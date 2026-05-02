// Single-chunk historical sync. Frontend orchestrates the loop and calls this
// once per chunk. Each call processes one weekly range for one company and
// returns in well under 30s, so we never hit the 150s edge idle timeout.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Validate caller is an authenticated user via JWT claims (signing-keys system)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "").trim();
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("Auth failed:", claimsErr?.message);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const company_name: string | undefined = body?.company_name?.toString().trim();
    const from_date: string | undefined = body?.from_date?.toString().trim();
    const to_date: string | undefined = body?.to_date?.toString().trim();
    const chunk_label: string | undefined = body?.chunk_label?.toString().trim();
    const fetch_ledgers: boolean = body?.fetch_ledgers === true;
    const sync_type: string = body?.sync_type?.toString().trim() || "historical";

    if (!company_name || !from_date || !to_date || !chunk_label) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: company_name, from_date, to_date, chunk_label",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!/^\d{8}$/.test(from_date) || !/^\d{8}$/.test(to_date)) {
      return new Response(
        JSON.stringify({ success: false, error: "from_date/to_date must be YYYYMMDD" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Forward to tally-sync-engine using service role (server-to-server)
    const resp = await fetch(`${supabaseUrl}/functions/v1/tally-sync-engine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        company_name,
        from_date,
        to_date,
        sync_type,
        chunk_label,
        fetch_ledgers,
      }),
    });

    const text = await resp.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    return new Response(
      JSON.stringify({
        success: resp.ok && data?.success !== false,
        chunk_label,
        company_name,
        from_date,
        to_date,
        engine: data,
      }),
      { status: resp.ok ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
