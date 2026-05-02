import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SYNC_TYPE = "last_month";

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function isoWeek(d: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { year: target.getUTCFullYear(), week };
}

function lastMonthWindow(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start, end };
}

function buildChunks() {
  const { start, end } = lastMonthWindow();
  const chunks: { label: string; from: string; to: string }[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + 6);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    const { year, week } = isoWeek(cursor);
    const label = `${year}-W${String(week).padStart(2, "0")}-lm`;
    chunks.push({ label, from: fmt(cursor), to: fmt(actualEnd) });
    cursor = new Date(actualEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

async function callEngine(supabaseUrl: string, serviceKey: string, body: any) {
  const resp = await fetch(`${supabaseUrl}/functions/v1/tally-sync-engine`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let data: any = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
  return data;
}

async function isPaused(supabase: any) {
  const { data } = await supabase
    .from("tally_sync_control")
    .select("is_paused")
    .eq("sync_type", SYNC_TYPE)
    .maybeSingle();
  return data?.is_paused === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    if (await isPaused(supabase)) {
      return new Response(
        JSON.stringify({ success: true, paused: true, done: false, processed_this_call: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: companies, error } = await supabase
      .from("tally_companies")
      .select("company_name")
      .eq("is_active", true)
      .order("company_name", { ascending: true });
    if (error) throw error;

    const chunks = buildChunks();
    const totalChunks = (companies?.length ?? 0) * chunks.length;

    if (!companies || companies.length === 0 || chunks.length === 0) {
      return new Response(
        JSON.stringify({ success: true, done: true, total_chunks: 0, processed_this_call: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch already-completed chunk labels for this sync_type per company
    const { data: doneRows } = await supabase
      .from("tally_sync_log")
      .select("company_name, chunk_label, status")
      .eq("sync_type", SYNC_TYPE)
      .eq("status", "completed");

    const doneSet = new Set<string>(
      (doneRows ?? []).map((r: any) => `${r.company_name}::${r.chunk_label}`)
    );

    // Find the next pending (company, chunk) pair
    let target: { company: string; chunk: typeof chunks[number]; firstForCompany: boolean } | null = null;
    for (const c of companies) {
      let firstForCompany = true;
      for (const ch of chunks) {
        const key = `${c.company_name}::${ch.label}`;
        if (!doneSet.has(key)) {
          target = { company: c.company_name, chunk: ch, firstForCompany };
          break;
        }
        firstForCompany = false;
      }
      if (target) break;
    }

    if (!target) {
      return new Response(
        JSON.stringify({
          success: true,
          done: true,
          total_chunks: totalChunks,
          processed_this_call: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: any;
    let ok = true;
    let errMsg: string | null = null;
    try {
      result = await callEngine(supabaseUrl, serviceKey, {
        company_name: target.company,
        from_date: target.chunk.from,
        to_date: target.chunk.to,
        sync_type: SYNC_TYPE,
        chunk_label: target.chunk.label,
        fetch_ledgers: target.firstForCompany,
      });
    } catch (e: any) {
      ok = false;
      errMsg = String(e?.message || e);
    }

    const completedAfter = doneSet.size + (ok ? 1 : 0);
    const done = completedAfter >= totalChunks;

    return new Response(
      JSON.stringify({
        success: ok,
        error: errMsg,
        done,
        total_chunks: totalChunks,
        processed_this_call: ok ? 1 : 0,
        summary: [{
          company: target.company,
          chunks_processed: ok ? 1 : 0,
          results: [{ chunk: target.chunk.label, ok, error: errMsg, data: result }],
        }],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
