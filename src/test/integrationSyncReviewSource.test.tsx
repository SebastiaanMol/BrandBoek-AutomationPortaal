import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const instellingen = readFileSync(resolve(process.cwd(), "src/pages/Instellingen.tsx"), "utf8");
const imports = readFileSync(resolve(process.cwd(), "src/pages/Imports.tsx"), "utf8");
const panel = readFileSync(resolve(process.cwd(), "src/components/SyncReviewPanel.tsx"), "utf8");
const integrationsHook = readFileSync(resolve(process.cwd(), "src/lib/queryHooks/integrations.ts"), "utf8");

describe("sync review UI wiring", () => {
  it("routes integration sync preview changes to the imports page instead of opening a review dialog", () => {
    expect(instellingen).not.toContain("SyncReviewDialog");
    expect(instellingen).toContain("changeItems");
    expect(instellingen).toContain("formatSyncPreviewImportedToast");
    expect(integrationsHook).toContain('queryKey: ["source-sync-review-items"]');
  });

  it("renders and applies sync review changes inline from the imports page", () => {
    expect(imports).not.toContain("SyncReviewDialog");
    expect(imports).toContain("fetchPendingSyncReviewItems");
    expect(imports).toContain("SyncReviewPanel");
    expect(panel).toContain("Bronwijzigingen uit synchronisaties");
    expect(imports).toContain("useApplySourceSyncReview");
  });

  it("keeps the imports page on the new paginated sync-review inbox only", () => {
    expect(imports).not.toContain('from("automation_import_proposals")');
    expect(imports).not.toContain("TabsTrigger");
    expect(panel).toContain("Bron filter");
    expect(panel).toContain("Selectie filter");
    expect(panel).toContain("onPageChange");
  });
});
