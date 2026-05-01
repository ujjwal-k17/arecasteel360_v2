
ALTER TABLE public.tally_sync_runs
  ADD COLUMN IF NOT EXISTS from_date date,
  ADD COLUMN IF NOT EXISTS to_date date;

CREATE INDEX IF NOT EXISTS idx_tally_sync_runs_window
  ON public.tally_sync_runs (status, finished_at DESC, from_date, to_date);

-- Drop dependent views first
DROP VIEW IF EXISTS public.v_tally_sales CASCADE;
DROP VIEW IF EXISTS public.v_tally_purchases CASCADE;
DROP VIEW IF EXISTS public.v_tally_receipts CASCADE;
DROP VIEW IF EXISTS public.v_tally_bank_txns CASCADE;
DROP VIEW IF EXISTS public.v_tally_active_runs CASCADE;

-- New active runs view: ledgers stay "latest run per company".
-- Vouchers resolve per-voucher-date: pick the latest successful run whose [from_date,to_date]
-- window contains the voucher's date. If a run has NULL window (legacy pre-migration), treat
-- it as covering all dates so existing data continues to surface until re-synced.
CREATE OR REPLACE VIEW public.v_tally_active_runs AS
WITH ledger_runs AS (
  SELECT
    'ledgers'::text AS dataset,
    l.company,
    l.sync_run_id,
    r.finished_at,
    r.status,
    row_number() OVER (PARTITION BY l.company ORDER BY r.finished_at DESC NULLS LAST) AS rn
  FROM public.tally_ledgers l
  JOIN public.tally_sync_runs r ON r.id = l.sync_run_id
  WHERE r.status IN ('success','partial')
  GROUP BY l.company, l.sync_run_id, r.finished_at, r.status
)
SELECT dataset, company, sync_run_id, finished_at, status
FROM ledger_runs
WHERE rn = 1;

-- Helper: for a voucher, the active sync_run_id is the run with the latest finished_at among
-- successful/partial runs whose [from_date,to_date] covers voucher_date. We compute this with
-- DISTINCT ON joined to tally_sync_runs.
-- Used in each voucher view.

CREATE OR REPLACE VIEW public.v_tally_sales AS
SELECT DISTINCT ON (v.id)
  v.id, v.company, v.kind, v.voucher_type, v.voucher_number, v.voucher_date,
  v.party_name, v.amount, v.sync_run_id
FROM public.tally_vouchers v
JOIN public.tally_sync_runs r ON r.id = v.sync_run_id
WHERE v.kind = 'sales'
  AND r.status IN ('success','partial')
  AND (
    r.from_date IS NULL OR r.to_date IS NULL
    OR (v.voucher_date IS NOT NULL AND v.voucher_date BETWEEN r.from_date AND r.to_date)
  )
ORDER BY v.id, r.finished_at DESC NULLS LAST;

CREATE OR REPLACE VIEW public.v_tally_purchases AS
SELECT DISTINCT ON (v.id)
  v.id, v.company, v.kind, v.voucher_type, v.voucher_number, v.voucher_date,
  v.party_name, v.amount, v.sync_run_id
FROM public.tally_vouchers v
JOIN public.tally_sync_runs r ON r.id = v.sync_run_id
WHERE v.kind = 'purchase'
  AND r.status IN ('success','partial')
  AND (
    r.from_date IS NULL OR r.to_date IS NULL
    OR (v.voucher_date IS NOT NULL AND v.voucher_date BETWEEN r.from_date AND r.to_date)
  )
ORDER BY v.id, r.finished_at DESC NULLS LAST;

CREATE OR REPLACE VIEW public.v_tally_receipts AS
SELECT DISTINCT ON (v.id)
  v.id, v.company, v.kind, v.voucher_type, v.voucher_number, v.voucher_date,
  v.party_name, v.amount, v.sync_run_id
FROM public.tally_vouchers v
JOIN public.tally_sync_runs r ON r.id = v.sync_run_id
WHERE v.kind = 'receipt'
  AND r.status IN ('success','partial')
  AND (
    r.from_date IS NULL OR r.to_date IS NULL
    OR (v.voucher_date IS NOT NULL AND v.voucher_date BETWEEN r.from_date AND r.to_date)
  )
ORDER BY v.id, r.finished_at DESC NULLS LAST;

-- Bank txns view: rebuild from base, keeping prior shape (joins ledger entries for bank rows).
-- Pick the active voucher per (id) by date-window-aware run, then attach bank ledger details.
CREATE OR REPLACE VIEW public.v_tally_bank_txns AS
WITH active_vouchers AS (
  SELECT DISTINCT ON (v.id)
    v.id, v.company, v.kind, v.voucher_type, v.voucher_number, v.voucher_date,
    v.party_name, v.amount, v.sync_run_id
  FROM public.tally_vouchers v
  JOIN public.tally_sync_runs r ON r.id = v.sync_run_id
  WHERE v.kind IN ('receipt','payment','contra','journal')
    AND r.status IN ('success','partial')
    AND (
      r.from_date IS NULL OR r.to_date IS NULL
      OR (v.voucher_date IS NOT NULL AND v.voucher_date BETWEEN r.from_date AND r.to_date)
    )
  ORDER BY v.id, r.finished_at DESC NULLS LAST
)
SELECT
  av.id, av.company, av.kind, av.voucher_type, av.voucher_number, av.voucher_date,
  av.party_name, av.amount,
  le.ledger_name AS bank_ledger,
  le.amount AS bank_amount,
  le.is_debit AS bank_is_debit
FROM active_vouchers av
JOIN public.tally_voucher_ledger_entries le ON le.voucher_id = av.id
JOIN public.tally_ledgers tl
  ON tl.company = av.company
 AND tl.name = le.ledger_name
 AND tl.sync_run_id IN (
   SELECT sync_run_id FROM public.v_tally_active_runs WHERE dataset = 'ledgers' AND company = av.company
 )
WHERE 'Bank Accounts' = ANY(tl.parent_chain)
   OR 'Bank OD A/c' = ANY(tl.parent_chain);
