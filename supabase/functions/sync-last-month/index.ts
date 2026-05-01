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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const firstOfPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastOfPrev = new Date(now.getFullYear(), now.getMonth(), 0);
    const from_date = fmt(firstOfPrev);
    const to_date = fmt(lastOfPrev);
    const chunk_label = `${firstOfPrev.getFullYear()}-${String(firstOfPrev.getMonth() + 1).padStart(2, "0")}-last_month`;

    const { data: companies, error } = await supabase
      .from("tally_companies")
      .select("company_name")
      .eq("is_active", true);

    if (error) throw error;

    const results: any[] = [];
    for (const c of companies ?? []) {
      try {
        const { data, error: invErr } = await supabase.functions.invoke(
          "tally-sync-engine",
          {
            body: {
              company_name: c.company_name,
              from_date,
              to_date,
              sync_type: "last_month",
              chunk_label,
            },
          }
        );
        if (invErr) throw invErr;
        results.push({ company: c.company_name, ok: true, data });
      } catch (e) {
        results.push({ company: c.company_name, ok: false, error: String(e) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, from_date, to_date, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
