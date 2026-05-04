import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Automation = {
  id: string;
  naam: string;
  categorie: string;
  doel: string;
  trigger_beschrijving: string;
  systemen: string[];
  webhook_paths: string[];
  endpoints: string[];
};

type Suggestie = {
  from_id: string;
  to_id: string;
  confidence: number;
  reasoning: string;
};

function endpointMatches(webhookPath: string, endpoint: string): boolean {
  return webhookPath.endsWith(endpoint);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error: fetchError } = await db
      .from("automatiseringen")
      .select("id, naam, categorie, doel, trigger_beschrijving, systemen, webhook_paths, endpoints");
    if (fetchError) throw fetchError;

    const autos: Automation[] = rows ?? [];

    // Step 1: Webhook/endpoint matching (deterministic)
    const webhookSuggesties: Suggestie[] = [];
    const linkedIds = new Set<string>();

    for (const source of autos) {
      if (!source.webhook_paths?.length) continue;
      for (const target of autos) {
        if (target.id === source.id || !target.endpoints?.length) continue;
        for (const webhookPath of source.webhook_paths) {
          for (const endpoint of target.endpoints) {
            if (endpointMatches(webhookPath, endpoint)) {
              webhookSuggesties.push({
                from_id: source.id,
                to_id: target.id,
                confidence: 1.0,
                reasoning: endpoint,
              });
              linkedIds.add(source.id);
              linkedIds.add(target.id);
            }
          }
        }
      }
    }

    // Step 2: AI analysis for automations not yet linked
    const unlinked = autos.filter((a) => !linkedIds.has(a.id));
    const aiSuggesties: Suggestie[] = [];

    if (unlinked.length > 1) {
      const autoList = unlinked
        .map(
          (a) =>
            `- id: "${a.id}", naam: "${a.naam}", categorie: "${a.categorie}", doel: "${a.doel}", trigger: "${a.trigger_beschrijving}", systemen: ${JSON.stringify(a.systemen ?? [])}`,
        )
        .join("\n");

      const prompt = `Gegeven deze automatiseringen, welke hangen logisch samen? Geef alleen koppels terug met directe functionele verbanden. Geen indirecte relaties.

${autoList}

Antwoord uitsluitend in dit JSON-formaat:
{"suggesties": [{"from": "id1", "to": "id2", "redenering": "korte Nederlandse toelichting"}]}`;

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

      if (res.ok) {
        const geminiResult = await res.json();
        const content = geminiResult.choices?.[0]?.message?.content;
        if (content) {
          const cleaned = content
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          try {
            const parsed = JSON.parse(cleaned) as {
              suggesties: { from: string; to: string; redenering: string }[];
            };
            for (const s of parsed.suggesties ?? []) {
              if (s.from && s.to) {
                aiSuggesties.push({
                  from_id: s.from,
                  to_id: s.to,
                  confidence: 0.7,
                  reasoning: s.redenering ?? "",
                });
              }
            }
          } catch {
            console.warn("detect-flow-links: Gemini returned invalid JSON, skipping AI suggestions");
          }
        }
      } else {
        console.warn(`detect-flow-links: Gemini API error ${res.status}, skipping AI suggestions`);
      }
    }

    // Step 3: Save to automatisering_ai_flows (idempotent: delete old first)
    const allSuggesties = [...webhookSuggesties, ...aiSuggesties];
    const affectedFromIds = [...new Set(allSuggesties.map((s) => s.from_id))];

    if (affectedFromIds.length > 0) {
      await db.from("automatisering_ai_flows").delete().in("from_id", affectedFromIds);
    }

    if (allSuggesties.length > 0) {
      const { error: insertError } = await db.from("automatisering_ai_flows").insert(
        allSuggesties.map((s) => ({
          from_id: s.from_id,
          to_id: s.to_id,
          confidence: s.confidence,
          reasoning: s.reasoning,
          confirmed: false,
          rejected: false,
        })),
      );
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({ webhook: webhookSuggesties.length, ai: aiSuggesties.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("detect-flow-links error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
