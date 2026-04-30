## Goal

Make Debtors & Creditors classification rely strictly on the **ancestor chain** rolling up to the reserved primary groups **"Sundry Debtors"** or **"Sundry Creditors"**. This correctly captures any custom sub-group (e.g. "Delhi Debtors", "Local Parties", "Overdue > 90 days") that the user has created under those primaries, and excludes ledgers that just happen to have the words "debtor"/"creditor"/"payable"/"receivable" in their immediate parent name.

## Current behaviour (problem)

In `supabase/functions/tally-fetch/index.ts`, the classifier checks:

```
isDebtor   = root === 'sundry debtors'   OR parent contains 'debtor'/'receivable'
isCreditor = root === 'sundry creditors' OR parent contains 'creditor'/'payable'
```

The substring fallbacks on the immediate parent are noisy:
- They miss ledgers whose immediate parent doesn't contain the word but which roll up correctly (e.g. parent = "Delhi Parties" → "Sundry Debtors").
- They wrongly include ledgers under unrelated parents that happen to share a substring.

## Change

In `supabase/functions/tally-fetch/index.ts`, replace the classification block inside the ledgers job with a strict root-group check:

```ts
const root = rootGroupOf(l.parent, groupMap); // already lowercase

const isDebtor   = root === 'sundry debtors';
const isCreditor = root === 'sundry creditors';
const isBank     = root === 'bank accounts'
                || root === 'bank od a/c'
                || root === 'bank occ a/c';
```

`rootGroupOf` already walks the full parent chain via the Group collection until it hits a top-level (reserved) primary, so any ledger whose chain terminates at "Sundry Debtors" / "Sundry Creditors" will be picked up regardless of how many intermediate user-defined sub-groups exist.

### Edge cases handled by the existing walker

- The function detects cycles via a `seen` set.
- It returns the immediate parent if no further parent is found in `groupMap` — so for the walk to terminate at "Sundry Debtors", that primary must appear in the Group collection. The current `buildGroupXml` fetches **all** groups (including reserved ones via `NATIVEMETHOD IsReserved`), so the chain resolves correctly. No XML change needed.

### Defensive note

If the Group collection comes back empty (e.g. partial Tally response), the walker returns the immediate parent name. In that degenerate case we'd classify nothing as debtor/creditor rather than misclassify — acceptable, and the diagnostics panel already surfaces `groupCount: 0` when this happens.

## Files

- `supabase/functions/tally-fetch/index.ts` — tighten `isDebtor` / `isCreditor` / `isBank` to root-only checks (remove substring fallbacks on `parent`).

No frontend, schema, or RLS changes. No new dependencies.

## Verification after deploy

1. Sync Debtors & Creditors.
2. Open the diagnostics panel — `sampleLedgers` shows `{ name, parent, root, closing }`. Confirm every row in `result.debtors` has `root === "sundry debtors"` and every row in `result.creditors` has `root === "sundry creditors"`.
3. Spot-check a known ledger nested 2+ levels deep under a custom sub-group of Sundry Debtors — it should now appear.
