const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { url } = await req.json().catch(() => ({ url: "http://103.239.89.153:9000" }));
    const target = url || "http://103.239.89.153:9000";

    const xml = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Companies</REPORTNAME></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    let reachable = false;
    let error: string | null = null;
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "text/xml" },
        body: xml,
        signal: ctrl.signal,
      });
      reachable = res.ok;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      clearTimeout(t);
    }

    return new Response(JSON.stringify({ reachable, url: target, error, checked_at: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ reachable: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
