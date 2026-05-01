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
  if (!resp.ok) {
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const from_date = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
    const to_date = fmt(now);
    const chunk_label = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-current`;

    const { data: companies, error } = await supabase
      .from("tally_companies")
      .select("company_name")
      .eq("is_active", true);

    if (error) throw error;

    const results: any[] = [];
    for (const c of companies ?? []) {
      try {
        const data = await callEngine(supabaseUrl, serviceKey, {
          company_name: c.company_name,
          from_date,
          to_date,
          sync_type: "current_month",
          chunk_label,
        });
        results.push({ company: c.company_name, ok: true, data });
      } catch (e) {
        results.push({ company: c.company_name, ok: false, error: String(e?.message || e) });
      }
    }

    const ok_count = results.filter((r) => r.ok).length;
    const fail_count = results.length - ok_count;

    return new Response(
      JSON.stringify({ success: true, from_date, to_date, ok_count, fail_count, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
