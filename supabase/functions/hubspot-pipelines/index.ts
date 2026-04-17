import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Read HubSpot integration
    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("type", "hubspot")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: "Geen HubSpot-integratie gevonden. Sla eerst een token op via Instellingen." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = integration.token as string;

    // Fetch all deal pipelines from HubSpot
    const res = await fetch(
      "https://api.hubapi.com/crm/v3/pipelines/deals?includeInactive=false",
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const errBody = await res.text();
      const msg = res.status === 401
        ? "Ongeldige HubSpot token — sla de verbinding opnieuw op via Instellingen."
        : `HubSpot Pipelines API fout (${res.status}): ${errBody.slice(0, 200)}`;
      await db.from("integrations")
        .update({ status: "error", error_message: msg })
        .eq("id", integration.id);
      return new Response(
        JSON.stringify({ error: msg }),
        { status: res.status === 401 ? 401 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pipelinesBody = await res.json();
    const pipelines: any[] = pipelinesBody.results ?? [];
    const now = new Date().toISOString();
    let upserted = 0;

    for (const pipeline of pipelines) {
      const stages = [...(pipeline.stages ?? [])]
        .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((s: any) => ({
          stage_id:      s.id,
          label:         s.label,
          display_order: s.displayOrder ?? 0,
          metadata:      s.metadata ?? {},
        }));

      const { error } = await db.from("pipelines").upsert(
        {
          pipeline_id: pipeline.id,
          naam:        pipeline.label,
          stages,
          synced_at:   now,
        },
        { onConflict: "pipeline_id" },
      );

      if (error) throw error;
      upserted++;
    }

    return new Response(
      JSON.stringify({ success: true, upserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("hubspot-pipelines error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
