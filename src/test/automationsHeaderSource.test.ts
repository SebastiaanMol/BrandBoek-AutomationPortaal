import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const automationsSource = readFileSync(resolve(process.cwd(), "src/pages/AutomationsPage.tsx"), "utf8");

describe("Automations page header", () => {
  it("uses the shared compact command header", () => {
    expect(automationsSource).toContain("PageHeaderShell");
    expect(automationsSource).toContain("PageHeaderMetrics");
    expect(automationsSource).not.toContain("function StatPill");
  });
});
