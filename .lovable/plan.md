## Problem

The browser shows "Failed to send a request to the Edge Function" when syncing Debtors & Creditors. Edge function logs show clean boot/shutdown cycles with no exception trace, and shutdowns occur ~75–80 seconds after boot. This indicates the edge worker is being killed by the platform's wall-clock limit because the 4 parallel Tally calls (2 companies × groups + ledgers, each with a 90s timeout) all hang when Tally is unreachable. When the worker dies mid-request, the client receives a transport-level invoke failure instead of a JSON response.

This is independent of (and additional to) the underlying network issue that Tally on the cloud RDP isn't reachable on port 9000.

## Fix

Make `supabase/functions/tally-fetch/index.ts` resilient so it always returns a JSON response within the platform's time budget, even when Tally is unreachable.

### 1. Reduce per-request timeout

Change `callTally` default `timeoutMs` from `90000` → `25000`. Twenty-five seconds is more than enough for a healthy Tally response and leaves headroom for the function to assemble and return the response within the platform limit.

### 2. Classify network errors clearly

In `callTally`, wrap the `fetch` in a try/catch. Distinguish:
- `AbortError` → "Tally timed out (25s)"
- `TypeError` / connection errors → "Cannot reach Tally at 103.239.89.153:9000 (connection refused or unreachable)"
- Other → original message

Return these as structured `{ ok: false, text: '', status: 0, error: <msg> }` instead of throwing, so the job loop records a per-company error and continues.

### 3. Hard wall-clock guard

Add an outer `Promise.race` around the `Promise.all(jobs.map(...))` with a 60-second cap. If hit, mark any unresolved jobs as "Tally unreachable (timeout)" and return whatever partial data we have plus errors. Guarantees the function always responds within budget.

### 4. Better client-side error message

In `BusinessOverviewPage.tsx`, in `handleSyncLedgers` (and `handleSyncVouchers`), when `supabase.functions.invoke` returns a transport `error` (FunctionsFetchError), surface a friendlier message: "Backend timed out reaching Tally. Check that Tally on the cloud RDP is running and port 9000 is open." instead of the raw "Failed to send a request to the Edge Function".

## Files

- `supabase/functions/tally-fetch/index.ts` — timeout reduction, error classification, wall-clock guard
- `src/pages/BusinessOverviewPage.tsx` — friendlier error toast for invoke failures

## What this does and doesn't fix

- **Fixes**: The unhelpful "Failed to send a request" error. After this change, when Tally is unreachable, the UI will clearly say so per company, and the diagnostics panel will show specific reasons (timeout vs. connection refused vs. DNS).
- **Does NOT fix**: Tally itself being unreachable. That still requires opening inbound TCP 9000 on the cloud RDP's firewall/security group as discussed earlier. Once that's done, the existing sync logic will work — this change just makes the failure mode informative until then.

No database changes. No new dependencies.