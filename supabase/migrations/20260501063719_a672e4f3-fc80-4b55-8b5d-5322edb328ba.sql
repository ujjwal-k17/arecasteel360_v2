
CREATE OR REPLACE VIEW public.v_tally_debtors AS
SELECT l.company, l.name, l.parent_group, l.parent_chain, l.root_group,
       l.closing_balance, l.mailing_name, l.address, l.gstin,
       l.contact_person, l.phone, l.email
FROM public.tally_ledgers l
WHERE l.classification = 'debtor'
  AND l.sync_run_id IN (
    SELECT sync_run_id FROM public.v_tally_active_runs
    WHERE dataset = 'ledgers' AND company = l.company
  );

CREATE OR REPLACE VIEW public.v_tally_creditors AS
SELECT l.company, l.name, l.parent_group, l.parent_chain, l.root_group,
       l.closing_balance, l.mailing_name, l.address, l.gstin,
       l.contact_person, l.phone, l.email
FROM public.tally_ledgers l
WHERE l.classification = 'creditor'
  AND l.sync_run_id IN (
    SELECT sync_run_id FROM public.v_tally_active_runs
    WHERE dataset = 'ledgers' AND company = l.company
  );

CREATE OR REPLACE VIEW public.v_tally_banks AS
SELECT l.company, l.name, l.parent_group, l.parent_chain, l.root_group,
       l.closing_balance, l.mailing_name, l.address, l.gstin,
       l.contact_person, l.phone, l.email
FROM public.tally_ledgers l
WHERE l.classification = 'bank'
  AND l.sync_run_id IN (
    SELECT sync_run_id FROM public.v_tally_active_runs
    WHERE dataset = 'ledgers' AND company = l.company
  );
