-- Recreate views with security_invoker so they respect the caller's RLS context
DROP VIEW IF EXISTS public.v_tally_debtors CASCADE;
DROP VIEW IF EXISTS public.v_tally_creditors CASCADE;
DROP VIEW IF EXISTS public.v_tally_banks CASCADE;
DROP VIEW IF EXISTS public.v_tally_sales CASCADE;
DROP VIEW IF EXISTS public.v_tally_purchases CASCADE;
DROP VIEW IF EXISTS public.v_tally_active_runs CASCADE;

CREATE VIEW public.v_tally_active_runs
WITH (security_invoker = true) AS
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

CREATE VIEW public.v_tally_debtors
WITH (security_invoker = true) AS
SELECT l.*
FROM public.tally_ledgers l
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'ledgers' AND ar.company = l.company AND ar.sync_run_id = l.sync_run_id
WHERE l.classification = 'debtor';

CREATE VIEW public.v_tally_creditors
WITH (security_invoker = true) AS
SELECT l.*
FROM public.tally_ledgers l
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'ledgers' AND ar.company = l.company AND ar.sync_run_id = l.sync_run_id
WHERE l.classification = 'creditor';

CREATE VIEW public.v_tally_banks
WITH (security_invoker = true) AS
SELECT l.*
FROM public.tally_ledgers l
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'ledgers' AND ar.company = l.company AND ar.sync_run_id = l.sync_run_id
WHERE l.classification = 'bank';

CREATE VIEW public.v_tally_sales
WITH (security_invoker = true) AS
SELECT v.*
FROM public.tally_vouchers v
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'sales' AND ar.company = v.company AND ar.sync_run_id = v.sync_run_id
WHERE v.kind = 'sales';

CREATE VIEW public.v_tally_purchases
WITH (security_invoker = true) AS
SELECT v.*
FROM public.tally_vouchers v
JOIN public.v_tally_active_runs ar
  ON ar.dataset = 'purchases' AND ar.company = v.company AND ar.sync_run_id = v.sync_run_id
WHERE v.kind = 'purchase';