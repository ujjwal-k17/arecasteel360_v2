-- Remove all Tally Sync module database objects

DROP VIEW IF EXISTS public.v_tally_bank_txns CASCADE;
DROP VIEW IF EXISTS public.v_tally_receipts CASCADE;
DROP VIEW IF EXISTS public.v_tally_purchases CASCADE;
DROP VIEW IF EXISTS public.v_tally_sales CASCADE;
DROP VIEW IF EXISTS public.v_tally_banks CASCADE;
DROP VIEW IF EXISTS public.v_tally_creditors CASCADE;
DROP VIEW IF EXISTS public.v_tally_debtors CASCADE;
DROP VIEW IF EXISTS public.v_tally_active_runs CASCADE;

DROP TABLE IF EXISTS public.tally_voucher_bill_refs CASCADE;
DROP TABLE IF EXISTS public.tally_voucher_ledger_entries CASCADE;
DROP TABLE IF EXISTS public.tally_voucher_items CASCADE;
DROP TABLE IF EXISTS public.tally_vouchers CASCADE;
DROP TABLE IF EXISTS public.tally_ledgers CASCADE;
DROP TABLE IF EXISTS public.tally_groups CASCADE;
DROP TABLE IF EXISTS public.tally_debtor_overrides CASCADE;
DROP TABLE IF EXISTS public.tally_sync_runs CASCADE;