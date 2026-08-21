import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pipelinesSource = readFileSync(resolve(process.cwd(), "src/pages/Pipelines.tsx"), "utf8");

describe("Pipelines page header", () => {
  it("uses the shared compact command header instead of the old primary-soft header card", () => {
    expect(pipelinesSource).toContain("PageHeaderShell");
    expect(pipelinesSource).toContain("PageCommandBar");
    expect(pipelinesSource).toContain("PageHeaderMetrics");
    expect(pipelinesSource).not.toContain("bg-primary-soft px-8 py-8");
    expect(pipelinesSource).not.toContain("const StatBadge");
  });
});
