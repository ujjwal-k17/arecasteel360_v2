## Diagnose "Synced 0 items from Tally"

The edge function reached Tally and got HTTP 200, but the parser found zero `<STOCKITEM>` blocks. We need to see the raw XML Tally is actually returning to fix the parser correctly.

### Step 1 — Add debug payload to `tally-sync`
In `supabase/functions/tally-sync/index.ts`, when `items.length === 0`, include a `debug` object in the JSON response containing:
- `rawLength` — total length of Tally's response
- `rawSnippet` — first 3000 chars of the raw XML
- `stockItemTagCount` — count of `<STOCKITEM` occurrences
- `tallyMessageTagCount` — count of `<TALLYMESSAGE` occurrences
- `contentType` — the Content-Type header Tally sent

No UI changes. The user clicks **Sync from Tally** once; I read the network response.

### Step 2 — Fix the parser based on what we see
After seeing the actual response shape:
- **If error envelope** (e.g. "Could not Set Object", "No Company Loaded") → surface the message in the toast.
- **If different tag structure** (items inside `<COLLECTION>`, `<TALLYMESSAGE>` only, etc.) → update the regex / switch to a real XML parser.
- **If genuinely empty** → show "No items in Tally" empty state.
- **If a specific company is needed** → add `<SVCURRENTCOMPANY>` to the request envelope.

### Files
- edit `supabase/functions/tally-sync/index.ts` (debug payload only — Step 1)
- Step 2 edits depend on what we observe.
