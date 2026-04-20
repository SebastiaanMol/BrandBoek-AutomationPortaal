// supabase/functions/enrich-automation/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Parse `from app.service/schemas/repository.x.y import ...` → file paths ──
function parseServiceImports(content: string): string[] {
  const seen = new Set<string>();
  const re = /^from\s+(app\.(?:service|schemas|repository)\.[a-zA-Z0-9_.]+)\s+import/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    // app.service.operations.operations → app/service/operations/operations.py
    const filePath = m[1].replace(/\./g, "/") + ".py";
    seen.add(filePath);
  }
  return [...seen];
}

async function fetchGitlabFile(
  projectId: string, filePath: string, branch: string, pat: string,
): Promise<string | null> {
  const res = await fetch(
    `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(branch)}`,
    { headers: { "PRIVATE-TOKEN": pat } },
  );
  if (!res.ok) return null;
  return res.text();
}

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
    const serviceFiles: { path: string; code: string }[] = [];

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

          // 4. Fetch router-bestand (API-laag)
          const routerContent = await fetchGitlabFile(projectId, gl.gitlab_file_path, branch, pat);
          if (routerContent) {
            productieCode = routerContent.slice(0, 3000);

            // 5. Trace service-imports: haal de service-bestanden op die de router aanroept
            const importedPaths = parseServiceImports(routerContent);
            // Sla schemas/ over — die bevatten alleen Pydantic-modellen, geen logica
            const logicPaths = importedPaths.filter((p) => !p.startsWith("app/schemas/"));

            for (const servicePath of logicPaths.slice(0, 4)) {
              const code = await fetchGitlabFile(projectId, servicePath, branch, pat);
              if (code) {
                serviceFiles.push({ path: servicePath, code: code.slice(0, 3000) });
              } else {
                console.warn(`Service-bestand niet gevonden: ${servicePath}`);
              }
            }
          } else {
            console.warn(`GitLab fetch mislukt: ${gitlabFile}`);
          }

          // 6. Fetch testbestand (gitlabtest/<zelfde bestandsnaam>)
          const filename = gl.gitlab_file_path.split("/").pop() ?? "";
          testFile = `gitlabtest/${filename}`;
          const testContent = await fetchGitlabFile(projectId, testFile, branch, pat);
          if (testContent) {
            testCode = testContent.slice(0, 2000);
          } else {
            console.warn(`GitLab test fetch mislukt: ${testFile}`);
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

    const serviceSection = serviceFiles.length > 0
      ? serviceFiles.map((sf) => `### Service: ${sf.path}\n${sf.code}`).join("\n\n")
      : "";

    const prompt = hasGitlab
      ? `Je krijgt twee databronnen van één automatisering:
1. De trigger-configuratie vanuit HubSpot
2. De volledige backend-code vanuit GitLab (router + service-laag)

Jouw taak: schrijf een samengestelde beschrijving als één geheel — van trigger tot eindresultaat.

## Context over de backend-architectuur
De backend is een interne Python API (FastAPI) op Railway.
Structuur: app/API/ (dunne HTTP-laag) → app/service/ (bedrijfslogica) → app/repository/ (externe API-wrappers).
HubSpot workflows sturen webhooks naar de API. De API koppelt terug naar HubSpot, Clockify, WeFact, SharePoint of andere systemen.

## HubSpot Workflow
Naam: ${workflowName}
Status: ${workflowStatus}
Trigger: ${triggerType}
Acties: ${workflowActions}

## GitLab Backend

### Router (API-laag)
Endpoint: POST ${endpointPath}
Bestand: ${gitlabFile}
${productieCode}
${serviceSection ? `\n${serviceSection}` : ""}
${testCode ? `\n### Testcode\nBestand: ${testFile}\n${testCode}` : ""}

Geef je antwoord in dit JSON-formaat:
${jsonSchema}

Schrijf alsof je uitlegt aan een niet-technische collega. Gebruik geen jargon. Wees concreet en kort.
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
