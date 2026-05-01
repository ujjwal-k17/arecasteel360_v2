# Switch Tally Sync to Cloudflare Tunnel

## Goal
Replace direct public-IP access (`http://103.239.89.153:9000`) — which is unreachable from the internet and causes "signal has been aborted" timeouts — with the Cloudflare Tunnel URL `https://360.arecasteel.com`. Keep the direct IP as a secondary fallback.

## Will this fix "signal has been aborted"?
Yes. The tunnel hostname is reachable globally over HTTPS. Cloudflare's edge accepts the request immediately and forwards it through the persistent outbound tunnel to `localhost:9000` on the Tally PC. No port-forwarding, no public-IP dependency, no firewall holes. Typical round-trip 200–800 ms — well inside the 10 s timeout.

The only ways the timeout could still occur after this change:
- `cloudflared` is not running on the Tally PC
- Tunnel hostname not mapped to `http://localhost:9000`
- Tally itself is closed (no listener on port 9000)
- Cloudflare Access policy blocks the edge function (would return 403, not abort)

## Changes

### 1. Add runtime secret
- `TALLY_TUNNEL_URL` = `https://360.arecasteel.com`
- Optional fallback `TALLY_DIRECT_URL` = `http://103.239.89.153:9000` (defaulted in code if missing)

### 2. `supabase/functions/tally-ping/index.ts`
Read both URLs from env. Try tunnel first (10 s timeout). On timeout / network error / 5xx, retry the direct IP (10 s timeout). Return which URL succeeded so the UI can show it.

Response shape:
```json
{ "reachable": true, "url": "https://360.arecasteel.com", "via": "tunnel", "error": null, "checked_at": "..." }
```

### 3. `supabase/functions/tally-sync-engine/index.ts`
Currently reads `tally_url` from `tally_companies` table and falls back to the hardcoded IP. Update the resolution order to:
1. `tally_companies.tally_url` (if set by admin)
2. `TALLY_TUNNEL_URL` env
3. `TALLY_DIRECT_URL` env / hardcoded IP

Wrap the Tally fetch in a try-tunnel-then-fallback helper so any sync (historical, current FY, current month, last month) automatically benefits. The four sync wrapper functions all call into `tally-sync-engine`, so this single change covers them.

### 4. `src/pages/TallySyncPage.tsx`
- Remove the hardcoded `TALLY_URL` constant; let the edge function decide.
- Status line shows the URL returned by `tally-ping` (e.g. "Tally Connected — via tunnel (https://360.arecasteel.com)" or "Tally Connected — via direct IP (fallback)").
- Refresh button keeps current behavior; toast surfaces which path succeeded.

## Technical details

**Fallback helper (used in both ping and sync-engine):**
```ts
async function fetchTally(body: string, urls: {tunnel?: string, direct?: string}) {
  const tryFetch = async (url: string) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body,
        signal: ctrl.signal,
      });
      return { ok: res.ok, status: res.status, text: await res.text(), url };
    } finally { clearTimeout(t); }
  };
  if (urls.tunnel) {
    try { return { ...(await tryFetch(urls.tunnel)), via: 'tunnel' as const }; }
    catch (e) { /* fall through */ }
  }
  if (urls.direct) {
    return { ...(await tryFetch(urls.direct)), via: 'direct' as const };
  }
  throw new Error('No Tally URL configured');
}
```

**Files touched:**
- `supabase/functions/tally-ping/index.ts` — rewrite with fallback helper, read env
- `supabase/functions/tally-sync-engine/index.ts` — replace single `fetch(tallyUrl, ...)` call sites with `fetchTally(...)`; resolution order updated
- `src/pages/TallySyncPage.tsx` — drop hardcoded URL, render `via` + `url` from ping response
- Add secret `TALLY_TUNNEL_URL` (will prompt you when implementation starts)

**Not touched:**
- `tally_companies.tally_url` DB column stays (still respected as highest-priority override)
- Sync wrapper functions (`sync-historical`, `sync-current-fy`, `sync-current-month`, `sync-last-month`) — they delegate to the engine
- No DB migration needed

## Out of scope
- Cloudflare Access service-token auth (can be added later if you lock down the tunnel)
- UI to edit tunnel URL from admin settings (using secret per your choice)