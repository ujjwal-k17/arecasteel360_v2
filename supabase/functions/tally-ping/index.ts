const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DIRECT_DEFAULT = "http://103.239.89.153:9000";
const PING_TIMEOUT_MS = 10_000;

const PING_XML = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;

async function tryPing(url: string): Promise<{ reachable: boolean; error: string | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: PING_XML,
      signal: ctrl.signal,
    });
    if (!res.ok) return { reachable: false, error: `HTTP ${res.status}` };
    return { reachable: true, error: null };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    const friendly = msg.includes("aborted") ? `Timed out after ${PING_TIMEOUT_MS}ms` : msg;
    return { reachable: false, error: friendly };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const tunnelUrl = (body?.url as string | undefined) || Deno.env.get("TALLY_TUNNEL_URL") || "";
    const directUrl = Deno.env.get("TALLY_DIRECT_URL") || DIRECT_DEFAULT;

    const attempts: { url: string; via: "tunnel" | "direct"; error: string | null }[] = [];

    // Try tunnel first
    if (tunnelUrl) {
      const r = await tryPing(tunnelUrl);
      if (r.reachable) {
        return new Response(
          JSON.stringify({
            reachable: true,
            url: tunnelUrl,
            via: "tunnel",
            error: null,
            attempts,
            checked_at: new Date().toISOString(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      attempts.push({ url: tunnelUrl, via: "tunnel", error: r.error });
    }

    // Fallback to direct IP
    if (directUrl) {
      const r = await tryPing(directUrl);
      if (r.reachable) {
        return new Response(
          JSON.stringify({
            reachable: true,
            url: directUrl,
            via: "direct",
            error: null,
            attempts,
            checked_at: new Date().toISOString(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      attempts.push({ url: directUrl, via: "direct", error: r.error });
    }

    const lastErr = attempts.length > 0 ? attempts[attempts.length - 1].error : "No Tally URL configured";
    return new Response(
      JSON.stringify({
        reachable: false,
        url: tunnelUrl || directUrl,
        via: null,
        error: lastErr,
        attempts,
        checked_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ reachable: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
