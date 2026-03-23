import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Niet geautoriseerd" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for DB operations
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch integration token
    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("type", "hubspot")
      .single();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Geen HubSpot-integratie gevonden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch workflows from HubSpot
    const hubspotRes = await fetch("https://api.hubapi.com/automation/v3/workflows", {
      headers: { Authorization: `Bearer ${integration.token}` },
    });

    if (!hubspotRes.ok) {
      const errText = await hubspotRes.text();
      console.error("HubSpot API error:", hubspotRes.status, errText);

      const errorMessage = hubspotRes.status === 401
        ? "Ongeldige HubSpot token. Controleer je Private App token."
        : `HubSpot API fout (${hubspotRes.status})`;

      await db.from("integrations").update({
        status: "error",
        error_message: errorMessage,
      }).eq("id", integration.id);

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: hubspotRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { workflows } = await hubspotRes.json();
    if (!Array.isArray(workflows)) {
      return new Response(JSON.stringify({ error: "Onverwacht antwoord van HubSpot" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch existing automations with source=hubspot to detect deletions
    const { data: existing } = await db
      .from("automatiseringen")
      .select("id, external_id, status")
      .eq("source", "hubspot");

    const existingByExternalId: Record<string, { id: string; status: string }> = {};
    for (const row of existing || []) {
      if (row.external_id) existingByExternalId[row.external_id] = { id: row.id, status: row.status };
    }

    const syncedExternalIds = new Set<string>();
    let inserted = 0;
    let updated = 0;

    for (const wf of workflows) {
      const externalId = String(wf.id);
      syncedExternalIds.add(externalId);
      const status = wf.enabled ? "Actief" : "Uitgeschakeld";
      const now = new Date().toISOString();

      if (existingByExternalId[externalId]) {
        // Update existing
        await db.from("automatiseringen").update({
          naam: wf.name,
          status,
          last_synced_at: now,
        }).eq("id", existingByExternalId[externalId].id);
        updated++;
      } else {
        // Insert new — generate ID via RPC
        const { data: newId } = await db.rpc("generate_auto_id");
        const id = newId || `AUTO-HS-${externalId}`;

        await db.from("automatiseringen").insert({
          id,
          naam: wf.name,
          categorie: "HubSpot Workflow",
          doel: "",
          trigger_beschrijving: wf.enrollmentCriteria?.type || "",
          systemen: ["HubSpot"],
          stappen: Array.isArray(wf.actions) ? wf.actions.map((a: any) => a.type || "Stap") : [],
          afhankelijkheden: "",
          owner: "",
          status,
          verbeterideeen: "",
          mermaid_diagram: "",
          fasen: [],
          external_id: externalId,
          source: "hubspot",
          last_synced_at: now,
        });
        inserted++;
      }
    }

    // Mark deleted workflows as inactive
    let deactivated = 0;
    for (const [extId, row] of Object.entries(existingByExternalId)) {
      if (!syncedExternalIds.has(extId) && row.status !== "Uitgeschakeld") {
        await db.from("automatiseringen").update({ status: "Uitgeschakeld" }).eq("id", row.id);
        deactivated++;
      }
    }

    // Update integration last_synced_at and clear errors
    await db.from("integrations").update({
      last_synced_at: new Date().toISOString(),
      status: "connected",
      error_message: null,
    }).eq("id", integration.id);

    return new Response(
      JSON.stringify({ success: true, inserted, updated, deactivated, total: workflows.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("hubspot-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
