-- Strip leading <NAME> wrappers (possibly repeated) and trailing </NAME> from synced Tally text fields
UPDATE public.tally_ledger_balances
SET ledger_name = regexp_replace(regexp_replace(ledger_name, '^(<NAME>)+', '', 'i'), '</NAME>\s*$', '', 'i')
WHERE ledger_name ~* '^<NAME>' OR ledger_name ~* '</NAME>\s*$';

UPDATE public.tally_vouchers
SET party_name = regexp_replace(regexp_replace(party_name, '^(<NAME>)+', '', 'i'), '</NAME>\s*$', '', 'i')
WHERE party_name ~* '^<NAME>' OR party_name ~* '</NAME>\s*$';
