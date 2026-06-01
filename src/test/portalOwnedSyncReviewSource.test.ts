import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/portal-owned-sync.ts"),
  "utf8",
);

describe("portal-owned sync review helpers", () => {
  it("exposes preview and apply helpers while preserving apply-all compatibility", () => {
    expect(source).toContain("SOURCE_SYNC_CHANGE_ITEMS_TABLE");
    expect(source).toContain("previewPortalOwnedSync");
    expect(source).toContain("applyPortalOwnedSyncChanges");
    expect(source).toContain("recordPortalOwnedSync");
  });

  it("preview mode writes change items without updating existing automations directly", () => {
    expect(source).toContain("insertSyncChangeItem");
    expect(source).toContain("buildSyncChangeItems");
    expect(source).toContain("selected_by_default: true");
    expect(source).toContain("payload_sanitized");
  });

  it("apply mode only applies selected pending items and marks unselected items skipped", () => {
    expect(source).toContain("selectedChangeItemIds");
    expect(source).toContain("markUnselectedReviewItemsSkipped");
    expect(source).toContain("status: \"applied\"");
    expect(source).toContain("status: \"skipped\"");
  });
});
