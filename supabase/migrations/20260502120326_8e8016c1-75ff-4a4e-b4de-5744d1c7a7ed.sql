DELETE FROM tally_ledger_balances t
USING (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY company_name, ledger_name
    ORDER BY as_of_date DESC, synced_at DESC
  ) AS rn
  FROM tally_ledger_balances
) s
WHERE t.id = s.id AND s.rn > 1;

INSERT INTO sales_reps (name, is_active)
SELECT DISTINCT lb.ledger_group, true
FROM tally_ledger_balances lb
WHERE lb.ultimate_group = 'Sundry Debtors'
  AND lb.ledger_group IS NOT NULL
  AND lb.ledger_group NOT IN (
    'Sundry Debtors','Sundry Creditors','Retail Debtors - Gzb',
    'Resin Debtors','Sundry Debtors TMT Bars','Brokerage on Sales'
  )
  AND NOT EXISTS (SELECT 1 FROM sales_reps sr WHERE sr.name = lb.ledger_group);

WITH latest AS (
  SELECT DISTINCT ON (company_name, ledger_name)
    company_name, ledger_name, ledger_group
  FROM tally_ledger_balances
  WHERE ultimate_group = 'Sundry Debtors'
  ORDER BY company_name, ledger_name, as_of_date DESC
)
UPDATE debtor_master dm
SET sales_rep = latest.ledger_group, updated_at = now()
FROM latest
WHERE dm.company_name = latest.company_name
  AND dm.ledger_name = latest.ledger_name
  AND dm.sales_rep IS NULL
  AND EXISTS (SELECT 1 FROM sales_reps sr WHERE sr.name = latest.ledger_group);