import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { type, data } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let prompt = "";

    if (type === "csv_rows") {
      prompt = `Je bent een expert in procesautomatisering bij een boekhoudkantoor. Analyseer de volgende CSV-rijen en extraheer voor ELKE rij gestructureerde informatie.

De CSV kan afkomstig zijn van:
- HubSpot workflow exports (kolommen zoals: Workflow name, Type, Status, Enrollment triggers, etc.)
- Zapier Zap exports (kolommen zoals: Name, Status, Trigger App, Action App, Steps, Folder, etc.)
- Andere automatiseringstools

ZAPIER-SPECIFIEK:
- Herken "Trigger App" + "Action App" als betrokken systemen
- De "Steps" of individuele stappen-kolommen beschrijven de flow
- Een Zap heeft altijd minimaal een trigger en een action
- Herken apps als: HubSpot, Gmail, Slack, Google Sheets, Typeform, SharePoint, WeFact, Docufy, etc.
- Categorie moet "Zapier Zap" zijn, tenzij het ook HubSpot bevat → dan "HubSpot + Zapier"

HUBSPOT-SPECIFIEK:
- Workflows hebben enrollment triggers en actions
- Categorie is "HubSpot Workflow"

CSV data (JSON):
${JSON.stringify(data, null, 2)}

Geef per rij de volgende informatie terug. Gebruik ALTIJD Nederlands.`;
    } else if (type === "text") {
      prompt = `Je bent een expert in procesautomatisering bij een boekhoudkantoor. Analyseer de volgende tekst en extraheer alle automatiseringsinformatie.

Herken automatiseringen uit alle bronnen: HubSpot workflows, Zapier Zaps, backend scripts, API-koppelingen, etc.
Als het een Zapier Zap beschrijft, gebruik categorie "Zapier Zap" en herken de betrokken apps als systemen.

Tekst:
${data}

Extraheer de automatisering en geef gestructureerde informatie terug. Gebruik ALTIJD Nederlands.`;
    } else {
      return new Response(JSON.stringify({ error: "Unknown type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "extract_automations",
          description: "Extract structured automation data from the input",
          parameters: {
            type: "object",
            properties: {
              automations: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    naam: { type: "string", description: "Naam van de automatisering" },
                    categorie: {
                      type: "string",
                      enum: ["HubSpot Workflow", "Zapier Zap", "Backend Script", "HubSpot + Zapier", "Anders"],
                    },
                    doel: { type: "string", description: "Wat doet deze automatisering? Uitgebreide beschrijving." },
                    trigger: { type: "string", description: "Waardoor start de automatisering?" },
                    systemen: {
                      type: "array",
                      items: { type: "string", enum: ["HubSpot", "Zapier", "Backend", "E-mail", "API", "Typeform", "SharePoint", "WeFact", "Docufy", "Google Sheets", "Slack", "Gmail"] },
                    },
                    stappen: {
                      type: "array",
                      items: { type: "string" },
                      description: "Stap-voor-stap flow van de automatisering",
                    },
                    afhankelijkheden: { type: "string", description: "Afhankelijkheden en mogelijke knelpunten" },
                    owner: { type: "string", description: "Verantwoordelijke persoon" },
                    status: {
                      type: "string",
                      enum: ["Actief", "Verouderd", "In review", "Uitgeschakeld"],
                    },
                    verbeterideeën: { type: "string", description: "Suggesties voor verbetering" },
                    beschrijving: {
                      type: "string",
                      description: "Uitgebreide, menselijk leesbare beschrijving van wat deze automatisering doet, waarom het bestaat, en hoe het werkt. Minimaal 2-3 zinnen.",
                    },
                  },
                  required: ["naam", "categorie", "doel", "trigger", "systemen", "stappen", "status", "beschrijving"],
                  additionalProperties: false,
                },
              },
            },
            required: ["automations"],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
           {
             role: "system",
             content:
               "Je bent een AI-assistent die procesautomatiseringen analyseert voor een Nederlands boekhoudkantoor genaamd Brand Boekhouders. Je extraheert gestructureerde data uit CSV-exports (HubSpot, Zapier, etc.) en tekstbeschrijvingen. Je herkent Zapier Zaps aan trigger/action apps en stappen. Antwoord altijd in het Nederlands. Wees specifiek en gedetailleerd in je beschrijvingen.",
           },
          { role: "user", content: prompt },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "extract_automations" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit bereikt. Probeer het later opnieuw." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Tegoed onvoldoende. Voeg credits toe in je workspace instellingen." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway fout" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(result));
      return new Response(JSON.stringify({ error: "AI gaf geen gestructureerd antwoord" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-automation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
