-- Wipe Tally sync data so a fresh sync rebuilds it with the fixed parser.
-- Preserves user-controlled data: tally_debtor_overrides (credit periods, sales reps).
TRUNCATE TABLE
  public.tally_voucher_bill_refs,
  public.tally_voucher_ledger_entries,
  public.tally_voucher_items,
  public.tally_vouchers,
  public.tally_ledgers,
  public.tally_groups,
  public.tally_sync_runs
RESTART IDENTITY;