import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gitlabSyncSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/gitlab-sync/index.ts"),
  "utf8",
);

describe("GitLab backfill source wiring", () => {
  it("keeps the default GitLab sync portal-owned while exposing an explicit backfill mode", () => {
    expect(gitlabSyncSource).toContain("recordPortalOwnedSync");
    expect(gitlabSyncSource).toContain("runGitLabAutomationBackfill");
    expect(gitlabSyncSource).toMatch(/mode\s*===\s*["']backfill["']/);
    expect(gitlabSyncSource).toMatch(/dryRun/);
    expect(gitlabSyncSource).not.toMatch(/\.from\(["']automatiseringen["']\)\s*\.\s*update/s);
    expect(gitlabSyncSource).not.toMatch(/\.from\(["']automatiseringen["']\)\s*\.\s*delete/s);
  });

  it("uses the shared GitLab mapper for all endpoint payloads", () => {
    expect(gitlabSyncSource).toContain("mapGitLabEndpointToAutomationPayload");
    expect(gitlabSyncSource).not.toContain("buildDescription(");
    expect(gitlabSyncSource).not.toContain("Deze automation start wanneer het endpoint");
  });
});
