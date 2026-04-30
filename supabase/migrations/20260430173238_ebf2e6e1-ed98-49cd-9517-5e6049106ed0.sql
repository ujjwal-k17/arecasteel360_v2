
-- ============================================================
-- Extend Tally snapshot for Debtor metadata, Receipts, Bank txns
-- ============================================================

-- 1) Ledger contact / GST fields (synced from Tally master)
ALTER TABLE public.tally_ledgers
  ADD COLUMN IF NOT EXISTS mailing_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2) Voucher kind expanded: add 'receipt', 'payment', 'contra', 'journal'
ALTER TABLE public.tally_vouchers
  DROP CONSTRAINT IF EXISTS tally_vouchers_kind_check;
ALTER TABLE public.tally_vouchers
  ADD CONSTRAINT tally_vouchers_kind_check
  CHECK (kind IN ('sales','purchase','receipt','payment','contra','journal'));

-- 3) Voucher ledger entries (Dr/Cr side per ledger) — needed for bank txns
CREATE TABLE IF NOT EXISTS public.tally_voucher_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.tally_vouchers(id) ON DELETE CASCADE,
  ledger_name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,    -- positive = Dr, negative = Cr
  is_debit BOOLEAN NOT NULL DEFAULT true,
  is_party_ledger BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tvle_voucher ON public.tally_voucher_ledger_entries(voucher_id);
CREATE INDEX IF NOT EXISTS idx_tvle_ledger ON public.tally_voucher_ledger_entries(ledger_name);

ALTER TABLE public.tally_voucher_ledger_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tally_voucher_ledger_entries"
  ON public.tally_voucher_ledger_entries FOR SELECT TO authenticated USING (true);

-- 4) Receipt bill allocations (which invoice the receipt is paying against)
CREATE TABLE IF NOT EXISTS public.tally_voucher_bill_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL REFERENCES public.tally_vouchers(id) ON DELETE CASCADE,
  ledger_name TEXT NOT NULL,
  bill_name TEXT,                        -- invoice / bill ref
  bill_type TEXT,                        -- New Ref / Agst Ref / On Account / Advance
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tvbr_voucher ON public.tally_voucher_bill_refs(voucher_id);
CREATE INDEX IF NOT EXISTS idx_tvbr_ledger_bill ON public.tally_voucher_bill_refs(ledger_name, bill_name);

ALTER TABLE public.tally_voucher_bill_refs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tally_voucher_bill_refs"
  ON public.tally_voucher_bill_refs FOR SELECT TO authenticated USING (true);

-- 5) Editable per-debtor overrides (credit period that survives re-sync)
CREATE TABLE IF NOT EXISTS public.tally_debtor_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  ledger_name TEXT NOT NULL,
  credit_period_days INTEGER,
  notes TEXT,
  updated_by UUID,
  updated_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company, ledger_name)
);

CREATE TRIGGER trg_tdo_updated_at
BEFORE UPDATE ON public.tally_debtor_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tally_debtor_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read tally_debtor_overrides"
  ON public.tally_debtor_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tally_debtor_overrides"
  ON public.tally_debtor_overrides FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update tally_debtor_overrides"
  ON public.tally_debtor_overrides FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- 6) Extend active-runs view to include receipts + bank txns datasets
CREATE OR REPLACE VIEW public.v_tally_active_runs AS
WITH ranked AS (
  SELECT
    'ledgers'::text AS dataset, l.company, l.sync_run_id, r.finished_at, r.status,
    ROW_NUMBER() OVER (PARTITION BY l.company ORDER BY r.finished_at DESC NULLS LAST) AS rn
  FROM public.tally_ledgers l
  JOIN public.tally_sync_runs r ON r.id = l.sync_run_id
  WHERE r.status IN ('success','partial')
  GROUP BY l.company, l.sync_run_id, r.finished_at, r.status

  UNION ALL
  SELECT 'sales'::text, v.company, v.sync_run_id, r.finished_at, r.status,
    ROW_NUMBER() OVER (PARTITION BY v.company ORDER BY r.finished_at DESC NULLS LAST)
  FROM public.tally_vouchers v
  JOIN public.tally_sync_runs r ON r.id = v.sync_run_id
  WHERE r.status IN ('success','partial') AND v.kind = 'sales'
  GROUP BY v.company, v.sync_run_id, r.finished_at, r.status

  UNION ALL
  SELECT 'purchases'::text, v.company, v.sync_run_id, r.finished_at, r.status,
    ROW_NUMBER() OVER (PARTITION BY v.company ORDER BY r.finished_at DESC NULLS LAST)
  FROM public.tally_vouchers v
  JOIN public.tally_sync_runs r ON r.id = v.sync_run_id
  WHERE r.status IN ('success','partial') AND v.kind = 'purchase'
  GROUP BY v.company, v.sync_run_id, r.finished_at, r.status

  UNION ALL
  SELECT 'receipts'::text, v.company, v.sync_run_id, r.finished_at, r.status,
    ROW_NUMBER() OVER (PARTITION BY v.company ORDER BY r.finished_at DESC NULLS LAST)
  FROM public.tally_vouchers v
  JOIN public.tally_sync_runs r ON r.id = v.sync_run_id
  WHERE r.status IN ('success','partial') AND v.kind = 'receipt'
  GROUP BY v.company, v.sync_run_id, r.finished_at, r.status

  UNION ALL
  SELECT 'bank_txns'::text, v.company, v.sync_run_id, r.finished_at, r.status,
    ROW_NUMBER() OVER (PARTITION BY v.company ORDER BY r.finished_at DESC NULLS LAST)
  FROM public.tally_vouchers v
  JOIN public.tally_sync_runs r ON r.id = v.sync_run_id
  WHERE r.status IN ('success','partial') AND v.kind IN ('receipt','payment','contra','journal')
  GROUP BY v.company, v.sync_run_id, r.finished_at, r.status
)
SELECT dataset, company, sync_run_id, finished_at, status
FROM ranked WHERE rn = 1;

-- 7) Receipts view (with bill refs joined later in app)
CREATE OR REPLACE VIEW public.v_tally_receipts AS
SELECT v.*
FROM public.tally_vouchers v
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'receipts' AND ar.company = v.company AND ar.sync_run_id = v.sync_run_id
WHERE v.kind = 'receipt';

-- 8) Bank transactions: any voucher (receipt/payment/contra/journal) where a ledger entry hits a bank-classified ledger
CREATE OR REPLACE VIEW public.v_tally_bank_txns AS
SELECT
  v.id, v.company, v.kind, v.voucher_type, v.voucher_number, v.voucher_date,
  v.party_name, v.amount, v.is_cancelled, v.is_optional,
  e.ledger_name AS bank_ledger,
  e.amount AS bank_amount,
  e.is_debit AS bank_is_debit
FROM public.tally_vouchers v
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'bank_txns' AND ar.company = v.company AND ar.sync_run_id = v.sync_run_id
JOIN public.tally_voucher_ledger_entries e
  ON e.voucher_id = v.id
JOIN public.tally_ledgers l
  ON l.sync_run_id = v.sync_run_id AND l.company = v.company AND l.name = e.ledger_name
WHERE v.kind IN ('receipt','payment','contra','journal')
  AND l.classification = 'bank'
  AND COALESCE(v.is_cancelled, false) = false;

-- 9) Update v_tally_debtors etc. by recreating (column added to base table) — already SELECT l.*, so they auto-pick new cols.
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
