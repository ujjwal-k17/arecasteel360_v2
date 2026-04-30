import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TALLY_URL = 'http://103.239.89.153:9000';

const TALLY_XML = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Stock Items</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '');
}

function parseStockItems(xml: string): Array<{ name: string; quantity: string; value: string }> {
  const items: Array<{ name: string; quantity: string; value: string }> = [];
  // Match <STOCKITEM ...>...</STOCKITEM> blocks
  const blockRe = /<STOCKITEM\b([^>]*)>([\s\S]*?)<\/STOCKITEM>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const attrs = m[1] || '';
    const inner = m[2] || '';
    // NAME attribute (e.g. NAME="Item A")
    const nameAttrMatch = attrs.match(/NAME\s*=\s*"([^"]*)"/i);
    let name = nameAttrMatch ? decodeEntities(nameAttrMatch[1]) : '';
    if (!name) {
      const nameTag = inner.match(/<NAME>([\s\S]*?)<\/NAME>/i);
      name = nameTag ? decodeEntities(nameTag[1].trim()) : '';
    }
    const balMatch = inner.match(/<CLOSINGBALANCE>([\s\S]*?)<\/CLOSINGBALANCE>/i);
    const valMatch = inner.match(/<CLOSINGVALUE>([\s\S]*?)<\/CLOSINGVALUE>/i);
    const quantity = balMatch ? decodeEntities(balMatch[1].trim()) : '';
    const value = valMatch ? decodeEntities(valMatch[1].trim()) : '';
    if (!name) continue;
    // Skip group/header rows with no data
    if (!quantity && !value) continue;
    items.push({ name, quantity, value });
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call Tally with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let tallyResp: Response;
    try {
      tallyResp = await fetch(TALLY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        body: TALLY_XML,
        signal: controller.signal,
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      const msg = e?.name === 'AbortError'
        ? 'Tally Server did not respond within 30s. Make sure Tally is running and reachable at 103.239.89.153:9000.'
        : `Could not reach Tally Server: ${e?.message || String(e)}`;
      return new Response(JSON.stringify({ error: msg }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    clearTimeout(timeoutId);

    const text = await tallyResp.text();
    if (!tallyResp.ok) {
      return new Response(
        JSON.stringify({ error: `Tally returned HTTP ${tallyResp.status}`, raw: text.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const items = parseStockItems(text);

    return new Response(
      JSON.stringify({ items, fetchedAt: new Date().toISOString(), count: items.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
