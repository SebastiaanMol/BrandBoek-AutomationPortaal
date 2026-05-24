import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const automationsPageSource = readFileSync(resolve(process.cwd(), "src/pages/AutomationsPage.tsx"), "utf8");
const allAutomationsSource = readFileSync(resolve(process.cwd(), "src/pages/AlleAutomatiseringen.tsx"), "utf8");

describe("Zapier automations visibility", () => {
  it("shows Zapier as its own source tab on the automations page", () => {
    expect(automationsPageSource).toContain('"zapier"');
    expect(automationsPageSource).toContain("zapierCount");
    expect(automationsPageSource).toContain('value: "zapier"');
  });

  it("filters automations by Zapier source when the Zapier tab is selected", () => {
    expect(allAutomationsSource).toContain('"zapier"');
    expect(allAutomationsSource).toContain("isZapierAutomation");
    expect(allAutomationsSource).toContain('sourceFilter === "zapier"');
  });
});
