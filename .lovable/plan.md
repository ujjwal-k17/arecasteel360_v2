## Goal

Replace timeout-prone "Sync All" with a manual, period-by-period sync model:

- **Sync Current Month** — refreshes only the current month's vouchers + ledgers.
- **Sync Historic Data** — opens a dialog where the user picks one quarter (Apr 1, 2025 onwards, plus older quarters back to Apr 2022) and syncs only that quarter.

Each click syncs **only the chosen window** (no full-history loop), so each invocation stays well under the edge-function timeout.

## Important: Data-merging caveat (please read before approving)

The current snapshot views (`v_tally_active_runs` → `v_tally_sales` etc.) pick **only the single most recent successful run per (company, dataset)**. That means today, if you "Sync Current Month", the resulting run becomes "the active run" and the views will show **only that month's vouchers** — earlier quarters silently disappear from the UI until you re-sync them.

For per-period syncs to actually merge, we need to change how the views resolve "active data":

**Proposed fix:** switch the active-run logic from "latest run per company" to "latest run per (company, voucher_date window)". Concretely, for each voucher we keep the most recent run that covered its date — implemented by stamping each run with its `from_date` / `to_date` and resolving per-voucher via the run that has the latest `finished_at` among runs whose window contains that voucher's date.

Without this change, partial-period syncs will not work as you expect — they'll wipe other periods from the views.

## Implementation Plan

### 1. Database migration (active-run resolution by date window)

- Add `from_date date`, `to_date date` columns to `tally_sync_runs` (nullable; populated by edge function on insert).
- Rewrite `v_tally_active_runs` and the dependent views (`v_tally_sales`, `v_tally_purchases`, `v_tally_receipts`, `v_tally_bank_txns`) so that for each voucher they pick the run with the latest `finished_at` among successful/partial runs whose `[from_date, to_date]` window contains `voucher_date`.
- Ledgers stay "latest run per company" (closing balances are always whole-company, not date-scoped). So "Sync Current Month" will still update closing balances, while older quarters' vouchers remain visible from their own earlier runs.

### 2. Edge function (`supabase/functions/tally-sync/index.ts`)

- On insert into `tally_sync_runs`, also write `from_date` and `to_date` from the request body.
- No other behaviour change — it already accepts `fromDate`/`toDate`/`includeLedgers` and writes vouchers scoped to that window.

### 3. UI (`src/pages/BusinessOverviewPage.tsx`)

Replace the existing two buttons + Sync All dialog with:

- **`Sync Current Month`** button
  - Window: 1st of current month → today.
  - `includeLedgers: true` (so closing balances refresh).
  - Single edge-function call. No chunking.
  - Toast with summary on completion.

- **`Sync Historic Data`** button → opens a dialog
  - Dialog shows a dropdown of quarters from **Apr 2022 → current quarter** (Indian FY quarters: Apr–Jun, Jul–Sep, Oct–Dec, Jan–Mar), labelled e.g. "Q1 FY26 (Apr–Jun 2025)".
  - User picks one quarter, clicks **Sync Quarter**.
  - Single edge-function call for that 90-ish-day window.
  - `includeLedgers: false` (closing balances are not period-scoped; Sync Current Month handles those).
  - Progress shown as a simple inline status row (Running → Done / Error with count).

- Remove the old `buildChunks` loop, the multi-chunk progress panel, and the "Sync All" confirmation dialog. Keep the diagnostics ("Diagnose Tally") button untouched.

### 4. Behaviour summary after the change

```text
Sync Current Month  → updates Nov 2026 vouchers + all closing balances
Sync Historic Data  → user picks Q2 FY26 → updates Jul–Sep 2025 vouchers only
                       Earlier quarters' data remains intact in the views.
```

## Files touched

- New SQL migration: alter `tally_sync_runs`, redefine 5 views.
- `supabase/functions/tally-sync/index.ts` — write `from_date`/`to_date` on run insert.
- `src/pages/BusinessOverviewPage.tsx` — replace sync UI + handlers, add quarter-picker dialog.

## Decisions I need from you

1. **Approve the view rewrite** (Section 1)? Without it, per-period syncs will overwrite other periods in the UI. This is the only safe way to make your proposal work.
2. **Quarter range** — start the dropdown from **Apr 2022** (matching today's Sync All baseline) and go to current quarter? Or only from **Apr 2025** as your message implies, with older quarters hidden?
3. **Should "Sync Current Month" also include the previous month's last few days** (e.g. current month – 7 days) to safely catch back-dated entries? Or strictly 1st of current month?
