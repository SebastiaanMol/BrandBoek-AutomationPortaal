import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const instellingen = readFileSync(resolve(process.cwd(), "src/pages/Instellingen.tsx"), "utf8");
const imports = readFileSync(resolve(process.cwd(), "src/pages/Imports.tsx"), "utf8");

describe("sync review UI wiring", () => {
  it("opens SyncReviewDialog from integration sync cards", () => {
    expect(instellingen).toContain("SyncReviewDialog");
    expect(instellingen).toContain("changeItems");
    expect(instellingen).toContain("useApplySourceSyncReview");
  });

  it("uses the same review flow from the imports page sync buttons", () => {
    expect(imports).toContain("SyncReviewDialog");
    expect(imports).toContain("changeItems");
    expect(imports).toContain("useApplySourceSyncReview");
  });
});
