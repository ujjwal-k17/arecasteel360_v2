import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Max chunks to process per invocation (per company). Keep low so we never
// approach the 150s edge-function idle timeout. Each chunk = 1 tally-sync-engine
// call (which itself can take 20-40s for heavy weeks).
const CHUNKS_PER_CALL = 3;

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
  // Historical window: covers FY 2024-25 and FY 2025-26 fully.
  // Note: Tally returns voucher dates in the calendar year matching the
  // transaction (e.g. FY 2025-26 vouchers from Apr 2025 onward, but in this
  // dataset transactions are dated Apr 2026+). Widen window to be safe.
  const start = new Date(2024, 3, 1); // 01 Apr 2024
  const end = new Date(2027, 2, 31); // 31 Mar 2027
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
    let totalProcessed = 0;
    let anyRemaining = false;

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

      // Only process up to CHUNKS_PER_CALL chunks for this company per invocation
      const endIdx = Math.min(startIdx + CHUNKS_PER_CALL, chunks.length);
      const companyResults: any[] = [];

      for (let i = startIdx; i < endIdx; i++) {
        const ch = chunks[i];
        // Fetch ledger masters only on the very first chunk of a company's
        // historical run (i === 0 AND no prior successful chunk). For all
        // subsequent chunks, skip — ledgers are a master snapshot, not
        // weekly data, and re-fetching duplicates rows and inflates counts.
        const fetch_ledgers = i === 0 && !lastChunk;
        try {
          const data = await callEngine(supabaseUrl, serviceKey, {
            company_name: c.company_name,
            from_date: ch.from,
            to_date: ch.to,
            sync_type: "historical",
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
