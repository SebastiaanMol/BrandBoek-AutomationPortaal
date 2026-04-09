// src/test/domainLogic.test.ts
/**
 * domainLogic.test.ts
 * Covers berekenComplexiteit and berekenImpact from types.ts.
 * Signal detection tests live in signalen.test.ts.
 */

import { describe, it, expect } from "vitest";
import { berekenComplexiteit, berekenImpact, Automatisering } from "@/lib/types";

function makeAutomatisering(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "auto-1", naam: "Test", categorie: "HubSpot Workflow",
    doel: "Test doel", trigger: "Form submitted", systemen: [],
    stappen: [], afhankelijkheden: "", owner: "Jan", status: "Actief",
    verbeterideeën: "", mermaidDiagram: "", koppelingen: [],
    fasen: [], createdAt: "2026-01-01T00:00:00Z",
    laatstGeverifieerd: null, geverifieerdDoor: "",
    ...overrides,
  };
}

describe("berekenComplexiteit", () => {
  it("empty automation returns 0", () => {
    const a = makeAutomatisering();
    expect(berekenComplexiteit(a)).toBe(0);
  });

  it("4 stappen returns stappenScore of 40", () => {
    const a = makeAutomatisering({ stappen: ["a", "b", "c", "d"] });
    expect(berekenComplexiteit(a)).toBe(40);
  });

  it("cap is respected — 5 stappen still returns 40", () => {
    const a = makeAutomatisering({ stappen: ["a", "b", "c", "d", "e"] });
    expect(berekenComplexiteit(a)).toBe(40);
  });

  it("afhankelijkheden non-empty adds 15", () => {
    const a = makeAutomatisering({ afhankelijkheden: "heeft deps" });
    expect(berekenComplexiteit(a)).toBe(15);
  });

  it("combined scoring: 1 stap + 1 systeem + afhankelijkheden + 1 koppeling = 42", () => {
    const a = makeAutomatisering({
      stappen: ["a"],
      systemen: ["HubSpot"],
      afhankelijkheden: "x",
      koppelingen: [{ doelId: "b", label: "" }],
    });
    // stappenScore=10, systemenScore=12, afhankScore=15, koppScore=5 → 42
    expect(berekenComplexiteit(a)).toBe(42);
  });
});

describe("berekenImpact", () => {
  it("2 fasen and Actief status returns 34 (fasenScore 24 + statusBonus 10)", () => {
    const a = makeAutomatisering({ fasen: ["Marketing", "Sales"], status: "Actief" });
    expect(berekenImpact(a, [a])).toBe(34);
  });

  it("depScore: automation depended on by another scores 20 (+ statusBonus 10 = 30)", () => {
    const autoA = makeAutomatisering({ id: "auto-a", fasen: [], systemen: [], status: "Actief" });
    const autoB = makeAutomatisering({ id: "auto-b", koppelingen: [{ doelId: "auto-a", label: "" }] });
    const score = berekenImpact(autoA, [autoA, autoB]);
    expect(score).toBe(10 + 20); // statusBonus + depScore
  });

  it("Verouderd status adds no bonus", () => {
    const a = makeAutomatisering({ status: "Verouderd" });
    expect(berekenImpact(a, [a])).toBe(0);
  });
});
