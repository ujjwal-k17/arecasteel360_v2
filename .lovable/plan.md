# Debtor Analysis & Master — Four Fixes

## Current state (from DB inspection)

- `tally_ledger_balances`: **5,922 total rows**, but only **2,961 distinct (company, ledger)** pairs → ~**2,961 duplicate snapshot rows** to remove.
- `CORETECH DYNAMICS` (Areca Indocorp LLP — Gzb): 2 snapshots (2026-05-02 and 2026-04-07), both with `closing_balance = -103`. Latest = ₹103 debit → should show as ₹103 outstanding in Debtor Analysis.
- 17 distinct `ledger_group` values under Sundry Debtors. Existing `sales_reps`: Shivam Singh, SP Gupta, Vinod Singh, Siyaram Sharma. Several Tally sub-groups (Bipin Pandey, Arvind Kumar, SANTOSH DUBEY, Alok Kumar, JB Steel Group, Siyaram, etc.) will become new sales reps.
- Generic groups like `Sundry Debtors`, `Retail Debtors - Gzb`, `Resin Debtors`, `Sundry Debtors TMT Bars`, `Brokerage on Sales` are NOT sales-rep names — these must be excluded from auto-creation.

---

## Fix 1 — Always use latest ledger snapshot

**File:** `src/pages/business-overview/PartyAnalysisPage.tsx` (and `MISDashboardPage.tsx` if it reads ledger balances similarly)

Replace the plain `select` from `tally_ledger_balances` with a client-side dedup that keeps only the row with the max `as_of_date` per `(company_name, ledger_name)`:

```ts
const { data } = await supabase
  .from('tally_ledger_balances')
  .select('ledger_name, ledger_group, ultimate_group, closing_balance, company_name, as_of_date')
  .order('as_of_date', { ascending: false });

// Keep first occurrence per (company, ledger) — that's the latest snapshot
const seen = new Set<string>();
const latest = (data ?? []).filter(r => {
  const k = `${r.company_name}::${r.ledger_name}`;
  if (seen.has(k)) return false;
  seen.add(k); return true;
});
```

This guarantees **never sum/double-count** snapshots.

## Fix 2 — Remove minimum-balance filter

**File:** `src/pages/business-overview/PartyAnalysisPage.tsx` line ~272

Current: `if (out > 0.01) { main.push(...) }` — keeps tiny balances out.
Change to: `if (out > 0) { main.push(...) }` — only excludes exactly zero/credit. Same for the creditor advance branch (`out < 0`).

This guarantees CORETECH (₹103) and any small-balance debtor appears.

## Fix 3 — Dedupe `tally_ledger_balances`

Run a one-time cleanup migration:

```sql
DELETE FROM tally_ledger_balances t
USING (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY company_name, ledger_name
    ORDER BY as_of_date DESC, synced_at DESC
  ) AS rn
  FROM tally_ledger_balances
) s
WHERE t.id = s.id AND s.rn > 1;
```

Then add a unique index to prevent future duplicates from older snapshots being kept alongside newer ones — the sync engine already upserts with the latest as_of_date, but we'll add:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_tally_ledger_balances_company_ledger
  ON tally_ledger_balances (company_name, ledger_name);
```

(If the engine relies on inserting different `as_of_date` rows, we'll instead keep the dedupe purely as a one-time cleanup and add a post-sync dedupe step. I'll verify the engine's upsert key before applying the unique index — Tally Sync module is not being modified.)

Expected removal: **~2,961 rows** (5,922 → 2,961).

## Fix 4 — Auto-populate Sales Rep from `ledger_group`

### Generic groups to skip (not real sales reps)
A hardcoded skip-list:
```
Sundry Debtors, Sundry Creditors, Retail Debtors - Gzb, Resin Debtors,
Sundry Debtors TMT Bars, Brokerage on Sales
```

### One-time backfill (SQL migration / data step)

```sql
-- 1. Insert new sales_reps from Tally ledger_group (excluding generics & duplicates)
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

-- 2. Auto-set sales_rep on debtor_master where currently NULL.
--    Use latest snapshot per (company, ledger).
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
```

### Recurring auto-population (after every sync)

Update `src/lib/business-overview-sync.ts` `upsertDebtorsFromSales()` to also:
1. Fetch latest-snapshot debtor ledgers from `tally_ledger_balances` (filtered to `Sundry Debtors`).
2. Insert any missing `ledger_group` into `sales_reps` (excluding generic skip-list, case-insensitive dedupe).
3. Upsert `debtor_master` rows; for rows where `sales_rep IS NULL`, set it to `ledger_group` if that group is in `sales_reps`.

Logic preserved: **never overwrite** `sales_rep` if user has set it.

This runs from `TallySyncPage.tsx` line 433 (already invoked post-sync), so it runs after every future sync automatically.

## Confirmation queries (run after fixes)

```sql
-- a) CORETECH visible (latest snapshot only)
SELECT * FROM (
  SELECT DISTINCT ON (company_name, ledger_name) *
  FROM tally_ledger_balances
  ORDER BY company_name, ledger_name, as_of_date DESC
) s WHERE ledger_name ILIKE '%CORETECH%';

-- b) Sales reps auto-created (after − before)
SELECT COUNT(*) FROM sales_reps;

-- c) Debtors auto-populated
SELECT COUNT(*) FROM debtor_master WHERE sales_rep IS NOT NULL;

-- d) Duplicates removed
SELECT 5922 - (SELECT COUNT(*) FROM tally_ledger_balances) AS removed;
```

I'll report all four numbers in the implementation message.

---

## Technical details

**Files to edit**
- `src/pages/business-overview/PartyAnalysisPage.tsx` — latest-snapshot dedupe + remove `> 0.01` threshold.
- `src/pages/business-overview/MISDashboardPage.tsx` — same latest-snapshot dedupe if it reads ledger balances.
- `src/lib/business-overview-sync.ts` — extend `upsertDebtorsFromSales()` with sales-rep auto-creation + auto-assignment, using latest snapshot only.

**Migration**
- One SQL migration containing: dedupe DELETE on `tally_ledger_balances`, sales_reps INSERT, debtor_master UPDATE.

**Not touched**
- `supabase/functions/tally-sync-engine/*` and other Tally Sync module files.
- No DB schema changes other than possibly adding a unique index (only if compatible with the engine's current upsert behavior — verified before applying).

**Skip-list rationale**: Generic group names like `Sundry Debtors`, `Resin Debtors`, `Retail Debtors - Gzb` are not people — auto-creating them as sales reps would pollute the dropdown. Real human-named sub-groups become reps.
