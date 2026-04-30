## Goal

Restore Business Overview / Tally Sync responsiveness. The page got slow because (a) `useTallySnapshot` now fetches large datasets that the UI no longer needs after the move to "outstanding walk-back" logic, and (b) the Payment Summary table recomputes per-debtor invoice walks with O(debtors × sales) work + thousands of `Date` allocations on every dependency change.

Confirmed sizes in the DB today: 5,379 vouchers, 25,882 ledger entries, 7,878 bill refs, 2,960 ledgers. Cold loads currently do multiple chunked `.in()` round-trips then iterate 25k entries in JS — and re-do all of it after every sync or override save.

## Changes

### 1. `src/hooks/useTallySnapshot.ts` — slim the payload

The Payment Summary table and debtor dialog now derive everything from `closing_balance` + `sales`. So:

- **Drop the `debtorCredits` fetch entirely** (the two-pass entries → vouchers query is the heaviest single cost). Keep the type exported as `[]` for backward compatibility, or remove the field and update consumers.
- **Drop the `billRefs` chunked fetch** — currently unused by the active UI paths. (If a future feature needs it, fetch on demand inside that component.)
- **Drop receipts, bankTxns, purchases caps** from 50,000 to a more realistic ceiling, and only request the columns each view needs. Keep ascending order only where overdue calc requires it (sales).
- Run the remaining `Promise.all` queries unchanged but without the dependent second-stage fetches.

Net effect: cold load goes from ~8–20 round-trips to ~6 single-shot queries, and the JS post-processing loop over 25k entries disappears.

### 2. `src/pages/BusinessOverviewPage.tsx` — make the table cheap to render

In `DebtorPaymentSummaryTab` (`rows` memo around line 533):

- **Pre-index sales by `(company, ledger_name lowercase)` once** with a `useMemo` over `sales`, then look up `salesByDebtor.get(key) || []` per debtor instead of `sales.filter(...)` in the inner loop. This collapses the dominant O(debtors × sales) factor.
- Pre-sort each bucket descending by date once when building the index, so the per-row `[...].sort(...)` goes away.
- Hoist `today` out of the loop; replace `new Date(...).setDate / toISOString()` with simple ISO string arithmetic by adding days numerically (we already store `voucher_date` as an ISO string — add days via a tiny helper that does it without allocating two `Date` objects per invoice).
- Drop `creditIndex` from the deps of the `rows` memo (it's no longer read inside the loop after the walk-back rewrite — verified by reading the current code).

In `BusinessOverviewPage`:

- Wrap `debtors / banks / sales / purchases / receipts / bankTxns / debtorCredits` filtering in a single `useMemo` keyed on `data` + `companyFilter` so we don't re-filter on every keystroke / dialog open.

In `DebtorInvoiceCycleCard` (dialog body):

- Same pre-index trick: derive `dInvoices` from a passed-in indexed map instead of re-filtering `sales` when the dialog opens.

### 3. Quick wins

- Replace `localeCompare` on ISO date strings with `<` / `>` comparators (ISO dates sort lexicographically).
- Memoize `repCounts`, `repFilteredRows`, `filtered`, `totals` are already memoized — leave as is.

## Out of scope

- No schema or edge-function changes. The sync function itself isn't the slow part the user is feeling on this page; the lag is on the read/render side after sync.
- No removal of `debtorCredits` / `billRefs` from the codebase beyond the snapshot hook — components that currently import the types stay compiled; they'll just receive empty arrays.

## Verification

1. Open Business Overview after the change → initial render visibly faster, fewer network requests in DevTools.
2. Switch company filter → table updates without a perceptible pause.
3. Open a debtor dialog → opens immediately; unpaid invoices and overdue figures match the table column.
4. Run "Sync from Tally" → on completion, the snapshot refetch is a small handful of queries, not 15+.
5. Numbers (Outstanding, Overdue, Overdue Invoices, Open Invoices) match the values shown before the change for a couple of spot-checked debtors.
