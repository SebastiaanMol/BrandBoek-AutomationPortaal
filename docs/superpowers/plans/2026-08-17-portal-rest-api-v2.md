# Portal REST API v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned Supabase Edge Function REST API that lets Claude read, create, update, archive, place, search, dry-run, and audit portal resources.

**Architecture:** One `portal-api` Edge Function owns routing, auth, redaction, validation, optimistic concurrency, dry-run behavior, and audit logging. New database support is limited to version columns, `automation_placements`, and `portal_api_audit_log`; existing tables remain the source for automations, process states, flows, pipelines, and sync review items.

**Tech Stack:** Supabase Edge Functions on Deno, Supabase JS v2 service-role client, PostgreSQL migrations, Vitest source/helper tests, existing `automatiseringen`, `process_state`, `flows`, `pipelines`, and `source_sync_change_items` tables.

---

## File Structure

- Create `supabase/migrations/20260817120000_portal_api_v2.sql`: adds API schema support.
- Create `supabase/functions/portal-api/index.ts`: Edge Function entrypoint and HTTP route table.
- Create `supabase/functions/portal-api/helpers.ts`: pure helpers for JSON responses, auth parsing, redaction, allowlists, versions, diffs, and collection patching.
- Create `supabase/functions/portal-api/openapi.ts`: OpenAPI 3.1 document returned by `/v1/openapi.json`.
- Create `src/test/portalApiMigration.test.ts`: source-level migration checks.
- Create `src/test/portalApiSource.test.ts`: source-level route/auth/OpenAPI checks.
- Create `src/test/portalApiHelpers.test.ts`: behavior tests for pure helpers.

## Task 1: Database Support

**Files:**
- Create: `supabase/migrations/20260817120000_portal_api_v2.sql`
- Test: `src/test/portalApiMigration.test.ts`

- [ ] **Step 1: Write the failing migration source test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("portal API v2 migration", () => {
  const source = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260817120000_portal_api_v2.sql"),
    "utf8",
  );

  it("adds version columns to mutable resources", () => {
    expect(source).toContain("ALTER TABLE public.automatiseringen");
    expect(source).toContain("ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 1");
    expect(source).toContain("ALTER TABLE public.process_state");
    expect(source).toContain("ALTER TABLE public.flows");
    expect(source).toContain("ADD COLUMN IF NOT EXISTS api_chain JSONB NOT NULL DEFAULT '[]'");
    expect(source).toContain("ALTER TABLE public.source_sync_change_items");
  });

  it("creates automation placements and audit log tables", () => {
    expect(source).toContain("CREATE TABLE IF NOT EXISTS public.automation_placements");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS public.portal_api_audit_log");
    expect(source).toContain("automation_id TEXT NOT NULL REFERENCES public.automatiseringen(id)");
    expect(source).toContain("pipeline_id TEXT NOT NULL");
    expect(source).toContain("target JSONB NOT NULL");
    expect(source).toContain("diff JSONB NOT NULL DEFAULT '{}'");
  });

  it("uses soft archive fields instead of hard delete support", () => {
    expect(source).toContain("ADD COLUMN IF NOT EXISTS archived_at timestamptz");
    expect(source).toContain("ADD COLUMN IF NOT EXISTS archived_by text");
    expect(source).not.toMatch(/DROP\s+TABLE/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/portalApiMigration.test.ts`

Expected: FAIL because `20260817120000_portal_api_v2.sql` does not exist yet.

- [ ] **Step 3: Add the migration**

```sql
ALTER TABLE public.automatiseringen
  ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by text;

CREATE UNIQUE INDEX IF NOT EXISTS automatiseringen_source_external_unique_idx
  ON public.automatiseringen(source, external_id)
  WHERE source IS NOT NULL AND external_id IS NOT NULL;

ALTER TABLE public.process_state
  ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.flows
  ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS api_chain JSONB NOT NULL DEFAULT '[]';

ALTER TABLE public.source_sync_change_items
  ADD COLUMN IF NOT EXISTS api_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.automation_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id TEXT NOT NULL REFERENCES public.automatiseringen(id) ON DELETE CASCADE,
  pipeline_id TEXT NOT NULL,
  target JSONB NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  placed_by text NOT NULL DEFAULT 'api',
  api_version integer NOT NULL DEFAULT 1,
  CONSTRAINT automation_placements_target_object_check CHECK (jsonb_typeof(target) = 'object')
);

CREATE INDEX IF NOT EXISTS automation_placements_automation_idx
  ON public.automation_placements(automation_id);

CREATE INDEX IF NOT EXISTS automation_placements_pipeline_idx
  ON public.automation_placements(pipeline_id);

CREATE UNIQUE INDEX IF NOT EXISTS automation_placements_unique_target_idx
  ON public.automation_placements(automation_id, pipeline_id, (target->>'type'), (target->>'stepId'), (target->>'arrowId'));

CREATE TABLE IF NOT EXISTS public.portal_api_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  resource_id text NOT NULL,
  action text NOT NULL,
  actor text NOT NULL DEFAULT 'api',
  diff JSONB NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_api_audit_log_resource_idx
  ON public.portal_api_audit_log(resource, resource_id, created_at DESC);

ALTER TABLE public.automation_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_api_audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'automation_placements'
      AND policyname = 'Service role can manage automation placements'
  ) THEN
    CREATE POLICY "Service role can manage automation placements"
      ON public.automation_placements FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'portal_api_audit_log'
      AND policyname = 'Service role can manage portal api audit log'
  ) THEN
    CREATE POLICY "Service role can manage portal api audit log"
      ON public.portal_api_audit_log FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/portalApiMigration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260817120000_portal_api_v2.sql src/test/portalApiMigration.test.ts
git commit -m "Add portal API database support"
```

## Task 2: Pure Gateway Helpers

**Files:**
- Create: `supabase/functions/portal-api/helpers.ts`
- Test: `src/test/portalApiHelpers.test.ts`

- [ ] **Step 1: Write failing helper tests**

```ts
import {
  assertAllowedFields,
  buildJsonResponse,
  computeDiff,
  mergeById,
  parseBearerToken,
  redactSecrets,
  requireVersion,
} from "../../supabase/functions/portal-api/helpers";

describe("portal API helpers", () => {
  it("parses bearer tokens and rejects malformed headers", () => {
    expect(parseBearerToken("Bearer abc")).toBe("abc");
    expect(parseBearerToken("Basic abc")).toBeNull();
    expect(parseBearerToken(null)).toBeNull();
  });

  it("redacts nested secret values and bearer strings", () => {
    expect(redactSecrets({
      safe: "ok",
      token: "secret",
      nested: { Authorization: "Bearer abc.def" },
    })).toEqual({
      safe: "ok",
      token: "[redacted]",
      nested: { Authorization: "[redacted]" },
    });
  });

  it("rejects unknown write fields", () => {
    expect(() => assertAllowedFields({ name: "A", placements: [] }, ["name"])).toThrow("Unknown field: placements");
  });

  it("requires If-Match for mutable routes", () => {
    expect(requireVersion("3")).toBe(3);
    expect(() => requireVersion(null)).toThrow("Missing If-Match header");
  });

  it("merges nested arrays by id without dropping unmentioned items", () => {
    expect(mergeById([{ id: "a", label: "A" }, { id: "b", label: "B" }], [{ id: "b", label: "B2" }]))
      .toEqual([{ id: "a", label: "A" }, { id: "b", label: "B2" }]);
  });

  it("computes a compact before/after diff", () => {
    expect(computeDiff({ name: "Old", status: "active" }, { name: "New", status: "active" }))
      .toEqual({ name: { before: "Old", after: "New" } });
  });

  it("returns stable JSON envelopes", async () => {
    const response = buildJsonResponse({ data: { ok: true } }, 201);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { ok: true } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/portalApiHelpers.test.ts`

Expected: FAIL because helper exports do not exist.

- [ ] **Step 3: Implement helpers**

Create `helpers.ts` with these exported functions:

```ts
export type JsonRecord = Record<string, unknown>;

const SECRET_KEY_PATTERN = /token|authorization|api[_-]?key|password|secret/i;
const BEARER_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function parseBearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactSecrets) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonRecord).map(([key, nested]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactSecrets(nested),
    ])) as T;
  }
  if (typeof value === "string") return value.replace(BEARER_PATTERN, "Bearer [redacted]") as T;
  return value;
}

export function buildJsonResponse(body: JsonRecord, status = 200): Response {
  return new Response(JSON.stringify(redactSecrets(body)), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, if-match, x-actor",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Content-Type": "application/json",
    },
  });
}

export function errorResponse(error: string, code: string, status: number): Response {
  return buildJsonResponse({ error, code }, status);
}

export function assertAllowedFields(body: JsonRecord, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(body)) {
    if (!allowedSet.has(key)) throw new Error(`Unknown field: ${key}`);
  }
}

export function requireVersion(value: string | null): number {
  if (!value) throw new Error("Missing If-Match header");
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) throw new Error("Invalid If-Match header");
  return version;
}

export function mergeById<T extends { id: string }>(current: T[], patch: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of patch) byId.set(item.id, { ...(byId.get(item.id) ?? {} as T), ...item });
  return current.map((item) => byId.get(item.id) ?? item).concat(patch.filter((item) => !current.some((existing) => existing.id === item.id)));
}

export function computeDiff(before: JsonRecord | null, after: JsonRecord | null): JsonRecord {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const diff: JsonRecord = {};
  for (const key of keys) {
    const oldValue = before?.[key];
    const newValue = after?.[key];
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) diff[key] = { before: oldValue ?? null, after: newValue ?? null };
  }
  return diff;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/portalApiHelpers.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/portal-api/helpers.ts src/test/portalApiHelpers.test.ts
git commit -m "Add portal API helper utilities"
```

## Task 3: Gateway Skeleton, Auth, OpenAPI Shell

**Files:**
- Create: `supabase/functions/portal-api/index.ts`
- Create: `supabase/functions/portal-api/openapi.ts`
- Test: `src/test/portalApiSource.test.ts`

- [ ] **Step 1: Write failing source tests**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("portal API source", () => {
  const indexSource = readFileSync(resolve(process.cwd(), "supabase/functions/portal-api/index.ts"), "utf8");
  const openApiSource = readFileSync(resolve(process.cwd(), "supabase/functions/portal-api/openapi.ts"), "utf8");

  it("creates a service-role Supabase client and checks PORTAL_API_KEY", () => {
    expect(indexSource).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(indexSource).toContain("PORTAL_API_KEY");
    expect(indexSource).toContain("parseBearerToken");
  });

  it("contains the v1 route table", () => {
    for (const route of ["/v1/openapi.json", "/v1/automations", "/v1/placements", "/v1/process-states", "/v1/procesreizen", "/v1/sync-review", "/v1/search", "/v1/audit-log"]) {
      expect(indexSource).toContain(route);
    }
  });

  it("exposes OpenAPI 3.1 metadata", () => {
    expect(openApiSource).toContain('"openapi": "3.1.0"');
    expect(openApiSource).toContain("/v1/automations");
    expect(openApiSource).toContain("/v1/placements");
    expect(openApiSource).toContain("If-Match");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/portalApiSource.test.ts`

Expected: FAIL because `portal-api` files do not exist.

- [ ] **Step 3: Implement skeleton**

`openapi.ts` should export `openApiDocument` with `"openapi": "3.1.0"`, bearer auth, `If-Match`, and path entries for every route in the v2 spec. `index.ts` should:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildJsonResponse, errorResponse, parseBearerToken } from "./helpers.ts";
import { openApiDocument } from "./openapi.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return buildJsonResponse({}, 204);

  const apiKey = Deno.env.get("PORTAL_API_KEY") ?? "";
  const token = parseBearerToken(req.headers.get("authorization"));
  if (!apiKey || token !== apiKey) return errorResponse("Unauthorized", "UNAUTHORIZED", 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const actor = req.headers.get("x-actor")?.trim() || "api";

  if (req.method === "GET" && url.pathname === "/v1/openapi.json") {
    return buildJsonResponse({ data: openApiDocument });
  }

  void db;
  void actor;
  return errorResponse("Route not found", "NOT_FOUND", 404);
});
```

- [ ] **Step 4: Run source test**

Run: `npm test -- src/test/portalApiSource.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/portal-api/index.ts supabase/functions/portal-api/openapi.ts src/test/portalApiSource.test.ts
git commit -m "Add portal API gateway skeleton"
```

## Task 4: Automation Routes

**Files:**
- Modify: `supabase/functions/portal-api/index.ts`
- Modify: `supabase/functions/portal-api/openapi.ts`
- Test: `src/test/portalApiSource.test.ts`
- Test: `src/test/portalApiHelpers.test.ts`

- [ ] **Step 1: Add failing source expectations**

Extend `portalApiSource.test.ts`:

```ts
it("implements automation route handlers and field guards", () => {
  expect(indexSource).toContain("AUTOMATION_WRITE_FIELDS");
  expect(indexSource).toContain("handleListAutomations");
  expect(indexSource).toContain("handleGetAutomation");
  expect(indexSource).toContain("handleUpsertAutomation");
  expect(indexSource).toContain("handlePatchAutomation");
  expect(indexSource).toContain("handleArchiveAutomation");
  expect(indexSource).toContain("handleRestoreAutomation");
  expect(indexSource).toContain("handleBulkPatchAutomations");
  expect(indexSource).toContain("automation_placements");
  expect(indexSource).toContain("api_version");
  expect(indexSource).toContain("archived_at");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/portalApiSource.test.ts`

Expected: FAIL until handlers exist.

- [ ] **Step 3: Implement automation mapping and handlers**

Add an `AUTOMATION_WRITE_FIELDS` allowlist for `name`, `goal`, `trigger`, `actions`, `systems`, `dependencies`, `owner`, `status`, `category`, `link`, `phaseData`, and `importMetadata`. Map these to existing columns: `naam`, `doel`, `trigger_beschrijving`, `stappen`/metadata JSON, `systemen`, `afhankelijkheden`, `owner`, `status`, `categorie`, `link`, and import metadata fields already used in `automatiseringen`.

Implement:

- `GET /v1/automations` with filters and pagination envelope.
- `GET /v1/automations/:id` including derived placements.
- `POST /v1/automations` as upsert by `(source, external_id)`.
- `PATCH /v1/automations/:id` with `If-Match`.
- `DELETE /v1/automations/:id` as archive, checking placements and supporting `force=true`.
- `POST /v1/automations/:id/restore`.
- `PATCH /v1/automations/bulk` with per-item result.

Each write increments `api_version`, writes `updated_at` if the table has it, supports `dryRun`, and calls the audit helper from Task 7 once that helper exists. Until Task 7, include a local `recordAudit` no-op with the same signature so routes compile.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/test/portalApiSource.test.ts src/test/portalApiHelpers.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/portal-api/index.ts supabase/functions/portal-api/openapi.ts src/test/portalApiSource.test.ts src/test/portalApiHelpers.test.ts
git commit -m "Add portal API automation routes"
```

## Task 5: Placement and Process-State Routes

**Files:**
- Modify: `supabase/functions/portal-api/index.ts`
- Modify: `supabase/functions/portal-api/openapi.ts`
- Test: `src/test/portalApiSource.test.ts`
- Test: `src/test/portalApiHelpers.test.ts`

- [ ] **Step 1: Add failing expectations**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/portalApiSource.test.ts`

Expected: FAIL until handlers exist.

- [ ] **Step 3: Implement placement routes**

Implement placement target validation:

```ts
function validatePlacementTarget(target: unknown): asserts target is { type: "step" | "arrow" | "syncBlock"; stepId?: string; arrowId?: string } {
  if (!target || typeof target !== "object") throw new Error("Invalid placement target");
  const type = (target as Record<string, unknown>).type;
  if (type !== "step" && type !== "arrow" && type !== "syncBlock") throw new Error("Invalid placement target type");
  if (type === "step" && typeof (target as Record<string, unknown>).stepId !== "string") throw new Error("stepId is required");
  if (type === "arrow" && typeof (target as Record<string, unknown>).arrowId !== "string") throw new Error("arrowId is required");
}
```

Validate `stepId` against `process_state.steps[].id`, and `arrowId` against `process_state.connections[].id`. Implement `GET`, `POST`, `PATCH`, `DELETE`, and bulk `POST` with `If-Match` for `PATCH`/`DELETE`.

- [ ] **Step 4: Implement process-state routes**

`GET /v1/process-states/:pipelineId` returns existing `process_state` columns plus `automationPlacements` from `automation_placements`.

`PATCH /v1/process-states/:pipelineId` rejects `automationPlacements`, requires `If-Match`, merges `steps`, `connections`, and `lanes` arrays by `id`, replaces scalar JSON fields from the patch, increments `api_version`, and supports `dryRun`.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/test/portalApiSource.test.ts src/test/portalApiHelpers.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/portal-api/index.ts supabase/functions/portal-api/openapi.ts src/test/portalApiSource.test.ts src/test/portalApiHelpers.test.ts
git commit -m "Add portal API placement and process-state routes"
```

## Task 6: Procesreizen, Sync Review, Search

**Files:**
- Modify: `supabase/functions/portal-api/index.ts`
- Modify: `supabase/functions/portal-api/openapi.ts`
- Test: `src/test/portalApiSource.test.ts`

- [ ] **Step 1: Add failing route expectations**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/portalApiSource.test.ts`

Expected: FAIL until handlers exist.

- [ ] **Step 3: Implement procesreizen routes using `flows`**

Map `flows` to API procesreizen:

- `id`: `flows.id`
- `name`: `flows.naam`
- `systems`: `flows.systemen`
- `automationIds`: `flows.automation_ids`
- `version`: `flows.api_version`

`PATCH /v1/procesreizen/:id` accepts `name`, `description`, `systems`, `automationIds`, and `chain`. Store `chain` in the `flows.api_chain` JSONB column added in Task 1, and return it as the API `chain` field.

- [ ] **Step 4: Implement sync review routes**

Use `source_sync_change_items` for list/detail. `PATCH` only accepts `status` changes to `skipped`, `selected`, or `unselected` and selected flag updates where supported by existing columns. Require `If-Match`, increment `api_version`, and support `dryRun`.

- [ ] **Step 5: Implement search route**

Search automations, pipelines, flows/procesreizen, process states by pipeline id, and sync review items. Return compact objects:

```ts
{ type: "automation", id: row.id, title: row.naam, summary: row.doel, url: `/v1/automations/${row.id}` }
```

- [ ] **Step 6: Run tests**

Run: `npm test -- src/test/portalApiSource.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/portal-api/index.ts supabase/functions/portal-api/openapi.ts src/test/portalApiSource.test.ts
git commit -m "Add portal API journey review and search routes"
```

## Task 7: Audit Log and Dry-Run Enforcement

**Files:**
- Modify: `supabase/functions/portal-api/index.ts`
- Modify: `supabase/functions/portal-api/helpers.ts`
- Test: `src/test/portalApiHelpers.test.ts`
- Test: `src/test/portalApiSource.test.ts`

- [ ] **Step 1: Add failing tests**

Add helper tests:

```ts
import { buildDryRunPayload } from "../../supabase/functions/portal-api/helpers";

it("builds dry-run payloads with a diff and no committed flag", () => {
  expect(buildDryRunPayload({ name: "Old" }, { name: "New" })).toEqual({
    dryRun: true,
    wouldChange: { name: { before: "Old", after: "New" } },
  });
});
```

Add source expectation:

```ts
it("records audit entries for every write route", () => {
  expect(indexSource).toContain("recordAuditEntry");
  expect(indexSource).toContain("portal_api_audit_log");
  expect(indexSource).toContain("x-actor");
  expect(indexSource).toContain("dryRun");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/test/portalApiHelpers.test.ts src/test/portalApiSource.test.ts`

Expected: FAIL until helper and audit implementation exist.

- [ ] **Step 3: Implement dry-run helper**

```ts
export function buildDryRunPayload(before: JsonRecord | null, after: JsonRecord | null): JsonRecord {
  return { dryRun: true, wouldChange: computeDiff(before, after) };
}
```

- [ ] **Step 4: Implement audit helper in `index.ts`**

```ts
async function recordAuditEntry(db: SupabaseClient, input: {
  resource: string;
  resourceId: string;
  action: string;
  actor: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const { error } = await db.from("portal_api_audit_log").insert({
    resource: input.resource,
    resource_id: input.resourceId,
    action: input.action,
    actor: input.actor,
    diff: computeDiff(input.before, input.after),
  });
  if (error) throw error;
}
```

Call it after every committed write and skip it when `dryRun=true`.

- [ ] **Step 5: Implement audit-log route**

`GET /v1/audit-log` filters by `resource`, `resourceId`, `actor`, `since`, `until`, `limit`, and `offset`, returning the list envelope.

- [ ] **Step 6: Run tests**

Run: `npm test -- src/test/portalApiHelpers.test.ts src/test/portalApiSource.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/portal-api/index.ts supabase/functions/portal-api/helpers.ts src/test/portalApiHelpers.test.ts src/test/portalApiSource.test.ts
git commit -m "Add portal API audit and dry-run support"
```

## Task 8: OpenAPI Completeness and Final Verification

**Files:**
- Modify: `supabase/functions/portal-api/openapi.ts`
- Test: `src/test/portalApiSource.test.ts`

- [ ] **Step 1: Add failing OpenAPI coverage test**

```ts
it("OpenAPI lists every shipped v2 route", () => {
  for (const path of [
    "/v1/openapi.json",
    "/v1/automations",
    "/v1/automations/{id}",
    "/v1/automations/{id}/restore",
    "/v1/automations/bulk",
    "/v1/placements",
    "/v1/placements/{id}",
    "/v1/placements/bulk",
    "/v1/pipelines",
    "/v1/process-states/{pipelineId}",
    "/v1/procesreizen",
    "/v1/procesreizen/{id}",
    "/v1/sync-review",
    "/v1/sync-review/{id}",
    "/v1/search",
    "/v1/audit-log",
  ]) {
    expect(openApiSource).toContain(path);
  }
});
```

- [ ] **Step 2: Run test to verify it fails if any path is missing**

Run: `npm test -- src/test/portalApiSource.test.ts`

Expected: FAIL if the OpenAPI doc is incomplete.

- [ ] **Step 3: Complete OpenAPI schemas**

Add OpenAPI schemas for:

- `Automation`
- `Placement`
- `ProcessState`
- `Procesreis`
- `SyncReviewItem`
- `AuditLogEntry`
- `ErrorEnvelope`
- `ListMeta`

Include bearer auth, `X-Actor`, `If-Match`, `dryRun`, `force`, pagination, and route query parameters.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/test/portalApiMigration.test.ts src/test/portalApiHelpers.test.ts src/test/portalApiSource.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `npm test -- src/test/portalApiMigration.test.ts src/test/portalApiHelpers.test.ts src/test/portalApiSource.test.ts`

Expected: PASS with no failed tests. If runtime TypeScript checking is available through the existing build, also run `npm run build` and expect a successful production build.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/portal-api/openapi.ts src/test/portalApiSource.test.ts
git commit -m "Complete portal API OpenAPI coverage"
```

## Self-Review

- Spec coverage: The tasks cover API key auth, response envelopes, OpenAPI self-description, optimistic concurrency, dry-run, automation CRUD/archive/restore/bulk, placements, pipelines, process states, procesreizen, sync review, search, audit log, redaction, allowlists, and no hard deletes.
- Scope note: This is a large single API surface, but it is one coherent subsystem because the gateway-level concerns must be implemented consistently across every route.
- Type consistency: The plan consistently uses `api_version` in database rows and `version` in API responses; `automation_placements` is the only write path for canvas placement; `flows` backs procesreizen.
