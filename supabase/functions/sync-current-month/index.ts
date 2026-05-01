import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CHUNKS_PER_CALL = 3;
const SYNC_TYPE = "current_month";

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

function currentMonthWindow(): { start: Date; end: Date } {
  const now = new Date();
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now };
}

function buildChunks() {
  const { start, end } = currentMonthWindow();
  const chunks: { label: string; from: string; to: string }[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + 6);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    const { year, week } = isoWeek(cursor);
    const label = `${year}-W${String(week).padStart(2, "0")}-cm`;
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

    const { data: companies, error } = await supabase
      .from("tally_companies")
      .select("company_name")
      .eq("is_active", true);
    if (error) throw error;

    const chunks = buildChunks();
    const summary: any[] = [];
    let totalProcessed = 0;
    let anyRemaining = false;

    for (const c of companies ?? []) {
      const { data: lastLogs } = await supabase
        .from("tally_sync_log")
        .select("last_successful_chunk, completed_at")
        .eq("company_name", c.company_name)
        .eq("sync_type", SYNC_TYPE)
        .eq("status", "completed")
        .not("last_successful_chunk", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1);

      const lastChunk = lastLogs?.[0]?.last_successful_chunk ?? null;
      let startIdx = 0;
      if (lastChunk) {
        const idx = chunks.findIndex((ch) => ch.label === lastChunk);
        if (idx >= 0) startIdx = idx + 1;
      }

      const endIdx = Math.min(startIdx + CHUNKS_PER_CALL, chunks.length);
      const companyResults: any[] = [];

      for (let i = startIdx; i < endIdx; i++) {
        if (await isPaused(supabase)) {
          anyRemaining = true;
          summary.push({
            company: c.company_name,
            resumed_from: lastChunk,
            paused: true,
            chunks_processed: companyResults.length,
            chunks_remaining: chunks.length - i,
            results: companyResults,
          });
          return new Response(
            JSON.stringify({
              success: true,
              paused: true,
              done: false,
              total_chunks: chunks.length,
              processed_this_call: totalProcessed,
              summary,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const ch = chunks[i];
        const fetch_ledgers = i === 0 && !lastChunk;
        try {
          const data = await callEngine(supabaseUrl, serviceKey, {
            company_name: c.company_name,
            from_date: ch.from,
            to_date: ch.to,
            sync_type: SYNC_TYPE,
            chunk_label: ch.label,
            fetch_ledgers,
          });
          companyResults.push({ chunk: ch.label, ok: true, data });
          totalProcessed++;
        } catch (e) {
          companyResults.push({ chunk: ch.label, ok: false, error: String((e as any)?.message || e) });
        }
        if (i < endIdx - 1) await sleep(1500);
      }

      const remaining = chunks.length - endIdx;
      if (remaining > 0) anyRemaining = true;

      summary.push({
        company: c.company_name,
        resumed_from: lastChunk,
        chunks_processed: companyResults.length,
        chunks_remaining: remaining,
        results: companyResults,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        done: !anyRemaining,
        total_chunks: chunks.length,
        processed_this_call: totalProcessed,
        summary,
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
