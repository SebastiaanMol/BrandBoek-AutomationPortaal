export const openApiDocument = {
  "openapi": "3.1.0",
  info: {
    title: "Automation Navigator Portal API",
    version: "2.0.0",
  },
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Bearer token checked against the PORTAL_API_KEY secret.",
      },
    },
    parameters: {
      IfMatch: {
        name: "If-Match",
        in: "header",
        required: true,
        schema: { type: "string" },
        description: "Optimistic concurrency version for write operations.",
      },
      Id: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      PipelineId: {
        name: "pipelineId",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
      XActor: {
        name: "X-Actor",
        in: "header",
        required: false,
        schema: { type: "string" },
        description: "Attributed actor recorded on the audit log entry for this write. Defaults to \"api\" when omitted. The runtime reads this header case-insensitively.",
      },
      DryRun: {
        name: "dryRun",
        in: "query",
        required: false,
        schema: { type: "boolean" },
        description: "Run full validation and compute the result without committing it. No audit log entry is recorded for a dry run.",
      },
      Force: {
        name: "force",
        in: "query",
        required: false,
        schema: { type: "boolean" },
        description: "Only used by DELETE /v1/automations/{id}. When true, cascade-removes active placements for the automation in the same transaction as the archive.",
      },
      Limit: {
        name: "limit",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        description: "Maximum rows to return. Defaults to 50 and is clamped to the range 1-200.",
      },
      Offset: {
        name: "offset",
        in: "query",
        required: false,
        schema: { type: "integer", minimum: 0, default: 0 },
        description: "Rows to skip for pagination. Defaults to 0.",
      },
      Q: {
        name: "q",
        in: "query",
        required: false,
        schema: { type: "string" },
        description: "Free-text search term. Optional on list routes (automations, procesreizen, sync-review); required on /v1/search.",
      },
    },
    schemas: {
      ErrorEnvelope: {
        type: "object",
        description:
          "Uniform error shape returned by every non-2xx response. code is a stable machine-readable string, e.g. UNAUTHORIZED, NOT_FOUND, VERSION_CONFLICT, ACTIVE_PLACEMENTS, DUPLICATE_PLACEMENT, AUTOMATION_ARCHIVED, BAD_REQUEST, NOT_IMPLEMENTED, METHOD_NOT_ALLOWED, SERVER_CONFIG_ERROR (illustrative, not exhaustive). data is present on most 409 conflict responses and carries the current record so the caller can retry against fresh state; it is absent on most other errors.",
        properties: {
          error: { type: "string", description: "Human-readable error message." },
          code: { type: "string", description: "Stable machine-readable error code." },
          data: { type: "object", additionalProperties: true, description: "Present on version-conflict and similar responses; carries the current server-side record." },
        },
        required: ["error", "code"],
      },
      ListMeta: {
        type: "object",
        description: "Pagination metadata attached to every list route response except /v1/search, which uses its own shape (see SearchMeta).",
        properties: {
          total: { type: "integer", description: "Total matching rows across the whole collection, not just this page." },
          limit: { type: "integer" },
          offset: { type: "integer" },
          hasMore: { type: "boolean", description: "True when offset + this page's row count is less than total." },
        },
        required: ["total", "limit", "offset", "hasMore"],
      },
      SearchMeta: {
        type: "object",
        description: "Pagination metadata specific to /v1/search. Deliberately different from ListMeta: no offset (there is no cross-type offset paging over the merged result set), and returned reports how many rows came back for the accurate combined total.",
        properties: {
          total: { type: "integer", description: "Accurate combined total across all selected result types." },
          limit: { type: "integer", description: "Limit applied per selected type, not to the merged list." },
          returned: { type: "integer", description: "Number of results actually returned in this response." },
          hasMore: { type: "boolean" },
        },
        required: ["total", "limit", "returned", "hasMore"],
      },
      PlacementTarget: {
        type: "object",
        description: "Where in a pipeline's process state an automation is placed.",
        properties: {
          type: { type: "string", enum: ["step", "arrow", "syncBlock"] },
          stepId: { type: "string", description: "Required when type is \"step\"." },
          arrowId: { type: "string", description: "Required when type is \"arrow\"." },
        },
        required: ["type"],
      },
      Placement: {
        type: "object",
        description: "An active link between an automation and a spot (step, arrow, or sync block) in a pipeline's process state.",
        properties: {
          id: { type: "string" },
          automationId: { type: "string" },
          pipelineId: { type: "string" },
          target: { $ref: "#/components/schemas/PlacementTarget" },
          createdAt: { type: ["string", "null"], format: "date-time" },
          updatedAt: { type: ["string", "null"], format: "date-time" },
          placedBy: { type: ["string", "null"] },
          version: { type: "integer", description: "api_version; required as If-Match on subsequent writes." },
        },
        required: ["id", "automationId", "pipelineId", "target", "version"],
      },
      Automation: {
        type: "object",
        description: "A registered automation. Placements are managed through the placement routes, not through this resource's write path.",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          goal: { type: ["string", "null"] },
          trigger: { type: ["string", "null"] },
          actions: { type: "array", items: { type: "object", additionalProperties: true } },
          systems: { type: "array", items: { type: "string" } },
          dependencies: { type: ["string", "null"] },
          owner: { type: ["string", "null"] },
          status: { type: "string", enum: ["active", "inactive"] },
          category: { type: ["string", "null"] },
          link: { type: ["string", "null"] },
          source: { type: ["string", "null"] },
          externalId: { type: ["string", "null"] },
          phaseData: { type: "array", items: { type: "object", additionalProperties: true } },
          importMetadata: { type: ["object", "null"], additionalProperties: true },
          version: { type: "integer", description: "api_version; required as If-Match on subsequent writes." },
          archivedAt: { type: ["string", "null"], format: "date-time" },
          archivedBy: { type: ["string", "null"] },
          createdAt: { type: ["string", "null"], format: "date-time" },
          updatedAt: { type: ["string", "null"], format: "date-time" },
          aiEnrichment: { type: ["object", "null"], additionalProperties: true },
          reviewerOverrides: { type: ["object", "null"], additionalProperties: true },
          endpoints: { type: "array", items: { type: "object", additionalProperties: true } },
          webhookPaths: { type: "array", items: { type: "string" } },
          pipelineId: { type: ["string", "null"] },
          stageId: { type: ["string", "null"] },
          placements: { type: "array", items: { $ref: "#/components/schemas/Placement" } },
        },
        required: ["id", "name", "status", "version"],
      },
      ProcessState: {
        type: "object",
        description: "The saved canvas state for a pipeline: steps, connections, lanes, and derived read-only placement info.",
        properties: {
          pipelineId: { type: "string" },
          steps: { type: "array", items: { type: "object", additionalProperties: true } },
          connections: { type: "array", items: { type: "object", additionalProperties: true } },
          autoLinks: { type: "object", additionalProperties: true },
          flowLinks: {
            type: "object",
            description: "Procesreis (flow) placements on the canvas, keyed by flow id. Same shape as autoLinks/CanvasPlacement: {kind:\"step\", stepId} | {kind:\"connection\", fromStepId, toStepId} | {kind:\"pipeline_wide\"}.",
            additionalProperties: true,
          },
          parkedSteps: { type: "array", items: { type: "object", additionalProperties: true } },
          activeLanes: { type: ["object", "array", "null"], additionalProperties: true },
          lanes: {
            type: "array",
            description: "Merged by \"key\", not \"id\", when patched.",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                bg: { type: "string" },
                stroke: { type: "string" },
                text: { type: "string" },
                dot: { type: "string" },
              },
              required: ["key"],
            },
          },
          artifacts: { type: "array", items: { type: "object", additionalProperties: true } },
          manualStatus: { type: ["string", "null"] },
          updatedAt: { type: ["string", "null"], format: "date-time" },
          version: { type: "integer", description: "api_version; required as If-Match on subsequent writes." },
          automationPlacements: {
            type: "array",
            description: "Read-only. Derived from automation_placements for this pipeline; direct writes to this field are rejected.",
            items: { $ref: "#/components/schemas/Placement" },
          },
        },
        required: ["pipelineId", "version"],
      },
      Procesreis: {
        type: "object",
        description:
          "A process journey, backed by the flows table. Note: unlike the master design spec's example JSON, this resource has no category, status, sources, or issues fields — the flows table has no backing columns for those, and this is a deliberate, already-reviewed scope narrowing, not an omission.",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          systems: { type: "array", items: { type: "string" } },
          automationIds: { type: "array", items: { type: "string" } },
          chain: {
            type: "array",
            description: "Opaque ordered JSON stored in and returned verbatim from flows.api_chain. Not validated or reshaped by this API.",
            items: { type: "object", additionalProperties: true },
          },
          version: { type: "integer", description: "api_version; required as If-Match on subsequent writes." },
          createdAt: { type: ["string", "null"], format: "date-time" },
          updatedAt: { type: ["string", "null"], format: "date-time" },
        },
        required: ["id", "name", "version"],
      },
      SyncReviewItem: {
        type: "object",
        description:
          "A pending or resolved item surfaced by a source sync run, backed by source_sync_change_items. The read-side status enum below is different from the write-side PATCH body enum (see SyncReviewItemPatch) — do not conflate the two.",
        properties: {
          id: { type: "string" },
          syncRunId: { type: "string" },
          source: { type: "string" },
          externalId: { type: ["string", "null"] },
          automationId: { type: ["string", "null"] },
          type: {
            type: "string",
            enum: ["new_automation", "metadata_changed", "route_changed", "source_data_incomplete", "source_missing", "legacy_gitlab_record"],
          },
          status: {
            type: "string",
            description: "Read-side status.",
            enum: ["pending", "applied", "skipped", "failed", "superseded"],
          },
          selected: { type: "boolean" },
          title: { type: "string" },
          summary: { type: ["string", "null"] },
          impact: { type: ["string", "null"] },
          oldValue: { type: ["object", "null"], additionalProperties: true },
          newValue: { type: ["object", "null"], additionalProperties: true },
          payload: { type: ["object", "null"], additionalProperties: true },
          appliedAt: { type: ["string", "null"], format: "date-time" },
          skippedAt: { type: ["string", "null"], format: "date-time" },
          errorMessage: { type: ["string", "null"] },
          reviewKey: { type: ["string", "null"] },
          createdAt: { type: ["string", "null"], format: "date-time" },
          updatedAt: { type: ["string", "null"], format: "date-time" },
          version: { type: "integer", description: "api_version; required as If-Match on subsequent writes." },
        },
        required: ["id", "source", "type", "status", "title", "version"],
      },
      SyncReviewItemPatch: {
        type: "object",
        description:
          "PATCH /v1/sync-review/{id} request body. Write-side status enum, distinct from SyncReviewItem's read-side status. \"skipped\" sets status to skipped and records skippedAt; \"selected\"/\"unselected\" toggle the selected flag without touching status. Applying an actual source sync remains the job of the existing source-sync functions.",
        properties: {
          status: { type: "string", enum: ["skipped", "selected", "unselected"] },
        },
        required: ["status"],
      },
      AutomationWrite: {
        type: "object",
        description:
          "POST /v1/automations request body. Only these fields plus source and externalId are accepted; any other field (including read-only Automation fields like id, version, archivedAt, or placements) is rejected with an \"Unknown field\" error. source and externalId are required and identify the upsert target; the remaining fields mirror a subset of Automation's writable properties.",
        properties: {
          source: { type: "string" },
          externalId: { type: "string" },
          name: { type: "string" },
          goal: { type: ["string", "null"] },
          trigger: { type: ["string", "null"] },
          actions: { type: "array", items: { type: "object", additionalProperties: true } },
          systems: { type: "array", items: { type: "string" } },
          dependencies: { type: ["string", "null"] },
          owner: { type: ["string", "null"] },
          status: { type: "string", enum: ["active", "inactive"] },
          category: { type: ["string", "null"] },
          link: { type: ["string", "null"] },
          phaseData: { type: "array", items: { type: "object", additionalProperties: true } },
          importMetadata: { type: ["object", "null"], additionalProperties: true },
        },
        required: ["source", "externalId"],
      },
      AuditLogEntry: {
        type: "object",
        description: "An immutable audit log row backed by portal_api_audit_log. Every committed write route (never a dryRun) appends one automatically.",
        properties: {
          id: { type: "string" },
          resource: { type: "string" },
          resourceId: { type: ["string", "null"] },
          action: { type: "string" },
          actor: { type: "string" },
          diff: { type: "object", additionalProperties: true, description: "Redacted the same as every other response." },
          timestamp: { type: "string", format: "date-time" },
        },
        required: ["id", "resource", "action", "actor", "timestamp"],
      },
    },
  },
  paths: {
    "/v1/openapi.json": {
      get: {
        summary: "Return the Portal API OpenAPI document.",
        description: "Still requires the bearer token like every other route; it is only served before the Supabase database config is checked, so it stays available even if the database is misconfigured.",
        responses: { "200": { description: "OpenAPI document." } },
      },
    },
    "/v1/automations": {
      get: {
        summary: "List automations.",
        description: "Supports source, status, placed, q, limit, and offset query parameters.",
        parameters: [
          { $ref: "#/components/parameters/Q" },
          { $ref: "#/components/parameters/Limit" },
          { $ref: "#/components/parameters/Offset" },
        ],
        responses: {
          "200": {
            description: "Automation list envelope with pagination metadata.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Automation" } },
                    meta: { $ref: "#/components/schemas/ListMeta" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Upsert an automation.",
        description: "Upserts by source and externalId. Unknown write fields are rejected; placements are managed through placement routes.",
        parameters: [{ $ref: "#/components/parameters/XActor" }, { $ref: "#/components/parameters/DryRun" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AutomationWrite" },
            },
          },
        },
        responses: {
          "200": { description: "Updated automation.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Automation" } } } } } },
          "201": { description: "Created automation.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Automation" } } } } } },
          "400": { description: "Validation error.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": { description: "Concurrent upsert race on the same (source, externalId).", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/v1/automations/{id}": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      get: {
        summary: "Get an automation.",
        responses: {
          "200": { description: "Automation.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Automation" } } } } } },
          "404": { description: "Automation not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
      patch: {
        summary: "Update an automation.",
        description: "Requires If-Match and increments api_version. Supports dryRun.",
        parameters: [
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/XActor" },
          { $ref: "#/components/parameters/DryRun" },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", additionalProperties: true, description: "Partial Automation fields to change." } } },
        },
        responses: {
          "200": { description: "Updated automation.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Automation" } } } } } },
          "404": { description: "Automation not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": {
            description: "Version conflict with current automation in data.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
          },
        },
      },
      delete: {
        summary: "Archive an automation.",
        description: "Requires If-Match. Archives by status and archived_at; force=true archives and removes active placements in one database transaction.",
        parameters: [
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/XActor" },
          { $ref: "#/components/parameters/DryRun" },
          { $ref: "#/components/parameters/Force" },
        ],
        responses: {
          "200": { description: "Archived automation.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Automation" } } } } } },
          "404": { description: "Automation not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": {
            description: "Version conflict or active placements without force.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
          },
        },
      },
    },
    "/v1/automations/{id}/restore": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      post: {
        summary: "Restore an automation.",
        description: "Requires If-Match and restores archived automations to active status.",
        parameters: [
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/XActor" },
          { $ref: "#/components/parameters/DryRun" },
        ],
        responses: {
          "200": { description: "Restored automation.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Automation" } } } } } },
          "404": { description: "Automation not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": {
            description: "Version conflict with current automation in data.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
          },
        },
      },
    },
    "/v1/automations/bulk": {
      patch: {
        summary: "Apply bulk automation changes.",
        description: "Accepts an array of { id, version, patch } items and reports succeeded and failed items independently.",
        parameters: [{ $ref: "#/components/parameters/XActor" }, { $ref: "#/components/parameters/DryRun" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    version: { type: "integer" },
                    patch: { type: "object", additionalProperties: true },
                  },
                  required: ["id", "version"],
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Bulk result.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        succeeded: { type: "array", items: { $ref: "#/components/schemas/Automation" } },
                        failed: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: { id: { type: ["string", "null"] }, code: { type: "string" }, error: { type: "string" }, data: { type: "object", additionalProperties: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/placements": {
      get: {
        summary: "List placements.",
        description: "Supports automationId, pipelineId, type, limit, and offset filters. Returns a list envelope with metadata.",
        parameters: [{ $ref: "#/components/parameters/Limit" }, { $ref: "#/components/parameters/Offset" }],
        responses: {
          "200": {
            description: "Placement list envelope.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Placement" } },
                    meta: { $ref: "#/components/schemas/ListMeta" },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: "Create a placement.",
        description: "Creates an active automation-to-process-state link. Validates target.type, stepId, and arrowId against the pipeline process state; rejects archived automations; supports dryRun=true.",
        parameters: [{ $ref: "#/components/parameters/XActor" }, { $ref: "#/components/parameters/DryRun" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  automationId: { type: "string" },
                  pipelineId: { type: "string" },
                  target: { $ref: "#/components/schemas/PlacementTarget" },
                },
                required: ["automationId", "pipelineId", "target"],
              },
            },
          },
        },
        responses: {
          "201": { description: "Created placement.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Placement" } } } } } },
          "404": { description: "Automation not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": {
            description: "Archived automation or duplicate placement conflict.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
          },
        },
      },
    },
    "/v1/placements/{id}": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      get: {
        summary: "Get a placement.",
        responses: {
          "200": { description: "Placement.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Placement" } } } } } },
          "404": { description: "Placement not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
      patch: {
        summary: "Update a placement.",
        description: "Requires If-Match, validates moves against the target process state, increments api_version, supports dryRun=true, and returns the current placement on stale versions.",
        parameters: [
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/XActor" },
          { $ref: "#/components/parameters/DryRun" },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", additionalProperties: true, description: "Partial Placement fields to change, typically target." } } },
        },
        responses: {
          "200": { description: "Updated placement.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Placement" } } } } } },
          "404": { description: "Placement not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": {
            description: "Version conflict with current placement in data.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
          },
        },
      },
      delete: {
        summary: "Remove a placement link.",
        description: "Requires If-Match. Deletes the automation_placements row because placements are active links; supports dryRun=true and returns the removed record data.",
        parameters: [
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/XActor" },
          { $ref: "#/components/parameters/DryRun" },
        ],
        responses: {
          "200": { description: "Removed placement.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Placement" } } } } } },
          "404": { description: "Placement not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": {
            description: "Version conflict with current placement in data.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
          },
        },
      },
    },
    "/v1/placements/bulk": {
      post: {
        summary: "Create placements in bulk.",
        description: "Accepts an array of placement create items and reports per-item succeeded and failed results independently. Supports dryRun=true.",
        parameters: [{ $ref: "#/components/parameters/XActor" }, { $ref: "#/components/parameters/DryRun" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    automationId: { type: "string" },
                    pipelineId: { type: "string" },
                    target: { $ref: "#/components/schemas/PlacementTarget" },
                  },
                  required: ["automationId", "pipelineId", "target"],
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Bulk placement result.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        succeeded: { type: "array", items: { $ref: "#/components/schemas/Placement" } },
                        failed: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: ["string", "null"] },
                              automationId: { type: ["string", "null"] },
                              code: { type: "string" },
                              error: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/pipelines": {
      get: {
        summary: "List pipelines.",
        description: "Read-only synced HubSpot/custom pipeline and stage metadata. Supports source, isActive, limit, and offset query parameters. This API never writes pipelines.",
        parameters: [{ $ref: "#/components/parameters/Limit" }, { $ref: "#/components/parameters/Offset" }],
        responses: {
          "200": {
            description: "Pipeline list envelope with pagination metadata.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object", additionalProperties: true } },
                    meta: { $ref: "#/components/schemas/ListMeta" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/process-states/{pipelineId}": {
      parameters: [{ $ref: "#/components/parameters/PipelineId" }],
      get: {
        summary: "Get process state.",
        description: "Returns the saved process_state row plus read-only automationPlacements derived from automation_placements for the pipeline.",
        responses: {
          "200": { description: "Process state.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/ProcessState" } } } } } },
          "404": { description: "Process state not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
      patch: {
        summary: "Update process state.",
        description: "Requires If-Match. Rejects automationPlacements writes, merges steps and connections by id and lanes by key, updates scalar/JSON fields, increments api_version, and supports dryRun=true (query parameter only).",
        parameters: [
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/XActor" },
          { $ref: "#/components/parameters/DryRun" },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true,
                description: "Partial ProcessState fields to change. automationPlacements is read-only and rejected if present.",
              },
            },
          },
        },
        responses: {
          "200": { description: "Updated process state.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/ProcessState" } } } } } },
          "400": { description: "Invalid patch or direct automationPlacements write.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "404": { description: "Process state not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": {
            description: "Version conflict with current process state in data.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
          },
        },
      },
    },
    "/v1/procesreizen": {
      get: {
        summary: "List procesreizen (process journeys).",
        description: "Backed by the flows table. Supports q, limit, and offset query parameters.",
        parameters: [
          { $ref: "#/components/parameters/Q" },
          { $ref: "#/components/parameters/Limit" },
          { $ref: "#/components/parameters/Offset" },
        ],
        responses: {
          "200": {
            description: "Procesreis list envelope with pagination metadata.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Procesreis" } },
                    meta: { $ref: "#/components/schemas/ListMeta" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/procesreizen/{id}": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      get: {
        summary: "Get a procesreis.",
        responses: {
          "200": { description: "Procesreis.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Procesreis" } } } } } },
          "404": { description: "Procesreis not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
      patch: {
        summary: "Update a procesreis.",
        description: "Requires If-Match and increments api_version. Accepts name, description, systems, automationIds, and chain; chain is stored as-is in the flows.api_chain JSONB column and returned verbatim. Supports dryRun=true (query parameter only).",
        parameters: [
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/XActor" },
          { $ref: "#/components/parameters/DryRun" },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", additionalProperties: true, description: "Partial Procesreis fields to change." } } },
        },
        responses: {
          "200": { description: "Updated procesreis.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Procesreis" } } } } } },
          "404": { description: "Procesreis not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": {
            description: "Version conflict with current procesreis in data.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
          },
        },
      },
    },
    "/v1/sync-review": {
      get: {
        summary: "List sync review items.",
        description: "Backed by source_sync_change_items. Returns pending or failed items by default; an explicit status filter overrides that default. Supports source, status, type, q, limit, and offset query parameters.",
        parameters: [
          { $ref: "#/components/parameters/Q" },
          { $ref: "#/components/parameters/Limit" },
          { $ref: "#/components/parameters/Offset" },
        ],
        responses: {
          "200": {
            description: "Sync review list envelope with pagination metadata.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/SyncReviewItem" } },
                    meta: { $ref: "#/components/schemas/ListMeta" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/v1/sync-review/{id}": {
      parameters: [{ $ref: "#/components/parameters/Id" }],
      get: {
        summary: "Get a sync review item.",
        responses: {
          "200": { description: "Sync review item.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/SyncReviewItem" } } } } } },
          "404": { description: "Sync review item not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
      patch: {
        summary: "Update a sync review item's review status.",
        description: "Requires If-Match and increments api_version. Body accepts only { status: 'skipped' | 'selected' | 'unselected' }. 'skipped' sets the underlying status to skipped and records skipped_at; 'selected'/'unselected' toggle selected_by_default without touching status. Applying an actual source sync remains the job of the existing source-sync functions. Supports dryRun=true (query parameter only).",
        parameters: [
          { $ref: "#/components/parameters/IfMatch" },
          { $ref: "#/components/parameters/XActor" },
          { $ref: "#/components/parameters/DryRun" },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SyncReviewItemPatch" } } },
        },
        responses: {
          "200": { description: "Updated sync review item.", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/SyncReviewItem" } } } } } },
          "400": { description: "Invalid or missing status value.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "404": { description: "Sync review item not found.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
          "409": {
            description: "Version conflict with current sync review item in data.",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
          },
        },
      },
    },
    "/v1/search": {
      get: {
        summary: "Search portal resources.",
        description: "Requires q. Optional types (comma-separated subset of automation, pipeline, procesreis, processState, syncReview; defaults to all) narrows the search. Returns a compact mixed list; each result has type, id, title, summary, and a route-specific url for follow-up. Process states are matched by pipeline id rather than free text. Returns up to limit matches per selected type with an accurate combined meta.total; does not support offset-based paging across the merged result set.",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" }, description: "Free-text search term. Required for this route (unlike the optional Q parameter used elsewhere)." },
          { name: "types", in: "query", required: false, schema: { type: "string" }, description: "Comma-separated subset of automation, pipeline, procesreis, processState, syncReview. Defaults to all." },
          { $ref: "#/components/parameters/Limit" },
        ],
        responses: {
          "200": {
            description: "Search result envelope with an accurate combined total; no cross-type offset paging.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          type: { type: "string", enum: ["automation", "pipeline", "procesreis", "processState", "syncReview"] },
                          id: { type: "string" },
                          title: { type: "string" },
                          summary: { type: ["string", "null"] },
                          url: { type: "string", description: "Route-specific path for following up on this result." },
                        },
                        required: ["type", "id", "title", "url"],
                      },
                    },
                    meta: { $ref: "#/components/schemas/SearchMeta" },
                  },
                },
              },
            },
          },
          "400": { description: "Missing q or invalid types value.", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } } },
        },
      },
    },
    "/v1/audit-log": {
      get: {
        summary: "List audit log entries.",
        description: "Backed by portal_api_audit_log. Every committed write route (never a dryRun) appends an entry automatically. Supports resource, resourceId, actor, since, until, limit, and offset query parameters; since/until filter created_at with >= and <=. diff is redacted the same as every other response.",
        parameters: [{ $ref: "#/components/parameters/Limit" }, { $ref: "#/components/parameters/Offset" }],
        responses: {
          "200": {
            description: "Audit log list envelope with pagination metadata.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/AuditLogEntry" } },
                    meta: { $ref: "#/components/schemas/ListMeta" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
