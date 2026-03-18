import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get client IP from headers
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // Check if any IPs are configured
    const { data: allowedIps } = await adminClient
      .from("allowed_ips")
      .select("ip_address")
      .eq("is_active", true);

    // If no IPs configured, allow all
    if (!allowedIps || allowedIps.length === 0) {
      return new Response(
        JSON.stringify({ allowed: true, ip: clientIp }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isAllowed = allowedIps.some((r) => r.ip_address === clientIp);

    return new Response(
      JSON.stringify({ allowed: isAllowed, ip: clientIp }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, allowed: true }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
