import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const analyseSource = readFileSync(resolve(process.cwd(), "src/pages/Analyse.tsx"), "utf8");

describe("Analyse page headers", () => {
  it("uses the shared compact command header and removes the old primary-soft hero", () => {
    expect(analyseSource).toContain("PageHeaderShell");
    expect(analyseSource).toContain("PageCommandBar");
    expect(analyseSource).toContain("PageHeaderMetrics");
    expect(analyseSource).not.toContain("bg-primary-soft px-8 py-8");
  });
});
