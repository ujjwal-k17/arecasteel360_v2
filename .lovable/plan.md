# Why every week shows the same record count per company

## Root cause (confirmed from data)

The `records_fetched` column in `tally_sync_log` is being inflated by **ledger masters that get re-fetched and re-stored on every chunk**. Voucher counts (the thing that actually varies week-to-week) are tiny or zero for these archive companies, so the totals look identical.

Evidence from the database right now:

| Company | Reported per chunk | Ledger masters | Vouchers in entire DB |
|---|---|---|---|
| Areca Gzb FY-2022-23 | **2067** every week | 2067 | 1,208 (all dated Apr 2026) |
| Areca Delhi FY-2022-23 | **846** every week | 846 | 131 (all dated Apr 2026) |
| RUKMINI ISPAT GZB | **48** every week | 48 | 29 (all dated Apr 2026) |

The number reported per chunk = the company's ledger master count, exactly.

## Why it happens

In `tally-sync-engine/index.ts`:

1. **Step 3 — Ledger fetch** uses `buildLedgerXml()` which is a **TDL Collection of TYPE Ledger** with no date filter. Tally always returns the full master list (e.g. 2067 ledgers for Gzb).
2. These rows are upserted into `tally_ledger_balances` with conflict key `(company_name, ledger_name, as_of_date)` — and `as_of_date` is set to the **chunk's `to_date`**. So every weekly chunk creates a fresh snapshot of all 2067 ledgers (visible in the `tally_ledger_balances` table — 24 distinct `as_of_date` snapshots, each with the same row count).
3. `totalRecords += up.inserted` adds the full ledger count to `records_fetched` for **every chunk**.
4. **Step 4 — Vouchers** is correctly date-filtered, but for FY-2022-23 archive companies, the 2025-26 window has 0 vouchers, so it adds nothing visible to the total.

So the symptom "same number every week" is mathematically `ledger_count + 0 vouchers = ledger_count`, repeated identically each chunk.

## Two issues to fix

### A. The reported number is misleading
`records_fetched` should reflect **what was actually new for that chunk** — i.e. vouchers (which are date-bound) — not the always-constant ledger master list.

### B. Ledger snapshots are being duplicated 24× per company
Storing 2067 identical ledger rows under 24 different `as_of_date` values for the same historical sync run wastes space and is not what was intended. The ledger master is a single point-in-time list per company; one snapshot per sync run is enough.

## Plan

### 1. `supabase/functions/tally-sync-engine/index.ts`

- **Track ledger and voucher counts separately** in the log row instead of summing them into one `records_fetched`.
  - Keep `records_fetched` = voucher count only (the meaningful per-chunk figure).
  - Append a one-line summary like `"ledgers: 2067, vouchers: 14"` into `error_message` only if it helps debugging — or better, store both in the existing JSON response and stop double-counting in the log.
- **Skip ledger fetch on weekly historical chunks**. Ledgers are a master snapshot, not weekly data:
  - If `sync_type === 'historical'` AND `chunk_label` does not end in something marker-like (e.g. first chunk only), skip the ledger fetch entirely.
  - Simplest rule: fetch ledgers only when the engine is called with `sync_type` of `current_month`, `last_month`, or the **first** historical chunk. For `historical` calls after the first, skip Step 3.
  - The decision can be made by `sync-historical/index.ts` by passing a new flag `fetch_ledgers: boolean` in the body (true only for the first chunk of the run, false otherwise). The engine reads `body.fetch_ledgers` (default `true` for backward compat).

### 2. `supabase/functions/sync-historical/index.ts`

- For each company in the per-call loop, set `fetch_ledgers: true` only for the **first chunk in this invocation when no prior successful chunk exists** (i.e. brand-new historical run for that company). For all subsequent chunks, set `fetch_ledgers: false`.
- This eliminates 23 redundant ledger fetches per company per full historical run and gives accurate per-chunk voucher counts.

### 3. Optional cleanup (one-time)

After the fix is deployed, optionally collapse the duplicate ledger snapshots:

```sql
-- Keep only the latest as_of_date per (company, ledger)
DELETE FROM tally_ledger_balances a
USING tally_ledger_balances b
WHERE a.company_name = b.company_name
  AND a.ledger_name = b.ledger_name
  AND a.as_of_date < b.as_of_date;
```

Run this only if you confirm the duplicate snapshots aren't useful as a history.

## Expected outcome after fix

- Each historical chunk's `records_fetched` will reflect **only that week's voucher count** — so most archive-company chunks will show `0`, and weeks with actual activity will show real numbers.
- `tally_ledger_balances` will gain at most one new snapshot per historical run per company (instead of 24+).
- `sync-last-month` and `sync-current-month` behavior is unchanged (they still fetch ledgers).

## Technical notes

- Default `fetch_ledgers = true` keeps the engine backward-compatible with any caller that doesn't pass the flag.
- No DB schema change required.
- No frontend change required (`TallySyncPage` already reads `records_fetched` from the log; the meaning just becomes accurate).
