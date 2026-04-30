-- ============================================================
-- Tally snapshot storage
-- ============================================================

-- Run log: one row per sync attempt
CREATE TABLE public.tally_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
  triggered_by UUID,
  triggered_by_email TEXT,
  datasets TEXT[] NOT NULL DEFAULT '{}',
  companies TEXT[] NOT NULL DEFAULT '{}',
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tally_sync_runs_status_finished ON public.tally_sync_runs(status, finished_at DESC);

-- Groups (raw hierarchy from Tally)
CREATE TABLE public.tally_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id UUID NOT NULL REFERENCES public.tally_sync_runs(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  name TEXT NOT NULL,
  parent TEXT,
  is_reserved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tally_groups_run_company ON public.tally_groups(sync_run_id, company);

-- Ledgers with classification computed at sync time
CREATE TABLE public.tally_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id UUID NOT NULL REFERENCES public.tally_sync_runs(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_group TEXT,
  root_group TEXT,
  parent_chain TEXT[] NOT NULL DEFAULT '{}',
  closing_balance NUMERIC NOT NULL DEFAULT 0,
  classification TEXT NOT NULL DEFAULT 'other' CHECK (classification IN ('debtor','creditor','bank','other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tally_ledgers_run_company ON public.tally_ledgers(sync_run_id, company);
CREATE INDEX idx_tally_ledgers_classification ON public.tally_ledgers(classification);

-- Vouchers (sales + purchase)
CREATE TABLE public.tally_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id UUID NOT NULL REFERENCES public.tally_sync_runs(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sales','purchase')),
  voucher_type TEXT,
  voucher_number TEXT,
  voucher_date DATE,
  party_name TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  is_cancelled BOOLEAN DEFAULT false,
  is_optional BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tally_vouchers_run_company_kind ON public.tally_vouchers(sync_run_id, company, kind);
CREATE INDEX idx_tally_vouchers_date ON public.tally_vouchers(voucher_date DESC);

-- Voucher inventory line items
CREATE TABLE public.tally_voucher_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.tally_vouchers(id) ON DELETE CASCADE,
  stock_item TEXT,
  qty NUMERIC DEFAULT 0,
  rate NUMERIC DEFAULT 0,
  amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tally_voucher_items_voucher ON public.tally_voucher_items(voucher_id);

-- ============================================================
-- RLS: authenticated read, no client writes (edge function uses service role)
-- ============================================================
ALTER TABLE public.tally_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_ledgers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tally_voucher_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tally_sync_runs"
  ON public.tally_sync_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read tally_groups"
  ON public.tally_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read tally_ledgers"
  ON public.tally_ledgers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read tally_vouchers"
  ON public.tally_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read tally_voucher_items"
  ON public.tally_voucher_items FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Active-snapshot views: most recent good run per (company, dataset)
-- A "dataset" is one of: ledgers, sales, purchases.
-- A run is "good" for a (company, dataset) if it inserted rows for that slice
-- AND the run.errors jsonb does NOT contain an error matching that slice.
-- We use a simpler proxy: pick the latest run with status in (success, partial)
-- that actually has rows for the slice.
-- ============================================================

-- Latest run per company per dataset that contains data for that slice
CREATE OR REPLACE VIEW public.v_tally_active_runs AS
WITH ranked AS (
  SELECT
    'ledgers'::text AS dataset,
    l.company,
    l.sync_run_id,
    r.finished_at,
    r.status,
    ROW_NUMBER() OVER (PARTITION BY l.company ORDER BY r.finished_at DESC NULLS LAST) AS rn
  FROM public.tally_ledgers l
  JOIN public.tally_sync_runs r ON r.id = l.sync_run_id
  WHERE r.status IN ('success','partial')
  GROUP BY l.company, l.sync_run_id, r.finished_at, r.status

  UNION ALL

  SELECT
    'sales'::text AS dataset,
    v.company,
    v.sync_run_id,
    r.finished_at,
    r.status,
    ROW_NUMBER() OVER (PARTITION BY v.company ORDER BY r.finished_at DESC NULLS LAST) AS rn
  FROM public.tally_vouchers v
  JOIN public.tally_sync_runs r ON r.id = v.sync_run_id
  WHERE r.status IN ('success','partial') AND v.kind = 'sales'
  GROUP BY v.company, v.sync_run_id, r.finished_at, r.status

  UNION ALL

  SELECT
    'purchases'::text AS dataset,
    v.company,
    v.sync_run_id,
    r.finished_at,
    r.status,
    ROW_NUMBER() OVER (PARTITION BY v.company ORDER BY r.finished_at DESC NULLS LAST) AS rn
  FROM public.tally_vouchers v
  JOIN public.tally_sync_runs r ON r.id = v.sync_run_id
  WHERE r.status IN ('success','partial') AND v.kind = 'purchase'
  GROUP BY v.company, v.sync_run_id, r.finished_at, r.status
)
SELECT dataset, company, sync_run_id, finished_at, status
FROM ranked WHERE rn = 1;

-- Convenience views
CREATE OR REPLACE VIEW public.v_tally_debtors AS
SELECT l.*
FROM public.tally_ledgers l
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'ledgers' AND ar.company = l.company AND ar.sync_run_id = l.sync_run_id
WHERE l.classification = 'debtor';

CREATE OR REPLACE VIEW public.v_tally_creditors AS
SELECT l.*
FROM public.tally_ledgers l
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'ledgers' AND ar.company = l.company AND ar.sync_run_id = l.sync_run_id
WHERE l.classification = 'creditor';

CREATE OR REPLACE VIEW public.v_tally_banks AS
SELECT l.*
FROM public.tally_ledgers l
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'ledgers' AND ar.company = l.company AND ar.sync_run_id = l.sync_run_id
WHERE l.classification = 'bank';

CREATE OR REPLACE VIEW public.v_tally_sales AS
SELECT v.*
FROM public.tally_vouchers v
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'sales' AND ar.company = v.company AND ar.sync_run_id = v.sync_run_id
WHERE v.kind = 'sales';

CREATE OR REPLACE VIEW public.v_tally_purchases AS
SELECT v.*
FROM public.tally_vouchers v
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'purchases' AND ar.company = v.company AND ar.sync_run_id = v.sync_run_id
WHERE v.kind = 'purchase';