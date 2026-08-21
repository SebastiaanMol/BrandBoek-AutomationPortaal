# Portal REST API for Claude Integration (v2)

## Goal

Expose a stable REST API that lets Claude inspect, analyze, create, update, and archive portal data without direct database access and without depending on browser automation. One Supabase Edge Function acts as an API gateway so authentication, validation, redaction, concurrency control, and audit logging stay consistent across every route.

This version supersedes the original draft. The main changes: automation-to-canvas linking is now a single first-class resource instead of living in two places, every mutable resource supports optimistic concurrency, writes support a dry-run mode, archival (soft delete) is now in scope, and the API describes itself so Claude does not need to be told its shape by hand.

Hard deletes and irreversible bulk operations remain out of scope.

## Architecture

One Edge Function:

```text
supabase/functions/portal-api/index.ts
```

The function routes requests by method and pathname under `/v1`. It uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` internally. External clients authenticate with a separate `PORTAL_API_KEY` environment variable.

This is deliberately a plain REST API, not an MCP server. It is designed so a thin MCP wrapper could be layered on top later without changing the underlying data model, but that is not part of this version.

## Authentication

Clients send:

```text
Authorization: Bearer <PORTAL_API_KEY>
```

Optionally, clients identify themselves for audit purposes:

```text
X-Actor: claude-cowork
```

If `X-Actor` is omitted, the audit log records the actor as `api`. Requests with a missing or invalid key return `401`. The API key is never returned in responses or logs.

## Response Envelope

Single-resource success:

```json
{ "data": {} }
```

List success:

```json
{ "data": [], "meta": { "total": 0, "limit": 50, "offset": 0, "hasMore": false } }
```

Error:

```json
{ "error": "Human readable message", "code": "VALIDATION_ERROR" }
```

`code` is a stable machine-readable string, such as `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, or `UNAUTHORIZED`, so a calling agent can branch on it without parsing prose.

## Self-Description

```text
GET /v1/openapi.json
```

Returns a complete OpenAPI 3.1 document covering every route, field, and enum in this spec. Claude fetches this once per session instead of needing the API's shape explained in chat. This document must be kept in sync with the implementation: a route or field not reflected here does not count as shipped.

## Concurrency Control

Every mutable resource - automations, placements, process states, procesreizen, and sync review items - carries a `version` integer, returned on every `GET`.

Writes (`PATCH`, `DELETE`) must include:

```text
If-Match: <version>
```

If the current version does not match, the API returns `409 Conflict` with the current record, including its current `version`, in `data`, so the caller can re-fetch and retry rather than silently overwriting a concurrent change. This includes changes made by a human editing the same pipeline in the portal UI at the same time.

## Dry Run

Any `POST`, `PATCH`, or `DELETE` accepts `?dryRun=true`. The request runs full validation and computes the resulting change, but does not commit it. The response has the same shape as a normal write response, with an added `"dryRun": true` field and, where relevant, a `"wouldChange"` diff. Implementations must run this inside a transaction that is rolled back, not by skipping validation logic.

## Routes

### Automations

```text
GET    /v1/automations
GET    /v1/automations/:id
POST   /v1/automations
PATCH  /v1/automations/:id
DELETE /v1/automations/:id
POST   /v1/automations/:id/restore
PATCH  /v1/automations/bulk
```

`GET /v1/automations` supports:

- `source`: `HubSpot | GitLab | Zapier | Typeform | Manual`
- `status`: `active | inactive | archived`
- `placed`: `true | false`; filters on whether the automation has at least one row in the placements table. This directly answers "which active automations are not yet represented anywhere in the portal" in one call.
- `q`: free-text search over name/goal
- `limit`, `offset`

An automation object returned by `GET` includes both writable fields and read-only enrichment:

```json
{
  "id": "auto-081",
  "externalId": "149350723",
  "source": "HubSpot",
  "name": "Afspraak gemist 2",
  "status": "active",
  "goal": "...",
  "trigger": { "type": "Contact-based", "criteria": [] },
  "actions": [],
  "systems": ["HubSpot"],
  "dependencies": [],
  "owner": null,
  "category": "deal eigenschap",
  "link": "https://app.hubspot.com/workflows/.../edit",
  "phaseData": {},
  "importMetadata": {},
  "usedProperties": ["hs_meeting_outcome", "hs_call_disposition"],
  "enrollment": { "total": 94, "last7d": 7, "lastRun": null },
  "qualityScore": "Procesreis-klaar",
  "issues": ["Runtime metrics ontbreken", "Field mappings ontbreken"],
  "placements": [
    { "placementId": "pl-123", "pipelineId": "sales-pipeline", "target": { "type": "syncBlock" }, "placedAt": "...", "placedBy": "claude-cowork" }
  ],
  "version": 3,
  "createdAt": "...",
  "updatedAt": "...",
  "archivedAt": null
}
```

`placements` is always derived from the placements table. It is never written directly through this endpoint. Attempting to set `placements` or `placementMetadata` in a `POST`/`PATCH` body returns `400`.

`POST` upserts by the composite key `(source, externalId)`, so re-syncing an already-known automation updates it instead of creating a duplicate. `POST` and `PATCH` accept only allowlisted writable fields: `name`, `goal`, `trigger`, `actions`, `systems`, `dependencies`, `owner`, `status` (`active`/`inactive` only, not `archived`), `category`, `link`, `phaseData`, `importMetadata`. Unknown fields return `400`.

`DELETE /v1/automations/:id` archives the automation (`status: archived`, `archivedAt` set) rather than removing the row. If the automation has active placements, `DELETE` returns `409` unless called with `?force=true`, in which case its placements are removed in the same transaction. `POST /v1/automations/:id/restore` reverses an archive.

`PATCH /v1/automations/bulk` accepts an array of `{ "id": "...", "version": N, "patch": {...} }` and processes each item independently, returning a per-item result so one invalid item does not block the rest:

```json
{ "data": { "succeeded": ["auto-1"], "failed": [{ "id": "auto-2", "error": "..." }] } }
```

### Placements

The single write path for "which automation is linked to which pipeline, and where." This resolves the ambiguity in the original draft where placement lived both on the automation and inside process-state.

```text
GET    /v1/placements
POST   /v1/placements
PATCH  /v1/placements/:id
DELETE /v1/placements/:id
POST   /v1/placements/bulk
```

`GET /v1/placements` supports `automationId`, `pipelineId`, and `type` (`step | arrow | syncBlock`) filters. This gives direct reverse lookup: every pipeline this automation touches, or everything placed on this pipeline, without fetching every process-state and searching client-side.

```json
{
  "automationId": "auto-081",
  "pipelineId": "sales-pipeline",
  "target": { "type": "step", "stepId": "step-geen-gehoor-1" }
}
```

`target.type` is one of `step`, `arrow`, or `syncBlock`; `stepId` or `arrowId` is required accordingly and validated against the pipeline's current process state. `PATCH` can move a placement to a new target without a delete-then-create. `POST /v1/placements/bulk` accepts an array, uses the same per-item result shape as automation bulk patch, and supports `dryRun`.

`GET /v1/automations/:id` (its `placements` field) and `GET /v1/process-states/:pipelineId` (its `automationPlacements` field) are both read views computed from this table. Neither accepts direct writes to that field.

### Pipelines

```text
GET /v1/pipelines
```

Read-only synced pipeline and stage metadata. HubSpot remains the source of truth for pipeline/stage definitions; this API does not write them.

### Process States

```text
GET   /v1/process-states/:pipelineId
PATCH /v1/process-states/:pipelineId
```

Returns and updates the saved canvas: steps, connections, lanes, custom lanes, manual blocks, attachments, artifacts, flow links, and process actions, plus a read-only `automationPlacements` array derived from the placements table.

`PATCH` accepts a partial patch. Nested collections (`steps`, `connections`, `lanes`) are upserted by `id`, not replaced wholesale. Sending one changed step must not require resending the entire canvas, and must not silently drop steps or connections the caller did not mention. `automationPlacements` in the patch body returns `400`; placements are managed exclusively through `/v1/placements`.

### Procesreizen (Process Journeys)

This is added because procesreizen are a distinct data model already in use: currently 24 journeys chaining automations across HubSpot, GitLab, Zapier, and Typeform.

```text
GET   /v1/procesreizen
GET   /v1/procesreizen/:id
PATCH /v1/procesreizen/:id
```

```json
{
  "id": "pr-01",
  "name": "VPB procesreis: VA VPB ingediend -> VPB deal property aanpassen",
  "category": "deal eigenschap",
  "status": "active",
  "sources": ["HubSpot", "GitLab"],
  "automationIds": ["auto-014", "auto-091"],
  "chain": [{ "step": "trigger", "automationId": "auto-014" }, { "step": "action", "automationId": "auto-091" }],
  "issues": [],
  "version": 1
}
```

`automationIds`/`chain` order matters here because it represents a sequence, so unlike placements this stays a plain ordered array on the resource itself rather than a separate join table.

### Sync Review

```text
GET   /v1/sync-review
GET   /v1/sync-review/:id
PATCH /v1/sync-review/:id
```

`GET /v1/sync-review` returns pending or failed sync review items with optional `source`, `status`, `type`, and `q` filters. `GET /v1/sync-review/:id` returns a single item's full detail. `PATCH` allows limited status transitions, such as `skipped`, `selected`, or `unselected`, and supports `dryRun`. Applying an actual source sync remains the job of the existing source-sync functions, not this route.

### Search

```text
GET /v1/search?q=...&types=automation,pipeline,processState,procesreis,syncReview
```

Returns a compact mixed list. Each result has `type`, `id`, `title`, `summary`, and a route-specific API URL for follow-up.

### Audit Log

Added so it is always traceable whether a change came from a human in the portal UI or from an API caller, which matters once Claude can write directly.

```text
GET /v1/audit-log
```

Filters: `resource` (`automation | placement | processState | procesreis | syncReview`), `resourceId`, `actor`, `since`, `until`, `limit`, `offset`.

```json
{
  "id": "log-1",
  "resource": "placement",
  "resourceId": "pl-123",
  "action": "create",
  "actor": "claude-cowork",
  "diff": { "before": null, "after": { "automationId": "auto-081", "pipelineId": "sales-pipeline" } },
  "timestamp": "..."
}
```

Every write route appends an entry automatically. This is a cross-cutting requirement enforced once in the gateway, not per-route. `diff` is subject to the same redaction rules as every other response.

## Data Safety

The API must redact secrets and credentials from all responses, including audit log diffs. Redaction applies to fields and nested JSON keys matching common secret names, including token, access token, refresh token, authorization, api key, password, secret, and bearer values.

Writes use allowlists rather than passing request bodies directly into Supabase. Unknown fields return `400`. Invalid JSON returns `400`. Unsupported routes return `404`. Unsupported methods return `405`. Stale `If-Match` returns `409`.

## Testing

Add tests before implementation for:

- Missing and invalid API key return `401`.
- Unknown route returns `404`; unsupported method returns `405`.
- `GET /v1/automations` respects `source`, `status`, `placed`, `q`, and pagination `meta`.
- `GET /v1/automations/:id` includes a `placements` array that reflects the current placements table, and redacts secrets.
- `POST /v1/automations` rejects unknown fields and upserts correctly on repeated `(source, externalId)`.
- `PATCH /v1/automations/:id` writes only allowlisted fields and rejects a `placements`/`placementMetadata` field with `400`.
- `PATCH` with a stale `If-Match` version returns `409` with the current version.
- `DELETE /v1/automations/:id` returns `409` when active placements exist and `force` is not set; succeeds and cascades when `force=true`.
- `POST /v1/automations/:id/restore` un-archives correctly.
- `PATCH /v1/automations/bulk` reports per-item success/failure without failing the whole batch on one bad item.
- `POST /v1/placements` validates `target` against the pipeline's current steps/arrows and is reflected in both the automation's `placements` and the pipeline's `automationPlacements`.
- `PATCH /v1/process-states/:pipelineId` upserts nested collections by id without dropping unmentioned steps/connections, and rejects a direct `automationPlacements` write.
- `?dryRun=true` on a placement or process-state write returns the would-be diff and persists nothing.
- `GET /v1/procesreizen` and `GET /v1/procesreizen/:id` return the expected shape.
- `GET /v1/sync-review/:id` returns single-item detail; `PATCH` only allows approved status transitions.
- `GET /v1/search` returns a mixed, correctly typed result set across all five resource types.
- `GET /v1/audit-log` returns entries after a write, correctly filtered and redacted.
- `GET /v1/openapi.json` returns a valid OpenAPI document covering every route in this spec.

Source-level tests should verify `portal-api/index.ts` contains the route table, auth check, redaction helper, concurrency check, and service-role client creation. Behavior tests should cover pure helpers (redaction, allowlist filtering, diff computation) where possible to avoid requiring a live Supabase instance.

## Non-Goals

- No hard deletes anywhere. `DELETE` always means archive; history is not permanently erased in this version.
- No direct exposure of Supabase credentials.
- No direct HubSpot mutation through this API. HubSpot and pipeline/stage definitions remain read-only here.
- No public unauthenticated routes.
- No schema-free JSON passthrough writes. Every write goes through an allowlist.
- No multi-key or per-caller permission system in v1. A single shared bearer token plus the optional `X-Actor` header for audit attribution is sufficient for now; a real multi-tenant auth model is a deliberate later phase if more integrations need distinct permissions.
