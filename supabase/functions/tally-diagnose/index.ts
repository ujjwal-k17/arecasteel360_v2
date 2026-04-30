// Diagnostic endpoint - probes Tally with minimal requests to see if it's alive,
// and can dump one receipt voucher's raw ledger entries.
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

function escapeXml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function buildReceiptDumpXml(company: string, fromDate: string, toDate: string, limit = 2): string {
  // Pull receipt vouchers in the date range — Tally returns full voucher XML
  // including <ALLLEDGERENTRIES.LIST> children with ISDEEMEDPOSITIVE / AMOUNT.
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ArecaReceiptDump</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY><SVFROMDATE>${fromDate}</SVFROMDATE><SVTODATE>${toDate}</SVTODATE></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="ArecaReceiptDump" ISMODIFY="No"><TYPE>Voucher</TYPE><FETCH>Date,VoucherTypeName,VoucherNumber,PartyLedgerName,Amount,AllLedgerEntries.List,IsCancelled</FETCH><FILTER>IsReceiptVch</FILTER></COLLECTION><SYSTEM TYPE="Formulae" NAME="IsReceiptVch">$$IsReceipt:$VoucherTypeName</SYSTEM></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
}

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
      bodyText: text,
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

  // Optional body: { company?: string, from?: string (YYYYMMDD), to?: string, dumpReceipts?: boolean }
  let body: any = {};
  try { if (req.method === 'POST') body = await req.json(); } catch { /* ignore */ }
  const dumpReceipts = !!body?.dumpReceipts;
  const company = body?.company as string | undefined;
  const from = (body?.from as string | undefined) || '20240101';
  const to = (body?.to as string | undefined) || new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const probes: any[] = [];
  probes.push(await probe('ping (current company)', PING_XML, 10000));
  probes.push(await probe('list companies', LIST_COMPANIES_XML, 15000));

  let receiptDump: any = null;
  if (dumpReceipts && company) {
    const r = await probe(`receipts (${company}) ${from}-${to}`, buildReceiptDumpXml(company, from, to, 2), 60000);
    if (r.bodyText) {
      // Extract first 2 <VOUCHER> blocks for inspection
      const blocks: string[] = [];
      const re = /<VOUCHER\b[\s\S]*?<\/VOUCHER>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(r.bodyText)) !== null) {
        blocks.push(m[0]);
        if (blocks.length >= 2) break;
      }
      receiptDump = {
        elapsedMs: r.elapsedMs,
        ok: r.ok,
        status: r.status,
        bodyLength: r.bodyLength,
        firstTwoVouchers: blocks,
      };
    } else {
      receiptDump = { elapsedMs: r.elapsedMs, ok: r.ok, status: r.status, error: r.error };
    }
  }

  return new Response(
    JSON.stringify({ tallyUrl: TALLY_URL, ping: probes[0], list: probes[1], receiptDump }, null, 2),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
