## Goal
Replace the single "Sync from Tally" button with separate sync buttons so users can sync just the lightweight ledgers data (Debtors & Creditors / Banks) without waiting on the slow voucher exports (Dispatches & Purchases). This avoids 90s+ timeouts when one dataset fails.

## Current state
- `tally-fetch` edge function already accepts `dataset: 'debtors' | 'banks' | 'dispatches' | 'purchases' | 'all'` and only runs the relevant Tally jobs.
- `BusinessOverviewPage.tsx` always invokes it with `dataset: 'all'` via a single React Query keyed `['tally-fetch', fromDate, toDate]`, then derives debtors/banks/dispatches/purchases from one merged response.

## Changes — `src/pages/BusinessOverviewPage.tsx`

1. **Drop the single `useQuery` "all" call.** Replace with manual fetch state per dataset group:
   - `ledgersData` (debtors + banks) — synced together since both come from the same Tally ledger XML in one job.
   - `vouchersData` (dispatches + purchases) — synced together since both are voucher exports.
   - Each holds `{ debtors?, banks?, dispatches?, purchases?, errors, fetchedAt, companies }` plus `isFetching` flag.

2. **Two sync handlers**:
   - `handleSyncLedgers()` → `supabase.functions.invoke('tally-fetch', { body: { dataset: 'debtors', fromDate, toDate } })`. The backend's `'debtors'` branch already pulls the ledgers job which returns both debtors and banks, so one call covers Debtors & Creditors/Banks.
   - `handleSyncVouchers()` → invokes with `dataset: 'all'` minus ledgers. Since the function doesn't have a "vouchers only" mode, add a new dataset value `'vouchers'` in the edge function (see below) OR call it twice in parallel with `'dispatches'` and `'purchases'`. Plan: **add `'vouchers'` as a dataset value** in `tally-fetch` for a single round-trip.

3. **Header buttons** — replace the one `Sync from Tally` button with two:
   ```
   [ Sync Debtors & Creditors ]   [ Sync Dispatches & Purchases ]
   ```
   Each shows its own spinner and last-synced timestamp underneath (e.g. "Ledgers: 10:42 AM · Vouchers: not yet").

4. **Companies dropdown** — populate from whichever response arrived most recently (merge `ledgersData.companies` ∪ `vouchersData.companies`).

5. **Errors / warnings panel** — combine `errors` arrays from both responses.

6. **Summary cards & tabs** — read debtors/banks from `ledgersData`, dispatches/purchases from `vouchersData`. Show a subtle "Not synced yet" placeholder when a group hasn't been fetched.

## Changes — `supabase/functions/tally-fetch/index.ts`

- Extend the `dataset` union to include `'vouchers'`.
- Add condition: when `dataset === 'vouchers'`, push both `sales` and `purchase` voucher jobs (skip ledgers).
- Keep `'all'`, `'debtors'`, `'banks'`, `'dispatches'`, `'purchases'` working unchanged.

## Out of scope
- No persistence/caching across page reloads (still in-memory via component state).
- No per-company sync — still all companies at once per dataset group.
- No change to date-range controls.

## User-visible result
- Clicking **Sync Debtors & Creditors** finishes in a few seconds even when Tally voucher exports are slow.
- Clicking **Sync Dispatches & Purchases** is the heavy call; if it times out, the ledger numbers shown on the page are unaffected.
