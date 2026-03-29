import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TABLES = [
  "batches",
  "inventory_actions",
  "orders",
  "order_items",
  "order_dispatches",
  "customers",
  "processing_records",
  "processing_output_items",
  "wip_items",
  "fg_items",
  "fg_sales",
  "fg_defectives",
  "defective_sales",
  "scrap_sales",
  "invoice_details",
  "inward_payments",
  "pallet_skus",
  "pallet_purchases",
  "pallet_consumptions",
  "steel_pallet_skus",
  "steel_pallet_purchases",
  "steel_pallet_consumptions",
  "skus",
  "profiles",
  "user_roles",
  "user_permissions",
  "action_logs",
  "allowed_ips",
  "pending_approvals",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toISOString().split("T")[1].replace(/[:.]/g, "-").slice(0, 8);
    const folderName = `backup_${dateStr}_${timeStr}`;

    const results: Record<string, { rows: number; error?: string }> = {};

    for (const table of TABLES) {
      try {
        // Fetch all rows (handle >1000 with pagination)
        let allRows: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabaseAdmin
            .from(table)
            .select("*")
            .range(from, from + pageSize - 1);

          if (error) throw error;
          if (data && data.length > 0) {
            allRows = allRows.concat(data);
            from += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        // Upload as JSON to storage
        const jsonContent = JSON.stringify(allRows, null, 2);
        const filePath = `${folderName}/${table}.json`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from("db-backups")
          .upload(filePath, new Blob([jsonContent], { type: "application/json" }), {
            contentType: "application/json",
            upsert: true,
          });

        if (uploadError) throw uploadError;

        results[table] = { rows: allRows.length };
      } catch (e: any) {
        results[table] = { rows: 0, error: e.message };
      }
    }

    // Create a manifest file
    const manifest = {
      backup_date: now.toISOString(),
      folder: folderName,
      tables: results,
      total_tables: TABLES.length,
      successful: Object.values(results).filter((r) => !r.error).length,
    };

    await supabaseAdmin.storage
      .from("db-backups")
      .upload(
        `${folderName}/manifest.json`,
        new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }),
        { contentType: "application/json", upsert: true }
      );

    return new Response(JSON.stringify(manifest), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
