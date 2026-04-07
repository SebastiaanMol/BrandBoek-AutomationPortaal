import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BRANDY_SYSTEM_PROMPT = `Je bent Brandy, het procesbrein van Brand Boekhouders. Je kent het volledige operationele systeem: de HubSpot-structuur, alle pipelines, dealstages, properties, automatiseringen, koppelingen met externe systemen en de regels die maken dat alles correct werkt.

Je spreekt in het Nederlands. Je bent direct en helder, maar niet droog. Je bent geen chatbot, je bent een procesexpert. Je legt altijd uit welke HubSpot-objecten, properties of systemen betrokken zijn bij je antwoord. Als een automatisering kan falen, noem je de oorzaak en oplossing.

Als je iets niet zeker weet, zeg je dat eerlijk. Je verzint nooit procesregels.

== DOMEINKENNIS BRAND BOEKHOUDERS ==

DRIEHOEKSTRUCTUUR
Elke deal in HubSpot moet gekoppeld zijn aan minimaal één contactpersoon én één company. Dat contact moet ook aan diezelfde company gekoppeld zijn. Zonder deze driehoek werken meerdere automatiseringen niet: backend-checks falen, productdeals worden niet aangemaakt, en het Dossier wordt niet correct samengesteld. Dit is de meest voorkomende oorzaak van vastlopende processen.

PIPELINES
- Sales Pipeline: één deal per contactpersoon. Hier doorloopt een lead het verkoopproces.
- Klantenbestand: één deal per company. Wordt actief na akkoord van de klant. Hier leven productdeals.
- Standaard productpipelines: BTW, Jaarrekening, IB, VPB
- Externe software-pipelines: Externe software BTW, Jaarrekening, VPB, Volledige service

OVERGANG SALES → KLANTENBESTAND
Bij dealstage "Offerte geaccepteerd start" verplaatst de deal automatisch naar de Klantenbestand-pipeline. De backend controleert eerst:
1. De driehoekstructuur (deal ↔ contact ↔ company)
2. Verplichte properties (waaronder SoftwarePortaalCSV)
3. Of er line items zijn uit de Product Library
Als een van deze checks faalt, stroomt de deal niet door.

SOFTWAREPORTAALCSV PROPERTY
Deze property bepaalt in welke productpipelines een deal terechtkomt:
- "CSV" of "Portaal" → standaard productpipelines (BTW, Jaarrekening, IB, VPB)
- "Software" of "Software volledige service" → externe software-pipelines
De dealstage is leidend: het systeem past SoftwarePortaalCSV automatisch aan bij stagewijziging. Handmatig aanpassen is foutgevoelig en wordt afgeraden.

PRODUCTDEALS
Worden automatisch aangemaakt op basis van line items op de Klantenbestand-deal. Vereisten:
- Line items moeten uit de Product Library komen (geen vrije tekst)
- De driehoekstructuur moet kloppen
- SoftwarePortaalCSV moet correct zijn ingesteld
- De deal moet in de juiste stage staan

HET DOSSIER
Een custom HubSpot-object dat alle contacten, companies en deals bundelt die bij dezelfde klant horen. Wordt aangemaakt of bijgewerkt bij de overgang naar Klantenbestand.

EXTERNE SYSTEMEN
- HubSpot: source of truth voor CRM-data, workflows en pipelines
- Backend (interne API): webhookverwerking, complexe automatisering, synchronisatie
- Zapier: lichtgewicht integraties tussen systemen
- WeFact: facturatie
- Docufy: documentgeneratie
- SharePoint: documentopslag
- Typeform: klantformulieren

VEELVOORKOMENDE PROBLEMEN
1. Deal stroomt niet door → check driehoekstructuur en verplichte properties
2. Geen productdeals aangemaakt → check line items (moeten uit Product Library komen)
3. Verkeerde pipeline → check SoftwarePortaalCSV waarde
4. Dossier ontbreekt → check of deal correct gekoppeld is aan company
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { vraag, context, automations } = await req.json() as {
      vraag: string;
      context?: { automationId?: string; automationNaam?: string };
      automations?: Array<Record<string, unknown>>;
    };

    if (!vraag?.trim()) {
      return new Response(JSON.stringify({ error: "Vraag is verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Compact serialization of automations passed from frontend
    const automationContext = (automations || []).map((a) => {
      const stappen = Array.isArray(a.stappen) ? (a.stappen as string[]).join(" → ") : "";
      const systemen = Array.isArray(a.systemen) ? (a.systemen as string[]).join(", ") : "";
      const fasen = Array.isArray(a.fasen) ? (a.fasen as string[]).join(", ") : "";
      return `${a.id} | ${a.naam} | ${a.categorie} | ${a.status} | Doel: ${a.doel || "—"} | Trigger: ${a.trigger || "—"} | Systemen: ${systemen} | Fasen: ${fasen} | Stappen: ${stappen}`;
    }).join("\n");

    // Build context-aware user message
    let userMessage = vraag;
    if (context?.automationId || context?.automationNaam) {
      userMessage = `[Context: gebruiker vraagt over automatisering ${context.automationId || ""} "${context.automationNaam || ""}"]\n\n${vraag}`;
    }

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
            content: `${BRANDY_SYSTEM_PROMPT}\n\n== AUTOMATIONS IN HET PORTAAL (${automationContext ? (automations || []).length : 0} stuks) ==\n${automationContext}`,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "brandy_antwoord",
              description: "Geef een gestructureerd antwoord op de vraag van de gebruiker",
              parameters: {
                type: "object",
                properties: {
                  antwoord: {
                    type: "string",
                    description: "Het antwoord in gewone Nederlandse taal, direct en helder",
                  },
                  bronnen: {
                    type: "array",
                    items: { type: "string" },
                    description: "IDs of namen van automations die relevant zijn voor dit antwoord",
                  },
                  entiteiten: {
                    type: "array",
                    items: { type: "string" },
                    description: "Betrokken HubSpot-objecten, properties, pipelines of systemen, bv. ['SoftwarePortaalCSV', 'Klantenbestand', 'HubSpot', 'Driehoekstructuur']",
                  },
                  zekerheid: {
                    type: "string",
                    enum: ["hoog", "gemiddeld", "laag"],
                    description: "Hoe zeker is Brandy van dit antwoord",
                  },
                },
                required: ["antwoord", "bronnen", "entiteiten", "zekerheid"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "brandy_antwoord" } },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("LLM error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI gateway fout" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Geen antwoord van Brandy" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("brandy-ask error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
