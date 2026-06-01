import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildBrandContextPrompt } from "../_shared/brand-context.ts";
import { runGitLabAutomationBackfill } from "../_shared/gitlab-backfill.ts";
import { mapGitLabEndpointToAutomationPayload } from "../_shared/gitlab-readonly.ts";
import {
  applyPortalOwnedSyncChanges,
  finishSourceSyncRun,
  previewPortalOwnedSync,
  recordPortalOwnedSync,
  recordSourceSyncFailure,
  startSourceSyncRun,
} from "../_shared/portal-owned-sync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Skip rules: these files are infrastructure, not automations ───────────────
// ── Fasen mapping: immediate parent directory → KlantFase[] ──────────────────
const FASEN_MAP: Record<string, string[]> = {
  API:          ["Sales"],
  clockify:     ["Onboarding"],
  kvk:          ["Onboarding"],
  operations:   ["Boekhouding"],
  va_pipelines: ["Boekhouding"],
  properties:   ["Boekhouding"],
};

function getFasen(filePath: string): string[] {
  const parts = filePath.split("/");
  const parentDir = parts.length >= 2 ? parts[parts.length - 2] : "";
  return FASEN_MAP[parentDir] ?? [];
}

type GitlabTreeFile = {
  path: string;
  blobId: string | null;
};

type PythonFunctionInfo = {
  name: string;
  decorators: string[];
  body: string;
};

type PythonModuleInfo = {
  module: string;
  filePath: string;
  imports: Map<string, { type: "module"; module: string } | { type: "symbol"; module: string; name: string }>;
  functions: Map<string, PythonFunctionInfo>;
  routerPrefix: string;
};

type EndpointAutomation = {
  externalId: string;
  name: string;
  method: string;
  endpoint: string;
  apiFile: string;
  handler: string;
  systems: string[];
  calls: Array<{ depth: number; kind: string; from: string; to: string; file: string | null }>;
};

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

function pathToModule(filePath: string): string {
  return filePath.replace(/\.py$/, "").replace(/\//g, ".");
}

function normalizeImportBlocks(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*from app\..*import\s*\(\s*$/.test(line)) {
      const block = [line.trim()];
      while (i + 1 < lines.length) {
        i++;
        block.push(lines[i].trim());
        if (lines[i].includes(")")) break;
      }
      result.push(block.join(" "));
    } else {
      result.push(line);
    }
  }
  return result;
}

function parseImports(lines: string[]): PythonModuleInfo["imports"] {
  const imports: PythonModuleInfo["imports"] = new Map();

  for (const line of lines) {
    const importMatch = line.match(/^\s*import\s+(app\.[\w.]+)(?:\s+as\s+(\w+))?/);
    if (importMatch) {
      imports.set(importMatch[2] || importMatch[1].split(".")[0], { type: "module", module: importMatch[1] });
      continue;
    }

    const fromMatch = line.match(/^\s*from\s+(app\.[\w.]+)\s+import\s+(.+)$/);
    if (!fromMatch) continue;
    const fromModule = fromMatch[1];
    const names = fromMatch[2].replace(/[()]/g, "").split(",").map((part) => part.trim()).filter(Boolean);

    for (const raw of names) {
      const aliasMatch = raw.match(/^(\w+)\s+as\s+(\w+)$/);
      const importedName = aliasMatch ? aliasMatch[1] : raw;
      const localName = aliasMatch ? aliasMatch[2] : raw;
      imports.set(localName, { type: "symbol", module: fromModule, name: importedName });
    }
  }

  return imports;
}

function parseRouterPrefix(content: string): string {
  return content.match(/router\s*=\s*APIRouter\s*\([\s\S]*?prefix\s*=\s*["']([^"']+)["']/m)?.[1] ?? "";
}

function lineIndent(line: string): number {
  return line.match(/^(\s*)/)?.[1].length ?? 0;
}

function parseFunctions(lines: string[]): Map<string, PythonFunctionInfo> {
  const functions = new Map<string, PythonFunctionInfo>();
  let pendingDecorators: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("@")) {
      pendingDecorators.push(trimmed);
      continue;
    }

    const defMatch = line.match(/^(\s*)(?:async\s+)?def\s+(\w+)\s*\((.*)$/);
    if (!defMatch) {
      if (trimmed && !trimmed.startsWith("#")) pendingDecorators = [];
      continue;
    }

    const indent = defMatch[1].length;
    const name = defMatch[2];
    const signatureParts = [line.trim()];
    while (!signatureParts.at(-1)?.trim().endsWith(":") && i + 1 < lines.length) {
      i++;
      signatureParts.push(lines[i].trim());
    }

    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const bodyLine = lines[j];
      if (bodyLine.trim() && lineIndent(bodyLine) <= indent) break;
      body.push(bodyLine);
    }
    i = j - 1;

    functions.set(name, { name, decorators: pendingDecorators, body: body.join("\n") });
    pendingDecorators = [];
  }

  return functions;
}

function joinRoute(prefix: string, routePath: string): string {
  const left = prefix.replace(/\/$/, "");
  const right = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return left ? `${left}${right}` : right;
}

function endpointDecorators(functionInfo: PythonFunctionInfo, prefix: string): Array<{ method: string; endpoint: string }> {
  const routes: Array<{ method: string; endpoint: string }> = [];
  for (const decorator of functionInfo.decorators) {
    const match = decorator.match(/^@router\.(\w+)\s*\(\s*["']([^"']+)["']/);
    if (!match) continue;
    const method = match[1].toLowerCase();
    if (!HTTP_METHODS.has(method)) continue;
    routes.push({ method: method.toUpperCase(), endpoint: joinRoute(prefix, match[2]) });
  }
  return routes;
}

function resolveTarget(moduleInfo: PythonModuleInfo, rawTarget: string) {
  const clean = rawTarget.replace(/^await\s+/, "").trim();
  const parts = clean.split(".");
  const first = parts[0];
  const imported = moduleInfo.imports.get(first);

  if (imported?.type === "module") return { module: imported.module, functionName: parts.slice(1).join(".") || first };
  if (imported?.type === "symbol") return { module: imported.module, functionName: [imported.name, ...parts.slice(1)].join(".") };
  if (moduleInfo.functions.has(first)) return { module: moduleInfo.module, functionName: first };
  return null;
}

function dedupeByKey<T>(items: T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function extractCallTargets(moduleInfo: PythonModuleInfo, functionInfo: PythonFunctionInfo) {
  const targets: Array<{ kind: string; raw: string }> = [];
  const body = functionInfo.body;

  for (const match of body.matchAll(/background_tasks\.add_task\s*\(\s*([\w.]+)/g)) targets.push({ kind: "background_task", raw: match[1] });
  for (const match of body.matchAll(/call_hubspot_api\s*\(\s*([\w.]+)/g)) targets.push({ kind: "hubspot_repository_call", raw: match[1] });
  for (const match of body.matchAll(/(?:return\s+)?await\s+([\w.]+)\s*\(/g)) {
    if (match[1] !== "call_hubspot_api") targets.push({ kind: "await_call", raw: match[1] });
  }
  for (const match of body.matchAll(/\b([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\(/g)) {
    const raw = match[1];
    if (
      raw === "call_hubspot_api" ||
      raw === "background_tasks.add_task" ||
      raw.startsWith("logger.") ||
      raw.startsWith("logging.") ||
      raw.startsWith("HTTPException")
    ) continue;
    if (resolveTarget(moduleInfo, raw)) targets.push({ kind: "call", raw });
  }

  return dedupeByKey(targets, (target) => `${target.kind}:${target.raw}`)
    .map((target) => ({ ...target, resolved: resolveTarget(moduleInfo, target.raw) }))
    .filter((target) => target.resolved);
}

function collectCalls(
  modules: Map<string, PythonModuleInfo>,
  moduleName: string,
  functionName: string,
  depth = 0,
  maxDepth = 3,
  seen = new Set<string>(),
): EndpointAutomation["calls"] {
  const key = `${moduleName}::${functionName}`;
  if (seen.has(key)) return [];
  seen.add(key);

  const moduleInfo = modules.get(moduleName);
  const functionInfo = moduleInfo?.functions.get(functionName);
  if (!moduleInfo || !functionInfo) return [];

  const records: EndpointAutomation["calls"] = [];
  for (const target of extractCallTargets(moduleInfo, functionInfo)) {
    const targetModule = target.resolved!.module;
    const targetFunction = target.resolved!.functionName;
    records.push({
      depth,
      kind: target.kind,
      from: `${moduleName}::${functionName}`,
      to: `${targetModule}::${targetFunction}`,
      file: modules.get(targetModule)?.filePath ?? null,
    });

    const nestedFunction = targetFunction.split(".").at(-1);
    if (depth + 1 < maxDepth && nestedFunction) {
      records.push(...collectCalls(modules, targetModule, nestedFunction, depth + 1, maxDepth, new Set(seen)));
    }
  }

  return dedupeByKey(records, (record) => JSON.stringify(record));
}

function inferSystems(endpoint: string, calls: EndpointAutomation["calls"]): string[] {
  const text = [endpoint, ...calls.map((call) => call.to), ...calls.map((call) => call.file || "")].join(" ").toLowerCase();
  const systems = ["GitLab"];
  for (const [needle, label] of [
    ["hubspot", "HubSpot"],
    ["typeform", "Typeform"],
    ["clockify", "Clockify"],
    ["kvk", "KvK"],
    ["wefact", "WeFact"],
    ["sharepoint", "SharePoint"],
    ["graph", "Microsoft Graph"],
  ]) {
    if (text.includes(needle) && !systems.includes(label)) systems.push(label);
  }
  return systems;
}

function readableName(handler: string): string {
  const name = handler.replace(/_/g, " ").trim();
  return name ? `${name[0].toUpperCase()}${name.slice(1)}` : "Endpoint automation";
}

function buildModules(contentsByPath: Map<string, string>): Map<string, PythonModuleInfo> {
  const modules = new Map<string, PythonModuleInfo>();
  for (const [filePath, content] of contentsByPath.entries()) {
    const lines = normalizeImportBlocks(content);
    const moduleName = pathToModule(filePath);
    modules.set(moduleName, {
      module: moduleName,
      filePath,
      imports: parseImports(lines),
      functions: parseFunctions(lines),
      routerPrefix: parseRouterPrefix(content),
    });
  }
  return modules;
}

function analyzeEndpointAutomations(contentsByPath: Map<string, string>, maxDepth = 3): EndpointAutomation[] {
  const modules = buildModules(contentsByPath);
  const endpoints: EndpointAutomation[] = [];
  for (const moduleInfo of [...modules.values()].sort((a, b) => a.filePath.localeCompare(b.filePath))) {
    if (!moduleInfo.module.startsWith("app.API.")) continue;
    for (const functionInfo of moduleInfo.functions.values()) {
      for (const route of endpointDecorators(functionInfo, moduleInfo.routerPrefix)) {
        const calls = collectCalls(modules, moduleInfo.module, functionInfo.name, 0, maxDepth);
        const systems = inferSystems(route.endpoint, calls);
        endpoints.push({
          externalId: `${moduleInfo.filePath}::${route.method} ${route.endpoint}`,
          name: readableName(functionInfo.name),
          method: route.method,
          endpoint: route.endpoint,
          apiFile: moduleInfo.filePath,
          handler: functionInfo.name,
          systems,
          calls,
        });
      }
    }
  }
  return endpoints;
}

// ── Endpoint extraction: regex on FastAPI APIRouter patterns ─────────────────
// ── GitLab Tree API: returns all .py file paths under app/ ───────────────────
async function fetchGitlabTree(
  projectId: string,
  branch: string,
  pat: string,
): Promise<GitlabTreeFile[]> {
  const files: GitlabTreeFile[] = [];
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

    const items: Array<{ id?: string; type: string; path: string }> = await res.json();
    for (const item of items) {
      if (item.type === "blob" && item.path.endsWith(".py")) {
        files.push({ path: item.path, blobId: item.id ?? null });
      }
    }

    const nextPage = res.headers.get("X-Next-Page");
    if (!nextPage) break;
    page = Number(nextPage);
  }

  return files;
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
  const brandContext = buildBrandContextPrompt();
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
              `${brandContext}\n\nAnalyseer dit Python script en extraheer de automatiseringsmetadata.\n\nBestandsnaam: ${filename}\n\nInhoud:\n${content.slice(0, 6000)}`,
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
    const requestBody = req.method === "POST"
      ? await req.json().catch(() => ({}))
      : {};
    const mode = requestBody?.mode === "apply"
      ? "apply"
      : requestBody?.mode === "backfill"
        ? "backfill"
        : "preview";
    const dryRun = mode === "backfill" ? requestBody?.dryRun !== false : false;

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (mode === "apply") {
      const result = await applyPortalOwnedSyncChanges(db, {
        source: "gitlab",
        syncRunId: String(requestBody?.syncRunId ?? ""),
        selectedChangeItemIds: Array.isArray(requestBody?.selectedChangeItemIds)
          ? requestBody.selectedChangeItemIds.map(String)
          : [],
        now: new Date().toISOString(),
      });
      return new Response(
        JSON.stringify({ success: true, ...result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (mode === "preview") {
      // Preview mode fetches GitLab read-only data and stores review items.
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
      await recordSourceSyncFailure(db, "gitlab", new Date().toISOString(), {
        status: "failed",
        errorMessage: "Geen GitLab-integratie gevonden.",
      });
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
      await recordSourceSyncFailure(db, "gitlab", new Date().toISOString(), {
        status: "auth_failed",
        errorMessage: "GitLab configuratie ongeldig.",
      });
      return new Response(
        JSON.stringify({
          error: "GitLab configuratie ongeldig — sla de verbinding opnieuw op",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Discover all Python source files and split app/API routes into endpoint automations
    const allFiles = await fetchGitlabTree(projectId, branch, pat);
    const sourceFiles = allFiles.filter((file) => !file.path.includes("/schemas/"));

    if (sourceFiles.length === 0) {
      await recordSourceSyncFailure(db, "gitlab", new Date().toISOString(), {
        status: "failed",
        errorMessage: "Geen Python-bestanden gevonden onder app/.",
      });
      return new Response(
        JSON.stringify({
          error: "Geen Python-bestanden gevonden onder app/",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const contentsByPath = new Map<string, string>();
    const sourceErrors: string[] = [];
    const SOURCE_BATCH = 8;
    for (let i = 0; i < sourceFiles.length; i += SOURCE_BATCH) {
      const batch = sourceFiles.slice(i, i + SOURCE_BATCH);
      await Promise.allSettled(
        batch.map(async (file) => {
          try {
            contentsByPath.set(file.path, await fetchFileContent(projectId, file.path, branch, pat));
          } catch (e) {
            sourceErrors.push(`${file.path}: ${(e as Error).message}`);
          }
        }),
      );
    }

    const endpointAutomations = analyzeEndpointAutomations(contentsByPath);
    const apiBlobByPath = new Map(allFiles.map((file) => [file.path, file.blobId]));

    if (endpointAutomations.length === 0) {
      await recordSourceSyncFailure(db, "gitlab", new Date().toISOString(), {
        status: "failed",
        errorMessage: "Geen FastAPI endpoints gevonden onder app/API/.",
        itemsSeen: sourceFiles.length,
      });
      return new Response(
        JSON.stringify({
          error: "Geen FastAPI endpoints gevonden onder app/API/",
          sourceErrors: sourceErrors.slice(0, 5),
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date().toISOString();
    const payloads = endpointAutomations.map((automation) => mapGitLabEndpointToAutomationPayload({
      externalId: automation.externalId,
      name: automation.name,
      method: automation.method,
      endpoint: automation.endpoint,
      apiFile: automation.apiFile,
      handler: automation.handler,
      systems: automation.systems,
      phases: getFasen(automation.apiFile),
      blobId: apiBlobByPath.get(automation.apiFile) ?? null,
      calls: automation.calls,
    }, now));

    const syncRunId = await startSourceSyncRun(db, "gitlab", now);

    if (mode === "backfill") {
      const backfill = await runGitLabAutomationBackfill(db, {
        payloads,
        now,
        dryRun,
      });

      if (dryRun) {
        await finishSourceSyncRun(db, syncRunId, {
          status: "success",
          finishedAt: now,
          itemsSeen: payloads.length,
        });

        return new Response(
          JSON.stringify({
            success: true,
            mode,
            dryRun,
            inserted: 0,
            updated: 0,
            deactivated: 0,
            total: payloads.length,
            proposed: backfill.newEndpoints,
            findings: 0,
            missing: backfill.missingExisting,
            changed: backfill.changedAutomations,
            syncRunId,
            backfill,
            scannedFiles: sourceFiles.length,
            sourceErrors: sourceErrors.slice(0, 5),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const result = await recordPortalOwnedSync(db, {
        source: "gitlab",
        payloads,
        syncRunId,
        now,
      });

      return new Response(
        JSON.stringify({
          success: true,
          mode,
          dryRun,
          backfill,
          ...result,
          scannedFiles: sourceFiles.length,
          sourceErrors: sourceErrors.slice(0, 5),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await previewPortalOwnedSync(db, {
      source: "gitlab",
      payloads,
      syncRunId,
      now,
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
        scannedFiles: sourceFiles.length,
        sourceErrors: sourceErrors.slice(0, 5),
      }),
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
