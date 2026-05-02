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
      if (await isPaused(supabase)) {
        summary.push({
          company: c.company_name,
          paused: true,
          chunks_processed: 0,
          chunks_remaining: chunks.length,
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

      // Always sync fresh: process all chunks regardless of previous sync history.
      // The engine upserts data, so re-syncing is safe.
      const companyResults: any[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        const fetch_ledgers = i === 0;
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
      }

      summary.push({
        company: c.company_name,
        chunks_processed: companyResults.length,
        chunks_remaining: 0,
        results: companyResults,
      });
    }

    const totalProcessed = summary.reduce((acc: number, s: any) => acc + (s.chunks_processed || 0), 0);
    const anyError = summary.some((s: any) => (s.results || []).some((r: any) => !r.ok));
    return new Response(
      JSON.stringify({
        success: !anyError,
        error: anyError ? "One or more chunks failed" : null,
        done: true,
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
