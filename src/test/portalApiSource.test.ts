import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("portal API source", () => {
  // Normalize line endings: this file is read as raw text and matched with literal multi-line
  // strings/regexes below, which must not be brittle to git's CRLF checkout conversion on Windows.
  const indexSource = readFileSync(resolve(process.cwd(), "supabase/functions/portal-api/index.ts"), "utf8").replace(/\r\n/g, "\n");
  const openApiSource = readFileSync(resolve(process.cwd(), "supabase/functions/portal-api/openapi.ts"), "utf8").replace(/\r\n/g, "\n");

  it("creates a service-role Supabase client and checks PORTAL_API_KEY", () => {
    expect(indexSource).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(indexSource).toContain("PORTAL_API_KEY");
    expect(indexSource).toContain("parseBearerToken");
  });

  it("contains the v1 route table", () => {
    for (const route of ["/v1/openapi.json", "/v1/automations", "/v1/placements", "/v1/process-states", "/v1/procesreizen", "/v1/sync-review", "/v1/search", "/v1/audit-log"]) {
      expect(indexSource).toContain(route);
    }
    expect(indexSource).toContain('{ path: "/v1/automations/bulk", pattern: /^\\/v1\\/automations\\/bulk$/, methods: ["PATCH"] }');
    expect(indexSource).toContain('{ path: "/v1/procesreizen", pattern: /^\\/v1\\/procesreizen$/, methods: ["GET"] }');
    expect(indexSource).toContain('{ path: "/v1/procesreizen/{id}", pattern: /^\\/v1\\/procesreizen\\/[^/]+$/, methods: ["GET", "PATCH"] }');
  });

  it("exposes OpenAPI 3.1 metadata", () => {
    expect(openApiSource).toContain('"openapi": "3.1.0"');
    expect(openApiSource).toContain("/v1/automations");
    expect(openApiSource).toContain("/v1/placements");
    expect(openApiSource).toContain("one database transaction");
    expect(openApiSource).toContain("If-Match");
    expect(openApiSource).toContain('name: "id"');
    expect(openApiSource).toContain('name: "pipelineId"');
    expect(openApiSource).toContain('in: "path"');
  });

  it("serves OpenAPI before requiring Supabase database config", () => {
    expect(indexSource.indexOf('url.pathname === "/v1/openapi.json"')).toBeLessThan(
      indexSource.indexOf('Deno.env.get("SUPABASE_URL")'),
    );
    expect(indexSource.indexOf('url.pathname === "/v1/openapi.json"')).toBeLessThan(
      indexSource.indexOf("const db = createClient"),
    );
  });

  it("implements automation route handlers and field guards", () => {
    expect(indexSource).toContain("AUTOMATION_WRITE_FIELDS");
    expect(indexSource).toContain("handleListAutomations");
    expect(indexSource).toContain("handleGetAutomation");
    expect(indexSource).toContain("handleUpsertAutomation");
    expect(indexSource).toContain("handlePatchAutomation");
    expect(indexSource).toContain("handleArchiveAutomation");
    expect(indexSource).toContain("handleRestoreAutomation");
    expect(indexSource).toContain("handleBulkPatchAutomations");
    expect(indexSource).toContain("handleGetAutomation(db, automationIdFromPath(url.pathname, 3))");
    expect(indexSource).toContain("handlePatchAutomation(db, req, actor, automationIdFromPath(url.pathname, 3))");
    expect(indexSource).toContain("handleArchiveAutomation(db, req, actor, url, automationIdFromPath(url.pathname, 3))");
    expect(indexSource).toContain("automation_placements");
    expect(indexSource).toContain("api_version");
    expect(indexSource).toContain("archived_at");
    expect(indexSource).toContain("function mapAutomationPatchToDb(patch: JsonRecord, current?: JsonRecord | null)");
    expect(indexSource).toContain("current?.import_proposal");
    expect(indexSource).toContain("fetchAutomationByExternalId");
    expect(indexSource).toContain('error.code === "23505"');
    expect(indexSource).toContain(".eq(\"api_version\", Number((existing as JsonRecord).api_version))");
    expect(indexSource).toContain("const dryRun = new URL(req.url).searchParams.get(\"dryRun\") === \"true\"");
    expect(indexSource).toContain("readOptionalJsonBody");
    expect(indexSource).toContain("portal_api_archive_automation");
    expect(indexSource).toContain("formatPostgrestInList");
    expect(indexSource).toContain("formatPostgrestFilterValue");
    expect(indexSource).toContain("statusFilterValues");
    expect(indexSource).toContain('if (status === "active") return ["active", "Actief"]');
    expect(indexSource).toContain('if (status === "inactive") return ["inactive", "Inactief", "Uitgeschakeld"]');
    expect(indexSource).toContain("const term = formatPostgrestFilterValue(`*${q}*`)");
    expect(indexSource).toContain("redactSecrets");
    expect(indexSource).toContain("dryRun: true");
    expect(indexSource).toContain("wouldChange: computeDiff");
    expect(indexSource).toContain("wouldChange.push({ id, diff: computeDiff(current, next) })");
  });

  it("implements placement and process-state route handlers", () => {
    expect(indexSource).toContain("handleListPlacements");
    expect(indexSource).toContain("handleCreatePlacement");
    expect(indexSource).toContain("handlePatchPlacement");
    expect(indexSource).toContain("handleDeletePlacement");
    expect(indexSource).toContain("handleBulkCreatePlacements");
    expect(indexSource).toContain("handleGetProcessState");
    expect(indexSource).toContain("handlePatchProcessState");
    expect(indexSource).toContain("automationPlacements");
    expect(indexSource).toContain("mergeById");
  });

  it("merges process-state lanes by their real key field, not a single conflicting write path", () => {
    expect(indexSource).toContain("mergeByField");
    expect(indexSource).toContain("hasStringKey");
    expect(indexSource).not.toContain("customLanes");
  });

  it("does not leak raw Postgres constraint errors for duplicate placements", () => {
    expect(indexSource).toContain("DUPLICATE_PLACEMENT");
    expect(indexSource).toContain('"23505"');
  });

  it("does not return a stray unrecorded audit field from placement delete", () => {
    expect(indexSource).not.toContain("audit: { recorded: false }");
  });

  it("reads dryRun for process-state patch only from the query string, matching every other placement route", () => {
    expect(indexSource).not.toContain('body.dryRun === true || url.searchParams.get("dryRun")');
    expect(indexSource.match(/dryRun.*===.*"true".*\|\|.*body\.dryRun/)).toBeNull();
  });

  it("implements procesreizen, sync review, and search handlers", () => {
    expect(indexSource).toContain("handleListProcesreizen");
    expect(indexSource).toContain("handleGetProcesreis");
    expect(indexSource).toContain("handlePatchProcesreis");
    expect(indexSource).toContain("handleListSyncReview");
    expect(indexSource).toContain("handleGetSyncReviewItem");
    expect(indexSource).toContain("handlePatchSyncReviewItem");
    expect(indexSource).toContain("handleSearch");
    expect(indexSource).toContain("flows");
    expect(indexSource).toContain("source_sync_change_items");
  });

  it("maps sync review status via the tested pure helper instead of an inline branch", () => {
    expect(indexSource).toContain("mapSyncReviewStatusToDbPatch");
  });

  it("reports an accurate combined total for search instead of a per-type-limit-capped count", () => {
    expect(indexSource).toContain('{ count: "exact" }');
    expect(indexSource).not.toContain("total: results.length");
  });

  it("records audit entries for every write route", () => {
    expect(indexSource).toContain("recordAuditEntry");
    expect(indexSource).toContain("portal_api_audit_log");
    expect(indexSource).toContain("x-actor");
    expect(indexSource).toContain("dryRun");
  });

  it("reads dryRun for automation writes only from the query string, matching every other write route", () => {
    expect(indexSource).not.toContain("body.dryRun === true");
    expect(indexSource).not.toContain("Boolean((body as JsonRecord)?.dryRun)");
  });

  it("implements the audit log route", () => {
    expect(indexSource).toContain("handleListAuditLog");
    expect(indexSource).toContain('url.pathname === "/v1/audit-log"');
  });

  it("OpenAPI lists every shipped v2 route", () => {
    for (const path of [
      "/v1/openapi.json", "/v1/automations", "/v1/automations/{id}", "/v1/automations/{id}/restore",
      "/v1/automations/bulk", "/v1/placements", "/v1/placements/{id}", "/v1/placements/bulk",
      "/v1/pipelines", "/v1/process-states/{pipelineId}", "/v1/procesreizen", "/v1/procesreizen/{id}",
      "/v1/sync-review", "/v1/sync-review/{id}", "/v1/search", "/v1/audit-log",
    ]) {
      expect(openApiSource).toContain(path);
    }
  });

  it("audit-logs every placement removed by a force archive, not just the automation itself", () => {
    expect(indexSource).toContain("removedPlacementRecords");
    expect(indexSource).toContain('"archive.cascade"');
  });

  it("documents single-resource and bulk-result success responses inside the real data envelope, not as bare objects", () => {
    // Every handler wraps its committed response in buildJsonResponse({ data: ... }); a response
    // schema that $refs a bare resource/result schema directly (not nested under a `data` property)
    // would misdescribe what actually ships on the wire.
    const bareResourceRef = /content: \{ "application\/json": \{ schema: \{ \$ref: "#\/components\/schemas\/(Automation|Placement|ProcessState|Procesreis|SyncReviewItem)" \} \} \}/;
    expect(openApiSource).not.toMatch(bareResourceRef);
    expect(openApiSource).toContain('data: {\n                      type: "object",\n                      properties: {\n                        succeeded: { type: "array", items: { $ref: "#/components/schemas/Automation" } },');
    expect(openApiSource).toContain('data: {\n                      type: "object",\n                      properties: {\n                        succeeded: { type: "array", items: { $ref: "#/components/schemas/Placement" } },');
  });

  it("documents a 404 on every write-by-id route that the handler actually returns one for", () => {
    for (const notFoundDescription of [
      "Automation not found.",
      "Placement not found.",
      "Process state not found.",
      "Procesreis not found.",
      "Sync review item not found.",
    ]) {
      expect(openApiSource.split(`description: "${notFoundDescription}"`).length).toBeGreaterThanOrEqual(3);
    }
    expect(openApiSource).toContain("Concurrent upsert race on the same (source, externalId).");
  });

  it("documents the placements bulk failed-item shape the handler actually returns", () => {
    expect(openApiSource).toContain(
      "properties: {\n                              id: { type: [\"string\", \"null\"] },\n                              automationId: { type: [\"string\", \"null\"] },\n                              code: { type: \"string\" },\n                              error: { type: \"string\" },\n                            },",
    );
  });

  it("strips the /portal-api gateway slug prefix before matching routes", () => {
    // The public Supabase gateway invokes this function at /portal-api/... (it strips
    // /functions/v1 but not the function slug itself) — confirmed by deploying and
    // querying the live function. Route matching must normalize this away or every
    // route lookup fails with a 404, even with a valid bearer token.
    expect(indexSource).toContain('url.pathname.replace(/^\\/portal-api(?=\\/|$)/, "") || "/"');
    expect(indexSource.indexOf("url.pathname = url.pathname.replace")).toBeLessThan(
      indexSource.indexOf("const route = ROUTES.find"),
    );
  });
});
