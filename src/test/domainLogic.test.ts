/**
 * domainLogic.test.ts
 * Failing test scaffold for QUAL-03 domain logic coverage (Wave 0).
 *
 * QUAL-03: berekenComplexiteit, berekenImpact, detectProblems
 *
 * These are it.todo stubs — they establish the RED state required before
 * Plan 04-03 replaces them with real assertions.
 */

import { describe, it } from "vitest";
import { berekenComplexiteit, berekenImpact, Automatisering } from "@/lib/types";
import { detectProblems } from "@/lib/graphProblems";

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

// Re-export references to suppress unused-import warnings while keeping
// the imports verifiable by tsc.
void berekenComplexiteit;
void berekenImpact;
void detectProblems;
void makeAutomatisering;

describe("berekenComplexiteit", () => {
  it.todo("empty automation returns 0");
  it.todo("4 stappen returns stappenScore of 40");
  it.todo("cap is respected — 5 stappen still returns 40");
  it.todo("afhankelijkheden non-empty adds 15");
});

describe("berekenImpact", () => {
  it.todo("2 fasen returns fasenScore of 24");
  it.todo("depScore: automation depended on by another scores 20");
  it.todo("Actief status adds 10 bonus");
});

describe("detectProblems", () => {
  it.todo("automation missing owner gets missing-owner problem");
  it.todo("automation missing trigger gets missing-trigger problem");
  it.todo("isolated automation with empty koppelingen is flagged as orphan");
  it.todo("two connected automations have no orphan problem");
});
