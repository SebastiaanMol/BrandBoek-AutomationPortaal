import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const importsSource = readFileSync(resolve(process.cwd(), "src/pages/Imports.tsx"), "utf8");

describe("Imports page header", () => {
  it("uses the shared compact command header instead of the old primary-soft header card", () => {
    expect(importsSource).toContain("PageHeaderShell");
    expect(importsSource).toContain("PageCommandBar");
    expect(importsSource).toContain("PageHeaderMetrics");
    expect(importsSource).not.toContain("bg-primary-soft px-8 py-8");
    expect(importsSource).not.toContain("function StatBadge");
  });
});
