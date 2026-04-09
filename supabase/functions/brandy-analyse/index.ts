import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BRANDY_CONTEXT = `
Je bent Brandy, het procesbrein van Brand Boekhouders — een Nederlands boekhoudkantoor.

== BEDRIJFSCONTEXT ==

Brand Boekhouders begeleidt klanten door vijf fasen:
Marketing → Sales → Onboarding → Boekhouding → Offboarding

Kritische bedrijfsregel — Driehoekstructuur:
Elke HubSpot Deal moet gekoppeld zijn aan zowel een Contact als een Company.
Zonder deze driehoek werken automatiseringen niet. Veelgemaakte fout: deal stroomt niet door
naar Klantenbestand omdat Contact of Company ontbreekt.

Hoofdsystemen: HubSpot (CRM + workflows), Zapier (integraties), WeFact (facturatie),
Typeform (klantformulieren), SharePoint (documentopslag), Docufy (documentgeneratie),
Backend (interne API).

Kritieke pipelines: Sales Pipeline → Klantenbestand → BTW → Jaarrekening → IB → VPB.
Elk product heeft een eigen pipeline. Productdeals worden automatisch aangemaakt zodra
een deal actief wordt — alleen als line items uit de Product Library komen.

Veelvoorkomende problemen:
- Deal stroomt niet door → check driehoek + verplichte properties (Intensiteit, Voertaal, SoftwarePortaalCSV)
- Geen productdeals → check line items (Product Library) + driehoek + SoftwarePortaalCSV
- BTW-deal staat in 'Open' → bankkoppeling niet actief
- IB kan niet gemaakt worden → machtiging VIG ontbreekt of JR-deal niet afgerond

Je taak: analyseer het volledige automatiseringslandschap vanuit deze bedrijfscontext.
Wees direct, concreet en eerlijk. Benoem zowel wat goed gaat als wat zorgwekkend is.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { signalen, automations } = await req.json() as {
      signalen: Array<{
        id: string;
        automationId: string;
        naam: string;
        type: string;
        ernst: string;
        categorie: string;
        bericht: string;
        suggestie: string;
      }>;
      automations: Array<{
        id: string;
        naam: string;
        status: string;
        fasen: string[];
        systemen: string[];
        owner: string;
        stappenCount: number;
        complexiteit: number;
      }>;
    };

    if (!Array.isArray(signalen) || !Array.isArray(automations) || automations.length === 0) {
      return new Response(JSON.stringify({ error: "signalen en automations zijn verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const signaalSummary = signalen.map(s =>
      `[${s.ernst.toUpperCase()}] ${s.naam} — ${s.type}: ${s.bericht}`
    ).join("\n");

    const autoSummary = automations.map(a =>
      `${a.naam} | status: ${a.status} | fasen: ${a.fasen.join(", ")} | systemen: ${a.systemen.join(", ")} | owner: ${a.owner || "—"} | stappen: ${a.stappenCount} | complexiteit: ${a.complexiteit}`
    ).join("\n");

    const userMessage = `
== SIGNALEN (${signalen.length} totaal) ==
${signaalSummary}

== AUTOMATISERINGEN (${automations.length} stuks) ==
${autoSummary}

Analyseer dit landschap. Schrijf een Nederlandse samenvatting van de huidige staat.
Kies dan de 5 meest urgente signal-IDs op basis van bedrijfsimpact.
    `.trim();

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: BRANDY_CONTEXT },
            { role: "user", content: userMessage },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "brandy_analyse_resultaat",
                description: "Geef het resultaat van de analyse",
                parameters: {
                  type: "object",
                  properties: {
                    samenvatting: {
                      type: "string",
                      description:
                        "Nederlandse proza-samenvatting van de staat van het automatiseringslandschap. Wees direct en concreet. Noem patronen, risico's en wat goed gaat.",
                    },
                    prioriteiten: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "De 5 meest urgente signal IDs (exact zoals aangeleverd), gesorteerd van hoogste naar laagste prioriteit op basis van bedrijfsimpact.",
                    },
                  },
                  required: ["samenvatting", "prioriteiten"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "brandy_analyse_resultaat" } },
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("Gemini error:", response.status, text);
      return new Response(
        JSON.stringify({ error: `Gemini fout ${response.status}: ${text}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Geen analyse van Brandy ontvangen" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { samenvatting: string; prioriteiten: string[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ error: "Brandy stuurde een onleesbaar antwoord" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: mindRow, error: insertError } = await supabaseAdmin
      .from("brandy_mind")
      .insert({
        signalen,
        samenvatting: parsed.samenvatting,
        prioriteiten: parsed.prioriteiten,
        automation_count: automations.length,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: `Opslaan mislukt: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(mindRow), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brandy-analyse error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
