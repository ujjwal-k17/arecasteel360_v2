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

    const { data: companies, error } = await supabase
      .from("tally_companies")
      .select("company_name")
      .eq("is_active", true);
    if (error) throw error;

    const chunks = buildChunks();
    const summary: any[] = [];

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

      if (startIdx >= chunks.length) {
        summary.push({
          company: c.company_name,
          resumed_from: lastChunk,
          chunks_processed: 0,
          chunks_remaining: 0,
          results: [],
        });
        continue;
      }

      if (await isPaused(supabase)) {
        summary.push({
          company: c.company_name,
          resumed_from: lastChunk,
          paused: true,
          chunks_processed: 0,
          chunks_remaining: chunks.length - startIdx,
          results: [],
        });
        return new Response(
          JSON.stringify({
            success: true,
            paused: true,
            done: false,
            total_chunks: chunks.length,
            processed_this_call: 0,
            summary,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const ch = chunks[startIdx];
      const fetch_ledgers = startIdx === 0 && !lastChunk;
      const companyResults: any[] = [];
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
      } catch (e) {
        companyResults.push({ chunk: ch.label, ok: false, error: String((e as any)?.message || e) });
      }

      const remaining = chunks.length - (startIdx + 1);
      const chunkOk = companyResults.every((r) => r.ok);

      summary.push({
        company: c.company_name,
        resumed_from: lastChunk,
        chunks_processed: companyResults.length,
        chunks_remaining: remaining,
        results: companyResults,
      });

      return new Response(
        JSON.stringify({
          success: chunkOk,
          error: chunkOk ? null : companyResults.find((r) => !r.ok)?.error,
          done: false,
          total_chunks: chunks.length,
          processed_this_call: companyResults.length,
          summary,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        done: true,
        total_chunks: chunks.length,
        processed_this_call: 0,
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
