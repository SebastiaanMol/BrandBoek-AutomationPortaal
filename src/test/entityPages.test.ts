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

import { describe, it } from "vitest";
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

// SYS-01: systemCounts derivation
describe("systemCounts derivation", () => {
  it.todo("returns empty map for no automations");
  it.todo("counts each system once per automation");
  it.todo("aggregates the same system across multiple automations");
  it.todo("sorts descending by count");
});

// SYS-02: system filter
describe("system filter", () => {
  it.todo("returns only automations containing the selected system");
  it.todo("returns empty array when no automations match the system");
});

// OWN-01: ownerCounts derivation
describe("ownerCounts derivation", () => {
  it.todo("returns empty map for no automations");
  it.todo("groups automations by owner name");
  it.todo("skips automations with empty string owner");
  it.todo("sorts descending by count");
});

// OWN-02: owner filter
describe("owner filter", () => {
  it.todo("returns only automations whose owner matches");
  it.todo("returns empty array when no automations match the owner");
});
