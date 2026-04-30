# Diagnose why Tally is timing out

The 20-second timeout is firing for every Tally call. Before doing anything bigger (queues, workers), we need to know whether the Tally server at `103.239.89.153:9000` is even reachable.

## Step 1 — New edge function: `tally-diagnose`

A tiny function that runs two fast probes against Tally in parallel:
- **Ping**: asks for `$$CurrentCompany` (10s timeout)
- **List Companies**: asks Tally for the companies it has open (15s timeout)

Returns elapsed time, HTTP status, response length, and a 2 KB snippet of the raw response. No parsing, no business logic.

The result tells us the exact problem:

| Result | Meaning | Fix |
|---|---|---|
| Both timeout | Tally not running OR port 9000 blocked | Open Tally, enable "Act as Server", check firewall |
| HTTP error | Reverse proxy / wrong port | Adjust IP/port |
| Returns fast, empty company list | Tally up but no companies loaded | Open the two Areca companies |
| Returns fast with names | Names don't match our `COMPANIES` array | Update names in `tally-fetch` |

## Step 2 — "Test Connection" button on Business Overview

A small button next to "Sync from Tally". Calls `tally-diagnose` and shows the JSON response in a dialog. Makes future Tally debugging a one-click operation.

## Files

- **New**: `supabase/functions/tally-diagnose/index.ts`
- **Modified**: `src/pages/BusinessOverviewPage.tsx` — add Test Connection button + result dialog

## What I'm NOT doing

Not building the queue/background-worker architecture yet. If the real issue is "Tally isn't running" or "companies aren't loaded", a queue won't fix it — it'll just hide the timeout behind a longer one. We'll revisit only if diagnostics show Tally is genuinely reachable but slow.
