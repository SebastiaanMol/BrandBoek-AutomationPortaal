import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Skip rules: these files are infrastructure, not automations ───────────────
const SKIP_NAMES = new Set([
  "__init__.py", "main.py", "auth.py", "constants.py",
  "exceptions.py", "logging_config.py", "hubspot_client.py",
]);
const SKIP_PATH_SEGMENTS = ["/repository/", "/schemas/"];

// ── Fasen mapping: immediate parent directory → KlantFase[] ──────────────────
const FASEN_MAP: Record<string, string[]> = {
  API:          ["Sales"],
  clockify:     ["Onboarding"],
  kvk:          ["Onboarding"],
  operations:   ["Boekhouding"],
  va_pipelines: ["Boekhouding"],
  properties:   ["Boekhouding"],
};

function shouldSkip(filePath: string): boolean {
  const name = filePath.split("/").pop() ?? "";
  if (SKIP_NAMES.has(name)) return true;
  return SKIP_PATH_SEGMENTS.some((seg) => filePath.includes(seg));
}

function getFasen(filePath: string): string[] {
  const parts = filePath.split("/");
  const parentDir = parts.length >= 2 ? parts[parts.length - 2] : "";
  return FASEN_MAP[parentDir] ?? [];
}

// ── GitLab Tree API: returns all .py file paths under app/ ───────────────────
async function fetchGitlabTree(
  projectId: string,
  branch: string,
  pat: string,
): Promise<string[]> {
  const filePaths: string[] = [];
  let page = 1;

  while (true) {
    const url =
      `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/repository/tree` +
      `?path=app&recursive=true&per_page=100&ref=${encodeURIComponent(branch)}&page=${page}`;

    const res = await fetch(url, { headers: { "PRIVATE-TOKEN": pat } });

    if (!res.ok) {
      const body = await res.text();
      try {
        const parsed = JSON.parse(body);
        if (parsed.error === "insufficient_scope") {
          throw new Error(
            `GitLab token heeft onvoldoende rechten. Maak een legacy Personal Access Token aan met 'read_api' scope (niet read_repository, niet via AI/Duo-instellingen).`,
          );
        }
      } catch (e) {
        if ((e as Error).message.startsWith("GitLab token")) throw e;
      }
      throw new Error(`GitLab Tree API fout (${res.status}): ${body.slice(0, 200)}`);
    }

    const items: Array<{ type: string; path: string }> = await res.json();
    for (const item of items) {
      if (item.type === "blob" && item.path.endsWith(".py")) {
        filePaths.push(item.path);
      }
    }

    const nextPage = res.headers.get("X-Next-Page");
    if (!nextPage) break;
    page = Number(nextPage);
  }

  return filePaths;
}

// ── GitLab Files API: fetch raw file content (base64-decoded) ─────────────────
async function fetchFileContent(
  projectId: string,
  filePath: string,
  branch: string,
  pat: string,
): Promise<string> {
  const encoded = encodeURIComponent(filePath);
  const url =
    `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectId)}/repository/files/${encoded}` +
    `?ref=${encodeURIComponent(branch)}`;

  const res = await fetch(url, { headers: { "PRIVATE-TOKEN": pat } });

  if (!res.ok) {
    throw new Error(`GitLab Files API fout (${res.status}): ${filePath}`);
  }

  const data = await res.json();
  // GitLab returns content as base64 with embedded newlines
  return atob((data.content as string).replace(/\n/g, ""));
}

// ── Gemini: extract structured metadata from Python source ────────────────────
async function extractMetadata(
  filename: string,
  content: string,
  geminiKey: string,
): Promise<{
  naam: string;
  doel: string;
  trigger: string;
  stappen: string[];
  systemen: string[];
}> {
  const tools = [
    {
      type: "function",
      function: {
        name: "extract_automation_metadata",
        description: "Extract structured automation metadata from a Python script",
        parameters: {
          type: "object",
          properties: {
            naam: {
              type: "string",
              description: "Korte Nederlandse naam voor de automatisering (max 60 tekens)",
            },
            doel: {
              type: "string",
              description: "Één zin in het Nederlands — wat bereikt dit script?",
            },
            trigger: {
              type: "string",
              description:
                "Wat start deze automatisering? (bijv. 'API endpoint POST /pad', 'webhook', 'handmatig')",
            },
            stappen: {
              type: "array",
              items: { type: "string" },
              description:
                "Array van 3-6 stappen in het Nederlands die beschrijven hoe het script werkt",
            },
            systemen: {
              type: "array",
              items: { type: "string" },
              description:
                "Array van externe systemen die worden gebruikt (bijv. HubSpot, Clockify, KvK, WeFact)",
            },
          },
          required: ["naam", "doel", "trigger", "stappen", "systemen"],
          additionalProperties: false,
        },
      },
    },
  ];

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
              "Je bent een technische assistent die Python automatiseringsscripts analyseert voor een Nederlands boekhoudkantoor. Extraheer gestructureerde metadata. Antwoord altijd in het Nederlands.",
          },
          {
            role: "user",
            content:
              `Analyseer dit Python script en extraheer de automatiseringsmetadata.\n\nBestandsnaam: ${filename}\n\nInhoud:\n${content.slice(0, 6000)}`,
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "extract_automation_metadata" } },
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Gemini API fout (${res.status})`);
  }

  const result = await res.json();
  const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error("Gemini: geen tool call in antwoord");
  }

  return JSON.parse(toolCall.function.arguments);
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY is niet geconfigureerd" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Read GitLab integration
    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("type", "gitlab")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({
          error:
            "Geen GitLab-integratie gevonden. Sla eerst een token op via Instellingen.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let pat: string, projectId: string, branch: string;
    try {
      ({ pat, projectId, branch } = JSON.parse(integration.token as string));
    } catch {
      return new Response(
        JSON.stringify({
          error: "GitLab configuratie ongeldig — sla de verbinding opnieuw op",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Discover all Python automation files
    const allFiles = await fetchGitlabTree(projectId, branch, pat);
    const automationFiles = allFiles.filter((p) => !shouldSkip(p));

    if (automationFiles.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Geen Python-automatiseringsbestanden gevonden onder app/",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Load existing GitLab records for diffing
    const { data: existing } = await db
      .from("automatiseringen")
      .select("id, external_id, status")
      .eq("source", "gitlab");

    const existingMap: Record<string, { id: string; status: string }> = {};
    for (const row of existing ?? []) {
      if (row.external_id) existingMap[row.external_id] = row;
    }

    const syncedPaths = new Set<string>(automationFiles); // mark all upfront
    let inserted = 0, updated = 0;
    const now = new Date().toISOString();
    const fileErrors: string[] = [];

    // Step 3: Fetch content + extract metadata + upsert — parallel batches of 5
    const BATCH = 5;
    for (let i = 0; i < automationFiles.length; i += BATCH) {
      const batch = automationFiles.slice(i, i + BATCH);
      await Promise.allSettled(
        batch.map(async (filePath) => {
          try {
            const content = await fetchFileContent(projectId, filePath, branch, pat);
            const filename = filePath.split("/").pop() ?? filePath;
            const metadata = await extractMetadata(filename, content, GEMINI_API_KEY);
            const systemen = [...new Set(["GitLab", ...(metadata.systemen ?? [])])];
            const fasen = getFasen(filePath);

            if (existingMap[filePath]) {
              const { error: updateError } = await db
                .from("automatiseringen")
                .update({
                  naam:                 metadata.naam,
                  doel:                 metadata.doel,
                  trigger_beschrijving: metadata.trigger,
                  stappen:              metadata.stappen,
                  systemen:             systemen,
                  fasen,
                  gitlab_file_path:     filePath,
                  last_synced_at:       now,
                })
                .eq("id", existingMap[filePath].id);
              if (updateError) throw updateError;
              updated++;
            } else {
              const { data: newId } = await db.rpc("generate_auto_id");
              const { error: insertError } = await db.from("automatiseringen").insert({
                id:                   newId || `AUTO-GL-${Date.now()}`,
                naam:                 metadata.naam,
                doel:                 metadata.doel,
                trigger_beschrijving: metadata.trigger,
                stappen:              metadata.stappen,
                systemen:             systemen,
                fasen,
                categorie:            "Backend Script",
                status:               "Actief",
                afhankelijkheden:     "",
                owner:                "",
                verbeterideeen:       "",
                mermaid_diagram:      "",
                external_id:          filePath,
                source:               "gitlab",
                import_status:        "approved",
                gitlab_file_path:     filePath,
                last_synced_at:       now,
              });
              if (insertError) throw insertError;
              inserted++;
            }
          } catch (e) {
            const msg = `${filePath}: ${(e as Error).message}`;
            console.warn(`gitlab-sync: bestand mislukt — ${msg}`);
            fileErrors.push(msg);
          }
        }),
      );
    }

    // If every single file failed, surface the first error instead of returning 0/0/0
    if (fileErrors.length > 0 && inserted + updated === 0) {
      return new Response(
        JSON.stringify({ error: `Alle bestanden mislukt. Eerste fout: ${fileErrors[0]}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 4: Deactivate files no longer in the repo
    let deactivated = 0;
    for (const [extPath, row] of Object.entries(existingMap)) {
      if (!syncedPaths.has(extPath) && row.status !== "Inactief") {
        await db
          .from("automatiseringen")
          .update({ status: "Inactief" })
          .eq("id", row.id);
        deactivated++;
      }
    }

    // Step 5: Update integration timestamp
    await db
      .from("integrations")
      .update({ last_synced_at: now, status: "connected", error_message: null })
      .eq("id", integration.id);

    return new Response(
      JSON.stringify({ success: true, inserted, updated, deactivated, total: automationFiles.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("gitlab-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
