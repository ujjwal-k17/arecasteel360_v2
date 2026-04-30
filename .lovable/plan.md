## Why Debtors are empty

The sync says "synced" because Tally responded successfully — but `result.debtors` is empty. Two reasons:

**1. The `<COMPUTE>` block in our XML doesn't actually work the way we hoped.**
We added `<COMPUTE>IsDebtor : $$IsLedOfGrp:$Name:"Sundry Debtors"</COMPUTE>` inside the `<COLLECTION>`, but Tally's XML export does **not** emit COMPUTE fields as `<ISDEBTOR>` tags in the response unless they're declared as proper `<TDLMESSAGE><FUNCTION>`/`<PART>` constructs. So `tag(inner, 'ISDEBTOR')` is always `null` → `isDebtor` is always `false`.

**2. The keyword fallback is also failing.**
Our fallback only checks the **immediate parent** name returned in `<PARENT>`. In your Tally, debtors are filed under sub-groups (e.g. *Domestic Debtors*, *Trade Receivables – North*) whose own parent is *Sundry Debtors*. The ledger's `<PARENT>` tag returns only that immediate sub-group name (e.g. "Domestic Debtors"), which **does** contain the word "debtor" — so this should match. But if your sub-groups are named without those keywords (e.g. "North Zone Parties", "GZB Customers"), nothing matches and the list is empty.

The previous "Sync Debtors & Creditors" worked when ledgers sat directly under *Sundry Debtors*; once they were re-organised under custom sub-groups, the filter stopped matching.

## The fix — walk the group hierarchy ourselves

Instead of relying on Tally's `$$IsLedOfGrp` (which doesn't survive collection XML export), fetch **both** ledgers and groups, then resolve each ledger's ultimate primary group inside the edge function.

### Edge function changes (`supabase/functions/tally-fetch/index.ts`)

1. **Add a second Tally request: a Group collection.** Builds a map of `groupName → parentName` for all groups in the company (small, fast).
2. **Drop the COMPUTE fields** from the ledger XML — they don't help.
3. **In code, for each ledger:** walk up the group chain (`parent → parent → …`) until we hit one of Tally's reserved primary groups: `Sundry Debtors`, `Sundry Creditors`, `Bank Accounts`, `Bank OD A/c`, `Cash-in-Hand`. Whichever we land on classifies the ledger.
4. **Add a `debug` flag** to the request body. When `debug: true`, return a `_debug` object containing: ledger count, sample of 5 raw ledger names + parents, group-chain resolution for each, and counts per classification. This lets us see exactly what Tally is returning if anything is still off.
5. **Keep the keyword fallback** as a last resort for safety.
6. **Filter out zero-balance debtors** only on the UI side, not the edge function — so the debug count reflects all parties.

### Data flow

```text
Tally
  ├── Ledgers (Name, Parent, ClosingBalance)
  └── Groups  (Name, Parent)
         │
         ▼
   Edge function builds parentMap
         │
         ▼
   For each ledger: walk parent chain
         │
   ┌─────┴──────┐
   ▼            ▼
 Sundry      Bank Accounts → banks[]
 Debtors  → debtors[]
 Sundry
 Creditors → (new) creditors[]
```

### Optional UI follow-up

The current page shows "Total Debtors Outstanding" but no Creditors panel. While we're here, surface creditors too (the data is already being parsed) — small addition: one stat card and a tab. Confirm if you want this included.

## Files to change

- `supabase/functions/tally-fetch/index.ts` — add Group XML builder, parser, parent-walk classifier, debug payload.
- `src/pages/BusinessOverviewPage.tsx` — pass `debug: true` on first sync after deploy so we can verify; optional creditors UI.

## How we'll verify

After deploy, click **Sync Debtors & Creditors** once. The toast will show counts; if still 0, the `_debug` payload will tell us the actual parent names Tally returned, and we can adjust the reserved-group list (e.g. some Indian Tally installs use "Sundry Debtors (Domestic)" as a primary group).

Want me to also add the Creditors stat card + tab in the same change?