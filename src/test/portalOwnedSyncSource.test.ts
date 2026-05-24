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
});
