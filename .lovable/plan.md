## Tally Sync Integration

### 1. New edge function `supabase/functions/tally-sync/index.ts`
- CORS headers + OPTIONS handler.
- Validate caller's JWT via `supabase.auth.getClaims()` (authenticated users only).
- POST the provided XML envelope to `http://103.239.89.153:9000` with `Content-Type: text/xml; charset=utf-8`, 30s `AbortController` timeout.
- Parse Tally's XML response: iterate `<STOCKITEM>` elements, extract `NAME` attribute, `<CLOSINGBALANCE>`, `<CLOSINGVALUE>`. Filter out group rows with empty balance.
- Return `{ items: [{ name, quantity, value }], fetchedAt }` as JSON.
- On network/timeout/parse failure return 502 with `{ error }` and include raw text snippet for debugging.
- Default `verify_jwt = false` is fine (in-code check); no `supabase/config.toml` edit needed.

### 2. Dashboard UI `src/components/DashboardTab.tsx`
- Add a "Tally Sync" card at the top with a **Sync from Tally** button.
- Use `useMutation` calling `supabase.functions.invoke('tally-sync')`. Disable button while pending (per project convention).
- On success: show "Last synced at ..." and render a table with columns **Item Name | Quantity | Value**. Empty state when no items.
- On error: toast with friendly message ("Could not reach Tally — make sure Tally Server is running and reachable at 103.239.89.153:9000").

### Caveats to flag to user after build
- Tally must be reachable from the public internet at that IP/port (not behind NAT/firewall). If it isn't, the function will time out — that's a network/infrastructure issue, not a code bug.
- Data is ephemeral (not stored). Tell me if you want a history table.

### Files
- create `supabase/functions/tally-sync/index.ts`
- edit `src/components/DashboardTab.tsx`
