import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TALLY_URL = 'http://103.239.89.153:9000';

const COMPANIES = [
  'Areca Indocorp LLP (Delhi) - FY-2022-23',
  'Areca Indocorp LLP (Gzb.) FY-2022-23',
];

// ----------------- helpers -----------------
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(inner: string, name: string): string | null {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = inner.match(re);
  return m ? decodeEntities(m[1].trim()) : null;
}

function tagAll(inner: string, name: string): string[] {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) out.push(decodeEntities(m[1].trim()));
  return out;
}

function parseAmount(s: string | null): number {
  if (!s) return 0;
  // Tally returns amounts like " 1234.56 Dr" or " -1234.56" - extract sign and number
  const cleaned = s.replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  // Treat trailing "Cr" as negative for outstanding (debtor Cr = advance/credit)
  const isCr = /Cr/i.test(s);
  return isCr ? -Math.abs(n) : Math.abs(n) * (n < 0 ? 1 : 1) * (s.trim().startsWith('-') ? -1 : 1);
}

function parseQty(s: string | null): number {
  if (!s) return 0;
  const m = s.match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

// ----------------- XML builders -----------------
function buildLedgerXml(company: string): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ArecaLedgerSync</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ArecaLedgerSync" ISMODIFY="No">
            <TYPE>Ledger</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Parent</NATIVEMETHOD>
            <NATIVEMETHOD>ClosingBalance</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildGroupXml(company: string): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ArecaGroupSync</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ArecaGroupSync" ISMODIFY="No">
            <TYPE>Group</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Parent</NATIVEMETHOD>
            <NATIVEMETHOD>IsReserved</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildVoucherXml(company: string, fromDate: string, toDate: string, voucherTypeFilter: 'sales' | 'purchase'): string {
  // Date format YYYYMMDD
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>ArecaVoucherSync</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>
        <SVFROMDATE>${fromDate}</SVFROMDATE>
        <SVTODATE>${toDate}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="ArecaVoucherSync" ISMODIFY="No">
            <TYPE>Voucher</TYPE>
            <FETCH>Date,VoucherTypeName,VoucherNumber,PartyLedgerName,Amount,InventoryEntries.List,IsInvoice,IsCancelled,IsOptional</FETCH>
            <FILTER>${voucherTypeFilter === 'sales' ? 'IsSalesVch' : 'IsPurchVch'}</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="IsSalesVch">$$IsSales:$VoucherTypeName</SYSTEM>
          <SYSTEM TYPE="Formulae" NAME="IsPurchVch">$$IsPurchase:$VoucherTypeName</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

// ----------------- parsers -----------------
type LedgerRow = {
  name: string;
  parent: string;
  closing: number;
  raw: string;
};

function parseLedgers(xml: string): LedgerRow[] {
  const out: LedgerRow[] = [];
  const blockRe = /<LEDGER\b([^>]*)>([\s\S]*?)<\/LEDGER>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const attrs = m[1] || '';
    const inner = m[2] || '';
    const nameAttr = attrs.match(/NAME\s*=\s*"([^"]*)"/i);
    const name = nameAttr ? decodeEntities(nameAttr[1]) : (tag(inner, 'NAME') || '');
    const parent = tag(inner, 'PARENT') || '';
    const closingRaw = tag(inner, 'CLOSINGBALANCE') || '';
    if (!name) continue;
    out.push({ name, parent, closing: parseAmount(closingRaw), raw: closingRaw });
  }
  return out;
}

type GroupRow = { name: string; parent: string };

function parseGroups(xml: string): GroupRow[] {
  const out: GroupRow[] = [];
  const blockRe = /<GROUP\b([^>]*)>([\s\S]*?)<\/GROUP>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const attrs = m[1] || '';
    const inner = m[2] || '';
    const nameAttr = attrs.match(/NAME\s*=\s*"([^"]*)"/i);
    const name = nameAttr ? decodeEntities(nameAttr[1]) : (tag(inner, 'NAME') || '');
    const parent = tag(inner, 'PARENT') || '';
    if (!name) continue;
    out.push({ name, parent });
  }
  return out;
}

// Walk parent chain in groupMap until we hit a reserved primary group
// or run out of parents. Returns the final ancestor name (lowercased).
function rootGroupOf(parent: string, groupMap: Map<string, string>): string {
  const seen = new Set<string>();
  let cur = (parent || '').trim();
  while (cur && !seen.has(cur.toLowerCase())) {
    seen.add(cur.toLowerCase());
    const next = groupMap.get(cur.toLowerCase());
    if (!next) break;
    cur = next.trim();
  }
  return (cur || '').toLowerCase();
}

type VoucherRow = {
  date: string;
  voucherNumber: string;
  voucherType: string;
  party: string;
  amount: number;
  items: { name: string; qty: number; rate: number; amount: number }[];
};

function parseVouchers(xml: string): VoucherRow[] {
  const out: VoucherRow[] = [];
  const blockRe = /<VOUCHER\b([^>]*)>([\s\S]*?)<\/VOUCHER>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const inner = m[2] || '';
    if (/<ISCANCELLED[^>]*>\s*Yes/i.test(inner)) continue;
    if (/<ISOPTIONAL[^>]*>\s*Yes/i.test(inner)) continue;
    const dateRaw = tag(inner, 'DATE') || '';
    // Tally date YYYYMMDD -> ISO
    const date = dateRaw.length === 8
      ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      : dateRaw;
    const voucherNumber = tag(inner, 'VOUCHERNUMBER') || '';
    const voucherType = tag(inner, 'VOUCHERTYPENAME') || '';
    const party = tag(inner, 'PARTYLEDGERNAME') || tag(inner, 'PARTYNAME') || '';
    const amountRaw = tag(inner, 'AMOUNT') || '';
    const amount = Math.abs(parseAmount(amountRaw));

    const items: VoucherRow['items'] = [];
    const invRe = /<ALLINVENTORYENTRIES\.LIST>([\s\S]*?)<\/ALLINVENTORYENTRIES\.LIST>/gi;
    let im: RegExpExecArray | null;
    while ((im = invRe.exec(inner)) !== null) {
      const ie = im[1];
      const stockName = tag(ie, 'STOCKITEMNAME') || '';
      const qty = parseQty(tag(ie, 'ACTUALQTY') || tag(ie, 'BILLEDQTY') || '');
      const rate = parseQty(tag(ie, 'RATE') || '');
      const amt = Math.abs(parseAmount(tag(ie, 'AMOUNT') || ''));
      if (stockName) items.push({ name: stockName, qty, rate, amount: amt });
    }
    out.push({ date, voucherNumber, voucherType, party, amount, items });
  }
  return out;
}

// ----------------- Tally call -----------------
type TallyCallResult = { ok: boolean; text: string; status: number; error?: string };

async function callTally(xml: string, timeoutMs = 25000): Promise<TallyCallResult> {
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
    return { ok: resp.ok, text, status: resp.status };
  } catch (e: any) {
    let msg: string;
    if (e?.name === 'AbortError') {
      msg = `Tally timed out after ${Math.round(timeoutMs / 1000)}s`;
    } else if (e instanceof TypeError) {
      // Deno fetch raises TypeError for DNS / refused / unreachable
      msg = `Cannot reach Tally at ${TALLY_URL} (${e.message || 'connection failed'})`;
    } else {
      msg = e?.message || String(e);
    }
    return { ok: false, text: '', status: 0, error: msg };
  } finally {
    clearTimeout(t);
  }
}

function toTallyDate(iso: string): string {
  // ISO YYYY-MM-DD -> YYYYMMDD
  return iso.replace(/-/g, '').slice(0, 8);
}

// ----------------- handler -----------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const body = await req.json().catch(() => ({}));
    const dataset = (body.dataset || 'all') as 'debtors' | 'banks' | 'ledgers' | 'dispatches' | 'purchases' | 'vouchers' | 'all';
    const debug = body.debug === true;
    const fromDate = body.fromDate as string | undefined; // ISO
    const toDate = body.toDate as string | undefined; // ISO

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const fromIso = fromDate || monthStart.toISOString().slice(0, 10);
    const toIso = toDate || today.toISOString().slice(0, 10);
    const fromTally = toTallyDate(fromIso);
    const toTally = toTallyDate(toIso);

    const result: any = {
      debtors: [],
      creditors: [],
      banks: [],
      dispatches: [],
      purchases: [],
      errors: [] as { company: string; dataset: string; error: string }[],
      fetchedAt: new Date().toISOString(),
      fromDate: fromIso,
      toDate: toIso,
      companies: COMPANIES,
    };
    const debugInfo: any = debug ? { companies: {} } : null;

    type Job =
      | { kind: 'ledgers'; company: string }
      | { kind: 'sales'; company: string }
      | { kind: 'purchase'; company: string };

    const jobs: Job[] = [];
    for (const company of COMPANIES) {
      if (dataset === 'all' || dataset === 'debtors' || dataset === 'banks' || dataset === 'ledgers') {
        jobs.push({ kind: 'ledgers', company });
      }
      if (dataset === 'all' || dataset === 'vouchers' || dataset === 'dispatches') {
        jobs.push({ kind: 'sales', company });
      }
      if (dataset === 'all' || dataset === 'vouchers' || dataset === 'purchases') {
        jobs.push({ kind: 'purchase', company });
      }
    }

    const allJobs = Promise.all(jobs.map(async (job) => {
      const ensureDbg = () => {
        if (!debug) return null;
        debugInfo.companies[job.company] = debugInfo.companies[job.company] || {};
        return debugInfo.companies[job.company];
      };
      try {
        if (job.kind === 'ledgers') {
          const [gResp, lResp] = await Promise.all([
            callTally(buildGroupXml(job.company)),
            callTally(buildLedgerXml(job.company)),
          ]);

          const dbg = ensureDbg();
          if (dbg) {
            dbg.ledgerHttp = `${lResp.status} (${lResp.text.length} bytes)`;
            dbg.groupHttp = `${gResp.status} (${gResp.text.length} bytes)`;
            dbg.ledgerSample = lResp.text.slice(0, 600);
            dbg.groupSample = gResp.text.slice(0, 600);
          }

          if (!lResp.ok) {
            const errMsg = lResp.error || `HTTP ${lResp.status}`;
            result.errors.push({ company: job.company, dataset: 'ledgers', error: errMsg });
            if (dbg) dbg.ledgerError = errMsg;
            return;
          }
          const groups = gResp.ok ? parseGroups(gResp.text) : [];
          const groupMap = new Map<string, string>();
          for (const g of groups) groupMap.set(g.name.toLowerCase(), g.parent);

          const ledgers = parseLedgers(lResp.text);

          let dCount = 0, cCount = 0, bCount = 0;
          const sample: any[] = [];

          for (const l of ledgers) {
            const root = rootGroupOf(l.parent, groupMap);
            const parent = (l.parent || '').toLowerCase();

            const isDebtor =
              root === 'sundry debtors' ||
              parent.includes('sundry debtor') ||
              parent.includes('debtor') ||
              parent.includes('receivable');
            const isCreditor =
              root === 'sundry creditors' ||
              parent.includes('sundry creditor') ||
              parent.includes('creditor') ||
              parent.includes('payable');
            const isBank =
              root === 'bank accounts' ||
              root === 'bank od a/c' ||
              root === 'bank occ a/c' ||
              parent.includes('bank');

            if (debug && sample.length < 10) {
              sample.push({ name: l.name, parent: l.parent, root, closing: l.closing });
            }

            if (isDebtor) {
              dCount++;
              result.debtors.push({ company: job.company, partyName: l.name, outstanding: l.closing, overdue: 0 });
            } else if (isCreditor) {
              cCount++;
              result.creditors.push({ company: job.company, partyName: l.name, outstanding: l.closing });
            } else if (isBank) {
              bCount++;
              result.banks.push({ company: job.company, accountName: l.name, balance: l.closing });
            }
          }

          if (dbg) {
            Object.assign(dbg, {
              ledgerCount: ledgers.length,
              groupCount: groups.length,
              debtors: dCount,
              creditors: cCount,
              banks: bCount,
              sampleLedgers: sample,
              sampleGroups: groups.slice(0, 10),
            });
          }
        } else {
          const filter = job.kind === 'sales' ? 'sales' : 'purchase';
          const r = await callTally(buildVoucherXml(job.company, fromTally, toTally, filter));
          const dsName = filter === 'sales' ? 'dispatches' : 'purchases';
          if (!r.ok) {
            const errMsg = r.error || `HTTP ${r.status}`;
            result.errors.push({ company: job.company, dataset: dsName, error: errMsg });
            return;
          }
          const vs = parseVouchers(r.text);
          for (const v of vs) {
            const row: any = {
              company: job.company,
              date: v.date,
              voucherNumber: v.voucherNumber,
              voucherType: v.voucherType,
              amount: v.amount,
              items: v.items,
              totalQty: v.items.reduce((s, i) => s + (i.qty || 0), 0),
              itemsSummary: v.items.map(i => i.name).filter(Boolean).join(', '),
            };
            if (filter === 'sales') {
              row.party = v.party;
              result.dispatches.push(row);
            } else {
              row.supplier = v.party;
              result.purchases.push(row);
            }
          }
        }
      } catch (e: any) {
        const dsName = job.kind === 'ledgers' ? 'ledgers' : (job.kind === 'sales' ? 'dispatches' : 'purchases');
        const msg = e?.name === 'AbortError' ? 'Tally timed out' : (e?.message || String(e));
        result.errors.push({ company: job.company, dataset: dsName, error: msg });
        const dbg = ensureDbg();
        if (dbg) dbg.exception = msg;
      }
    }));

    // Hard wall-clock guard: never let the worker get killed by the platform.
    // If jobs don't all finish within 60s, return whatever we have so far.
    let timedOut = false;
    await Promise.race([
      allJobs,
      new Promise<void>((resolve) => setTimeout(() => { timedOut = true; resolve(); }, 60000)),
    ]);
    if (timedOut) {
      result.errors.push({
        company: '*',
        dataset: 'all',
        error: 'Backend wall-clock timeout (60s). Tally is likely unreachable; returning partial results.',
      });
    }

    if (debug) {
      debugInfo.errors = result.errors;
      result._debug = debugInfo;
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
