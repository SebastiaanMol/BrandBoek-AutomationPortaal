/**
 * crossLinking.test.ts
 * Wave 0 scaffold — pure logic tests run with full assertions; DOM-level
 * link presence tests are it.todo stubs (non-blocking for Wave 1).
 *
 * Requirements covered:
 *   LINK-01: link to /processen in detail panel          (it.todo — DOM)
 *   LINK-02: system badges link to /systems?system=X     (it.todo — DOM)
 *   LINK-03: owner links to /owners?owner=X              (it.todo — DOM)
 *   LINK-04: deriveRelated pure function                 (full assertions)
 *
 * Pattern: inline derivation function + makeAutomatisering factory,
 * matching the established style in entityPages.test.ts.
 */

import { describe, it, expect } from "vitest";
import { Automatisering } from "@/lib/types";

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

// Inline derivation — mirrors the logic that AutomationDetailPanel will use
function deriveRelated(all: Automatisering[], current: Automatisering): Automatisering[] {
  return all.filter(a => {
    if (a.id === current.id) return false;
    const sharedFase = a.fasen?.some(f => current.fasen?.includes(f));
    const sharedSystem = a.systemen?.some(s => current.systemen?.includes(s));
    return sharedFase || sharedSystem;
  });
}

// LINK-04: deriveRelated pure logic
describe("deriveRelated", () => {
  it("returns empty array when no automations share fase or system", () => {
    const current = makeAutomatisering();
    const result = deriveRelated([], current);
    expect(result).toHaveLength(0);
  });

  it("includes automation sharing a fase", () => {
    const current = makeAutomatisering({ id: "current", fasen: ["Marketing"] });
    const other = makeAutomatisering({ id: "other", fasen: ["Marketing"] });
    const result = deriveRelated([current, other], current);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("other");
  });

  it("includes automation sharing a system", () => {
    const current = makeAutomatisering({ id: "current", systemen: ["HubSpot"] });
    const other = makeAutomatisering({ id: "other", systemen: ["HubSpot"] });
    const result = deriveRelated([current, other], current);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("other");
  });

  it("excludes the current automation (self)", () => {
    const current = makeAutomatisering({ id: "current", fasen: ["Sales"], systemen: ["Zapier"] });
    const result = deriveRelated([current], current);
    expect(result).toHaveLength(0);
  });

  it("excludes automations sharing neither fase nor system", () => {
    const current = makeAutomatisering({ id: "current", fasen: ["Marketing"], systemen: ["HubSpot"] });
    const unrelated = makeAutomatisering({ id: "unrelated", fasen: ["Sales"], systemen: ["Zapier"] });
    const result = deriveRelated([current, unrelated], current);
    expect(result).toHaveLength(0);
  });

  it("includes automation sharing BOTH fase and system only once", () => {
    const current = makeAutomatisering({ id: "current", fasen: ["Onboarding"], systemen: ["HubSpot"] });
    const overlap = makeAutomatisering({ id: "overlap", fasen: ["Onboarding"], systemen: ["HubSpot"] });
    const result = deriveRelated([current, overlap], current);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("overlap");
  });

  it("handles current with empty fasen and systemen", () => {
    const current = makeAutomatisering({ id: "current", fasen: [], systemen: [] });
    const other = makeAutomatisering({ id: "other", fasen: ["Marketing"], systemen: ["HubSpot"] });
    const result = deriveRelated([current, other], current);
    expect(result).toHaveLength(0);
  });
});

// LINK-01: canvas link
describe("LINK-01: canvas link", () => {
  it.todo("panel renders a Link to /processen when fullData is provided");
});

// LINK-02: system badge links
describe("LINK-02: system badge links", () => {
  it.todo("each system badge is wrapped in a Link to /systems?system=X");
});

// LINK-03: owner link
describe("LINK-03: owner link", () => {
  it.todo("owner text is wrapped in a Link to /owners?owner=X");
});
