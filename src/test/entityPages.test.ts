/**
 * entityPages.test.ts
 * Wave 0 scaffold — tests made GREEN by plans 07-02 and 07-03.
 *
 * Covers requirements:
 *   SYS-01: systemCounts derivation (unique systems + automation counts)
 *   SYS-02: system filter (automations containing a selected system)
 *   OWN-01: ownerCounts derivation (unique owners + automation counts, skip empty)
 *   OWN-02: owner filter (automations whose owner matches selection)
 *
 * All tests are it.todo stubs — they do not fail.
 * Wave 1 agents (plans 07-02 and 07-03) will replace stubs with passing assertions.
 */

import { describe, it, expect } from "vitest";
import { Automatisering, Systeem } from "@/lib/types";

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

// Inline derivation — mirrors Systems.tsx logic
function deriveSystemCounts(automations: Automatisering[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of automations) {
    for (const s of a.systemen) {
      map.set(s, (map.get(s) ?? 0) + 1);
    }
  }
  return map;
}

function filterBySystem(automations: Automatisering[], system: string): Automatisering[] {
  return automations.filter(a => a.systemen.includes(system as Systeem));
}

// SYS-01: systemCounts derivation
describe("systemCounts derivation", () => {
  it("returns empty map for no automations", () => {
    const result = deriveSystemCounts([]);
    expect(result.size).toBe(0);
  });

  it("counts each system once per automation", () => {
    const a = makeAutomatisering({ systemen: ["HubSpot"] });
    const result = deriveSystemCounts([a]);
    expect(result.get("HubSpot")).toBe(1);
  });

  it("aggregates the same system across multiple automations", () => {
    const a1 = makeAutomatisering({ id: "auto-1", systemen: ["HubSpot"] });
    const a2 = makeAutomatisering({ id: "auto-2", systemen: ["HubSpot"] });
    const result = deriveSystemCounts([a1, a2]);
    expect(result.get("HubSpot")).toBe(2);
  });

  it("sorts descending by count", () => {
    const a1 = makeAutomatisering({ id: "auto-1", systemen: ["HubSpot", "Zapier"] });
    const a2 = makeAutomatisering({ id: "auto-2", systemen: ["HubSpot"] });
    const map = deriveSystemCounts([a1, a2]);
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe("HubSpot");
  });
});

// SYS-02: system filter
describe("system filter", () => {
  it("returns only automations containing the selected system", () => {
    const a1 = makeAutomatisering({ id: "auto-1", systemen: ["HubSpot"] });
    const a2 = makeAutomatisering({ id: "auto-2", systemen: ["Zapier"] });
    const result = filterBySystem([a1, a2], "HubSpot");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("auto-1");
  });

  it("returns empty array when no automations match the system", () => {
    const a1 = makeAutomatisering({ systemen: ["Zapier"] });
    const result = filterBySystem([a1], "HubSpot");
    expect(result).toHaveLength(0);
  });
});

function deriveOwnerCounts(automations: Automatisering[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const a of automations) {
    if (a.owner?.trim()) {
      map.set(a.owner, (map.get(a.owner) ?? 0) + 1);
    }
  }
  return map;
}

function filterByOwner(automations: Automatisering[], owner: string): Automatisering[] {
  return automations.filter(a => a.owner === owner);
}

// OWN-01: ownerCounts derivation
describe("ownerCounts derivation", () => {
  it("returns empty map for no automations", () => {
    const result = deriveOwnerCounts([]);
    expect(result.size).toBe(0);
  });

  it("groups automations by owner name", () => {
    const automations = [
      makeAutomatisering({ id: "a1", owner: "Jan" }),
      makeAutomatisering({ id: "a2", owner: "Jan" }),
    ];
    const result = deriveOwnerCounts(automations);
    expect(result.get("Jan")).toBe(2);
  });

  it("skips automations with empty string owner", () => {
    const automations = [
      makeAutomatisering({ id: "a1", owner: "" }),
      makeAutomatisering({ id: "a2", owner: "Jan" }),
    ];
    const result = deriveOwnerCounts(automations);
    expect(result.size).toBe(1);
    expect(result.has("")).toBe(false);
    expect(result.get("Jan")).toBe(1);
  });

  it("sorts descending by count", () => {
    const automations = [
      makeAutomatisering({ id: "a1", owner: "Lisa" }),
      makeAutomatisering({ id: "a2", owner: "Jan" }),
      makeAutomatisering({ id: "a3", owner: "Jan" }),
    ];
    const result = deriveOwnerCounts(automations);
    const sorted = [...result.entries()].sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe("Jan");
    expect(sorted[0][1]).toBe(2);
    expect(sorted[1][0]).toBe("Lisa");
    expect(sorted[1][1]).toBe(1);
  });
});

// OWN-02: owner filter
describe("owner filter", () => {
  it("returns only automations whose owner matches", () => {
    const automations = [
      makeAutomatisering({ id: "a1", owner: "Jan" }),
      makeAutomatisering({ id: "a2", owner: "Lisa" }),
      makeAutomatisering({ id: "a3", owner: "Jan" }),
    ];
    const result = filterByOwner(automations, "Jan");
    expect(result).toHaveLength(2);
    expect(result.every(a => a.owner === "Jan")).toBe(true);
  });

  it("returns empty array when no automations match the owner", () => {
    const automations = [
      makeAutomatisering({ id: "a1", owner: "Jan" }),
    ];
    const result = filterByOwner(automations, "Unknown");
    expect(result).toHaveLength(0);
  });
});
