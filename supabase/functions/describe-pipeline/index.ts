import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PipelineStage {
  label: string;
  display_order: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pipeline_id } = await req.json() as { pipeline_id: string };

    if (!pipeline_id) {
      return new Response(
        JSON.stringify({ error: "pipeline_id is verplicht" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pipeline, error: dbError } = await db
      .from("pipelines")
      .select("pipeline_id, naam, stages")
      .eq("pipeline_id", pipeline_id)
      .maybeSingle();

    if (dbError) throw dbError;

    if (!pipeline) {
      return new Response(
        JSON.stringify({ error: "Pipeline niet gevonden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const stages = (pipeline.stages ?? []) as PipelineStage[];
    const sortedStages = [...stages].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    const stageList = sortedStages.map((s, i) => `${i + 1}. ${s.label}`).join("\n");

    const prompt = `Je krijgt een HubSpot deal-pipeline genaamd "${pipeline.naam}" met de volgende stages:\n${stageList}\n\nSchrijf een zakelijke beschrijving van 2-3 zinnen die uitlegt wat het doel van deze pipeline is en wat het proces globaal inhoudt. Schrijf voor medewerkers van een boekhoudkantoor, geen technisch jargon. Antwoord uitsluitend in het Nederlands.\n\nAntwoord in JSON: { "beschrijving": "..." }`;

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("GEMINI_API_KEY")!}`,
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

    if (!res.ok) throw new Error(`Gemini API fout (${res.status})`);

    const geminiResult = await res.json();
    const content = geminiResult.choices?.[0]?.message?.content;
    if (!content) throw new Error("Gemini: leeg antwoord");

    const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    let result: { beschrijving: string };
    try {
      result = JSON.parse(cleaned);
    } catch {
      throw new Error(`Gemini: ongeldige JSON: ${cleaned.slice(0, 100)}`);
    }

    const { error: updateError } = await db
      .from("pipelines")
      .update({ beschrijving: result.beschrijving })
      .eq("pipeline_id", pipeline_id);

    if (updateError) throw updateError;

    return new Response(
      JSON.stringify({ beschrijving: result.beschrijving }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("describe-pipeline error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
