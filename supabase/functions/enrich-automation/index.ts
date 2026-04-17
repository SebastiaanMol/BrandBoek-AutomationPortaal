// supabase/functions/enrich-automation/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { automation_id } = await req.json();
    if (!automation_id) {
      return new Response(JSON.stringify({ error: "automation_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Haal de automation op
    const { data: automation } = await db
      .from("automatiseringen")
      .select("id, naam, status, trigger_beschrijving, stappen, source")
      .eq("id", automation_id)
      .maybeSingle();

    if (!automation) {
      return new Response(JSON.stringify({ error: "Automation niet gevonden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Zoek gekoppelde GitLab automation
    const { data: link } = await (db as any)
      .from("automation_links")
      .select("target_id")
      .eq("source_id", automation_id)
      .maybeSingle();

    let productieCode = "";
    let testCode = "";
    let gitlabFile = "";
    let testFile = "";
    let endpointPath = "";

    if (link?.target_id) {
      const { data: gl } = await db
        .from("automatiseringen")
        .select("gitlab_file_path, endpoints")
        .eq("id", link.target_id)
        .maybeSingle();

      if (gl?.gitlab_file_path) {
        gitlabFile = gl.gitlab_file_path;
        endpointPath = (gl.endpoints ?? [])[0] ?? "";

        // 3. Haal GitLab credentials op
        const { data: integration } = await db
          .from("integrations")
          .select("token")
          .eq("type", "gitlab")
          .eq("status", "connected")
          .maybeSingle();

        if (integration?.token) {
          let pat: string, projectId: string, branch = "main";
          try {
            ({ pat, projectId, branch = "main" } = JSON.parse(integration.token));
          } catch {
            throw new Error("GitLab integratie: ongeldige token-opslag — sla de verbinding opnieuw op");
          }

          // 4. Fetch productie-code
          const encodedPath = encodeURIComponent(gl.gitlab_file_path);
          const codeRes = await fetch(
            `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodedPath}/raw?ref=${branch}`,
            { headers: { "PRIVATE-TOKEN": pat } },
          );
          if (codeRes.ok) {
            productieCode = (await codeRes.text()).slice(0, 4000);
          } else {
            console.warn(`GitLab fetch mislukt (${codeRes.status}): ${gitlabFile}`);
          }

          // 5. Fetch testbestand (gitlabtest/<zelfde bestandsnaam>)
          const filename = gl.gitlab_file_path.split("/").pop() ?? "";
          testFile = `gitlabtest/${filename}`;
          const encodedTestPath = encodeURIComponent(testFile);
          const testRes = await fetch(
            `https://gitlab.com/api/v4/projects/${projectId}/repository/files/${encodedTestPath}/raw?ref=${branch}`,
            { headers: { "PRIVATE-TOKEN": pat } },
          );
          if (testRes.ok) {
            testCode = (await testRes.text()).slice(0, 2000);
          } else {
            console.warn(`GitLab test fetch mislukt (${testRes.status}): ${testFile}`);
          }
        }
      }
    }

    // 6. Bouw prompt
    const workflowName = automation.naam ?? "";
    const workflowStatus = automation.status ?? "";
    const triggerType = automation.trigger_beschrijving ?? "";
    const workflowActions = Array.isArray(automation.stappen) ? automation.stappen.join("; ") : "";
    const hasGitlab = productieCode.length > 0;

    const jsonSchema = `{
  "summary": "Één zin die de kern van de automatisering beschrijft.",
  "description": "2-3 zinnen die uitleggen wat er stap voor stap gebeurt.",
  "systems": ["lijst", "van", "betrokken", "systemen"],
  "trigger_moment": "Wanneer start deze automatisering?",
  "end_result": "Wat is het eindresultaat?",
  "data_flow": "Welke data wordt doorgegeven van HubSpot naar de backend?",
  "phases": ["lijst", "van", "klantfasen"]
}`;

    const prompt = hasGitlab
      ? `Je krijgt twee databronnen van één automatisering:
1. De trigger-configuratie vanuit HubSpot
2. De bijbehorende backend-code vanuit GitLab

Jouw taak: schrijf een samengestelde beschrijving als één geheel — van trigger tot eindresultaat.

## Context over de backend-architectuur
De backend is een interne Python API (FastAPI) die draait op Railway.
HubSpot workflows sturen via webhooks data naar de API. De API verwerkt de logica en koppelt terug naar HubSpot, Clockify, WeFact, SharePoint of andere systemen.

## HubSpot Workflow
Naam: ${workflowName}
Status: ${workflowStatus}
Trigger: ${triggerType}
Acties: ${workflowActions}

## GitLab Backend

### Productie-code
Endpoint: POST ${endpointPath}
Bestand: ${gitlabFile}
${productieCode}

### Testcode (gitlabtest/)
Bestand: ${testFile}
${testCode}

Geef je antwoord in dit JSON-formaat:
${jsonSchema}

Schrijf alsof je uitlegt aan een niet-technische collega. Gebruik geen jargon. Wees concreet en kort.
Als de testcode extra inzicht geeft, verwerk dat dan in de beschrijving.
Geldige waarden voor phases: Onboarding, Marketing, Sales, Boekhouding, Offboarding.`
      : `Je analyseert een automatisering. Schrijf een beschrijving van trigger tot eindresultaat.

## Automatisering
Naam: ${workflowName}
Status: ${workflowStatus}
Trigger: ${triggerType}
Acties: ${workflowActions}

Geef je antwoord in dit JSON-formaat:
${jsonSchema}

Geldige waarden voor phases: Onboarding, Marketing, Sales, Boekhouding, Offboarding.`;

    // 7. Roep Gemini aan
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
              content: "Je bent een technische assistent die automatiseringen beschrijft voor een Nederlands boekhoudkantoor. Antwoord altijd in het Nederlands en in het gevraagde JSON-formaat.",
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
    let enrichment: Record<string, unknown>;
    try {
      enrichment = JSON.parse(cleaned);
    } catch {
      throw new Error(`Gemini: ongeldige JSON in antwoord: ${cleaned.slice(0, 100)}`);
    }

    // 8. Sla op in ai_enrichment
    const { error: updateError } = await db
      .from("automatiseringen")
      .update({
        ai_enrichment: { ...enrichment, generated_at: new Date().toISOString() },
      })
      .eq("id", automation_id);
    if (updateError) throw new Error(`DB update mislukt: ${updateError.message}`);

    return new Response(
      JSON.stringify({ success: true, automation_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("enrich-automation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
