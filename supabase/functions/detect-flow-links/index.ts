import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const GEMINI_TIMEOUT_MS = 30_000;
const DEFAULT_AI_BATCH_SIZE = 10;
const MAX_AI_BATCH_SIZE = 20;
const MAX_AI_AUTOMATIONS = 140;
const MAX_TEXT_FIELD_LENGTH = 140;

type DetectionMode = "meta" | "webhook" | "ai" | "all";

type DetectionPayload = {
  mode?: DetectionMode;
  offset?: number;
  limit?: number;
};

type Automation = {
  id: string;
  naam: string;
  categorie: string;
  doel: string;
  trigger_beschrijving: string;
  systemen: string[];
  stappen: string[];
  status: string;
  source: string | null;
  webhook_paths: string[];
  endpoints: string[];
  external_id: string | null;
  gitlab_file_path: string | null;
  import_proposal: {
    webhookPaths?: string[];
    hubspot_workflow?: {
      actions?: Array<{
        label?: string;
        type?: string;
        webhookMethod?: string | null;
        webhookPath?: string | null;
        webhookUrl?: string | null;
      }>;
      branches?: Array<{
        actions?: Array<{
          label?: string;
          type?: string;
          webhookMethod?: string | null;
          webhookPath?: string | null;
          webhookUrl?: string | null;
        }>;
      }>;
    };
    zap?: {
      process?: {
        webhookHandoffs?: Array<{ method?: string; path?: string; host?: string }>;
        steps?: Array<{
          appName?: string;
          title?: string;
          webhookPaths?: string[];
        }>;
      };
      steps?: Array<{
        appName?: string;
        title?: string;
        webhookPaths?: string[];
      }>;
    };
    typeform?: {
      webhooks?: Array<{
        enabled?: boolean;
        path?: string;
        tag?: string;
        host?: string;
      }>;
      process?: {
        webhookHandoffs?: Array<{ method?: string; path?: string; host?: string }>;
        steps?: Array<{
          title?: string;
          webhookPaths?: string[];
        }>;
      };
    };
    gitlab_endpoint?: {
      method?: string;
      endpoint?: string;
      api_file?: string;
      handler?: string;
      calls?: Array<{ depth: number; kind: string; from: string; to: string; file: string | null }>;
    };
    gitlab?: {
      endpoint?: {
        method?: string;
        path?: string;
        api_file?: string;
        handler?: string;
      };
    };
  } | null;
};

type Suggestie = {
  from_id: string;
  to_id: string;
  confidence: number;
  reasoning: string;
};

type RouteDirection = "outgoing" | "incoming";

type AutomationRoute = {
  automationId: string;
  automationName: string;
  automationSource: string | null;
  automationStatus: string;
  direction: RouteDirection;
  path: string;
  normalizedPath: string;
  method: string;
  sourceField: string;
  priority: number;
};

type AiDetectionResult = {
  suggestions: Suggestie[];
  status: "ok" | "partial-json" | "skipped" | "missing-key" | "api-error" | "invalid-json" | "timeout-or-error";
  rawCount?: number;
  note?: string;
};

function normalizeEndpointPath(value: string): string {
  const trimmed = value.trim();
  const withoutMethod = trimmed.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "");
  let route = withoutMethod;

  try {
    if (/^https?:\/\//i.test(withoutMethod)) {
      route = new URL(withoutMethod).pathname;
    }
  } catch {
    route = withoutMethod.replace(/^https?:\/\/[^/]+/i, "");
  }

  return route
    .replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "")
    .replace(/^https?:\/\/[^/]+/i, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "")
    .trim()
    .toLowerCase();
}

function endpointMatches(webhookPath: string, endpoint: string): boolean {
  const normalizedWebhook = normalizeEndpointPath(webhookPath);
  const normalizedEndpoint = normalizeEndpointPath(endpoint);
  if (!normalizedWebhook || !normalizedEndpoint) return false;
  return normalizedWebhook === normalizedEndpoint;
}

function buildWebhookMatchReason(source: Automation, endpoint: string): string {
  const normalizedEndpoint = normalizeEndpointPath(endpoint) || endpoint;
  if (isTypeformAutomation(source)) {
    return `Webhook-match: Typeform geeft formulierinzending door aan endpoint ${normalizedEndpoint}.`;
  }

  if (isZapierAutomation(source)) {
    return `Webhook-match: Zapier roept endpoint ${normalizedEndpoint} aan.`;
  }

  return `Webhook-match: automation roept endpoint ${normalizedEndpoint} aan.`;
}

function collectOutgoingRoutes(auto: Automation): AutomationRoute[] {
  const routes: AutomationRoute[] = [];
  const proposal = auto.import_proposal ?? {};
  const hasAuthoritativeTypeformWebhooks = auto.source === "typeform" && Array.isArray(proposal.typeform?.webhooks);

  if (!hasAuthoritativeTypeformWebhooks) {
    for (const path of auto.webhook_paths ?? []) {
      addRoute(routes, auto, "outgoing", path, "", "webhook_paths", 40);
    }
    for (const path of proposal.webhookPaths ?? []) {
      addRoute(routes, auto, "outgoing", path, "", "import_proposal.webhookPaths", 45);
    }
  }

  const hubspotActions = [
    ...(proposal.hubspot_workflow?.actions ?? []),
    ...((proposal.hubspot_workflow?.branches ?? []).flatMap((branch) => branch.actions ?? [])),
  ];
  for (const action of hubspotActions) {
    addRoute(
      routes,
      auto,
      "outgoing",
      action.webhookPath || action.webhookUrl || "",
      action.webhookMethod ?? "",
      "hubspot_workflow.actions",
      100,
    );
  }

  for (const handoff of proposal.zap?.process?.webhookHandoffs ?? []) {
    addRoute(routes, auto, "outgoing", handoff.path ?? "", handoff.method ?? "", "zap.process.webhookHandoffs", 100);
  }
  const zapSteps = [
    ...(proposal.zap?.process?.steps ?? []),
    ...(proposal.zap?.steps ?? []),
  ];
  for (const step of zapSteps) {
    for (const path of step.webhookPaths ?? []) {
      addRoute(routes, auto, "outgoing", path, "", "zap.process.steps.webhookPaths", 80);
    }
  }

  for (const webhook of proposal.typeform?.webhooks ?? []) {
    if (webhook.enabled !== true) continue;
    addRoute(routes, auto, "outgoing", webhook.path ?? "", "POST", "typeform.webhooks", 100);
  }
  for (const handoff of proposal.typeform?.process?.webhookHandoffs ?? []) {
    addRoute(
      routes,
      auto,
      "outgoing",
      handoff.path ?? "",
      handoff.method ?? "",
      "typeform.process.webhookHandoffs",
      hasAuthoritativeTypeformWebhooks ? 60 : 90,
    );
  }
  for (const step of proposal.typeform?.process?.steps ?? []) {
    for (const path of step.webhookPaths ?? []) {
      addRoute(
        routes,
        auto,
        "outgoing",
        path,
        "",
        "typeform.process.steps.webhookPaths",
        hasAuthoritativeTypeformWebhooks ? 50 : 80,
      );
    }
  }

  return dedupeRoutes(routes);
}

function collectIncomingRoutes(auto: Automation): AutomationRoute[] {
  const routes: AutomationRoute[] = [];
  const proposal = auto.import_proposal ?? {};

  addRoute(
    routes,
    auto,
    "incoming",
    proposal.gitlab_endpoint?.endpoint ?? "",
    proposal.gitlab_endpoint?.method ?? "",
    "gitlab_endpoint",
    100,
  );
  addRoute(
    routes,
    auto,
    "incoming",
    proposal.gitlab?.endpoint?.path ?? "",
    proposal.gitlab?.endpoint?.method ?? "",
    "import_proposal.gitlab.endpoint",
    95,
  );
  for (const endpoint of auto.endpoints ?? []) {
    addRoute(routes, auto, "incoming", endpoint, "", "endpoints", 35);
  }

  return dedupeRoutes(routes);
}

function addRoute(
  routes: AutomationRoute[],
  auto: Automation,
  direction: RouteDirection,
  path: string,
  method: string,
  sourceField: string,
  priority: number,
) {
  const normalizedPath = normalizeEndpointPath(path);
  if (!path?.trim() || !normalizedPath) return;
  routes.push({
    automationId: auto.id,
    automationName: auto.naam,
    automationSource: auto.source,
    automationStatus: auto.status,
    direction,
    path: path.trim(),
    normalizedPath,
    method: method.trim().toUpperCase(),
    sourceField,
    priority,
  });
}

function dedupeRoutes(routes: AutomationRoute[]): AutomationRoute[] {
  const best = new Map<string, AutomationRoute>();
  for (const route of routes) {
    const key = `${route.automationId}|${route.normalizedPath}|${route.direction}|${route.method}`;
    const existing = best.get(key);
    if (!existing || route.priority > existing.priority) best.set(key, route);
  }
  return [...best.values()];
}

function selectPreferredIncomingRoutes(routes: AutomationRoute[]): AutomationRoute[] {
  const grouped = new Map<string, AutomationRoute[]>();
  for (const route of routes) {
    const items = grouped.get(route.normalizedPath) ?? [];
    items.push(route);
    grouped.set(route.normalizedPath, items);
  }

  return [...grouped.values()].flatMap((items) => {
    const maxScore = Math.max(...items.map(receiverScore));
    return items.filter((item) => receiverScore(item) === maxScore);
  });
}

function receiverScore(route: AutomationRoute): number {
  return activeRank(route.automationStatus) * 1000 + route.priority;
}

function activeRank(status: string | undefined): number {
  if (status === "Actief" || status?.toLowerCase() === "active") return 2;
  if (status === "Uitgeschakeld" || status?.toLowerCase() === "disabled") return 0;
  return 1;
}

function shouldAutoConfirmSuggestion(suggestion: Suggestie): boolean {
  return suggestion.confidence >= 1.0 && suggestion.reasoning.toLowerCase().startsWith("webhook-match:");
}

function truncate(value: string | null | undefined, maxLength = MAX_TEXT_FIELD_LENGTH): string {
  const text = value ?? "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [
      record.message,
      record.code,
      record.details,
      record.hint,
    ].filter(Boolean).join(" | ") || JSON.stringify(record);
  }
  return String(error ?? "Onbekende fout");
}

function clampBatchSize(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_AI_BATCH_SIZE;
  return Math.min(Math.floor(parsed), MAX_AI_BATCH_SIZE);
}

function parseMode(value: unknown): DetectionMode {
  return value === "meta" || value === "webhook" || value === "ai" || value === "all"
    ? value
    : "all";
}

function prioritizeForAi(autos: Automation[]): Automation[] {
  return [...autos]
    .sort((a, b) => {
      const aScore =
        (a.webhook_paths?.length ? 3 : 0) +
        (a.endpoints?.length ? 3 : 0) +
        (a.doel ? 1 : 0) +
        (a.trigger_beschrijving ? 1 : 0);
      const bScore =
        (b.webhook_paths?.length ? 3 : 0) +
        (b.endpoints?.length ? 3 : 0) +
        (b.doel ? 1 : 0) +
        (b.trigger_beschrijving ? 1 : 0);
      if (bScore !== aScore) return bScore - aScore;
      return a.naam.localeCompare(b.naam, "nl");
    })
    .slice(0, MAX_AI_AUTOMATIONS);
}

function addSuggestion(map: Map<string, Suggestie>, suggestion: Suggestie) {
  if (suggestion.from_id === suggestion.to_id) return;
  const key = `${suggestion.from_id}|${suggestion.to_id}`;
  if (!map.has(key)) map.set(key, suggestion);
}

function detectWebhookSuggestions(autos: Automation[]): Suggestie[] {
  const suggestions = new Map<string, Suggestie>();
  const outgoingRoutes = autos.flatMap(collectOutgoingRoutes);
  const incomingRoutes = selectPreferredIncomingRoutes(autos.flatMap(collectIncomingRoutes));
  const incomingByPath = new Map<string, AutomationRoute[]>();

  for (const route of incomingRoutes) {
    const items = incomingByPath.get(route.normalizedPath) ?? [];
    items.push(route);
    incomingByPath.set(route.normalizedPath, items);
  }

  for (const sourceRoute of outgoingRoutes) {
    const source = autos.find((auto) => auto.id === sourceRoute.automationId);
    if (!source) continue;
    for (const targetRoute of incomingByPath.get(sourceRoute.normalizedPath) ?? []) {
      if (targetRoute.automationId === sourceRoute.automationId) continue;
      if (!routesMatchExactly(sourceRoute.path, targetRoute.path)) continue;
      addSuggestion(suggestions, {
        from_id: sourceRoute.automationId,
        to_id: targetRoute.automationId,
        confidence: 1.0,
        reasoning: buildWebhookMatchReason(source, targetRoute.path),
      });
    }
  }

  return [...suggestions.values()];
}

function routesMatchExactly(webhookPath: string, endpoint: string): boolean {
  return endpointMatches(webhookPath, endpoint);
}

function detectGitLabBackendSuggestions(autos: Automation[]): Suggestie[] {
  const suggestions = new Map<string, Suggestie>();
  const gitlabAutos = autos.filter((auto) => isGitLabAutomation(auto));

  for (const source of gitlabAutos) {
    const sourceCalls = meaningfulGitLabCallNames(source);
    if (sourceCalls.size === 0) continue;

    for (const target of gitlabAutos) {
      if (source.id === target.id) continue;
      if (!sharesBusinessContext(source, target)) continue;

      const targetHandler = normalizeFunctionName(target.import_proposal?.gitlab_endpoint?.handler);
      if (targetHandler && sourceCalls.has(targetHandler)) {
        addSuggestion(suggestions, {
          from_id: source.id,
          to_id: target.id,
          confidence: 0.95,
          reasoning: `Backend worker roept handler ${targetHandler} aan`,
        });
        continue;
      }

      const targetCalls = meaningfulGitLabCallNames(target);
      const shared = [...sourceCalls].find((call) => targetCalls.has(call));
      if (shared) {
        addSuggestion(suggestions, {
          from_id: source.id,
          to_id: target.id,
          confidence: 0.95,
          reasoning: `Backend workers delen vervolgstap ${shared}`,
        });
      }
    }
  }

  return [...suggestions.values()];
}

function isGitLabAutomation(auto: Automation): boolean {
  return auto.source === "gitlab" || Boolean(auto.gitlab_file_path);
}

function isZapierAutomation(auto: Automation): boolean {
  return auto.source === "zapier";
}

function isTypeformAutomation(auto: Automation): boolean {
  return auto.source === "typeform";
}

function meaningfulGitLabCallNames(auto: Automation): Set<string> {
  const calls = auto.import_proposal?.gitlab_endpoint?.calls ?? [];
  const names = new Set<string>();

  for (const call of calls) {
    const normalized = normalizeFunctionName(call.to);
    if (normalized && isMeaningfulBackendFunction(normalized)) names.add(normalized);
  }

  return names;
}

function normalizeFunctionName(value: string | null | undefined): string {
  const raw = value?.split("::").at(-1)?.split(".").at(-1) ?? "";
  return raw
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function isMeaningfulBackendFunction(name: string): boolean {
  if (name.length < 8) return false;
  return !/^(get|set|parse|format|client|basic|batch|search|update|create|read|list|do_search|api)$/i.test(name);
}

function sharesBusinessContext(a: Automation, b: Automation): boolean {
  const aSystems = new Set((a.systemen ?? []).filter((system) => system !== "GitLab"));
  const bSystems = new Set((b.systemen ?? []).filter((system) => system !== "GitLab"));
  if ([...aSystems].some((system) => bSystems.has(system))) return true;

  const aText = `${a.naam} ${a.doel} ${a.endpoints?.join(" ")}`.toLowerCase();
  const bText = `${b.naam} ${b.doel} ${b.endpoints?.join(" ")}`.toLowerCase();
  return ["btw", "jr", "ib", "vpb", "va", "sales", "wefact", "contact", "company", "bank"].some(
    (term) => aText.includes(term) && bText.includes(term),
  );
}

function extractSuggestionsFromText(content: string): { from: string; to: string; redenering: string }[] {
  const suggestions: { from: string; to: string; redenering: string }[] = [];
  const pattern =
    /"from"\s*:\s*"([^"]+)"[\s\S]*?"to"\s*:\s*"([^"]+)"[\s\S]*?"redenering"\s*:\s*"((?:\\.|[^"\\])*)"/g;
  for (const match of content.matchAll(pattern)) {
    suggestions.push({
      from: match[1],
      to: match[2],
      redenering: match[3].replace(/\\"/g, '"'),
    });
  }
  return suggestions;
}

function normalizeAiSuggestions(
  rawSuggestions: { from: string; to: string; redenering: string }[],
  focusIds: Set<string>,
  validIds: Set<string>,
  webhookPairs: Set<string>,
): Suggestie[] {
  const suggestions = new Map<string, Suggestie>();

  for (const s of rawSuggestions) {
    const pairKey = `${s.from}|${s.to}`;
    if (
      s.from &&
      s.to &&
      focusIds.has(s.from) &&
      validIds.has(s.to) &&
      s.from !== s.to &&
      !webhookPairs.has(pairKey)
    ) {
      addSuggestion(suggestions, {
        from_id: s.from,
        to_id: s.to,
        confidence: 0.7,
        reasoning: s.redenering ?? "",
      });
    }
  }

  return [...suggestions.values()];
}

async function fetchAiSuggestions(
  focusAutos: Automation[],
  contextAutos: Automation[],
  webhookSuggestions: Suggestie[],
): Promise<AiDetectionResult> {
  if (focusAutos.length === 0 || contextAutos.length <= 1) {
    return { suggestions: [], status: "skipped" };
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    console.warn("detect-flow-links: GEMINI_API_KEY missing, skipping AI suggestions");
    return { suggestions: [], status: "missing-key" };
  }

  const webhookPairs = new Set(webhookSuggestions.map((s) => `${s.from_id}|${s.to_id}`));
  const focusIds = new Set(focusAutos.map((a) => a.id));
  const validIds = new Set(contextAutos.map((a) => a.id));
  const contextList = contextAutos
    .map(
      (a) =>
        `- id: "${a.id}", naam: "${truncate(a.naam, 80)}", categorie: "${a.categorie}", systemen: ${JSON.stringify((a.systemen ?? []).slice(0, 3))}`,
    )
    .join("\n");
  const focusList = focusAutos
    .map((a) => {
      const stappen = (a.stappen ?? []).slice(0, 5).map((stap, index) => `${index + 1}. ${truncate(stap, 120)}`).join(" | ");
      return [
        `- id: "${a.id}"`,
        `  naam: "${truncate(a.naam, 110)}"`,
        `  categorie: "${a.categorie}", status: "${a.status}", source: "${a.source ?? ""}"`,
        `  doel: "${truncate(a.doel, 180)}"`,
        `  trigger: "${truncate(a.trigger_beschrijving, 180)}"`,
        `  systemen: ${JSON.stringify((a.systemen ?? []).slice(0, 6))}`,
        `  stappen: "${stappen}"`,
        `  webhook_paths: ${JSON.stringify((a.webhook_paths ?? []).slice(0, 4))}`,
        `  endpoints: ${JSON.stringify((a.endpoints ?? []).slice(0, 4))}`,
      ].join("\n");
    })
    .join("\n\n");
  const webhookContext = webhookSuggestions.length > 0
    ? `\nAl gevonden via webhook-matching (niet opnieuw opgeven):\n${webhookSuggestions.map((s) => `- ${s.from_id} -> ${s.to_id} (${s.reasoning})`).join("\n")}\n`
    : "";

  const prompt = `Je analyseert automatiseringen en stelt directe flow-koppelingen voor.

Taak:
- Kijk alleen naar de focus automations als mogelijke bron ("from").
- Kies als "to" een automation uit de context die waarschijnlijk direct hierna komt of direct gevoed/getriggerd wordt.
- Geef per focus automation maximaal 1 directe koppel terug.
- Geef maximaal 5 suggesties totaal terug.
- Houd redenering kort: maximaal 8 woorden.
- Suggesties mogen waarschijnlijk zijn, maar niet alleen omdat systemen of categorie hetzelfde zijn.
- Goede signalen: namen die op elkaar aansluiten, output/input, webhook/endpoint, deal/contact/status/fase die door de volgende automation wordt gebruikt, opeenvolgende processtappen.
- Ketens zijn toegestaan als losse koppels: A->B en B->C.
- Gebruik exact de IDs uit de lijsten.

Focus automations: geef alleen suggesties waarbij "from" in deze lijst staat:
${focusList}
${webhookContext}
Alle automations als context:
${contextList}

Antwoord uitsluitend in dit JSON-formaat:
{"suggesties": [{"from": "id1", "to": "id2", "redenering": "korte Nederlandse toelichting"}]}`;

  const controller = new AbortController();
  let timeout: number | undefined;

  try {
    const geminiRequest = fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
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
          max_tokens: 4000,
        }),
      },
    );
    const timeoutPromise = new Promise<Response>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error(`Gemini timeout na ${GEMINI_TIMEOUT_MS}ms`));
      }, GEMINI_TIMEOUT_MS);
    });
    const res = await Promise.race([geminiRequest, timeoutPromise]);

    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.warn(`detect-flow-links: Gemini API error ${res.status}, skipping AI suggestions`, errorText);
      return { suggestions: [], status: "api-error", note: `Gemini API ${res.status}` };
    }

    const geminiResult = await res.json();
    const content = geminiResult.choices?.[0]?.message?.content;
    if (!content) return { suggestions: [], status: "invalid-json", note: "Leeg Gemini antwoord" };

    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    let parsed: { suggesties: { from: string; to: string; redenering: string }[] };
    try {
      parsed = JSON.parse(cleaned) as {
        suggesties: { from: string; to: string; redenering: string }[];
      };
    } catch {
      console.warn("detect-flow-links: Gemini returned invalid JSON", cleaned.slice(0, 300));
      const recovered = normalizeAiSuggestions(
        extractSuggestionsFromText(cleaned),
        focusIds,
        validIds,
        webhookPairs,
      );
      return {
        suggestions: recovered,
        status: recovered.length > 0 ? "partial-json" : "invalid-json",
        rawCount: recovered.length,
        note: cleaned.slice(0, 160),
      };
    }
    const suggestions = normalizeAiSuggestions(parsed.suggesties ?? [], focusIds, validIds, webhookPairs);

    return {
      suggestions,
      status: "ok",
      rawCount: parsed.suggesties?.length ?? 0,
    };
  } catch (e) {
    console.warn("detect-flow-links: Gemini request failed or timed out, skipping AI suggestions", errorMessage(e));
    return { suggestions: [], status: "timeout-or-error", note: errorMessage(e) };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function replaceSuggestionsForSources(
  db: ReturnType<typeof createClient>,
  sourceIds: string[],
  suggestions: Suggestie[],
  options: { preserveWebhookSuggestions?: boolean; preserveTechnicalSuggestions?: boolean } = {},
) {
  const uniqueSourceIds = [...new Set(sourceIds)].filter(Boolean);
  if (uniqueSourceIds.length === 0) return;

  let deleteQuery = db
    .from("automatisering_ai_flows")
    .delete()
    .eq("confirmed", false)
    .eq("rejected", false)
    .is("flow_id", null)
    .in("from_id", uniqueSourceIds);

  if (options.preserveWebhookSuggestions) {
    deleteQuery = deleteQuery.lt("confidence", options.preserveTechnicalSuggestions ? 0.9 : 1);
  }

  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;

  if (suggestions.length === 0) return;

  const uniqueSuggestions = new Map<string, Suggestie>();
  for (const suggestion of suggestions) addSuggestion(uniqueSuggestions, suggestion);
  const suggestionsToInsert = [...uniqueSuggestions.values()];
  const targetIds = [...new Set(suggestionsToInsert.map((suggestion) => suggestion.to_id))].filter(Boolean);

  if (targetIds.length === 0) return;

  const { data: existingRows, error: existingError } = await db
    .from("automatisering_ai_flows")
    .select("from_id, to_id")
    .in("from_id", uniqueSourceIds)
    .in("to_id", targetIds);
  if (existingError) throw existingError;

  const existingPairs = new Set(
    (existingRows ?? []).map((row: { from_id: string; to_id: string }) => `${row.from_id}|${row.to_id}`),
  );
  const autoConfirmedSuggestions = suggestionsToInsert.filter(shouldAutoConfirmSuggestion);
  if (autoConfirmedSuggestions.length > 0) {
    await Promise.all(
      autoConfirmedSuggestions.map(async (suggestion) => {
        const { error: confirmError } = await db
          .from("automatisering_ai_flows")
          .update({ confirmed: true, rejected: false })
          .eq("from_id", suggestion.from_id)
          .eq("to_id", suggestion.to_id);
        if (confirmError) throw confirmError;
      }),
    );
  }

  const newSuggestions = suggestionsToInsert.filter(
    (suggestion) => !existingPairs.has(`${suggestion.from_id}|${suggestion.to_id}`),
  );

  if (newSuggestions.length === 0) return;

  const { error: insertError } = await db.from("automatisering_ai_flows").upsert(
    newSuggestions.map((s) => ({
      from_id: s.from_id,
      to_id: s.to_id,
      confidence: s.confidence,
      reasoning: s.reasoning,
      confirmed: shouldAutoConfirmSuggestion(s),
      rejected: false,
    })),
    { onConflict: "from_id,to_id", ignoreDuplicates: true },
  );
  if (insertError) throw insertError;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const payload = (await req.json().catch(() => ({}))) as DetectionPayload;
    const mode = parseMode(payload.mode);
    const offset = Math.max(0, Math.floor(Number(payload.offset ?? 0)));
    const limit = clampBatchSize(payload.limit);
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error: fetchError } = await db
      .from("automatiseringen")
      .select("id, naam, categorie, doel, trigger_beschrijving, systemen, stappen, status, source, webhook_paths, endpoints, external_id, gitlab_file_path, import_proposal")
      .or("source.is.null,import_status.is.null,import_status.eq.approved");
    if (fetchError) throw fetchError;

    const autos: Automation[] = rows ?? [];
    const aiAutos = prioritizeForAi(autos);

    if (mode === "meta") {
      return jsonResponse({
        mode,
        totalAutomations: autos.length,
        aiTotal: aiAutos.length,
        batchSize: limit,
        batches: Math.ceil(aiAutos.length / limit),
      });
    }

    const webhookSuggestions = detectWebhookSuggestions(autos);
    let savedWebhook = 0;
    const savedBackend = 0;
    const aiSuggestions: Suggestie[] = [];
    let aiStatus: AiDetectionResult["status"] | undefined;
    let aiRawCount: number | undefined;
    let aiNote: string | undefined;

    if (mode === "webhook" || mode === "all") {
      await replaceSuggestionsForSources(
        db,
        webhookSuggestions.map((s) => s.from_id),
        webhookSuggestions,
      );
      savedWebhook = webhookSuggestions.length;
    }

    if (mode === "ai" || mode === "all") {
      aiStatus = "skipped";
      aiNote = "Procesreisvorming gebruikt alleen exacte webhook/endpoint-matches.";
    }

    return jsonResponse({
      mode,
      totalAutomations: autos.length,
      aiTotal: aiAutos.length,
      offset,
      limit,
      processed: mode === "ai" ? Math.min(limit, Math.max(0, aiAutos.length - offset)) : undefined,
      webhook: savedWebhook,
      backend: savedBackend,
      ai: aiSuggestions.length,
      aiStatus,
      aiRawCount,
      aiNote,
    });
  } catch (e) {
    const message = errorMessage(e);
    console.error("detect-flow-links error:", message, e);
    return jsonResponse({ error: message }, 500);
  }
});
