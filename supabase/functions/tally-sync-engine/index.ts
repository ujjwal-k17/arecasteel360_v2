// Tally Sync Engine — core function called by all sync buttons.
// Accepts: company_name, from_date (YYYYMMDD), to_date (YYYYMMDD), sync_type, chunk_label.
// Sequence: lock check -> log row -> fetch ledgers -> fetch vouchers -> save partial -> finalize log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TALLY_URL_DEFAULT = 'http://103.239.89.153:9000';
const TALLY_TIMEOUT_MS = 30_000;
const FETCH_RETRIES = 3;
const RETRY_GAP_MS = 5_000;
const INTER_STEP_GAP_MS = 2_000;
const LOCK_WINDOW_MIN = 10;

// ---------- helpers ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXmlEntities(s: string): string {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#4;/g, '');
}

function getTagText(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  if (!m) return null;
  return decodeXmlEntities(m[1].trim());
}

function getAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, 'gi');
  return xml.match(re) || [];
}

function parseTallyAmount(raw: string | null | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[₹,\s]/g, '').trim();
  // Tally amounts can look like "(-)1234.50" or "-1234.50" or "1234.50"
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return 0;
  let n = parseFloat(m[0]);
  if (cleaned.startsWith('(-)') || cleaned.startsWith('-')) n = -Math.abs(n);
  return isNaN(n) ? 0 : n;
}

// YYYYMMDD -> YYYY-MM-DD (ISO date)
function tallyDateToIso(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = String(d).trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  // already iso?
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

// YYYYMMDD <-> Date (UTC) helpers
function yyyymmddToDate(s: string): Date {
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6)) - 1;
  const d = Number(s.slice(6, 8));
  return new Date(Date.UTC(y, m, d));
}
function dateToYyyymmdd(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, '0');
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = d.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${day}`;
}

// Split [from, to] (inclusive, YYYYMMDD) into ~7-day windows.
// Example for 20260401..20260430 ->
//   [20260401,20260407], [20260408,20260414], [20260415,20260421],
//   [20260422,20260428], [20260429,20260430]
function buildWeeklyRanges(from: string, to: string): Array<[string, string]> {
  const start = yyyymmddToDate(from);
  const end = yyyymmddToDate(to);
  if (end.getTime() < start.getTime()) return [];
  const out: Array<[string, string]> = [];
  let cur = start;
  while (cur.getTime() <= end.getTime()) {
    const next = new Date(cur.getTime());
    next.setUTCDate(next.getUTCDate() + 6); // 7-day inclusive window
    const sliceEnd = next.getTime() > end.getTime() ? end : next;
    out.push([dateToYyyymmdd(cur), dateToYyyymmdd(sliceEnd)]);
    const after = new Date(sliceEnd.getTime());
    after.setUTCDate(after.getUTCDate() + 1);
    cur = after;
  }
  return out;
}

// Pull NAME from either <NAME> child or NAME="..." attribute
function extractNameAttr(block: string): string | null {
  const child = getTagText(block, 'NAME');
  if (child) return child;
  const attr = block.match(/\sNAME="([^"]+)"/i);
  return attr ? decodeXmlEntities(attr[1]) : null;
}

// ---------- Tally request with retry ----------

async function tallyRequestOnce(url: string, xml: string): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TALLY_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      body: xml,
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (!text || text.length < 20) throw new Error('Empty response from Tally');
    return text;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error(`Timed out after ${TALLY_TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function tallyRequestWithRetry(url: string, xml: string, label: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let lastErr = '';
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const text = await tallyRequestOnce(url, xml);
      return { ok: true, text };
    } catch (e: any) {
      lastErr = e?.message || String(e);
      console.log(`[${label}] attempt ${attempt}/${FETCH_RETRIES} failed: ${lastErr}`);
      if (attempt < FETCH_RETRIES) await sleep(RETRY_GAP_MS);
    }
  }
  return { ok: false, error: `${label} failed after ${FETCH_RETRIES} attempts: ${lastErr}` };
}

// ---------- XML builders ----------

function buildSetCompanyXml(company: string): string {
  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Set Company</TALLYREQUEST>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>
        <LOADCOMPANYONDEMAND>Yes</LOADCOMPANYONDEMAND>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

function buildLedgerXml(company: string): string {
  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Ledger</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>
          <LOADCOMPANYONDEMAND>Yes</LOADCOMPANYONDEMAND>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
}

function buildDayBookXml(company: string, fromDate: string, toDate: string): string {
  return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>VoucherCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>
          <SVFROMDATE>${escapeXml(fromDate)}</SVFROMDATE>
          <SVTODATE>${escapeXml(toDate)}</SVTODATE>
          <LOADCOMPANYONDEMAND>Yes</LOADCOMPANYONDEMAND>
        </STATICVARIABLES>
        <TDL>
          <TDLMESSAGE>
            <COLLECTION NAME="VoucherCollection" ISMODIFY="No">
              <TYPE>Voucher</TYPE>
              <FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,PARTYNAME,NARRATION,AMOUNT,MASTERID,ISCANCELLED,ALLLEDGERENTRIES.*,ALLINVENTORYENTRIES.*,INVENTORYENTRIES.*</FETCH>
              <FILTER>DateFilter</FILTER>
            </COLLECTION>
            <SYSTEM TYPE="Formulae" NAME="DateFilter">$Date &gt;= $$Date:##SVFromDate AND $Date &lt;= $$Date:##SVToDate</SYSTEM>
          </TDLMESSAGE>
        </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
}

// ---------- parsers ----------

type LedgerRow = {
  company_name: string;
  ledger_name: string;
  ledger_group: string | null;
  closing_balance: number;
  as_of_date: string; // ISO
  synced_at: string;
};

function parseLedgers(xml: string, companyName: string, asOfIso: string, syncedAtIso: string): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const blocks = getAllBlocks(xml, 'LEDGER');
  const seen = new Set<string>();
  for (const b of blocks) {
    const name = extractNameAttr(b);
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    const parent = getTagText(b, 'PARENT');
    const closing = parseTallyAmount(getTagText(b, 'CLOSINGBALANCE') || getTagText(b, 'OPENINGBALANCE'));
    rows.push({
      company_name: companyName,
      ledger_name: name,
      ledger_group: parent,
      closing_balance: closing,
      as_of_date: asOfIso,
      synced_at: syncedAtIso,
    });
  }
  return rows;
}

type VoucherRow = {
  company_name: string;
  voucher_number: string;
  voucher_type: string | null;
  date: string | null;
  party_name: string | null;
  amount: number;
  narration: string | null;
  line_items: any;
  sync_type: string | null;
  synced_at: string;
};

function parseVouchers(xml: string, companyName: string, syncType: string | null, syncedAtIso: string): VoucherRow[] {
  const rows: VoucherRow[] = [];
  const blocks = getAllBlocks(xml, 'VOUCHER');
  const seen = new Set<string>();

  for (const b of blocks) {
    const isCancelled = (getTagText(b, 'ISCANCELLED') || '').toLowerCase() === 'yes';
    if (isCancelled) continue;

    const voucherNumber = getTagText(b, 'VOUCHERNUMBER') || getTagText(b, 'MASTERID');
    if (!voucherNumber) continue;
    const voucherType = getTagText(b, 'VOUCHERTYPENAME');
    const dateIso = tallyDateToIso(getTagText(b, 'DATE'));
    const voucherKey = `${dateIso || ''}::${voucherType || ''}::${voucherNumber}`;
    if (seen.has(voucherKey)) continue;
    seen.add(voucherKey);

    const partyName = getTagText(b, 'PARTYLEDGERNAME') || getTagText(b, 'PARTYNAME');
    const narration = getTagText(b, 'NARRATION');
    const amount = Math.abs(parseTallyAmount(getTagText(b, 'AMOUNT')));

    // line items: from INVENTORYENTRIES.LIST
    const itemBlocks = [
      ...getAllBlocks(b, 'ALLINVENTORYENTRIES.LIST'),
      ...getAllBlocks(b, 'INVENTORYENTRIES.LIST'),
    ];
    const items = itemBlocks.map((it) => ({
      stock_item: getTagText(it, 'STOCKITEMNAME'),
      qty: getTagText(it, 'ACTUALQTY') || getTagText(it, 'BILLEDQTY'),
      rate: getTagText(it, 'RATE'),
      amount: parseTallyAmount(getTagText(it, 'AMOUNT')),
    }));

    rows.push({
      company_name: companyName,
      voucher_number: voucherNumber,
      voucher_type: voucherType,
      date: dateIso,
      party_name: partyName,
      amount,
      narration,
      line_items: items,
      sync_type: syncType,
      synced_at: syncedAtIso,
    });
  }

  return rows;
}

// ---------- chunked upsert ----------

async function upsertInChunks<T>(
  supabase: any,
  table: string,
  rows: T[],
  conflictCols: string,
  chunkSize = 500,
): Promise<{ inserted: number; error: string | null }> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflictCols });
    if (error) return { inserted, error: error.message };
    inserted += chunk.length;
  }
  return { inserted, error: null };
}

// ---------- main handler ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();

  // Parse body
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const company_name: string | undefined = body?.company_name?.toString().trim();
  const from_date: string | undefined = body?.from_date?.toString().trim();
  const to_date: string | undefined = body?.to_date?.toString().trim();
  const sync_type: string | null = body?.sync_type ?? null;
  const chunk_label: string | null = body?.chunk_label ?? null;

  if (!company_name || !from_date || !to_date) {
    return new Response(
      JSON.stringify({ success: false, error: 'Missing required fields: company_name, from_date, to_date' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  if (!/^\d{8}$/.test(from_date) || !/^\d{8}$/.test(to_date)) {
    return new Response(
      JSON.stringify({ success: false, error: 'from_date and to_date must be in YYYYMMDD format' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Auth — accept either service-role token (server-to-server) or a valid user JWT
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = authHeader.replace('Bearer ', '').trim();

  if (token !== serviceKey) {
    // Treat as a user JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Step 1 — Sync lock
  const lockCutoffIso = new Date(Date.now() - LOCK_WINDOW_MIN * 60_000).toISOString();
  const { data: locks, error: lockErr } = await supabase
    .from('tally_sync_log')
    .select('id, started_at')
    .eq('company_name', company_name)
    .eq('status', 'running')
    .gt('started_at', lockCutoffIso)
    .order('started_at', { ascending: false })
    .limit(1);

  if (lockErr) {
    return new Response(JSON.stringify({ success: false, error: `Lock check failed: ${lockErr.message}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (locks && locks.length > 0) {
    const t = new Date(locks[0].started_at).toLocaleString();
    return new Response(
      JSON.stringify({
        success: false,
        error: `Sync already in progress for this company — started at ${t}. Please wait.`,
      }),
      { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Step 2 — Create log row
  const { data: logRow, error: logInsertErr } = await supabase
    .from('tally_sync_log')
    .insert({
      company_name,
      sync_type,
      status: 'running',
      chunk_label,
      records_fetched: 0,
      started_at: startedAtIso,
    })
    .select('id')
    .single();

  if (logInsertErr || !logRow) {
    return new Response(
      JSON.stringify({ success: false, error: `Could not create log row: ${logInsertErr?.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  const logId = logRow.id as string;

  // Resolve Tally URL for this company (fallback to default)
  let tallyUrl = TALLY_URL_DEFAULT;
  const { data: companyRow } = await supabase
    .from('tally_companies')
    .select('tally_url, is_active')
    .eq('company_name', company_name)
    .maybeSingle();
  if (companyRow?.tally_url) tallyUrl = companyRow.tally_url;

  const errors: string[] = [];
  let totalRecords = 0;
  const syncedAtIso = new Date().toISOString();
  const asOfIso = tallyDateToIso(to_date)!;

  // Step 2.5 — Activate company in Tally (Set Company), then 2s gap.
  // Tally needs the target company to be the "current company" before reports
  // will return data for it.
  try {
    const setXml = buildSetCompanyXml(company_name);
    const setRes = await tallyRequestWithRetry(tallyUrl, setXml, 'set-company');
    if (!setRes.ok) {
      // Non-fatal: log but continue (some Tally setups already have it active).
      console.log(`[set-company] ${company_name}: ${setRes.error}`);
    } else {
      console.log(`[set-company] ${company_name}: ok`);
    }
  } catch (e: any) {
    console.log(`[set-company] ${company_name}: ${e?.message || String(e)}`);
  }
  await sleep(INTER_STEP_GAP_MS);

  // Step 3 — Ledger balances
  let ledgerCount = 0;
  try {
    const ledgerXml = buildLedgerXml(company_name);
    const res = await tallyRequestWithRetry(tallyUrl, ledgerXml, 'ledgers');
    if (!res.ok) {
      errors.push(res.error);
    } else {
      const rows = parseLedgers(res.text, company_name, asOfIso, syncedAtIso);
      if (rows.length > 0) {
        const up = await upsertInChunks(
          supabase,
          'tally_ledger_balances',
          rows,
          'company_name,ledger_name,as_of_date',
        );
        ledgerCount = up.inserted;
        totalRecords += up.inserted;
        if (up.error) errors.push(`ledger upsert: ${up.error}`);
        // Save partial progress immediately
        await supabase
          .from('tally_sync_log')
          .update({ records_fetched: totalRecords })
          .eq('id', logId);
      }
    }
  } catch (e: any) {
    errors.push(`ledgers: ${e?.message || String(e)}`);
  }

  await sleep(INTER_STEP_GAP_MS);

  // Step 4 — Vouchers (Day Book) — split into weekly chunks to avoid Tally
  // gateway truncating large XML responses. Each weekly slice is fetched
  // separately, parsed, then upserted (so overlapping ranges don't dupe).
  let voucherCount = 0;
  try {
    const weeklyRanges = buildWeeklyRanges(from_date, to_date);
    console.log(`[vouchers] ${company_name}: ${weeklyRanges.length} weekly chunk(s) from ${from_date} to ${to_date}`);
    const seenVoucherKeys = new Set<string>();
    const combinedRows: VoucherRow[] = [];

    for (let i = 0; i < weeklyRanges.length; i++) {
      const [wf, wt] = weeklyRanges[i];
      const label = `vouchers ${wf}-${wt} (${i + 1}/${weeklyRanges.length})`;
      const voucherXml = buildDayBookXml(company_name, wf, wt);
      const res = await tallyRequestWithRetry(tallyUrl, voucherXml, label);
      if (!res.ok) {
        errors.push(res.error);
      } else {
        const rows = parseVouchers(res.text, company_name, sync_type, syncedAtIso);
        for (const r of rows) {
          const key = `${r.company_name}::${r.voucher_number}`;
          if (seenVoucherKeys.has(key)) continue;
          seenVoucherKeys.add(key);
          combinedRows.push(r);
        }
        console.log(`[${label}] parsed ${rows.length}, combined ${combinedRows.length}`);
      }
      // 2-second gap between weekly requests (skip after final)
      if (i < weeklyRanges.length - 1) await sleep(INTER_STEP_GAP_MS);
    }

    if (combinedRows.length > 0) {
      const up = await upsertInChunks(
        supabase,
        'tally_vouchers',
        combinedRows,
        'company_name,voucher_type,voucher_number,date',
      );
      voucherCount = up.inserted;
      totalRecords += up.inserted;
      if (up.error) errors.push(`voucher upsert: ${up.error}`);
      await supabase
        .from('tally_sync_log')
        .update({ records_fetched: totalRecords })
        .eq('id', logId);
    }
  } catch (e: any) {
    errors.push(`vouchers: ${e?.message || String(e)}`);
  }

  await sleep(INTER_STEP_GAP_MS);

  // Step 7 — Finalize log
  const completedAtIso = new Date().toISOString();
  const durationSeconds = Math.round((Date.now() - startedAtMs) / 1000);

  // Status: 'completed' if at least one fetch produced records or there were no errors;
  // 'failed' only if both fetches errored AND we got nothing.
  const anyData = totalRecords > 0;
  const status = errors.length === 0 ? 'completed' : (anyData ? 'completed' : 'failed');

  await supabase
    .from('tally_sync_log')
    .update({
      status,
      records_fetched: totalRecords,
      completed_at: completedAtIso,
      error_message: errors.length ? errors.join(' | ') : null,
      last_successful_chunk: anyData ? chunk_label : null,
    })
    .eq('id', logId);

  // Step 8 — Response
  return new Response(
    JSON.stringify({
      success: status === 'completed',
      records_fetched: totalRecords,
      ledger_count: ledgerCount,
      voucher_count: voucherCount,
      duration_seconds: durationSeconds,
      errors_if_any: errors.length ? errors : null,
      sync_log_id: logId,
      status,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
