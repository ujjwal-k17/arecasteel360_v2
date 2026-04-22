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
  "dropdown_options",
  "transporters",
  "transporter_freight",
  "transporter_freight_payments",
  "transporter_freight_comments",
  "user_devices",
  "wip_defectives",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // --- AUTH: require admin ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = (roles || []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "backup";

    // LIST backups
    if (action === "list") {
      const { data, error } = await supabaseAdmin.storage
        .from("db-backups")
        .list("", { limit: 100, sortBy: { column: "name", order: "desc" } });

      if (error) throw error;

      // Each top-level item is a folder like backup_2025-01-15_02-00-00
      const folders = (data || [])
        .filter((item: any) => item.id === null || item.metadata === null)
        .map((item: any) => item.name);

      // For each folder, try to read manifest
      const backups = [];
      for (const folder of folders) {
        try {
          const { data: manifestData } = await supabaseAdmin.storage
            .from("db-backups")
            .download(`${folder}/manifest.json`);
          if (manifestData) {
            const manifest = JSON.parse(await manifestData.text());
            backups.push(manifest);
          }
        } catch {
          backups.push({ folder, backup_date: null, tables: {}, total_tables: 0, successful: 0 });
        }
      }

      return new Response(JSON.stringify(backups), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DOWNLOAD a specific backup as a combined JSON
    if (action === "download") {
      const folder = url.searchParams.get("folder");
      if (!folder) {
        return new Response(JSON.stringify({ error: "folder parameter required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: files, error: listErr } = await supabaseAdmin.storage
        .from("db-backups")
        .list(folder, { limit: 200 });
      if (listErr) throw listErr;

      const backup: Record<string, any> = {};
      for (const file of (files || [])) {
        try {
          const { data: fileData } = await supabaseAdmin.storage
            .from("db-backups")
            .download(`${folder}/${file.name}`);
          if (fileData) {
            const key = file.name.replace(".json", "");
            backup[key] = JSON.parse(await fileData.text());
          }
        } catch { /* skip */ }
      }

      return new Response(JSON.stringify(backup, null, 2), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${folder}.json"`,
        },
      });
    }

    // RUN BACKUP
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    const timeStr = now.toISOString().split("T")[1].replace(/[:.]/g, "-").slice(0, 8);
    const folderName = `backup_${dateStr}_${timeStr}`;

    const results: Record<string, { rows: number; error?: string }> = {};

    // Export all tables
    for (const table of TABLES) {
      try {
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

    // Export auth users
    let authUsersCount = 0;
    try {
      let allUsers: any[] = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage: 1000,
        });
        if (error) throw error;
        if (users && users.length > 0) {
          // Strip sensitive fields, keep useful metadata
          const sanitized = users.map((u: any) => ({
            id: u.id,
            email: u.email,
            email_confirmed_at: u.email_confirmed_at,
            phone: u.phone,
            created_at: u.created_at,
            updated_at: u.updated_at,
            last_sign_in_at: u.last_sign_in_at,
            app_metadata: u.app_metadata,
            user_metadata: u.user_metadata,
          }));
          allUsers = allUsers.concat(sanitized);
          page++;
          hasMore = users.length === 1000;
        } else {
          hasMore = false;
        }
      }

      authUsersCount = allUsers.length;
      const { error: uploadError } = await supabaseAdmin.storage
        .from("db-backups")
        .upload(
          `${folderName}/auth_users.json`,
          new Blob([JSON.stringify(allUsers, null, 2)], { type: "application/json" }),
          { contentType: "application/json", upsert: true }
        );
      if (uploadError) throw uploadError;
      results["auth_users"] = { rows: authUsersCount };
    } catch (e: any) {
      results["auth_users"] = { rows: 0, error: e.message };
    }

    // Create manifest
    const manifest = {
      backup_date: now.toISOString(),
      folder: folderName,
      tables: results,
      total_tables: TABLES.length + 1, // +1 for auth_users
      successful: Object.values(results).filter((r) => !r.error).length,
      total_rows: Object.values(results).reduce((sum, r) => sum + r.rows, 0),
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
