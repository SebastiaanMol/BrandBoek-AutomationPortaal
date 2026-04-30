import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AutomationInput {
  naam: string;
  stappenInSimpeleTaal: string[];
  doel: string;
  trigger: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { automations } = await req.json() as { automations: AutomationInput[] };

    if (!automations?.length) {
      return new Response(JSON.stringify({ error: "automations required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const automationList = automations
      .map((a, i) => {
        const stappen = a.stappenInSimpeleTaal?.length
          ? a.stappenInSimpeleTaal.map((s, j) => `  ${j + 1}. ${s}`).join("\n")
          : `  Doel: ${a.doel}\n  Trigger: ${a.trigger}`;
        return `Automatisering ${i + 1}: ${a.naam}\n${stappen}`;
      })
      .join("\n\n");

    const prompt = `Je krijgt een reeks automatiseringen die samen één flow vormen, in volgorde van uitvoering.

${automationList}

Schrijf een zakelijke beschrijving van deze flow voor een niet-technisch publiek (medewerkers van een boekhoudkantoor).

Antwoord uitsluitend in dit JSON-formaat:
{
  "samenvatting": "2-4 zinnen die beschrijven wat de flow doet van begin tot eind, in begrijpelijke taal zonder jargon.",
  "stappen": ["Beschrijving van stap 1 in gewone taal.", "Beschrijving van stap 2.", "..."]
}

De stappen zijn een lijst van ALLE stappen die plaatsvinden in de hele flow, van eerste automatisering tot laatste. Schrijf elke stap als een volledige zin in het Nederlands. Geen technisch jargon.`;

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
    let result: { samenvatting: string; stappen: string[] };
    try {
      result = JSON.parse(cleaned);
    } catch {
      throw new Error(`Gemini: ongeldige JSON: ${cleaned.slice(0, 100)}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("describe-flow error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
