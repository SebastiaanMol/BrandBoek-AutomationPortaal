// src/test/signalen.test.ts
import { describe, it, expect } from "vitest";
import { detectSignalen } from "@/lib/signalen";
import { Automatisering } from "@/lib/types";

function makeA(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "auto-1",
    naam: "Test Auto",
    categorie: "HubSpot Workflow",
    doel: "Doel",
    trigger: "Form submitted",
    systemen: ["HubSpot"],
    stappen: ["stap 1", "stap 2"],
    afhankelijkheden: "",
    owner: "Jan",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Marketing"],
    createdAt: "2026-01-01T00:00:00Z",
    laatstGeverifieerd: new Date().toISOString(),
    geverifieerdDoor: "",
    ...overrides,
  };
}

describe("detectSignalen", () => {
  // --- Status signals ---

  it("status Verouderd produces outdated signal with ernst error", () => {
    const a = makeA({ status: "Verouderd" });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "outdated");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("error");
    expect(s!.categorie).toBe("status");
    expect(s!.automationId).toBe("auto-1");
  });

  it("uitgeschakeld automation referenced by active one produces uitgeschakeld-actief signal", () => {
    const disabled = makeA({ id: "dis-1", status: "Uitgeschakeld", koppelingen: [] });
    const active = makeA({ id: "act-1", status: "Actief", koppelingen: [{ doelId: "dis-1", label: "" }] });
    const signals = detectSignalen([disabled, active]);
    const s = signals.find(x => x.type === "uitgeschakeld-actief" && x.automationId === "dis-1");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("error");
    expect(s!.categorie).toBe("status");
  });

  it("uitgeschakeld automation NOT referenced by anyone does NOT produce uitgeschakeld-actief", () => {
    const disabled = makeA({ id: "dis-1", status: "Uitgeschakeld", koppelingen: [] });
    const signals = detectSignalen([disabled]);
    expect(signals.some(x => x.type === "uitgeschakeld-actief")).toBe(false);
  });

  // --- Kwaliteit signals ---

  it("empty owner produces missing-owner signal with ernst warning", () => {
    const a = makeA({ owner: "" });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "missing-owner");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("warning");
    expect(s!.categorie).toBe("kwaliteit");
  });

  it("empty trigger produces missing-trigger signal", () => {
    const a = makeA({ trigger: "" });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "missing-trigger")).toBe(true);
  });

  it("empty systemen produces missing-systems signal", () => {
    const a = makeA({ systemen: [] });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "missing-systems")).toBe(true);
  });

  it("empty doel produces no-goal signal with ernst info", () => {
    const a = makeA({ doel: "" });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "no-goal");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("info");
    expect(s!.categorie).toBe("kwaliteit");
  });

  it("hoge complexiteit (>50) with <=1 stap produces hoge-complexiteit signal", () => {
    // berekenComplexiteit: 1 stap (10) + 3 systemen (36 capped) + afhankelijkheden (15) = 61 > 50
    const a = makeA({
      stappen: ["stap 1"],
      systemen: ["HubSpot", "Zapier", "WeFact"],
      afhankelijkheden: "heeft deps",
    });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "hoge-complexiteit")).toBe(true);
  });

  it("hoge complexiteit with 2+ stappen does NOT produce hoge-complexiteit", () => {
    const a = makeA({
      stappen: ["stap 1", "stap 2"],
      systemen: ["HubSpot", "Zapier", "WeFact"],
      afhankelijkheden: "heeft deps",
    });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "hoge-complexiteit")).toBe(false);
  });

  it("low complexiteit with <=1 stap does NOT produce hoge-complexiteit", () => {
    const a = makeA({ stappen: ["stap 1"], systemen: ["HubSpot"], afhankelijkheden: "" });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "hoge-complexiteit")).toBe(false);
  });

  // --- Structuur signals ---

  it("koppeling to non-existent id produces broken-link signal", () => {
    const a = makeA({ koppelingen: [{ doelId: "ghost-id", label: "" }] });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "broken-link")).toBe(true);
  });

  it("koppeling to existing automation does NOT produce broken-link", () => {
    const a = makeA({ id: "src", koppelingen: [{ doelId: "tgt", label: "" }] });
    const b = makeA({ id: "tgt", koppelingen: [] });
    const signals = detectSignalen([a, b]);
    expect(signals.some(x => x.type === "broken-link")).toBe(false);
  });

  it("automation with no outgoing and no incoming koppelingen is orphan", () => {
    const a = makeA({ id: "lone", koppelingen: [] });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "orphan" && x.automationId === "lone");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("warning");
    expect(s!.categorie).toBe("structuur");
  });

  it("automation with no outgoing but an incoming koppeling is NOT orphan", () => {
    const target = makeA({ id: "tgt", koppelingen: [] });
    const source = makeA({ id: "src", koppelingen: [{ doelId: "tgt", label: "" }] });
    const signals = detectSignalen([target, source]);
    expect(signals.some(x => x.type === "orphan" && x.automationId === "tgt")).toBe(false);
  });

  // --- Verificatie signals ---

  it("automation not verified in 90+ days produces unverified warning", () => {
    const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const a = makeA({ laatstGeverifieerd: ninetyOneDaysAgo });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "unverified" && x.automationId === "auto-1");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("warning");
    expect(s!.categorie).toBe("verificatie");
  });

  it("automation never verified (null) produces unverified info signal", () => {
    const a = makeA({ laatstGeverifieerd: null });
    const signals = detectSignalen([a]);
    const s = signals.find(x => x.type === "unverified" && x.automationId === "auto-1");
    expect(s).toBeDefined();
    expect(s!.ernst).toBe("info");
  });

  it("recently verified automation does NOT produce unverified signal", () => {
    const a = makeA({ laatstGeverifieerd: new Date().toISOString() });
    const signals = detectSignalen([a]);
    expect(signals.some(x => x.type === "unverified")).toBe(false);
  });

  // --- Signal id uniqueness ---

  it("multiple broken links produce distinct signal ids", () => {
    const a = makeA({
      koppelingen: [
        { doelId: "ghost-1", label: "" },
        { doelId: "ghost-2", label: "" },
      ],
    });
    const signals = detectSignalen([a]);
    const brokenLinks = signals.filter(x => x.type === "broken-link");
    expect(brokenLinks).toHaveLength(2);
    const ids = brokenLinks.map(s => s.id);
    expect(new Set(ids).size).toBe(2);
  });
});
