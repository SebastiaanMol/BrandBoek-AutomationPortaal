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

    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("type", "zapier")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Geen Zapier-integratie gevonden. Sla eerst een API key op via Instellingen → Integraties." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const zapierRes = await fetch("https://api.zapier.com/v1/zaps", {
      headers: { "X-API-Key": integration.token },
    });

    if (!zapierRes.ok) {
      const errText = await zapierRes.text();
      const errorMessage = zapierRes.status === 401
        ? "Ongeldige Zapier API key."
        : `Zapier API fout (${zapierRes.status}): ${errText.slice(0, 200)}`;

      await db.from("integrations").update({ status: "error", error_message: errorMessage }).eq("id", integration.id);
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: zapierRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await zapierRes.json();
    const zaps: any[] = body.zaps ?? body.results ?? [];

    const { data: existing } = await db
      .from("automatiseringen").select("id, external_id, status").eq("source", "zapier");

    const existingByExternalId: Record<string, { id: string; status: string }> = {};
    for (const row of existing || []) {
      if (row.external_id) existingByExternalId[row.external_id] = { id: row.id, status: row.status };
    }

    const syncedIds = new Set<string>();
    let inserted = 0, updated = 0;

    for (const zap of zaps) {
      const externalId = String(zap.id);
      syncedIds.add(externalId);
      const status = zap.is_enabled ? "Actief" : "Uitgeschakeld";
      const now = new Date().toISOString();
      const rawSystemen = [...new Set((zap.steps || []).map((s: any) => s.app?.name).filter(Boolean))] as string[];
      const systemen = Array.from(new Set(["Zapier", ...rawSystemen]));

      if (existingByExternalId[externalId]) {
        await db.from("automatiseringen").update({ naam: zap.title, status, last_synced_at: now }).eq("id", existingByExternalId[externalId].id);
        updated++;
      } else {
        const { data: newId } = await db.rpc("generate_auto_id");
        await db.from("automatiseringen").insert({
          id: newId || `AUTO-ZP-${externalId}`,
          naam: zap.title, categorie: "Zapier Zap", doel: "",
          trigger_beschrijving: zap.steps?.[0]?.app?.name || "",
          systemen: systemen,
          stappen: (zap.steps || []).map((s: any) => s.app?.name || "Stap"),
          afhankelijkheden: "", owner: "", status, verbeterideeen: "", mermaid_diagram: "", fasen: [],
          external_id: externalId, source: "zapier", last_synced_at: now,
        });
        inserted++;
      }
    }

    let deactivated = 0;
    for (const [extId, row] of Object.entries(existingByExternalId)) {
      if (!syncedIds.has(extId) && row.status !== "Uitgeschakeld") {
        await db.from("automatiseringen").update({ status: "Uitgeschakeld" }).eq("id", row.id);
        deactivated++;
      }
    }

    await db.from("integrations").update({ last_synced_at: new Date().toISOString(), status: "connected", error_message: null }).eq("id", integration.id);
    return new Response(JSON.stringify({ success: true, inserted, updated, deactivated, total: zaps.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("zapier-sync error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
