## Why some debtors are missing

The Tally fetch returns **all ledgers**, but the edge function then keeps only those whose `PARENT` text literally contains `"sundry debtor"`. That filter is too narrow:

- Many Tally setups put debtors under **sub-groups** like `Domestic Debtors`, `Export Debtors`, `Trade Receivables`, `Debtors - Delhi`. None of these contain the word "sundry", so every party under them is silently dropped.
- The `<PARENT>` tag from Tally returns only the **immediate parent group**, not the full ancestor chain. A ledger under `Domestic Debtors` (which itself sits under `Sundry Debtors`) reports `PARENT = Domestic Debtors` and fails our keyword test.
- Same problem affects bank accounts placed under sub-groups like `Bank OD A/c` or `Current Accounts`.

This is a parsing/filtering bug, not a Tally connectivity issue. Tally is sending the data; we're throwing it away.

## Fix — `supabase/functions/tally-fetch/index.ts`

### 1. Ask Tally to walk the group hierarchy for us
In `buildLedgerXml`, add `COMPUTE` fields that use Tally's built-in `$$IsLedOfGrp` formula. This returns Yes/No for whether a ledger belongs (directly or via any ancestor) to a primary group:

```xml
<COMPUTE>IsDebtor : $$IsLedOfGrp:$Name:"Sundry Debtors"</COMPUTE>
<COMPUTE>IsCreditor : $$IsLedOfGrp:$Name:"Sundry Creditors"</COMPUTE>
<COMPUTE>IsBank : $$IsLedOfGrp:$Name:"Bank Accounts"</COMPUTE>
<COMPUTE>IsBankOD : $$IsLedOfGrp:$Name:"Bank OD A/c"</COMPUTE>
```

(Drop the unused `BillAllocations` native method while we're here.)

### 2. Parse the new flags
Extend `LedgerRow` with `isDebtor`, `isCreditor`, `isBank` booleans. Add a `parseYesNo` helper that reads `<ISDEBTOR>Yes</ISDEBTOR>` etc.

### 3. Use the flags + a broader keyword fallback
In the ledger-job handler, classify a row as a debtor if **any** of these is true:
- `l.isDebtor` (Tally's own group walk — primary signal)
- parent text contains `"sundry debtor"`, `"debtor"`, or `"receivable"` (fallback for older Tally versions that may not honour COMPUTE in the export)

Bank rows: `l.isBank` OR parent contains `"bank"`.

This guarantees every party under any sub-group of `Sundry Debtors` is captured, while keeping the keyword path as a safety net.

## Out of scope
- Creditors aren't shown on the page yet — the Compute field is added so we can surface them next without another XML round-trip, but no UI change in this pass.
- Overdue is still 0 (we don't fetch BillAllocations); that's a separate enhancement.

## Expected outcome
After deploy, click **Sync Debtors & Creditors** again and the Debtors tab should show every party that lives anywhere under the Sundry Debtors tree in Tally — not just those under a group literally named "Sundry Debtors".
