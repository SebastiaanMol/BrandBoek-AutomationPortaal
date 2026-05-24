import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(process.cwd(), "supabase/functions/zapier-sync/index.ts");
const source = readFileSync(sourcePath, "utf8");

describe("zapier-sync edge function", () => {
  it("uses the read-only Zapier v2 API with bearer auth helpers", () => {
    expect(source).toContain("https://api.zapier.com/v2/zaps");
    expect(source).toContain("zapierReadOnlyHeaders");
    expect(source).not.toContain("https://api.zapier.com/v1/zaps");
    expect(source).not.toContain("X-API-Key");
  });

  it("does not send write requests to Zapier", () => {
    expect(source).not.toMatch(/fetch\([^)]*method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/s);
  });
});
