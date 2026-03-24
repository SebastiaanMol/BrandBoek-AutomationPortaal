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

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("type", "typeform")
      .maybeSingle();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: "Geen Typeform-integratie gevonden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch forms from Typeform (server-side — no CORS issue)
    const typeformRes = await fetch("https://api.typeform.com/forms?page_size=200", {
      headers: { Authorization: `Bearer ${integration.token}` },
    });

    if (!typeformRes.ok) {
      const errText = await typeformRes.text();
      console.error("Typeform API error:", typeformRes.status, errText);

      const errorMessage = typeformRes.status === 401
        ? "Ongeldige Typeform token."
        : `Typeform API fout (${typeformRes.status})`;

      await db.from("integrations").update({
        status: "error",
        error_message: errorMessage,
      }).eq("id", integration.id);

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: typeformRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await typeformRes.json();
    const forms: any[] = body.items ?? [];

    const { data: existing } = await db
      .from("automatiseringen")
      .select("id, external_id, status")
      .eq("source", "typeform");

    const existingByExternalId: Record<string, { id: string; status: string }> = {};
    for (const row of existing || []) {
      if (row.external_id) existingByExternalId[row.external_id] = { id: row.id, status: row.status };
    }

    const syncedIds = new Set<string>();
    let inserted = 0;
    let updated = 0;

    for (const form of forms) {
      const externalId = String(form.id);
      syncedIds.add(externalId);
      const now = new Date().toISOString();

      if (existingByExternalId[externalId]) {
        await db.from("automatiseringen").update({
          naam: form.title,
          last_synced_at: now,
        }).eq("id", existingByExternalId[externalId].id);
        updated++;
      } else {
        const { data: newId } = await db.rpc("generate_auto_id");
        const id = newId || `AUTO-TF-${externalId}`;

        await db.from("automatiseringen").insert({
          id,
          naam: form.title,
          categorie: "Typeform",
          doel: "",
          trigger_beschrijving: "Typeform submission",
          systemen: ["Typeform"],
          stappen: ["Formulier ingevuld", "Data verwerkt"],
          afhankelijkheden: "",
          owner: "",
          status: "Actief",
          verbeterideeen: "",
          mermaid_diagram: "",
          fasen: [],
          external_id: externalId,
          source: "typeform",
          last_synced_at: now,
        });
        inserted++;
      }
    }

    // Typeform forms don't get "deleted" but we mark them inactive if not in latest sync
    let deactivated = 0;
    for (const [extId, row] of Object.entries(existingByExternalId)) {
      if (!syncedIds.has(extId) && row.status !== "Uitgeschakeld") {
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
      JSON.stringify({ success: true, inserted, updated, deactivated, total: forms.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("typeform-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
