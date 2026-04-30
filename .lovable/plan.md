## Goal

Replace the live-fetch model with a **snapshot-and-serve** architecture: one explicit "Sync from Tally" pulls the full available dataset into our database; every UI view reads from the database until the next sync. Manual sync only (no cron yet).

## Architecture

```
[Sync button] -> tally-sync edge function -> Tally XML -> parse -> INSERT into tally_* tables
                                                                       |
[Business Overview / Debtors / Creditors / Banks / Sales / Purchases]
       reads from tally_* tables via Supabase client (fast, offline-tolerant)
```

A sync-run row tags every inserted record. The active snapshot is the most recent successful run per (company, dataset), so a partial failure on one company doesn't blank the other.

## Schema (new tables)

- `tally_sync_runs` — run id, started/finished, status (running|success|partial|failed), triggered_by, datasets[], companies[], counts jsonb, errors jsonb
- `tally_groups` — sync_run_id, company, name, parent, is_reserved
- `tally_ledgers` — sync_run_id, company, name, parent_group, root_group, parent_chain text[], closing_balance, classification ('debtor'|'creditor'|'bank'|'other')
- `tally_vouchers` — sync_run_id, company, kind ('sales'|'purchase'), voucher_type, voucher_number, voucher_date, party_name, amount, is_cancelled, is_optional
- `tally_voucher_items` — voucher_id (fk), stock_item, qty, rate, amount

Views:
- `v_tally_active_runs(company, dataset, sync_run_id)` — most recent success/partial run per slice
- `v_tally_debtors`, `v_tally_creditors`, `v_tally_banks`, `v_tally_sales`, `v_tally_purchases` — pre-filtered to active runs for clean reads.

RLS: authenticated SELECT on all `tally_*`. Writes go via edge function (service role, bypasses RLS).

Indexes: `(sync_run_id)`, `(company, classification)` on ledgers, `(company, voucher_date)` on vouchers, `(voucher_id)` on items.

## Sync flow (`supabase/functions/tally-sync/index.ts`)

1. Insert `tally_sync_runs` row with `status='running'`.
2. For each company, run 3 datasets independently (groups+ledgers, sales vouchers, purchase vouchers):
   - Fetch via Tally XML
   - Parse, classify ledgers using full parent-chain walk
   - Bulk-insert tagged with this run id
3. Collect per-(company,dataset) errors into the run's `errors` jsonb. If a dataset fails, those rows aren't inserted, and the previous run's data for that slice stays active via the views.
4. Final status: `success` if no errors, `partial` if some, `failed` if nothing inserted.
5. Return `{ runId, counts, errors }`.

### Pulling all available data

Voucher requests use `SVFROMDATE=19000101` → today. Per-call 25s timeout, 60s wall-clock guard preserved. If a company times out, that dataset is marked failed for this run and the prior snapshot stays active. If the first full pull blows the budget we'll add an FY-chunked fallback in a follow-up.

## Frontend

- New hook `src/hooks/useTallySnapshot.ts` — queries the views, returns `{ debtors, creditors, banks, sales, purchases, lastSyncedAt, status, errors }`.
- `src/pages/BusinessOverviewPage.tsx`:
  - Read from snapshot hook (no more live tally-fetch in render path).
  - Top banner: "Last synced: <ts> (<status>)". 
  - "Sync from Tally" button invokes `tally-sync` then invalidates the snapshot query.

`tally-fetch` stays as a diagnostic preview — not the data path.

## Files

New:
- migration: tables + views + RLS + indexes
- `supabase/functions/tally-sync/index.ts`
- `src/hooks/useTallySnapshot.ts`

Edited:
- `src/pages/BusinessOverviewPage.tsx`

Untouched:
- `supabase/functions/tally-fetch/index.ts`
- `supabase/functions/tally-diagnose/index.ts`

## Deferred

- pg_cron daily auto-sync
- Aging buckets, per-party drill-downs, cross-module joins to customers/orders
- Automatic cleanup of old sync runs

## Verification

1. Migration applies cleanly.
2. Click Sync → returns within ~60s, rows present in tally_* tables, banner updates.
3. Reload page → views render from snapshot, no Tally call.
4. Kill Tally → page still works.
5. Re-sync → new runId, counts refresh.
