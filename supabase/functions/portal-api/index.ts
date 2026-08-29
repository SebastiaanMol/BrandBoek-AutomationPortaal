import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertAllowedFields,
  buildJsonResponse,
  computeDiff,
  errorResponse,
  mapSyncReviewStatusToDbPatch,
  mergeByField,
  mergeById,
  parseBearerToken,
  redactSecrets,
  requireVersion,
  type JsonRecord,
  type SyncReviewApiStatus,
} from "./helpers.ts";
import { openApiDocument } from "./openapi.ts";

type RouteDefinition = {
  path: string;
  pattern: RegExp;
  methods: readonly string[];
};

type PortalDb = ReturnType<typeof createClient>;

const AUTOMATION_SELECT = [
  "id",
  "naam",
  "categorie",
  "doel",
  "trigger_beschrijving",
  "systemen",
  "stappen",
  "afhankelijkheden",
  "owner",
  "status",
  "source",
  "external_id",
  "import_source",
  "import_proposal",
  "fasen",
  "api_version",
  "archived_at",
  "archived_by",
  "created_at",
  "last_synced_at",
  "ai_enrichment",
  "reviewer_overrides",
  "endpoints",
  "webhook_paths",
  "pipeline_id",
  "stage_id",
].join(",");

const AUTOMATION_WRITE_FIELDS = [
  "name",
  "goal",
  "trigger",
  "actions",
  "systems",
  "dependencies",
  "owner",
  "status",
  "category",
  "link",
  "phaseData",
  "importMetadata",
  "aiEnrichment",
] as const;

const PLACEMENT_SELECT = "id,automation_id,pipeline_id,target,created_at,updated_at,placed_by,api_version";

const PROCESS_STATE_SELECT = [
  "id",
  "steps",
  "connections",
  "auto_links",
  "flow_links",
  "parked_steps",
  "active_lanes",
  "custom_lanes",
  "artifacts",
  "manual_status",
  "updated_at",
  "api_version",
].join(",");

const PROCESS_STATE_WRITE_FIELDS = [
  "steps",
  "connections",
  "lanes",
  "autoLinks",
  "flowLinks",
  "parkedSteps",
  "activeLanes",
  "artifacts",
  "manualStatus",
] as const;

type PlacementTarget = { type: "step" | "arrow" | "syncBlock"; stepId?: string; arrowId?: string };

const PIPELINE_SELECT = ["pipeline_id", "naam", "stages", "beschrijving", "is_active", "source", "synced_at", "updated_at"].join(",");

const FLOW_SELECT = ["id", "naam", "beschrijving", "systemen", "automation_ids", "api_chain", "api_version", "created_at", "updated_at"].join(",");

const FLOW_WRITE_FIELDS = ["name", "description", "systems", "automationIds", "chain"] as const;

const SYNC_REVIEW_SELECT = [
  "id",
  "sync_run_id",
  "source",
  "external_id",
  "automation_id",
  "change_type",
  "status",
  "title",
  "summary",
  "impact",
  "old_value_sanitized",
  "new_value_sanitized",
  "payload_sanitized",
  "selected_by_default",
  "applied_at",
  "skipped_at",
  "error_message_sanitized",
  "review_key",
  "created_at",
  "updated_at",
  "api_version",
].join(",");

const SYNC_REVIEW_CHANGE_TYPES = [
  "new_automation",
  "metadata_changed",
  "route_changed",
  "source_data_incomplete",
  "source_missing",
  "legacy_gitlab_record",
] as const;

const SYNC_REVIEW_STATUSES = ["pending", "applied", "skipped", "failed", "superseded"] as const;

const ROUTES: readonly RouteDefinition[] = [
  { path: "/v1/openapi.json", pattern: /^\/v1\/openapi\.json$/, methods: ["GET"] },
  { path: "/v1/automations", pattern: /^\/v1\/automations$/, methods: ["GET", "POST"] },
  { path: "/v1/automations/bulk", pattern: /^\/v1\/automations\/bulk$/, methods: ["PATCH"] },
  { path: "/v1/automations/{id}/restore", pattern: /^\/v1\/automations\/[^/]+\/restore$/, methods: ["POST"] },
  { path: "/v1/automations/{id}", pattern: /^\/v1\/automations\/[^/]+$/, methods: ["GET", "PATCH", "DELETE"] },
  { path: "/v1/placements", pattern: /^\/v1\/placements$/, methods: ["GET", "POST"] },
  { path: "/v1/placements/bulk", pattern: /^\/v1\/placements\/bulk$/, methods: ["POST"] },
  { path: "/v1/placements/{id}", pattern: /^\/v1\/placements\/[^/]+$/, methods: ["GET", "PATCH", "DELETE"] },
  { path: "/v1/pipelines", pattern: /^\/v1\/pipelines$/, methods: ["GET"] },
  { path: "/v1/process-states/{pipelineId}", pattern: /^\/v1\/process-states\/[^/]+$/, methods: ["GET", "PATCH"] },
  { path: "/v1/procesreizen", pattern: /^\/v1\/procesreizen$/, methods: ["GET"] },
  { path: "/v1/procesreizen/{id}", pattern: /^\/v1\/procesreizen\/[^/]+$/, methods: ["GET", "PATCH"] },
  { path: "/v1/sync-review", pattern: /^\/v1\/sync-review$/, methods: ["GET"] },
  { path: "/v1/sync-review/{id}", pattern: /^\/v1\/sync-review\/[^/]+$/, methods: ["GET", "PATCH"] },
  { path: "/v1/search", pattern: /^\/v1\/search$/, methods: ["GET"] },
  { path: "/v1/audit-log", pattern: /^\/v1\/audit-log$/, methods: ["GET"] },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return buildJsonResponse({}, 204);
  }

  const expectedApiKey = Deno.env.get("PORTAL_API_KEY");
  const bearerToken = parseBearerToken(req.headers.get("Authorization"));

  if (!expectedApiKey || bearerToken !== expectedApiKey) {
    return errorResponse("Missing or invalid bearer token.", "UNAUTHORIZED", 401);
  }

  const url = new URL(req.url);
  // The public gateway invokes this function at /portal-api/... (it only strips the
  // /functions/v1 prefix, not the function slug itself), so normalize that away before
  // matching routes. A no-op when the slug prefix isn't present (e.g. local dev serving).
  url.pathname = url.pathname.replace(/^\/portal-api(?=\/|$)/, "") || "/";
  const route = ROUTES.find((entry) => entry.pattern.test(url.pathname));

  if (!route) {
    return errorResponse("Route not found.", "NOT_FOUND", 404);
  }

  if (!route.methods.includes(req.method)) {
    return errorResponse("Method not allowed.", "METHOD_NOT_ALLOWED", 405);
  }

  if (url.pathname === "/v1/openapi.json" && req.method === "GET") {
    return buildJsonResponse({ data: openApiDocument });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return errorResponse("Portal API is not configured.", "SERVER_CONFIG_ERROR", 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const actor = req.headers.get("x-actor")?.trim() || "api";

  try {
    if (url.pathname === "/v1/automations" && req.method === "GET") {
      return await handleListAutomations(db, url);
    }
    if (url.pathname === "/v1/automations" && req.method === "POST") {
      return await handleUpsertAutomation(db, req, actor);
    }
    if (url.pathname === "/v1/automations/bulk" && req.method === "PATCH") {
      return await handleBulkPatchAutomations(db, req, actor);
    }
    if (url.pathname.endsWith("/restore") && req.method === "POST") {
      return await handleRestoreAutomation(db, req, actor, automationIdFromPath(url.pathname, 3));
    }
    if (route.path === "/v1/automations/{id}" && req.method === "GET") {
      return await handleGetAutomation(db, automationIdFromPath(url.pathname, 3));
    }
    if (route.path === "/v1/automations/{id}" && req.method === "PATCH") {
      return await handlePatchAutomation(db, req, actor, automationIdFromPath(url.pathname, 3));
    }
    if (route.path === "/v1/automations/{id}" && req.method === "DELETE") {
      return await handleArchiveAutomation(db, req, actor, url, automationIdFromPath(url.pathname, 3));
    }
    if (url.pathname === "/v1/placements" && req.method === "GET") {
      return await handleListPlacements(db, url);
    }
    if (url.pathname === "/v1/placements" && req.method === "POST") {
      return await handleCreatePlacement(db, req, actor, url);
    }
    if (url.pathname === "/v1/placements/bulk" && req.method === "POST") {
      return await handleBulkCreatePlacements(db, req, actor, url);
    }
    if (route.path === "/v1/placements/{id}" && req.method === "GET") {
      return await handleGetPlacement(db, automationIdFromPath(url.pathname, 3));
    }
    if (route.path === "/v1/placements/{id}" && req.method === "PATCH") {
      return await handlePatchPlacement(db, req, actor, url, automationIdFromPath(url.pathname, 3));
    }
    if (route.path === "/v1/placements/{id}" && req.method === "DELETE") {
      return await handleDeletePlacement(db, req, actor, url, automationIdFromPath(url.pathname, 3));
    }
    if (route.path === "/v1/process-states/{pipelineId}" && req.method === "GET") {
      return await handleGetProcessState(db, automationIdFromPath(url.pathname, 3));
    }
    if (route.path === "/v1/process-states/{pipelineId}" && req.method === "PATCH") {
      return await handlePatchProcessState(db, req, actor, url, automationIdFromPath(url.pathname, 3));
    }
    if (url.pathname === "/v1/pipelines" && req.method === "GET") {
      return await handleListPipelines(db, url);
    }
    if (url.pathname === "/v1/procesreizen" && req.method === "GET") {
      return await handleListProcesreizen(db, url);
    }
    if (route.path === "/v1/procesreizen/{id}" && req.method === "GET") {
      return await handleGetProcesreis(db, automationIdFromPath(url.pathname, 3));
    }
    if (route.path === "/v1/procesreizen/{id}" && req.method === "PATCH") {
      return await handlePatchProcesreis(db, req, actor, url, automationIdFromPath(url.pathname, 3));
    }
    if (url.pathname === "/v1/sync-review" && req.method === "GET") {
      return await handleListSyncReview(db, url);
    }
    if (route.path === "/v1/sync-review/{id}" && req.method === "GET") {
      return await handleGetSyncReviewItem(db, automationIdFromPath(url.pathname, 3));
    }
    if (route.path === "/v1/sync-review/{id}" && req.method === "PATCH") {
      return await handlePatchSyncReviewItem(db, req, actor, url, automationIdFromPath(url.pathname, 3));
    }
    if (url.pathname === "/v1/search" && req.method === "GET") {
      return await handleSearch(db, url);
    }
    if (url.pathname === "/v1/audit-log" && req.method === "GET") {
      return await handleListAuditLog(db, url);
    }
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Request failed.", "BAD_REQUEST", 400);
  }

  return errorResponse("Route not implemented yet.", "NOT_IMPLEMENTED", 501);
});

function automationIdFromPath(pathname: string, index: number): string {
  return decodeURIComponent(pathname.split("/")[index] ?? "");
}

async function readJsonBody(req: Request): Promise<JsonRecord> {
  const body = await req.json().catch(() => {
    throw new Error("Request body must be valid JSON.");
  });

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  return body as JsonRecord;
}

async function readOptionalJsonBody(req: Request): Promise<JsonRecord> {
  if (req.headers.get("Content-Length") === "0") return {};

  const text = await req.text();
  if (!text.trim()) return {};

  const body = JSON.parse(text) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Request body must be a JSON object.");
  }

  return body as JsonRecord;
}

function parseLimitOffset(url: URL): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50), 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  return {
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  };
}

function normalizeStatus(status: unknown): string | null {
  if (typeof status !== "string") return null;
  if (status === "Actief") return "active";
  if (status === "Inactief" || status === "Uitgeschakeld") return "inactive";
  return status;
}

function validateAutomationStatus(status: unknown): void {
  if (status !== undefined && status !== "active" && status !== "inactive") {
    throw new Error("Automation status must be active or inactive.");
  }
}

function statusFilterValues(status: string): string[] {
  if (status === "active") return ["active", "Actief"];
  if (status === "inactive") return ["inactive", "Inactief", "Uitgeschakeld"];
  return [status];
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasStringId(value: unknown): value is { id: string } {
  return Boolean(isJsonRecord(value) && typeof value.id === "string");
}

function hasStringKey(value: unknown): value is { key: string } {
  return Boolean(isJsonRecord(value) && typeof value.key === "string");
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "23505");
}

function validatePlacementTarget(target: unknown): asserts target is { type: "step" | "arrow" | "syncBlock"; stepId?: string; arrowId?: string } {
  if (!target || typeof target !== "object") throw new Error("Invalid placement target");
  const type = (target as Record<string, unknown>).type;
  if (type !== "step" && type !== "arrow" && type !== "syncBlock") throw new Error("Invalid placement target type");
  if (type === "step" && typeof (target as Record<string, unknown>).stepId !== "string") throw new Error("stepId is required");
  if (type === "arrow" && typeof (target as Record<string, unknown>).arrowId !== "string") throw new Error("arrowId is required");
}

function mapPlacementRow(row: JsonRecord): JsonRecord {
  return redactSecrets({
    id: row.id,
    automationId: row.automation_id,
    pipelineId: row.pipeline_id,
    target: row.target,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    placedBy: row.placed_by,
    version: row.api_version,
  });
}

function mapProcessStateRow(row: JsonRecord, automationPlacements: JsonRecord[] = []): JsonRecord {
  return redactSecrets({
    pipelineId: row.id,
    steps: row.steps ?? [],
    connections: row.connections ?? [],
    autoLinks: row.auto_links ?? {},
    flowLinks: row.flow_links ?? {},
    parkedSteps: row.parked_steps ?? [],
    activeLanes: row.active_lanes ?? null,
    lanes: row.custom_lanes ?? [],
    artifacts: row.artifacts ?? [],
    manualStatus: row.manual_status ?? null,
    updatedAt: row.updated_at ?? null,
    version: row.api_version,
    automationPlacements,
  });
}

async function fetchPlacement(db: PortalDb, id: string): Promise<JsonRecord | null> {
  const { data, error } = await db.from("automation_placements").select(PLACEMENT_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as JsonRecord | null;
}

async function fetchProcessState(db: PortalDb, pipelineId: string): Promise<JsonRecord | null> {
  const { data, error } = await db.from("process_state").select(PROCESS_STATE_SELECT).eq("id", pipelineId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as JsonRecord | null;
}

async function fetchPlacementsByPipelineId(db: PortalDb, pipelineId: string): Promise<JsonRecord[]> {
  const { data, error } = await db
    .from("automation_placements")
    .select(PLACEMENT_SELECT)
    .eq("pipeline_id", pipelineId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as JsonRecord[]).map(mapPlacementRow);
}

async function validatePlacementTargetForPipeline(db: PortalDb, pipelineId: string, target: PlacementTarget): Promise<JsonRecord> {
  const processState = await fetchProcessState(db, pipelineId);
  if (!processState) throw new Error("Process state not found.");
  if (target.type === "step" && !(Array.isArray(processState.steps) && processState.steps.some((step) => hasStringId(step) && step.id === target.stepId))) {
    throw new Error("stepId does not exist in process state.");
  }
  if (target.type === "arrow" && !(Array.isArray(processState.connections) && processState.connections.some((connection) => hasStringId(connection) && connection.id === target.arrowId))) {
    throw new Error("arrowId does not exist in process state.");
  }
  return processState;
}

function mapAutomationPatchToDb(patch: JsonRecord, current?: JsonRecord | null): JsonRecord {
  assertAllowedFields(patch, AUTOMATION_WRITE_FIELDS);
  validateAutomationStatus(patch.status);

  const dbPatch: JsonRecord = {};
  if ("name" in patch) dbPatch.naam = patch.name;
  if ("goal" in patch) dbPatch.doel = patch.goal;
  if ("trigger" in patch) dbPatch.trigger_beschrijving = patch.trigger;
  if ("actions" in patch) dbPatch.stappen = patch.actions;
  if ("systems" in patch) dbPatch.systemen = patch.systems;
  if ("dependencies" in patch) dbPatch.afhankelijkheden = patch.dependencies;
  if ("owner" in patch) dbPatch.owner = patch.owner;
  if ("status" in patch) dbPatch.status = patch.status;
  if ("category" in patch) dbPatch.categorie = patch.category;
  if ("phaseData" in patch) dbPatch.fasen = patch.phaseData;
  if ("importMetadata" in patch) dbPatch.import_proposal = patch.importMetadata;
  if ("aiEnrichment" in patch) dbPatch.ai_enrichment = patch.aiEnrichment;
  if ("link" in patch) {
    dbPatch.import_proposal = {
      ...(isJsonRecord(current?.import_proposal) ? current.import_proposal : {}),
      ...(isJsonRecord(dbPatch.import_proposal) ? dbPatch.import_proposal : {}),
      link: patch.link,
    };
  }
  return dbPatch;
}

function mapAutomationRow(row: JsonRecord, placements: JsonRecord[] = []): JsonRecord {
  return redactSecrets({
    id: row.id,
    name: row.naam,
    goal: row.doel,
    trigger: row.trigger_beschrijving,
    actions: row.stappen ?? [],
    systems: row.systemen ?? [],
    dependencies: row.afhankelijkheden,
    owner: row.owner,
    status: normalizeStatus(row.status),
    category: row.categorie,
    link: isJsonRecord(row.import_proposal) ? row.import_proposal.link ?? row.import_proposal.displayUrl ?? null : null,
    source: row.source ?? row.import_source ?? null,
    externalId: row.external_id ?? null,
    phaseData: row.fasen ?? [],
    importMetadata: row.import_proposal ?? null,
    version: row.api_version,
    archivedAt: row.archived_at ?? null,
    archivedBy: row.archived_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.last_synced_at ?? null,
    aiEnrichment: row.ai_enrichment ?? null,
    reviewerOverrides: row.reviewer_overrides ?? null,
    endpoints: row.endpoints ?? [],
    webhookPaths: row.webhook_paths ?? [],
    pipelineId: row.pipeline_id ?? null,
    stageId: row.stage_id ?? null,
    placements,
  });
}

async function fetchPlacementsByAutomationIds(db: PortalDb, ids: string[]): Promise<Map<string, JsonRecord[]>> {
  if (ids.length === 0) return new Map();

  const { data, error } = await db
    .from("automation_placements")
    .select("id,automation_id,pipeline_id,target,created_at,updated_at,placed_by,api_version")
    .in("automation_id", ids);

  if (error) throw new Error(error.message);

  const byAutomation = new Map<string, JsonRecord[]>();
  for (const row of (data ?? []) as JsonRecord[]) {
    const automationId = String(row.automation_id);
    const entries = byAutomation.get(automationId) ?? [];
    entries.push({
      id: row.id,
      pipelineId: row.pipeline_id,
      target: row.target,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      placedBy: row.placed_by,
      version: row.api_version,
    });
    byAutomation.set(automationId, entries);
  }
  return byAutomation;
}

async function fetchAutomation(db: PortalDb, id: string): Promise<JsonRecord | null> {
  const { data, error } = await db.from("automatiseringen").select(AUTOMATION_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as JsonRecord | null;
}

async function fetchAutomationByExternalId(db: PortalDb, source: string, externalId: string): Promise<JsonRecord | null> {
  const { data, error } = await db
    .from("automatiseringen")
    .select(AUTOMATION_SELECT)
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as JsonRecord | null;
}

async function handleListAutomations(db: PortalDb, url: URL): Promise<Response> {
  const { limit, offset } = parseLimitOffset(url);
  let query = db.from("automatiseringen").select(AUTOMATION_SELECT, { count: "exact" });
  const source = url.searchParams.get("source");
  const status = url.searchParams.get("status");
  const placed = url.searchParams.get("placed");
  const q = url.searchParams.get("q")?.trim();

  if (source) query = query.eq("source", source);
  if (status) query = query.in("status", statusFilterValues(status));
  if (q) {
    const term = formatPostgrestFilterValue(`*${q}*`);
    query = query.or(`naam.ilike.${term},doel.ilike.${term},trigger_beschrijving.ilike.${term}`);
  }

  if (placed === "true" || placed === "false") {
    const { data: placementRows, error } = await db.from("automation_placements").select("automation_id");
    if (error) throw new Error(error.message);
    const placedIds = [...new Set(((placementRows ?? []) as JsonRecord[]).map((row) => String(row.automation_id)))];
    if (placed === "true") {
      if (placedIds.length === 0) return buildJsonResponse({ data: [], meta: { total: 0, limit, offset, hasMore: false } });
      query = query.in("id", placedIds);
    } else if (placedIds.length > 0) {
      query = query.not("id", "in", formatPostgrestInList(placedIds));
    }
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as JsonRecord[];
  const placements = await fetchPlacementsByAutomationIds(db, rows.map((row) => String(row.id)));
  return buildJsonResponse({
    data: rows.map((row) => mapAutomationRow(row, placements.get(String(row.id)) ?? [])),
    meta: {
      total: count ?? rows.length,
      limit,
      offset,
      hasMore: offset + rows.length < (count ?? rows.length),
    },
  });
}

function formatPostgrestInList(values: string[]): string {
  return `(${values.map(formatPostgrestFilterValue).join(",")})`;
}

function formatPostgrestFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

async function handleGetAutomation(db: PortalDb, id: string): Promise<Response> {
  const row = await fetchAutomation(db, id);
  if (!row) return errorResponse("Automation not found.", "NOT_FOUND", 404);

  const placements = await fetchPlacementsByAutomationIds(db, [id]);
  return buildJsonResponse({ data: mapAutomationRow(row, placements.get(id) ?? []) });
}

async function handleUpsertAutomation(db: PortalDb, req: Request, actor: string): Promise<Response> {
  const body = await readJsonBody(req);
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";
  const source = String(body.source ?? "");
  const externalId = String(body.externalId ?? body.external_id ?? "");
  if (!source || !externalId) throw new Error("source and externalId are required.");

  const { source: _source, externalId: _externalId, external_id: _external_id, ...writeBody } = body;
  void _source;
  void _externalId;
  void _external_id;
  assertAllowedFields(writeBody, AUTOMATION_WRITE_FIELDS);

  const existing = await fetchAutomationByExternalId(db, source, externalId);
  const dbPatch = mapAutomationPatchToDb(writeBody, existing as JsonRecord | null);

  const nextVersion = Number((existing as JsonRecord | null)?.api_version ?? 0) + 1;
  const id = String((existing as JsonRecord | null)?.id ?? `AUTO-API-${source}-${externalId}`).replace(/[^A-Za-z0-9_-]/g, "-");
  const payload = {
    ...dbPatch,
    id,
    source,
    import_source: source,
    external_id: externalId,
    api_version: nextVersion,
  };

  if (dryRun) {
    const preview = { ...((existing as JsonRecord | null) ?? {}), ...payload };
    return buildJsonResponse({
      data: mapAutomationRow(preview),
      dryRun: true,
      wouldChange: computeDiff((existing as JsonRecord | null) ?? null, preview),
    });
  }

  const query = existing
    ? db
        .from("automatiseringen")
        .update(payload)
        .eq("id", (existing as JsonRecord).id)
        .eq("api_version", Number((existing as JsonRecord).api_version))
        .select(AUTOMATION_SELECT)
        .maybeSingle()
    : db.from("automatiseringen").insert(payload).select(AUTOMATION_SELECT).single();
  const { data, error } = await query;
  if (error) {
    if (!existing && "code" in error && error.code === "23505") {
      const current = await fetchAutomationByExternalId(db, source, externalId);
      return buildJsonResponse({ error: "Automation version conflict.", code: "VERSION_CONFLICT", data: current ? mapAutomationRow(current) : null }, 409);
    }
    throw new Error(error.message);
  }
  if (existing && !data) {
    const current = await fetchAutomation(db, String((existing as JsonRecord).id));
    return buildJsonResponse({ error: "Automation version conflict.", code: "VERSION_CONFLICT", data: current ? mapAutomationRow(current) : null }, 409);
  }

  await recordAuditEntry(db, "automation", String((data as JsonRecord).id), existing ? "upsert.update" : "upsert.create", actor, computeDiff((existing as JsonRecord | null) ?? null, data as JsonRecord));
  return buildJsonResponse({ data: mapAutomationRow(data as JsonRecord) }, existing ? 200 : 201);
}

async function handlePatchAutomation(db: PortalDb, req: Request, actor: string, id: string): Promise<Response> {
  const expectedVersion = requireVersion(req.headers.get("If-Match"));
  const body = await readJsonBody(req);
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";
  const current = await fetchAutomation(db, id);

  if (!current) return errorResponse("Automation not found.", "NOT_FOUND", 404);
  const dbPatch = mapAutomationPatchToDb(body, current);
  if (Number(current.api_version) !== expectedVersion) {
    return buildJsonResponse({ error: "Automation version conflict.", code: "VERSION_CONFLICT", data: mapAutomationRow(current) }, 409);
  }

  const next = { ...current, ...dbPatch, api_version: expectedVersion + 1 };
  if (dryRun) {
    return buildJsonResponse({ data: mapAutomationRow(next), dryRun: true, wouldChange: computeDiff(current, next) });
  }

  const { data, error } = await db
    .from("automatiseringen")
    .update({ ...dbPatch, api_version: expectedVersion + 1 })
    .eq("id", id)
    .eq("api_version", expectedVersion)
    .select(AUTOMATION_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const latest = await fetchAutomation(db, id);
    return buildJsonResponse({ error: "Automation version conflict.", code: "VERSION_CONFLICT", data: latest ? mapAutomationRow(latest) : null }, 409);
  }

  await recordAuditEntry(db, "automation", id, "patch", actor, computeDiff(current, data as JsonRecord));
  return buildJsonResponse({ data: mapAutomationRow(data as JsonRecord) });
}

async function handleArchiveAutomation(db: PortalDb, req: Request, actor: string, url: URL, id: string): Promise<Response> {
  const expectedVersion = requireVersion(req.headers.get("If-Match"));
  const dryRun = url.searchParams.get("dryRun") === "true";
  const force = url.searchParams.get("force") === "true";
  const current = await fetchAutomation(db, id);
  if (!current) return errorResponse("Automation not found.", "NOT_FOUND", 404);
  if (Number(current.api_version) !== expectedVersion) {
    return buildJsonResponse({ error: "Automation version conflict.", code: "VERSION_CONFLICT", data: mapAutomationRow(current) }, 409);
  }

  const placements = await fetchPlacementsByAutomationIds(db, [id]);
  const activePlacements = placements.get(id) ?? [];
  if (activePlacements.length > 0 && !force) {
    return buildJsonResponse({ error: "Automation has active placements.", code: "ACTIVE_PLACEMENTS", data: { placements: activePlacements } }, 409);
  }

  const archived = {
    ...current,
    status: "archived",
    archived_at: new Date().toISOString(),
    archived_by: actor,
    api_version: expectedVersion + 1,
  };
  if (dryRun) {
    return buildJsonResponse({
      data: mapAutomationRow(archived, force ? [] : activePlacements),
      dryRun: true,
      wouldChange: computeDiff(current, archived),
    });
  }

  const { data: archiveResult, error } = await db.rpc("portal_api_archive_automation", {
    p_id: id,
    p_expected_version: expectedVersion,
    p_actor: actor,
    p_force: force,
  });
  if (error) throw new Error(error.message);
  const result = archiveResult as JsonRecord;
  if (result.code === "NOT_FOUND") return errorResponse("Automation not found.", "NOT_FOUND", 404);
  if (result.code === "VERSION_CONFLICT") {
    return buildJsonResponse({ error: "Automation version conflict.", code: "VERSION_CONFLICT", data: mapAutomationRow(result.automation as JsonRecord) }, 409);
  }
  if (result.code === "ACTIVE_PLACEMENTS") {
    return buildJsonResponse({ error: "Automation has active placements.", code: "ACTIVE_PLACEMENTS", data: { placements: result.placements ?? [] } }, 409);
  }
  const data = result.automation as JsonRecord;

  await recordAuditEntry(db, "automation", id, "archive", actor, computeDiff(current, data as JsonRecord));
  for (const removedPlacement of (result.removedPlacementRecords ?? []) as JsonRecord[]) {
    await recordAuditEntry(db, "placement", String(removedPlacement.id), "archive.cascade", actor, computeDiff(removedPlacement, null));
  }
  return buildJsonResponse({ data: mapAutomationRow(data as JsonRecord) });
}

async function handleRestoreAutomation(db: PortalDb, req: Request, actor: string, id: string): Promise<Response> {
  const expectedVersion = requireVersion(req.headers.get("If-Match"));
  const body = await readOptionalJsonBody(req);
  assertAllowedFields(body, []);
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";
  const current = await fetchAutomation(db, id);
  if (!current) return errorResponse("Automation not found.", "NOT_FOUND", 404);
  if (Number(current.api_version) !== expectedVersion) {
    return buildJsonResponse({ error: "Automation version conflict.", code: "VERSION_CONFLICT", data: mapAutomationRow(current) }, 409);
  }

  const restored = { ...current, status: "active", archived_at: null, archived_by: null, api_version: expectedVersion + 1 };
  if (dryRun) {
    return buildJsonResponse({ data: mapAutomationRow(restored), dryRun: true, wouldChange: computeDiff(current, restored) });
  }

  const { data, error } = await db
    .from("automatiseringen")
    .update({ status: "active", archived_at: null, archived_by: null, api_version: expectedVersion + 1 })
    .eq("id", id)
    .eq("api_version", expectedVersion)
    .select(AUTOMATION_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const latest = await fetchAutomation(db, id);
    return buildJsonResponse({ error: "Automation version conflict.", code: "VERSION_CONFLICT", data: latest ? mapAutomationRow(latest) : null }, 409);
  }

  await recordAuditEntry(db, "automation", id, "restore", actor, computeDiff(current, data as JsonRecord));
  return buildJsonResponse({ data: mapAutomationRow(data as JsonRecord) });
}

async function handleBulkPatchAutomations(db: PortalDb, req: Request, actor: string): Promise<Response> {
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";
  const body = await req.json().catch(() => {
    throw new Error("Request body must be valid JSON.");
  });
  if (!Array.isArray(body)) throw new Error("Bulk body must be an array.");

  const succeeded: JsonRecord[] = [];
  const failed: JsonRecord[] = [];
  const wouldChange: JsonRecord[] = [];
  for (const item of body as JsonRecord[]) {
    try {
      const id = String(item.id ?? "");
      const expectedVersion = Number(item.version);
      if (!id || !Number.isInteger(expectedVersion) || expectedVersion < 1) throw new Error("id and version are required.");
      const current = await fetchAutomation(db, id);
      if (!current) throw new Error("Automation not found.");
      const dbPatch = mapAutomationPatchToDb((item.patch ?? {}) as JsonRecord, current);
      if (Number(current.api_version) !== expectedVersion) {
        failed.push({ id, code: "VERSION_CONFLICT", data: mapAutomationRow(current) });
        continue;
      }
      if (dryRun) {
        const next = { ...current, ...dbPatch, api_version: expectedVersion + 1 };
        succeeded.push(mapAutomationRow(next));
        wouldChange.push({ id, diff: computeDiff(current, next) });
        continue;
      }
      const { data, error } = await db
        .from("automatiseringen")
        .update({ ...dbPatch, api_version: expectedVersion + 1 })
        .eq("id", id)
        .eq("api_version", expectedVersion)
        .select(AUTOMATION_SELECT)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        const latest = await fetchAutomation(db, id);
        failed.push({ id, code: "VERSION_CONFLICT", data: latest ? mapAutomationRow(latest) : null });
        continue;
      }
      await recordAuditEntry(db, "automation", id, "bulk.patch", actor, computeDiff(current, data as JsonRecord));
      succeeded.push(mapAutomationRow(data as JsonRecord));
    } catch (error) {
      failed.push({ id: item?.id ?? null, code: "BAD_REQUEST", error: error instanceof Error ? error.message : "Patch failed." });
    }
  }

  return buildJsonResponse({ data: { succeeded, failed }, ...(dryRun ? { dryRun: true, wouldChange } : {}) });
}

async function handleListPlacements(db: PortalDb, url: URL): Promise<Response> {
  const { limit, offset } = parseLimitOffset(url);
  let query = db.from("automation_placements").select(PLACEMENT_SELECT, { count: "exact" });
  const automationId = url.searchParams.get("automationId");
  const pipelineId = url.searchParams.get("pipelineId");
  const type = url.searchParams.get("type");

  if (automationId) query = query.eq("automation_id", automationId);
  if (pipelineId) query = query.eq("pipeline_id", pipelineId);
  if (type) {
    if (type !== "step" && type !== "arrow" && type !== "syncBlock") throw new Error("Invalid placement target type");
    query = query.eq("target->>type", type);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as JsonRecord[];
  return buildJsonResponse({
    data: rows.map(mapPlacementRow),
    meta: {
      total: count ?? rows.length,
      limit,
      offset,
      hasMore: offset + rows.length < (count ?? rows.length),
    },
  });
}

async function handleGetPlacement(db: PortalDb, id: string): Promise<Response> {
  const current = await fetchPlacement(db, id);
  if (!current) return errorResponse("Placement not found.", "NOT_FOUND", 404);
  return buildJsonResponse({ data: mapPlacementRow(current) });
}

async function handleCreatePlacement(db: PortalDb, req: Request, actor: string, url: URL): Promise<Response> {
  const body = await readJsonBody(req);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const automationId = String(body.automationId ?? "");
  const pipelineId = String(body.pipelineId ?? "");
  if (!automationId || !pipelineId) throw new Error("automationId and pipelineId are required.");
  validatePlacementTarget(body.target);

  const automation = await fetchAutomation(db, automationId);
  if (!automation) return errorResponse("Automation not found.", "NOT_FOUND", 404);
  if (normalizeStatus(automation.status) === "archived" || automation.archived_at) {
    return buildJsonResponse({ error: "Automation is archived.", code: "AUTOMATION_ARCHIVED", data: mapAutomationRow(automation) }, 409);
  }

  await validatePlacementTargetForPipeline(db, pipelineId, body.target);
  const payload = {
    automation_id: automationId,
    pipeline_id: pipelineId,
    target: body.target,
    placed_by: actor,
    api_version: 1,
  };
  const preview = { ...payload, id: "dry-run", created_at: null, updated_at: null };
  if (dryRun) {
    return buildJsonResponse({ data: mapPlacementRow(preview), dryRun: true, wouldChange: computeDiff(null, preview) });
  }

  const { data, error } = await db.from("automation_placements").insert(payload).select(PLACEMENT_SELECT).single();
  if (error) {
    if (isUniqueViolation(error)) {
      return buildJsonResponse({ error: "A placement already exists for this target.", code: "DUPLICATE_PLACEMENT" }, 409);
    }
    throw new Error(error.message);
  }
  await recordAuditEntry(db, "placement", String((data as JsonRecord).id), "create", actor, computeDiff(null, data as JsonRecord));
  return buildJsonResponse({ data: mapPlacementRow(data as JsonRecord) }, 201);
}

async function handlePatchPlacement(db: PortalDb, req: Request, actor: string, url: URL, id: string): Promise<Response> {
  const expectedVersion = requireVersion(req.headers.get("If-Match"));
  const body = await readJsonBody(req);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const current = await fetchPlacement(db, id);
  if (!current) return errorResponse("Placement not found.", "NOT_FOUND", 404);
  if (Number(current.api_version) !== expectedVersion) {
    return buildJsonResponse({ error: "Placement version conflict.", code: "VERSION_CONFLICT", data: mapPlacementRow(current) }, 409);
  }

  const automationId = String(body.automationId ?? current.automation_id);
  const pipelineId = String(body.pipelineId ?? current.pipeline_id);
  const target = body.target ?? current.target;
  validatePlacementTarget(target);
  const automation = await fetchAutomation(db, automationId);
  if (!automation) return errorResponse("Automation not found.", "NOT_FOUND", 404);
  if (normalizeStatus(automation.status) === "archived" || automation.archived_at) {
    return buildJsonResponse({ error: "Automation is archived.", code: "AUTOMATION_ARCHIVED", data: mapAutomationRow(automation) }, 409);
  }
  await validatePlacementTargetForPipeline(db, pipelineId, target);

  const dbPatch = {
    automation_id: automationId,
    pipeline_id: pipelineId,
    target,
    placed_by: actor,
    updated_at: new Date().toISOString(),
    api_version: expectedVersion + 1,
  };
  const next = { ...current, ...dbPatch };
  if (dryRun) {
    return buildJsonResponse({ data: mapPlacementRow(next), dryRun: true, wouldChange: computeDiff(current, next) });
  }

  const { data, error } = await db
    .from("automation_placements")
    .update(dbPatch)
    .eq("id", id)
    .eq("api_version", expectedVersion)
    .select(PLACEMENT_SELECT)
    .maybeSingle();
  if (error) {
    if (isUniqueViolation(error)) {
      return buildJsonResponse({ error: "A placement already exists for this target.", code: "DUPLICATE_PLACEMENT" }, 409);
    }
    throw new Error(error.message);
  }
  if (!data) {
    const latest = await fetchPlacement(db, id);
    return buildJsonResponse({ error: "Placement version conflict.", code: "VERSION_CONFLICT", data: latest ? mapPlacementRow(latest) : null }, 409);
  }
  await recordAuditEntry(db, "placement", id, "patch", actor, computeDiff(current, data as JsonRecord));
  return buildJsonResponse({ data: mapPlacementRow(data as JsonRecord) });
}

async function handleDeletePlacement(db: PortalDb, req: Request, actor: string, url: URL, id: string): Promise<Response> {
  const expectedVersion = requireVersion(req.headers.get("If-Match"));
  const dryRun = url.searchParams.get("dryRun") === "true";
  const current = await fetchPlacement(db, id);
  if (!current) return errorResponse("Placement not found.", "NOT_FOUND", 404);
  if (Number(current.api_version) !== expectedVersion) {
    return buildJsonResponse({ error: "Placement version conflict.", code: "VERSION_CONFLICT", data: mapPlacementRow(current) }, 409);
  }
  if (dryRun) {
    return buildJsonResponse({ data: mapPlacementRow(current), dryRun: true, wouldChange: computeDiff(current, null) });
  }

  const { data, error } = await db
    .from("automation_placements")
    .delete()
    .eq("id", id)
    .eq("api_version", expectedVersion)
    .select(PLACEMENT_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const latest = await fetchPlacement(db, id);
    return buildJsonResponse({ error: "Placement version conflict.", code: "VERSION_CONFLICT", data: latest ? mapPlacementRow(latest) : null }, 409);
  }
  await recordAuditEntry(db, "placement", id, "delete", actor, computeDiff(data as JsonRecord, null));
  return buildJsonResponse({ data: mapPlacementRow(data as JsonRecord) });
}

async function handleBulkCreatePlacements(db: PortalDb, req: Request, actor: string, url: URL): Promise<Response> {
  const dryRun = url.searchParams.get("dryRun") === "true";
  const body = await req.json().catch(() => {
    throw new Error("Request body must be valid JSON.");
  });
  if (!Array.isArray(body)) throw new Error("Bulk body must be an array.");

  const succeeded: JsonRecord[] = [];
  const failed: JsonRecord[] = [];
  const wouldChange: JsonRecord[] = [];
  for (const item of body as JsonRecord[]) {
    try {
      const automationId = String(item.automationId ?? "");
      const pipelineId = String(item.pipelineId ?? "");
      if (!automationId || !pipelineId) throw new Error("automationId and pipelineId are required.");
      validatePlacementTarget(item.target);
      const automation = await fetchAutomation(db, automationId);
      if (!automation) throw new Error("Automation not found.");
      if (normalizeStatus(automation.status) === "archived" || automation.archived_at) throw new Error("Automation is archived.");
      await validatePlacementTargetForPipeline(db, pipelineId, item.target);
      const payload = { automation_id: automationId, pipeline_id: pipelineId, target: item.target, placed_by: actor, api_version: 1 };
      if (dryRun) {
        const preview = { ...payload, id: String(item.id ?? "dry-run"), created_at: null, updated_at: null };
        succeeded.push(mapPlacementRow(preview));
        wouldChange.push({ id: item.id ?? null, diff: computeDiff(null, preview) });
        continue;
      }
      const { data, error } = await db.from("automation_placements").insert(payload).select(PLACEMENT_SELECT).single();
      if (error) {
        if (isUniqueViolation(error)) throw Object.assign(new Error("A placement already exists for this target."), { code: "DUPLICATE_PLACEMENT" });
        throw new Error(error.message);
      }
      await recordAuditEntry(db, "placement", String((data as JsonRecord).id), "bulk.create", actor, computeDiff(null, data as JsonRecord));
      succeeded.push(mapPlacementRow(data as JsonRecord));
    } catch (error) {
      const code = error instanceof Error && (error as Error & { code?: string }).code === "DUPLICATE_PLACEMENT" ? "DUPLICATE_PLACEMENT" : "BAD_REQUEST";
      failed.push({ id: item?.id ?? null, automationId: item?.automationId ?? null, code, error: error instanceof Error ? error.message : "Placement create failed." });
    }
  }

  return buildJsonResponse({ data: { succeeded, failed }, ...(dryRun ? { dryRun: true, wouldChange } : {}) });
}

function mapProcessStatePatchToDb(patch: JsonRecord, current: JsonRecord): JsonRecord {
  if ("automationPlacements" in patch) throw new Error("automationPlacements is read-only.");
  assertAllowedFields(patch, PROCESS_STATE_WRITE_FIELDS);

  const dbPatch: JsonRecord = {};
  if ("steps" in patch) {
    if (!Array.isArray(patch.steps) || !patch.steps.every(hasStringId)) throw new Error("steps must be an array of objects with id.");
    dbPatch.steps = mergeById((Array.isArray(current.steps) ? current.steps : []).filter(hasStringId), patch.steps);
  }
  if ("connections" in patch) {
    if (!Array.isArray(patch.connections) || !patch.connections.every(hasStringId)) throw new Error("connections must be an array of objects with id.");
    dbPatch.connections = mergeById((Array.isArray(current.connections) ? current.connections : []).filter(hasStringId), patch.connections);
  }
  if ("lanes" in patch) {
    if (!Array.isArray(patch.lanes) || !patch.lanes.every(hasStringKey)) throw new Error("lanes must be an array of objects with key.");
    dbPatch.custom_lanes = mergeByField(
      (Array.isArray(current.custom_lanes) ? current.custom_lanes : []).filter(hasStringKey),
      patch.lanes,
      "key",
    );
  }
  if ("autoLinks" in patch) dbPatch.auto_links = patch.autoLinks;
  if ("flowLinks" in patch) dbPatch.flow_links = patch.flowLinks;
  if ("parkedSteps" in patch) dbPatch.parked_steps = patch.parkedSteps;
  if ("activeLanes" in patch) dbPatch.active_lanes = patch.activeLanes;
  if ("artifacts" in patch) dbPatch.artifacts = patch.artifacts;
  if ("manualStatus" in patch) dbPatch.manual_status = patch.manualStatus;
  dbPatch.updated_at = new Date().toISOString();
  return dbPatch;
}

async function handleGetProcessState(db: PortalDb, pipelineId: string): Promise<Response> {
  const current = await fetchProcessState(db, pipelineId);
  if (!current) return errorResponse("Process state not found.", "NOT_FOUND", 404);
  const automationPlacements = await fetchPlacementsByPipelineId(db, pipelineId);
  return buildJsonResponse({ data: mapProcessStateRow(current, automationPlacements) });
}

async function handlePatchProcessState(db: PortalDb, req: Request, actor: string, url: URL, pipelineId: string): Promise<Response> {
  const expectedVersion = requireVersion(req.headers.get("If-Match"));
  const body = await readJsonBody(req);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const current = await fetchProcessState(db, pipelineId);
  if (!current) return errorResponse("Process state not found.", "NOT_FOUND", 404);
  if (Number(current.api_version) !== expectedVersion) {
    const automationPlacements = await fetchPlacementsByPipelineId(db, pipelineId);
    return buildJsonResponse({ error: "Process state version conflict.", code: "VERSION_CONFLICT", data: mapProcessStateRow(current, automationPlacements) }, 409);
  }

  const dbPatch = mapProcessStatePatchToDb(body, current);
  const next = { ...current, ...dbPatch, api_version: expectedVersion + 1 };
  const automationPlacements = await fetchPlacementsByPipelineId(db, pipelineId);
  if (dryRun) {
    return buildJsonResponse({ data: mapProcessStateRow(next, automationPlacements), dryRun: true, wouldChange: computeDiff(current, next) });
  }

  const { data, error } = await db
    .from("process_state")
    .update({ ...dbPatch, api_version: expectedVersion + 1 })
    .eq("id", pipelineId)
    .eq("api_version", expectedVersion)
    .select(PROCESS_STATE_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const latest = await fetchProcessState(db, pipelineId);
    const latestPlacements = await fetchPlacementsByPipelineId(db, pipelineId);
    return buildJsonResponse({ error: "Process state version conflict.", code: "VERSION_CONFLICT", data: latest ? mapProcessStateRow(latest, latestPlacements) : null }, 409);
  }
  await recordAuditEntry(db, "processState", pipelineId, "patch", actor, computeDiff(current, data as JsonRecord));
  return buildJsonResponse({ data: mapProcessStateRow(data as JsonRecord, automationPlacements) });
}

function mapPipelineRow(row: JsonRecord): JsonRecord {
  return redactSecrets({
    id: row.pipeline_id,
    name: row.naam,
    stages: row.stages ?? [],
    description: row.beschrijving ?? null,
    isActive: row.is_active,
    source: row.source,
    syncedAt: row.synced_at ?? null,
    updatedAt: row.updated_at ?? null,
  });
}

async function handleListPipelines(db: PortalDb, url: URL): Promise<Response> {
  const { limit, offset } = parseLimitOffset(url);
  let query = db.from("pipelines").select(PIPELINE_SELECT, { count: "exact" });
  const source = url.searchParams.get("source");
  const isActive = url.searchParams.get("isActive");

  if (source) query = query.eq("source", source);
  if (isActive === "true" || isActive === "false") query = query.eq("is_active", isActive === "true");

  const { data, error, count } = await query
    .order("naam", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as JsonRecord[];
  return buildJsonResponse({
    data: rows.map(mapPipelineRow),
    meta: {
      total: count ?? rows.length,
      limit,
      offset,
      hasMore: offset + rows.length < (count ?? rows.length),
    },
  });
}

function mapFlowRow(row: JsonRecord): JsonRecord {
  return redactSecrets({
    id: row.id,
    name: row.naam,
    description: row.beschrijving ?? null,
    systems: row.systemen ?? [],
    automationIds: row.automation_ids ?? [],
    chain: row.api_chain ?? [],
    version: row.api_version,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  });
}

async function fetchFlow(db: PortalDb, id: string): Promise<JsonRecord | null> {
  const { data, error } = await db.from("flows").select(FLOW_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as JsonRecord | null;
}

function mapFlowPatchToDb(patch: JsonRecord): JsonRecord {
  assertAllowedFields(patch, FLOW_WRITE_FIELDS);

  const dbPatch: JsonRecord = {};
  if ("name" in patch) {
    if (typeof patch.name !== "string" || !patch.name.trim()) throw new Error("name must be a non-empty string.");
    dbPatch.naam = patch.name;
  }
  if ("description" in patch) dbPatch.beschrijving = patch.description;
  if ("systems" in patch) {
    if (!Array.isArray(patch.systems) || !patch.systems.every((item) => typeof item === "string")) {
      throw new Error("systems must be an array of strings.");
    }
    dbPatch.systemen = patch.systems;
  }
  if ("automationIds" in patch) {
    if (!Array.isArray(patch.automationIds) || !patch.automationIds.every((item) => typeof item === "string")) {
      throw new Error("automationIds must be an array of strings.");
    }
    dbPatch.automation_ids = patch.automationIds;
  }
  if ("chain" in patch) {
    if (!Array.isArray(patch.chain)) throw new Error("chain must be an array.");
    dbPatch.api_chain = patch.chain;
  }
  dbPatch.updated_at = new Date().toISOString();
  return dbPatch;
}

async function handleListProcesreizen(db: PortalDb, url: URL): Promise<Response> {
  const { limit, offset } = parseLimitOffset(url);
  let query = db.from("flows").select(FLOW_SELECT, { count: "exact" });
  const q = url.searchParams.get("q")?.trim();

  if (q) {
    const term = formatPostgrestFilterValue(`*${q}*`);
    query = query.or(`naam.ilike.${term},beschrijving.ilike.${term}`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as JsonRecord[];
  return buildJsonResponse({
    data: rows.map(mapFlowRow),
    meta: {
      total: count ?? rows.length,
      limit,
      offset,
      hasMore: offset + rows.length < (count ?? rows.length),
    },
  });
}

async function handleGetProcesreis(db: PortalDb, id: string): Promise<Response> {
  const row = await fetchFlow(db, id);
  if (!row) return errorResponse("Procesreis not found.", "NOT_FOUND", 404);
  return buildJsonResponse({ data: mapFlowRow(row) });
}

async function handlePatchProcesreis(db: PortalDb, req: Request, actor: string, url: URL, id: string): Promise<Response> {
  const expectedVersion = requireVersion(req.headers.get("If-Match"));
  const body = await readJsonBody(req);
  const dryRun = url.searchParams.get("dryRun") === "true";
  const current = await fetchFlow(db, id);
  if (!current) return errorResponse("Procesreis not found.", "NOT_FOUND", 404);
  if (Number(current.api_version) !== expectedVersion) {
    return buildJsonResponse({ error: "Procesreis version conflict.", code: "VERSION_CONFLICT", data: mapFlowRow(current) }, 409);
  }

  const dbPatch = mapFlowPatchToDb(body);
  const next = { ...current, ...dbPatch, api_version: expectedVersion + 1 };
  if (dryRun) {
    return buildJsonResponse({ data: mapFlowRow(next), dryRun: true, wouldChange: computeDiff(current, next) });
  }

  const { data, error } = await db
    .from("flows")
    .update({ ...dbPatch, api_version: expectedVersion + 1 })
    .eq("id", id)
    .eq("api_version", expectedVersion)
    .select(FLOW_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const latest = await fetchFlow(db, id);
    return buildJsonResponse({ error: "Procesreis version conflict.", code: "VERSION_CONFLICT", data: latest ? mapFlowRow(latest) : null }, 409);
  }
  await recordAuditEntry(db, "procesreis", id, "patch", actor, computeDiff(current, data as JsonRecord));
  return buildJsonResponse({ data: mapFlowRow(data as JsonRecord) });
}

function mapSyncReviewRow(row: JsonRecord): JsonRecord {
  return redactSecrets({
    id: row.id,
    syncRunId: row.sync_run_id,
    source: row.source,
    externalId: row.external_id ?? null,
    automationId: row.automation_id ?? null,
    type: row.change_type,
    status: row.status,
    selected: Boolean(row.selected_by_default),
    title: row.title,
    summary: row.summary,
    impact: row.impact,
    oldValue: row.old_value_sanitized ?? null,
    newValue: row.new_value_sanitized ?? null,
    payload: row.payload_sanitized ?? null,
    appliedAt: row.applied_at ?? null,
    skippedAt: row.skipped_at ?? null,
    errorMessage: row.error_message_sanitized ?? null,
    reviewKey: row.review_key ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    version: row.api_version,
  });
}

async function fetchSyncReviewItem(db: PortalDb, id: string): Promise<JsonRecord | null> {
  const { data, error } = await db.from("source_sync_change_items").select(SYNC_REVIEW_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as JsonRecord | null;
}

async function handleListSyncReview(db: PortalDb, url: URL): Promise<Response> {
  const { limit, offset } = parseLimitOffset(url);
  let query = db.from("source_sync_change_items").select(SYNC_REVIEW_SELECT, { count: "exact" });
  const source = url.searchParams.get("source");
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type");
  const syncRunId = url.searchParams.get("syncRunId");
  const q = url.searchParams.get("q")?.trim();

  if (source) query = query.eq("source", source);
  if (syncRunId) query = query.eq("sync_run_id", syncRunId);
  if (status) {
    if (!SYNC_REVIEW_STATUSES.includes(status as (typeof SYNC_REVIEW_STATUSES)[number])) {
      throw new Error("Invalid status filter.");
    }
    query = query.eq("status", status);
  } else {
    query = query.in("status", ["pending", "failed"]);
  }
  if (type) {
    if (!SYNC_REVIEW_CHANGE_TYPES.includes(type as (typeof SYNC_REVIEW_CHANGE_TYPES)[number])) {
      throw new Error("Invalid type filter.");
    }
    query = query.eq("change_type", type);
  }
  if (q) {
    const term = formatPostgrestFilterValue(`*${q}*`);
    query = query.or(`title.ilike.${term},summary.ilike.${term}`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as JsonRecord[];
  return buildJsonResponse({
    data: rows.map(mapSyncReviewRow),
    meta: {
      total: count ?? rows.length,
      limit,
      offset,
      hasMore: offset + rows.length < (count ?? rows.length),
    },
  });
}

async function handleGetSyncReviewItem(db: PortalDb, id: string): Promise<Response> {
  const row = await fetchSyncReviewItem(db, id);
  if (!row) return errorResponse("Sync review item not found.", "NOT_FOUND", 404);
  return buildJsonResponse({ data: mapSyncReviewRow(row) });
}

function validateSyncReviewStatusInput(value: unknown): SyncReviewApiStatus {
  if (value !== "skipped" && value !== "selected" && value !== "unselected") {
    throw new Error("status must be one of skipped, selected, or unselected.");
  }
  return value;
}

async function handlePatchSyncReviewItem(db: PortalDb, req: Request, actor: string, url: URL, id: string): Promise<Response> {
  const expectedVersion = requireVersion(req.headers.get("If-Match"));
  const body = await readJsonBody(req);
  const dryRun = url.searchParams.get("dryRun") === "true";
  assertAllowedFields(body, ["status"]);
  if (!("status" in body)) throw new Error("status is required.");
  const apiStatus = validateSyncReviewStatusInput(body.status);

  const current = await fetchSyncReviewItem(db, id);
  if (!current) return errorResponse("Sync review item not found.", "NOT_FOUND", 404);
  if (Number(current.api_version) !== expectedVersion) {
    return buildJsonResponse({ error: "Sync review item version conflict.", code: "VERSION_CONFLICT", data: mapSyncReviewRow(current) }, 409);
  }

  const now = new Date().toISOString();
  const dbPatch: JsonRecord = { updated_at: now, ...mapSyncReviewStatusToDbPatch(apiStatus, now) };

  const next = { ...current, ...dbPatch, api_version: expectedVersion + 1 };
  if (dryRun) {
    return buildJsonResponse({ data: mapSyncReviewRow(next), dryRun: true, wouldChange: computeDiff(current, next) });
  }

  const { data, error } = await db
    .from("source_sync_change_items")
    .update({ ...dbPatch, api_version: expectedVersion + 1 })
    .eq("id", id)
    .eq("api_version", expectedVersion)
    .select(SYNC_REVIEW_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const latest = await fetchSyncReviewItem(db, id);
    return buildJsonResponse({ error: "Sync review item version conflict.", code: "VERSION_CONFLICT", data: latest ? mapSyncReviewRow(latest) : null }, 409);
  }
  await recordAuditEntry(db, "syncReview", id, "patch", actor, computeDiff(current, data as JsonRecord));
  return buildJsonResponse({ data: mapSyncReviewRow(data as JsonRecord) });
}

const SEARCH_TYPES = ["automation", "pipeline", "processState", "procesreis", "syncReview"] as const;
type SearchType = (typeof SEARCH_TYPES)[number];

async function handleSearch(db: PortalDb, url: URL): Promise<Response> {
  const q = url.searchParams.get("q")?.trim();
  if (!q) throw new Error("q is required.");
  const { limit } = parseLimitOffset(url);
  const typesParam = url.searchParams.get("types");
  const types = typesParam
    ? typesParam.split(",").map((value) => value.trim()).filter(Boolean)
    : [...SEARCH_TYPES];
  for (const type of types) {
    if (!SEARCH_TYPES.includes(type as SearchType)) throw new Error(`Invalid search type: ${type}`);
  }

  // Search returns up to `limit` matches per selected type, with an accurate combined
  // `meta.total` (from real per-type counts) — it does not support deep offset-based paging
  // across the merged, heterogeneous result set, since the spec doesn't require that and a
  // global offset across independently-ranked types has no well-defined meaning.
  const term = formatPostgrestFilterValue(`*${q}*`);
  const results: JsonRecord[] = [];
  let total = 0;

  if (types.includes("automation")) {
    const { data, error, count } = await db
      .from("automatiseringen")
      .select("id,naam,doel", { count: "exact" })
      .or(`naam.ilike.${term},doel.ilike.${term}`)
      .order("naam", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    total += count ?? (data ?? []).length;
    for (const row of (data ?? []) as JsonRecord[]) {
      results.push({ type: "automation", id: row.id, title: row.naam, summary: row.doel ?? "", url: `/v1/automations/${row.id}` });
    }
  }

  if (types.includes("pipeline")) {
    const { data, error, count } = await db
      .from("pipelines")
      .select("pipeline_id,naam,beschrijving", { count: "exact" })
      .or(`naam.ilike.${term},beschrijving.ilike.${term},pipeline_id.ilike.${term}`)
      .order("naam", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    total += count ?? (data ?? []).length;
    for (const row of (data ?? []) as JsonRecord[]) {
      // There is no single-resource GET /v1/pipelines/:id route (pipelines are read-only,
      // list-only per the spec), so the follow-up URL points at the collection endpoint.
      results.push({ type: "pipeline", id: row.pipeline_id, title: row.naam, summary: row.beschrijving ?? "", url: "/v1/pipelines" });
    }
  }

  if (types.includes("procesreis")) {
    const { data, error, count } = await db
      .from("flows")
      .select("id,naam,beschrijving", { count: "exact" })
      .or(`naam.ilike.${term},beschrijving.ilike.${term}`)
      .order("naam", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    total += count ?? (data ?? []).length;
    for (const row of (data ?? []) as JsonRecord[]) {
      results.push({ type: "procesreis", id: row.id, title: row.naam, summary: row.beschrijving ?? "", url: `/v1/procesreizen/${row.id}` });
    }
  }

  if (types.includes("processState")) {
    // Process states have no title/summary columns of their own; matching is by pipeline id,
    // and the summary falls back to the saved manual_status or a generic description.
    const { data, error, count } = await db
      .from("process_state")
      .select("id,manual_status", { count: "exact" })
      .or(`id.ilike.${term}`)
      .order("id", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    total += count ?? (data ?? []).length;
    for (const row of (data ?? []) as JsonRecord[]) {
      const summary = typeof row.manual_status === "string" && row.manual_status ? row.manual_status : `Process state for pipeline ${row.id}`;
      results.push({ type: "processState", id: row.id, title: String(row.id), summary, url: `/v1/process-states/${row.id}` });
    }
  }

  if (types.includes("syncReview")) {
    const { data, error, count } = await db
      .from("source_sync_change_items")
      .select("id,title,summary", { count: "exact" })
      .or(`title.ilike.${term},summary.ilike.${term}`)
      .order("title", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    total += count ?? (data ?? []).length;
    for (const row of (data ?? []) as JsonRecord[]) {
      results.push({ type: "syncReview", id: row.id, title: row.title, summary: row.summary ?? "", url: `/v1/sync-review/${row.id}` });
    }
  }

  return buildJsonResponse({
    data: results,
    meta: {
      total,
      limit,
      returned: results.length,
      hasMore: results.length < total,
    },
  });
}

const AUDIT_LOG_SELECT = "id,resource,resource_id,action,actor,diff,created_at";

function mapAuditLogRow(row: JsonRecord): JsonRecord {
  return redactSecrets({
    id: row.id,
    resource: row.resource,
    resourceId: row.resource_id,
    action: row.action,
    actor: row.actor,
    diff: row.diff ?? {},
    timestamp: row.created_at,
  });
}

async function handleListAuditLog(db: PortalDb, url: URL): Promise<Response> {
  const { limit, offset } = parseLimitOffset(url);
  let query = db.from("portal_api_audit_log").select(AUDIT_LOG_SELECT, { count: "exact" });
  const resource = url.searchParams.get("resource");
  const resourceId = url.searchParams.get("resourceId");
  const actor = url.searchParams.get("actor");
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");

  if (resource) query = query.eq("resource", resource);
  if (resourceId) query = query.eq("resource_id", resourceId);
  if (actor) query = query.eq("actor", actor);
  if (since) query = query.gte("created_at", since);
  if (until) query = query.lte("created_at", until);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as JsonRecord[];
  return buildJsonResponse({
    data: rows.map(mapAuditLogRow),
    meta: {
      total: count ?? rows.length,
      limit,
      offset,
      hasMore: offset + rows.length < (count ?? rows.length),
    },
  });
}

async function recordAuditEntry(
  db: PortalDb,
  resource: string,
  resourceId: string,
  action: string,
  actor: string,
  diff: JsonRecord,
): Promise<void> {
  const { error } = await db.from("portal_api_audit_log").insert({
    resource,
    resource_id: resourceId,
    action,
    actor,
    diff,
  });
  if (error) throw new Error(error.message);
}
