import { describe, it, expect } from "vitest";
import { getSystemMeta } from "@/lib/systemMeta";
import type { Systeem } from "@/lib/types";

describe("getSystemMeta", () => {
  it("returns correct hue var name for HubSpot", () => {
    expect(getSystemMeta("HubSpot").hue).toBe("--system-hubspot");
  });

  it("returns correct hue for E-mail (special char in key)", () => {
    expect(getSystemMeta("E-mail").hue).toBe("--system-email");
  });

  it("returns correct label for Zapier", () => {
    expect(getSystemMeta("Zapier").label).toBe("Zapier");
  });

  it("covers all Systeem values without throwing", () => {
    const all: Systeem[] = ["HubSpot", "Zapier", "Typeform", "SharePoint", "WeFact", "Docufy", "Backend", "E-mail", "API", "GitLab", "Anders"];
    for (const s of all) {
      const meta = getSystemMeta(s);
      expect(meta.hue).toMatch(/^--system-/);
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});
