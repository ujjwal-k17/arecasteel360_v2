// Diagnostic endpoint - probes Tally with minimal requests to see if it's alive
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TALLY_URL = 'http://103.239.89.153:9000';

const PING_XML = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Function</TYPE>
    <ID>$$CurrentCompany</ID>
  </HEADER>
  <BODY>
    <DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES></DESC>
  </BODY>
</ENVELOPE>`;

const LIST_COMPANIES_XML = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
      <TDL><TDLMESSAGE>
        <COLLECTION NAME="List of Companies" ISMODIFY="No">
          <TYPE>Company</TYPE>
          <NATIVEMETHOD>Name</NATIVEMETHOD>
        </COLLECTION>
      </TDLMESSAGE></TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

async function probe(label: string, xml: string, timeoutMs: number) {
  const start = Date.now();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(TALLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xml,
      signal: controller.signal,
    });
    const text = await resp.text();
    return {
      label,
      ok: resp.ok,
      status: resp.status,
      elapsedMs: Date.now() - start,
      bodyLength: text.length,
      bodySnippet: text.slice(0, 2000),
    };
  } catch (e: any) {
    return {
      label,
      ok: false,
      status: 0,
      elapsedMs: Date.now() - start,
      error: e?.name === 'AbortError' ? `Timed out after ${timeoutMs}ms` : (e?.message || String(e)),
    };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const [ping, list] = await Promise.all([
    probe('ping (current company)', PING_XML, 10000),
    probe('list companies', LIST_COMPANIES_XML, 15000),
  ]);

  return new Response(
    JSON.stringify({ tallyUrl: TALLY_URL, ping, list }, null, 2),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
