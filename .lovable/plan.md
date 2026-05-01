# Split Historical Sync into Previous FY and Current FY (YTD)

Today (1 May 2026) the previous financial year is **FY 2025-26 (1 Apr 2025 – 31 Mar 2026)** and the current financial year (YTD) is **FY 2026-27 (1 Apr 2026 – today)**.

Goal: replace the single "Sync Full Year History" button with two distinct buttons, each with its own backend chunk window, sync type, and progress tracking. Keep "Sync Current Month" and "Sync Last Month" as-is.

## Backend changes

### 1. Rename + narrow `sync-historical` → previous FY only

`supabase/functions/sync-historical/index.ts`:
- Change `buildChunks()` window to **1 Apr (current year - 1) → 31 Mar (current year)** when month >= April, else previous-previous FY. Use a helper that computes the previous FY boundaries dynamically from `new Date()` so it auto-rolls over each April 1.
- This produces ~52 weekly chunks (matching the existing `histTotal = 52` UI constant).
- Sync type label remains `historical` (so existing log rows continue to make sense), but we will treat it semantically as "Previous FY" in UI.

### 2. New edge function `sync-current-fy`

Create `supabase/functions/sync-current-fy/index.ts` — copy of `sync-historical` with two differences:
- Chunk window: **1 Apr (current FY start) → today** (computed dynamically).
- Sync type written to `tally_sync_log`: `current_fy`.
- Pause control: reads `tally_sync_control` row with `sync_type = 'current_fy'` (separate from historical so the two can pause independently).
- `last_successful_chunk` resume logic filters on `sync_type = 'current_fy'`.
- `fetch_ledgers` only on the very first chunk of a fresh run, same as historical.

The `tally_sync_control` table already supports arbitrary `sync_type` values (text PK), no migration needed.

### 3. Deploy both functions

Deploy `sync-historical` (updated) and `sync-current-fy` (new).

## Frontend changes — `src/pages/TallySyncPage.tsx`

### Buttons row
Replace the single orange "Sync Full Year History" button with two buttons:
1. **Sync Previous FY** (orange) — calls `sync-historical`. Confirmation dialog text updated to show actual date range "1 Apr 2025 – 31 Mar 2026" (computed dynamically).
2. **Sync Current FY (YTD)** (purple/indigo) — calls new `sync-current-fy`. Confirmation dialog shows "1 Apr 2026 – today".

Keep "Sync Current Month" (green) and "Sync Last Month" (blue) unchanged.

### State & types
- Extend `SyncFn` union: `'sync-current-month' | 'sync-last-month' | 'sync-historical' | 'sync-current-fy'`.
- Add a second `pausedRef` + `paused` state for current-FY sync, OR generalize to `pausedRefs: Record<'historical' | 'current_fy', boolean>`. Cleanest: keep two separate small states (`pausedHist`, `pausedCurrFy`) since they're independent.
- The `triggerSync` mutation's loop branch must apply to both `sync-historical` and `sync-current-fy` (both are chunked). Refactor the `if (fn === 'sync-historical')` check to `if (fn === 'sync-historical' || fn === 'sync-current-fy')` and use the matching control row + pause ref based on `fn`.

### Status cards row
Replace the single "Historical Sync" card with two cards side-by-side:
- **Previous FY Sync** — completed chunks / total chunks for `sync_type = 'historical'`.
- **Current FY Sync (YTD)** — completed chunks / total for `sync_type = 'current_fy'`.

Compute total chunks dynamically per type (52 for previous FY; weeks-elapsed-since-Apr-1 for current FY).

The grid becomes 5 cards on md+; switch to `md:grid-cols-5` (or wrap to 2 rows) so layout doesn't break.

### Progress bar row
The single running-historical card needs to handle whichever chunked sync is running. Show one progress card per running sync type (only one will run at a time in practice, but support both). Each shows its own pause/resume buttons targeting the correct `tally_sync_control` row.

### Sync log filter
Add a new filter option in the Sync Type dropdown: `current_fy` → label "Current FY".

## Date helper

Add a small helper in the page (or shared util in the function) to compute FY boundaries from a given date:
```
fyStart(date) = Apr 1 of (year if month>=Apr else year-1)
prevFyStart/end = previous FY's [Apr 1, Mar 31]
currFyStart = current FY's Apr 1
```

## Out of scope
- No DB migration (the existing `tally_sync_control` table works for any `sync_type`).
- No changes to `sync-current-month` / `sync-last-month`.
- Existing `tally_vouchers` data is preserved.
- Existing `tally_sync_log` rows with `sync_type = 'historical'` referencing 2024-W14 etc. will simply not match the new window; they're harmless. Optionally clear them with `DELETE FROM tally_sync_log WHERE sync_type = 'historical'` for a clean restart — recommended to keep progress UI accurate.

## Files

- Edit `supabase/functions/sync-historical/index.ts` — dynamic previous-FY window.
- New `supabase/functions/sync-current-fy/index.ts`.
- Edit `src/pages/TallySyncPage.tsx` — two buttons, two status cards, support both chunked syncs in mutation/pause logic, new filter option, dynamic confirmation text.
- Run `DELETE FROM tally_sync_log WHERE sync_type = 'historical'` to reset (optional but recommended).
- Deploy `sync-historical` and `sync-current-fy`.
