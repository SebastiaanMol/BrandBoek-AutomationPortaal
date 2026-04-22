import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutomationSummary {
  naam: string;
  doel: string;
  trigger: string;
  categorie: string;
  systemen: string[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { automations } = await req.json() as { automations: AutomationSummary[] };

    if (!automations?.length) {
      return new Response(JSON.stringify({ error: "automations required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const automationList = automations
      .map(
        (a) =>
          `- ${a.naam} (${a.categorie}): trigger: ${a.trigger}, doel: ${a.doel}, systemen: ${(a.systemen ?? []).join(", ")}`,
      )
      .join("\n");

    const prompt = `Je krijgt een lijst van gekoppelde automatiseringen die samen één flow vormen.
Geef een korte Nederlandse naam (max 4 woorden) en een beschrijving van 1-2 zinnen voor de hele flow als geheel.

Automatiseringen:
${automationList}

Antwoord uitsluitend in dit JSON-formaat:
{"naam": "Onboarding Flow", "beschrijving": "Wanneer een nieuw contact binnenkomt, wordt de data verrijkt en volgt een welkomstmail."}`;

    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
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
              content:
                "Je bent een technische assistent voor een Nederlands boekhoudkantoor. Antwoord alleen in het gevraagde JSON-formaat. Geen extra tekst.",
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
    let result: { naam: string; beschrijving: string };
    try {
      result = JSON.parse(cleaned);
    } catch {
      throw new Error(`Gemini: ongeldige JSON: ${cleaned.slice(0, 100)}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("name-flow error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
