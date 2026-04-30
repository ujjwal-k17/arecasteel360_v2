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

// ============================================================
// XML helpers
// ============================================================
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

function parseAmount(s: string | null): number {
  if (!s) return 0;
  const cleaned = s.replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  const isCr = /Cr/i.test(s);
  return isCr ? -Math.abs(n) : Math.abs(n) * (s.trim().startsWith('-') ? -1 : 1);
}

function parseQty(s: string | null): number {
  if (!s) return 0;
  const m = s.match(/-?[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

// ============================================================
// XML builders
// ============================================================
function buildLedgerXml(company: string): string {
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ArecaLedgerSync</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="ArecaLedgerSync" ISMODIFY="No"><TYPE>Ledger</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD><NATIVEMETHOD>Parent</NATIVEMETHOD><NATIVEMETHOD>ClosingBalance</NATIVEMETHOD></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
}

function buildGroupXml(company: string): string {
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ArecaGroupSync</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="ArecaGroupSync" ISMODIFY="No"><TYPE>Group</TYPE><NATIVEMETHOD>Name</NATIVEMETHOD><NATIVEMETHOD>Parent</NATIVEMETHOD><NATIVEMETHOD>IsReserved</NATIVEMETHOD></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
}

function buildVoucherXml(company: string, fromDate: string, toDate: string, kind: 'sales' | 'purchase'): string {
  return `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ArecaVoucherSync</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY><SVFROMDATE>${fromDate}</SVFROMDATE><SVTODATE>${toDate}</SVTODATE></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="ArecaVoucherSync" ISMODIFY="No"><TYPE>Voucher</TYPE><FETCH>Date,VoucherTypeName,VoucherNumber,PartyLedgerName,Amount,InventoryEntries.List,IsInvoice,IsCancelled,IsOptional</FETCH><FILTER>${kind === 'sales' ? 'IsSalesVch' : 'IsPurchVch'}</FILTER></COLLECTION><SYSTEM TYPE="Formulae" NAME="IsSalesVch">$$IsSales:$VoucherTypeName</SYSTEM><SYSTEM TYPE="Formulae" NAME="IsPurchVch">$$IsPurchase:$VoucherTypeName</SYSTEM></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
}

// ============================================================
// Parsers
// ============================================================
type LedgerRow = { name: string; parent: string; closing: number };

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
    out.push({ name, parent, closing: parseAmount(closingRaw) });
  }
  return out;
}

type GroupRow = { name: string; parent: string; isReserved: boolean };

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
    const isReserved = /Yes/i.test(tag(inner, 'ISRESERVED') || '');
    if (!name) continue;
    out.push({ name, parent, isReserved });
  }
  return out;
}

function rootGroupOf(parent: string, groupMap: Map<string, string>): { root: string; chain: string[] } {
  const seen = new Set<string>();
  const chain: string[] = [];
  let cur = (parent || '').trim();
  while (cur && !seen.has(cur.toLowerCase())) {
    seen.add(cur.toLowerCase());
    chain.push(cur);
    const next = groupMap.get(cur.toLowerCase());
    if (next === undefined) break;
    if (!next || !next.trim()) break;
    cur = next.trim();
  }
  return { root: (cur || '').toLowerCase(), chain };
}

type VoucherRow = {
  date: string;
  voucherNumber: string;
  voucherType: string;
  party: string;
  amount: number;
  isCancelled: boolean;
  isOptional: boolean;
  items: { name: string; qty: number; rate: number; amount: number }[];
};

function parseVouchers(xml: string): VoucherRow[] {
  const out: VoucherRow[] = [];
  const blockRe = /<VOUCHER\b([^>]*)>([\s\S]*?)<\/VOUCHER>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(xml)) !== null) {
    const inner = m[2] || '';
    const isCancelled = /<ISCANCELLED[^>]*>\s*Yes/i.test(inner);
    const isOptional = /<ISOPTIONAL[^>]*>\s*Yes/i.test(inner);
    const dateRaw = tag(inner, 'DATE') || '';
    const date = dateRaw.length === 8
      ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      : dateRaw;
    const voucherNumber = tag(inner, 'VOUCHERNUMBER') || '';
    const voucherType = tag(inner, 'VOUCHERTYPENAME') || '';
    const party = tag(inner, 'PARTYLEDGERNAME') || tag(inner, 'PARTYNAME') || '';
    const amount = Math.abs(parseAmount(tag(inner, 'AMOUNT') || ''));

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
    out.push({ date, voucherNumber, voucherType, party, amount, isCancelled, isOptional, items });
  }
  return out;
}

// ============================================================
// Tally HTTP
// ============================================================
type TallyResult = { ok: boolean; text: string; status: number; error?: string };

async function callTally(xml: string, timeoutMs = 25000): Promise<TallyResult> {
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
      msg = `Cannot reach Tally at ${TALLY_URL} (${e.message || 'connection failed'})`;
    } else {
      msg = e?.message || String(e);
    }
    return { ok: false, text: '', status: 0, error: msg };
  } finally {
    clearTimeout(t);
  }
}

function classify(root: string): 'debtor' | 'creditor' | 'bank' | 'other' {
  if (root === 'sundry debtors') return 'debtor';
  if (root === 'sundry creditors') return 'creditor';
  if (root === 'bank accounts' || root === 'bank od a/c' || root === 'bank occ a/c') return 'bank';
  return 'other';
}

// ============================================================
// Handler
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Auth (regular client to validate the caller)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
  if (claimsErr || !claims?.claims) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const userId = claims.claims.sub as string;
  const userEmail = (claims.claims.email as string) || null;

  // Service-role client for snapshot writes (bypasses RLS)
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Date range: pull all available history
  const today = new Date();
  const fromTally = '19000101';
  const toTally = today.toISOString().slice(0, 10).replace(/-/g, '');

  // Create the run row
  const { data: runRow, error: runErr } = await admin.from('tally_sync_runs').insert({
    status: 'running',
    triggered_by: userId,
    triggered_by_email: userEmail,
    datasets: ['ledgers', 'sales', 'purchases'],
    companies: COMPANIES,
  }).select('id').single();

  if (runErr || !runRow) {
    return new Response(JSON.stringify({ error: 'Failed to create sync run', detail: runErr?.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const runId = runRow.id as string;

  const errors: { company: string; dataset: string; error: string }[] = [];
  const counts: Record<string, Record<string, number>> = {};
  const recordCount = (company: string, dataset: string, n: number) => {
    counts[company] = counts[company] || {};
    counts[company][dataset] = (counts[company][dataset] || 0) + n;
  };

  // ---- per-company work, run in parallel under a wall-clock guard ----
  const work = COMPANIES.map(async (company) => {
    // 1) Groups + Ledgers (one logical dataset)
    try {
      const [gResp, lResp] = await Promise.all([
        callTally(buildGroupXml(company)),
        callTally(buildLedgerXml(company)),
      ]);
      if (!lResp.ok) {
        errors.push({ company, dataset: 'ledgers', error: lResp.error || `HTTP ${lResp.status}` });
      } else {
        const groups = gResp.ok ? parseGroups(gResp.text) : [];
        const groupMap = new Map<string, string>();
        for (const g of groups) groupMap.set(g.name.toLowerCase(), g.parent);

        if (groups.length) {
          const groupRows = groups.map(g => ({
            sync_run_id: runId, company,
            name: g.name, parent: g.parent, is_reserved: g.isReserved,
          }));
          // chunked insert
          for (let i = 0; i < groupRows.length; i += 1000) {
            const { error } = await admin.from('tally_groups').insert(groupRows.slice(i, i + 1000));
            if (error) throw new Error(`groups insert: ${error.message}`);
          }
          recordCount(company, 'groups', groups.length);
        }

        const ledgers = parseLedgers(lResp.text);
        const ledgerRows = ledgers.map(l => {
          const { root, chain } = rootGroupOf(l.parent, groupMap);
          return {
            sync_run_id: runId, company,
            name: l.name, parent_group: l.parent, root_group: root,
            parent_chain: chain, closing_balance: l.closing,
            classification: classify(root),
          };
        });
        for (let i = 0; i < ledgerRows.length; i += 1000) {
          const { error } = await admin.from('tally_ledgers').insert(ledgerRows.slice(i, i + 1000));
          if (error) throw new Error(`ledgers insert: ${error.message}`);
        }
        recordCount(company, 'ledgers', ledgerRows.length);
      }
    } catch (e: any) {
      errors.push({ company, dataset: 'ledgers', error: e?.message || String(e) });
    }

    // 2 & 3) Sales + Purchase vouchers (independent)
    for (const kind of ['sales', 'purchase'] as const) {
      try {
        const r = await callTally(buildVoucherXml(company, fromTally, toTally, kind));
        if (!r.ok) {
          errors.push({ company, dataset: kind === 'sales' ? 'sales' : 'purchases', error: r.error || `HTTP ${r.status}` });
          continue;
        }
        const vs = parseVouchers(r.text);
        // Insert vouchers in chunks, then their items
        for (let i = 0; i < vs.length; i += 500) {
          const slice = vs.slice(i, i + 500);
          const voucherRows = slice.map(v => ({
            sync_run_id: runId, company, kind,
            voucher_type: v.voucherType, voucher_number: v.voucherNumber,
            voucher_date: v.date && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : null,
            party_name: v.party, amount: v.amount,
            is_cancelled: v.isCancelled, is_optional: v.isOptional,
          }));
          const { data: inserted, error } = await admin
            .from('tally_vouchers').insert(voucherRows).select('id');
          if (error) throw new Error(`vouchers insert: ${error.message}`);

          // items: map each inserted voucher to its parsed items (same order)
          const itemRows: any[] = [];
          (inserted || []).forEach((row, idx) => {
            for (const it of slice[idx].items) {
              itemRows.push({
                voucher_id: row.id,
                stock_item: it.name,
                qty: it.qty, rate: it.rate, amount: it.amount,
              });
            }
          });
          for (let j = 0; j < itemRows.length; j += 1000) {
            const { error: ie } = await admin.from('tally_voucher_items').insert(itemRows.slice(j, j + 1000));
            if (ie) throw new Error(`items insert: ${ie.message}`);
          }
        }
        recordCount(company, kind === 'sales' ? 'sales' : 'purchases', vs.length);
      } catch (e: any) {
        errors.push({ company, dataset: kind === 'sales' ? 'sales' : 'purchases', error: e?.message || String(e) });
      }
    }
  });

  // 90s wall-clock guard (whole sync). If we hit it we still finalize what we have.
  let timedOut = false;
  await Promise.race([
    Promise.all(work),
    new Promise<void>((resolve) => setTimeout(() => { timedOut = true; resolve(); }, 90000)),
  ]);
  if (timedOut) {
    errors.push({ company: '*', dataset: 'all', error: 'Backend wall-clock timeout (90s). Some datasets may be incomplete.' });
  }

  // Decide final status
  const totalInserted = Object.values(counts).reduce(
    (sum, byDs) => sum + Object.values(byDs).reduce((a, b) => a + b, 0), 0
  );
  let finalStatus: 'success' | 'partial' | 'failed';
  if (errors.length === 0 && totalInserted > 0) finalStatus = 'success';
  else if (totalInserted > 0) finalStatus = 'partial';
  else finalStatus = 'failed';

  await admin.from('tally_sync_runs').update({
    status: finalStatus,
    finished_at: new Date().toISOString(),
    counts,
    errors,
  }).eq('id', runId);

  return new Response(JSON.stringify({ runId, status: finalStatus, counts, errors }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
