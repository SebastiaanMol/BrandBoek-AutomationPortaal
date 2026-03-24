import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find connected HubSpot integration (first one — internal single-team tool)
    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("type", "hubspot")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Geen HubSpot-integratie gevonden. Sla eerst een token op via Instellingen → Integraties." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch workflows from HubSpot (server-side — no CORS issue)
    const hubspotRes = await fetch("https://api.hubapi.com/automation/v3/workflows", {
      headers: { Authorization: `Bearer ${integration.token}` },
    });

    if (!hubspotRes.ok) {
      const errText = await hubspotRes.text();
      console.error("HubSpot API error:", hubspotRes.status, errText);

      const errorMessage = hubspotRes.status === 401
        ? "Ongeldige HubSpot token. Controleer je Private App token."
        : `HubSpot API fout (${hubspotRes.status}): ${errText.slice(0, 200)}`;

      await db.from("integrations").update({
        status: "error",
        error_message: errorMessage,
      }).eq("id", integration.id);

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: hubspotRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await hubspotRes.json();
    // HubSpot v1 returns { workflows: [...] }, v2+ returns { results: [...] }
    const workflows: any[] = body.workflows ?? body.results ?? [];

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
        await db.from("automatiseringen").update({
          naam: wf.name,
          status,
          last_synced_at: now,
        }).eq("id", existingByExternalId[externalId].id);
        updated++;
      } else {
        const { data: newId } = await db.rpc("generate_auto_id");
        await db.from("automatiseringen").insert({
          id: newId || `AUTO-HS-${externalId}`,
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

    let deactivated = 0;
    for (const [extId, row] of Object.entries(existingByExternalId)) {
      if (!syncedExternalIds.has(extId) && row.status !== "Uitgeschakeld") {
        await db.from("automatiseringen").update({ status: "Uitgeschakeld" }).eq("id", row.id);
        deactivated++;
      }
    }

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
