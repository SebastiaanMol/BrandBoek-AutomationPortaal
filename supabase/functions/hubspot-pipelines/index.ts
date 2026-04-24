import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PipelineStage {
  stage_id:      string;
  label:         string;
  display_order: number;
  metadata:      Record<string, unknown>;
}

async function generateDescription(
  naam: string,
  stages: PipelineStage[],
  geminiKey: string,
): Promise<string | null> {
  const sortedStages = [...stages].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const stageList = sortedStages.map((s, i) => `${i + 1}. ${s.label}`).join("\n");
  const prompt = `Je krijgt een HubSpot deal-pipeline genaamd "${naam}" met de volgende stages:\n${stageList}\n\nSchrijf een zakelijke beschrijving van 2-3 zinnen die uitlegt wat het doel van deze pipeline is en wat het proces globaal inhoudt. Schrijf voor medewerkers van een boekhoudkantoor, geen technisch jargon. Antwoord uitsluitend in het Nederlands.\n\nAntwoord in JSON: { "beschrijving": "..." }`;

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${geminiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "Je bent een technische assistent voor een Nederlands boekhoudkantoor. Antwoord alleen in het gevraagde JSON-formaat. Geen extra tekst.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );
    if (!res.ok) return null;
    const geminiResult = await res.json();
    const content = geminiResult.choices?.[0]?.message?.content;
    if (!content) return null;
    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const result = JSON.parse(cleaned) as { beschrijving: string };
    return result.beschrijving ?? null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";

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
      const stages: PipelineStage[] = [...(pipeline.stages ?? [])]
        .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((s: any) => ({
          stage_id:      s.id,
          label:         s.label,
          display_order: s.displayOrder ?? 0,
          metadata:      s.metadata ?? {},
        }));

      // Fetch existing row to compare stages and preserve beschrijving
      const { data: existing } = await db
        .from("pipelines")
        .select("stages, beschrijving")
        .eq("pipeline_id", pipeline.id)
        .maybeSingle();

      const existingIds = ((existing?.stages ?? []) as PipelineStage[])
        .map((s) => s.stage_id).sort().join(",");
      const newIds = stages.map((s) => s.stage_id).sort().join(",");
      const stagesChanged = existingIds !== newIds;
      const needsDescription = !existing?.beschrijving;

      let beschrijving: string | null = existing?.beschrijving ?? null;
      if ((stagesChanged || needsDescription) && GEMINI_API_KEY) {
        beschrijving = await generateDescription(pipeline.label, stages, GEMINI_API_KEY);
      }

      const { error } = await db.from("pipelines").upsert(
        {
          pipeline_id:  pipeline.id,
          naam:         pipeline.label,
          stages,
          synced_at:    now,
          ...(beschrijving !== null ? { beschrijving } : {}),
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
