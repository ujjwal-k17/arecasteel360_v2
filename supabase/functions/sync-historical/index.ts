import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ISO week number
function isoWeek(d: Date): { year: number; week: number } {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return { year: target.getUTCFullYear(), week };
}

function buildChunks() {
  const start = new Date(2025, 3, 1); // 01 Apr 2025
  const end = new Date(2026, 2, 31); // 31 Mar 2026
  const chunks: { label: string; from: string; to: string }[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + 6);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    const { year, week } = isoWeek(cursor);
    const label = `${year}-W${String(week).padStart(2, "0")}`;
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
      // Find the last successful historical chunk for this company
      const { data: lastLogs } = await supabase
        .from("tally_sync_log")
        .select("last_successful_chunk, completed_at")
        .eq("company_name", c.company_name)
        .eq("sync_type", "historical")
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

      const companyResults: any[] = [];
      for (let i = startIdx; i < chunks.length; i++) {
        const ch = chunks[i];
        try {
          const data = await callEngine(supabaseUrl, serviceKey, {
            company_name: c.company_name,
            from_date: ch.from,
            to_date: ch.to,
            sync_type: "historical",
            chunk_label: ch.label,
          });
          companyResults.push({ chunk: ch.label, ok: true, data });
        } catch (e) {
          companyResults.push({ chunk: ch.label, ok: false, error: String(e?.message || e) });
        }
        if (i < chunks.length - 1) await sleep(3000);
      }

      summary.push({
        company: c.company_name,
        resumed_from: lastChunk,
        chunks_processed: companyResults.length,
        results: companyResults,
      });
    }

    return new Response(
      JSON.stringify({ success: true, total_chunks: chunks.length, summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
