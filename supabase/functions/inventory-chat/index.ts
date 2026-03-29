import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch inventory summary for context
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [batchesRes, wipRes, fgRes, ordersRes, actionsRes] = await Promise.all([
      supabaseAdmin.from("batches").select("id, batch_number, material, make, grade, coating, thickness, width, gross_weight, net_weight, status, purchase_date, purchase_from, form"),
      supabaseAdmin.from("wip_items").select("id, material, thickness, width, length, qty, num_pcs, process, status, order_id"),
      supabaseAdmin.from("fg_items").select("id, material, thickness, width, length, qty, num_pcs, process, order_id"),
      supabaseAdmin.from("orders").select("id, order_number, status, order_date, comments, customers(customer_name)"),
      supabaseAdmin.from("inventory_actions").select("id, batch_id, action_type, net_weight, order_id, invoice_number, sales_date"),
    ]);

    // Build summary stats
    const batches = batchesRes.data || [];
    const inTransit = batches.filter(b => b.status === "in-transit");
    const received = batches.filter(b => b.status === "received");
    const wip = (wipRes.data || []).filter((w: any) => w.status === "active");
    const fg = fgRes.data || [];
    const orders = ordersRes.data || [];
    const actions = actionsRes.data || [];

    const totalInTransitWeight = inTransit.reduce((s, b) => s + (b.gross_weight || 0), 0);
    const totalReceivedWeight = received.reduce((s, b) => s + (b.gross_weight || 0), 0);
    const totalWIPQty = wip.reduce((s: number, w: any) => s + (w.qty || 0), 0);
    const totalFGQty = fg.reduce((s, f: any) => s + (f.qty || 0), 0);
    const openOrders = orders.filter((o: any) => o.status === "open");

    // Material breakdown
    const materialBreakdown: Record<string, { count: number; weight: number }> = {};
    for (const b of received) {
      const mat = b.material || "Unknown";
      if (!materialBreakdown[mat]) materialBreakdown[mat] = { count: 0, weight: 0 };
      materialBreakdown[mat].count++;
      materialBreakdown[mat].weight += b.gross_weight || 0;
    }

    const systemPrompt = `You are an AI inventory assistant for Areca Steel, a steel processing company. You help users query and understand their inventory data.

Current Inventory Snapshot:
- In-Transit Coils: ${inTransit.length} batches, ${totalInTransitWeight.toFixed(0)} Kg total
- Received Coils (in stock): ${received.length} batches, ${totalReceivedWeight.toFixed(0)} Kg total
- WIP Items: ${wip.length} items, ${totalWIPQty.toFixed(0)} Kg total
- Finished Goods: ${fg.length} items, ${totalFGQty.toFixed(0)} Kg total
- Open Orders: ${openOrders.length}
- Total Sales Actions: ${actions.filter(a => a.action_type === "sales").length}

Material Breakdown (Received):
${Object.entries(materialBreakdown).map(([m, d]) => `- ${m}: ${d.count} coils, ${d.weight.toFixed(0)} Kg`).join("\n")}

Detailed Data (use for answering specific queries):

Received Batches (sample, up to 50):
${JSON.stringify(received.slice(0, 50).map(b => ({
  batch: b.batch_number, material: b.material, make: b.make, grade: b.grade,
  coating: b.coating, thickness: b.thickness, width: b.width,
  gross_wt: b.gross_weight, from: b.purchase_from, date: b.purchase_date
})), null, 0)}

Open Orders:
${JSON.stringify(openOrders.map((o: any) => ({
  order: o.order_number, customer: o.customers?.customer_name, date: o.order_date, status: o.status
})), null, 0)}

WIP Items (active):
${JSON.stringify(wip.slice(0, 30).map((w: any) => ({
  material: w.material, thickness: w.thickness, width: w.width, length: w.length,
  qty: w.qty, pcs: w.num_pcs, process: w.process, order: w.order_id
})), null, 0)}

FG Items (sample, up to 30):
${JSON.stringify(fg.slice(0, 30).map((f: any) => ({
  material: f.material, thickness: f.thickness, width: f.width, length: f.length,
  qty: f.qty, pcs: f.num_pcs, process: f.process, order: f.order_id
})), null, 0)}

Instructions:
- Answer concisely with data-backed responses
- Use tables/lists when presenting multiple items
- If asked about specific batches, materials, or SKUs, search through the data provided
- Provide insights and suggestions when relevant
- Format numbers nicely (e.g., commas, 2 decimal places for weights)
- If data is not available for a query, say so honestly`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
