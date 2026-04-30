## Goal
Make the Tally sync diagnostics visible in the UI (no DevTools needed) and surface per-company HTTP status, raw response sample, and errors so we can pinpoint why debtors are empty.

## Changes

### 1. `supabase/functions/tally-fetch/index.ts`
- Initialize `_debug.companies[company]` early in the ledger job and write **HTTP status + response byte count + first 600 chars of raw XML** for both Group and Ledger calls *before* parsing.
- In the catch block, write `exception: <message>` into `_debug.companies[company]` so failures are visible.
- Always include `result.errors` inside `_debug` when `debug:true`.

### 2. `src/pages/BusinessOverviewPage.tsx`
- Add a collapsible **"Sync diagnostics"** panel (shown after a sync runs) that displays, per company:
  - HTTP status / bytes for ledger + group fetch
  - Ledger count, Group count, Debtor/Creditor/Bank counts
  - First 5 sample ledgers with `name → parent → resolved root group → closing balance`
  - Any exception message
- Panel auto-expands when zero parties were matched or any error occurred.

## Expected outcome
Click **Sync Debtors & Creditors** once, then expand the diagnostics panel. The output will tell us exactly which scenario we're in:
- **`exception: "error sending request"` / timeout** → Lovable's servers cannot reach `103.239.89.153:9000`. Fix on the Tally/router side (port-forward, firewall, public IP).
- **HTTP 200 but `ledgerCount: 0`** → Tally reachable but company name mismatch or company not loaded.
- **`ledgerCount > 0` but `debtors: 0`** → sample will reveal the actual parent group names so we extend the classifier.

No UI redesign, no schema changes, no new dependencies.