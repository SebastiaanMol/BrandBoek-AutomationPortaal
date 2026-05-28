import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const syncFiles = [
  "hubspot-sync",
  "gitlab-sync",
  "zapier-sync",
  "typeform-sync",
] as const;
const helperSource = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/portal-owned-sync.ts"), "utf8");

function readSyncSource(name: (typeof syncFiles)[number]): string {
  return readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), "utf8");
}

describe("portal-owned sync safety", () => {
  it.each(syncFiles)("keeps %s from mutating existing automations directly", (name) => {
    const source = readSyncSource(name);
    const combinedSource = `${source}\n${helperSource}`;

    expect(source).toContain("recordPortalOwnedSync");
    expect(combinedSource).toContain("source_sync_runs");
    expect(combinedSource).toContain("automation_source_findings");
    expect(combinedSource).toContain("automation_import_proposals");
    expect(source).not.toMatch(/\.from\(["']automatiseringen["']\)\s*\.\s*update/s);
    expect(source).not.toMatch(/\.from\(["']automatiseringen["']\)\s*\.\s*delete/s);
    expect(source).not.toMatch(/\.from\(["']automatiseringen["']\)\s*\.\s*insert/s);
  });

  it("does not create source_missing findings when a source sync fails", () => {
    const combinedSource = `${syncFiles.map(readSyncSource).join("\n")}\n${helperSource}`;

    expect(combinedSource).toContain("finishSourceSyncRun");
    expect(combinedSource).toContain("status: \"failed\"");
    expect(combinedSource).toContain("status: \"auth_failed\"");
    expect(combinedSource).toContain("recordSourceSyncFailure");
  });

  it("allows existing source-owned automations to refresh read-only source snapshots only", () => {
    expect(helperSource).toContain("updateExistingSourceSnapshot");
    expect(helperSource).toContain("SOURCE_MANAGED_AUTOMATION_FIELDS");
    expect(helperSource).toContain("\"import_proposal\"");
    expect(helperSource).toContain("\"last_synced_at\"");
    expect(helperSource).not.toContain("SOURCE_MANAGED_AUTOMATION_FIELDS = [\"naam\"");
    expect(helperSource).not.toContain("SOURCE_MANAGED_AUTOMATION_FIELDS = [\"owner\"");
  });

  it("preserves previously resolved HubSpot workflow audit actors when a later sync cannot refetch them", () => {
    expect(helperSource).toContain("import_proposal");
    expect(helperSource).toContain("preserveHubSpotWorkflowAudit");
    expect(helperSource).toContain("existingWorkflow.createdBy");
    expect(helperSource).toContain("existingWorkflow.updatedBy");
  });

  it("includes HubSpot audit-log lookup support for workflow actors", () => {
    const source = readSyncSource("hubspot-sync");

    expect(source).toContain("fetchWorkflowAuditLogActors");
    expect(source).toContain("fetchWorkflowAuditLogActorsForTimestamp");
    expect(source).toContain("workflowAuditSearchWindows");
    expect(source).toContain("auditWorkflowId");
    expect(source).toContain("occurredAfter");
    expect(source).toContain("occurredBefore");
    expect(source).toContain("account-info/v3/activity/audit-logs");
    expect(source).toContain("account-info/2026-03/activity/audit-logs");
    expect(source).toContain("actingUser");
    expect(source).toContain("targetObjectId");
    expect(source).toContain("auditDebug");
  });

  it("supports persistent incomplete source-data findings with stable evidence keys", () => {
    expect(helperSource).toContain("source_data_incomplete");
    expect(helperSource).toContain("buildSourceQualityMissingEvidence");
    expect(helperSource).toContain("missing_evidence_key");
    expect(helperSource).toContain("resolveSourceQualityFindings");
  });
});
