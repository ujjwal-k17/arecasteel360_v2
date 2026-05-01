# Fix: Sync buttons not producing log rows

## Root cause

The buttons on `/tally-sync` DO call the orchestrator edge functions — confirmed by edge logs at 08:13 and 08:14 UTC today. The orchestrators (`sync-current-month`, `sync-last-month`, `sync-historical`) return HTTP 200, so the UI shows a success toast. But no rows appear in `tally_sync_log` because of an auth bug **inside** the orchestrators:

1. Each orchestrator loops over active companies and calls `supabase.functions.invoke('tally-sync-engine', { body })` using a **service-role** Supabase client.
2. `supabase.functions.invoke` from inside an edge function does NOT forward an `Authorization: Bearer <user-jwt>` header.
3. `tally-sync-engine` (lines 321–342) hard-rejects requests without a valid user JWT with HTTP 401.
4. The orchestrator catches the 401 per-company silently into a `results` array and returns `{ success: true, results: [...] }`, so the UI sees success while the engine never ran — no log row is ever inserted.

The single existing log row (`RUKMINI ISPAT GZB`, 07:55) was from your earlier direct manual test, not from any orchestrator click.

## Fix

### 1. Engine: accept service-role calls from other edge functions

In `supabase/functions/tally-sync-engine/index.ts`, replace the strict user-JWT-only auth (lines 320–342) with: accept EITHER a service-role bearer token OR a valid user JWT. This lets orchestrators invoke it server-to-server while still blocking unauthenticated public calls.

```text
authHeader required → Bearer <token>
if token === SUPABASE_SERVICE_ROLE_KEY  → allow (internal call)
else                                    → verify user via userClient.auth.getUser(token); reject if invalid
```

### 2. Orchestrators: forward service-role token when invoking the engine

In all three orchestrators (`sync-current-month`, `sync-last-month`, `sync-historical`), replace `supabase.functions.invoke('tally-sync-engine', { body })` with a direct `fetch` to the function URL, including:

- `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
- `apikey: ${SUPABASE_SERVICE_ROLE_KEY}`
- `Content-Type: application/json`

Use `${SUPABASE_URL}/functions/v1/tally-sync-engine` as the URL. Parse the JSON response and treat non-2xx as an error so the per-company `results[]` honestly reflects engine failures.

### 3. Front-end polish on `src/pages/TallySyncPage.tsx`

The mutation already shows toasts and invalidates the log query, but improve UX:

- Add a `Loader2` spinner inside each of the three sync buttons while `triggerSync.isPending && triggerSync.variables === '<that-fn-name>'`. Track which button is running via the mutation's `variables` field.
- Disable only the button that is currently running (instead of all three).
- After mutation success, show toast that includes per-company outcome counts parsed from the response, e.g. `"Sync started for 3 companies — 3 ok, 0 failed"`. If any company failed, use `toast.warning` and include the first error message.
- On error, surface the orchestrator error message in `toast.error`.
- Already in place and kept: 5s auto-refetch of `tally_sync_log`, query invalidation on success.

### 4. Verification

After deploy, click **Sync Last Month**. Within ~30 seconds expect:

- One new `running` row in `tally_sync_log` per active company (3 rows: Delhi FY-2022-23, Gzb FY-2022-23, RUKMINI ISPAT GZB).
- Each row transitions to `completed` (with `records_fetched`) or `failed` (with `error_message`).
- Sync Log table on the page reflects this without manual refresh.

## Technical details

**Files to change**
- `supabase/functions/tally-sync-engine/index.ts` — relax auth to accept service-role token.
- `supabase/functions/sync-current-month/index.ts` — replace `functions.invoke` with `fetch` + service-role bearer.
- `supabase/functions/sync-last-month/index.ts` — same change.
- `supabase/functions/sync-historical/index.ts` — same change.
- `src/pages/TallySyncPage.tsx` — per-button spinner, granular disabled state, richer success/error toasts.

**No DB migration required.** No changes to RLS, schema, or `tally_companies`.

**No secret changes required.** `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` are already available to all edge functions.
