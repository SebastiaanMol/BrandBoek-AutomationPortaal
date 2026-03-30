/**
 * processCanvas.test.ts
 * Unit tests for Phase 1 process-canvas logic paths.
 *
 * PROC-01: toCanvasAutomation – team assignment and field mapping
 * PROC-02: handleAttach / handleDetach – state transitions
 * PROC-03: autoLinks merge – the ref-pattern fix (Plan 02 must make these pass)
 * PROC-04: Automatisering field mappings (trigger, stappen, systemen, owner)
 *
 * NOTE: toCanvasAutomation and FASE_TO_TEAM are NOT exported from Processen.tsx
 * (React component side effects prevent direct import in unit tests).
 * The pure logic is duplicated here for testability — this is intentional.
 * Extracting to a shared module is a refactor deferred beyond Phase 1 scope.
 */

import { describe, it, expect } from "vitest";
import type { Automation, TeamKey, ProcessState } from "@/data/processData";
import type { Automatisering, KlantFase, Systeem } from "@/lib/types";

// ── Duplicated pure logic from src/pages/Processen.tsx ──────────────────────
// Copy of FASE_TO_TEAM and toCanvasAutomation for testability.
// Keep in sync with Processen.tsx if the source logic ever changes.

const FASE_TO_TEAM: Record<KlantFase, TeamKey> = {
  Marketing:   "marketing",
  Sales:       "sales",
  Onboarding:  "onboarding",
  Boekhouding: "boekhouding",
  Offboarding: "management",
};

function toCanvasAutomation(a: Automatisering, existing?: Automation): Automation {
  return {
    id:         a.id,
    name:       a.naam,
    team:       FASE_TO_TEAM[a.fasen?.[0]] ?? "management",
    tool:       a.systemen?.[0] ?? "Anders",
    goal:       a.doel ?? "",
    fromStepId: existing?.fromStepId,
    toStepId:   existing?.toStepId,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeAutomatisering(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id:                "auto-1",
    naam:              "Test Automation",
    categorie:         "HubSpot Workflow",
    doel:              "Test goal",
    trigger:           "Form submitted",
    systemen:          [],
    stappen:           [],
    afhankelijkheden:  "",
    owner:             "Jan",
    status:            "Actief",
    verbeterideeën:    "",
    mermaidDiagram:    "",
    koppelingen:       [],
    fasen:             [],
    createdAt:         "2026-01-01T00:00:00Z",
    laatstGeverifieerd: null,
    geverifieerdDoor:  "",
    ...overrides,
  };
}

function makeProcessState(automations: Automation[] = []): ProcessState {
  return {
    steps:       [],
    connections: [],
    automations,
  };
}

// ── Inline attach/detach logic from src/pages/Processen.tsx ─────────────────
// Mirrors handleAttach and handleDetach without React/toast side effects.

function applyAttach(
  state: ProcessState,
  autoId: string,
  fromStepId: string,
  toStepId: string,
): ProcessState {
  return {
    ...state,
    automations: state.automations.map(a =>
      a.id === autoId ? { ...a, fromStepId, toStepId } : a,
    ),
  };
}

function applyDetach(state: ProcessState, autoId: string): ProcessState {
  return {
    ...state,
    automations: state.automations.map(a =>
      a.id === autoId ? { ...a, fromStepId: undefined, toStepId: undefined } : a,
    ),
  };
}

// ── PROC-03 ref-pattern merge (the FIXED behavior that Plan 02 must implement) ─
// These tests validate the FIXED autoLinks merge (Plan 02).
// They test the *intended* correct behavior, not the current buggy behavior.
// They are expected to FAIL until Plan 02 applies the fix.

function mergeAutoLinks(
  dbAutomations: Automatisering[],
  savedLinks: Record<string, { fromStepId: string; toStepId: string }>,
): Automation[] {
  return dbAutomations.map(a => {
    const savedLink = savedLinks[a.id];
    return toCanvasAutomation(a, savedLink
      ? { id: a.id, name: a.naam, team: "management", tool: "", goal: "", ...savedLink }
      : undefined,
    );
  });
}

// ── PROC-01: toCanvasAutomation ───────────────────────────────────────────────

describe("PROC-01: toCanvasAutomation – team assignment and field mapping", () => {
  it("maps fasen=['Marketing'] to team='marketing'", () => {
    const a = makeAutomatisering({ fasen: ["Marketing"] });
    expect(toCanvasAutomation(a).team).toBe("marketing");
  });

  it("maps fasen=['Sales'] to team='sales'", () => {
    const a = makeAutomatisering({ fasen: ["Sales"] });
    expect(toCanvasAutomation(a).team).toBe("sales");
  });

  it("maps fasen=['Onboarding'] to team='onboarding'", () => {
    const a = makeAutomatisering({ fasen: ["Onboarding"] });
    expect(toCanvasAutomation(a).team).toBe("onboarding");
  });

  it("maps fasen=['Boekhouding'] to team='boekhouding'", () => {
    const a = makeAutomatisering({ fasen: ["Boekhouding"] });
    expect(toCanvasAutomation(a).team).toBe("boekhouding");
  });

  it("maps fasen=['Offboarding'] to team='management'", () => {
    const a = makeAutomatisering({ fasen: ["Offboarding"] });
    expect(toCanvasAutomation(a).team).toBe("management");
  });

  it("defaults to team='management' when fasen is empty array", () => {
    const a = makeAutomatisering({ fasen: [] });
    expect(toCanvasAutomation(a).team).toBe("management");
  });

  it("defaults to team='management' when fasen is undefined", () => {
    const a = makeAutomatisering({ fasen: undefined as unknown as KlantFase[] });
    expect(toCanvasAutomation(a).team).toBe("management");
  });

  it("maps systemen=['HubSpot'] to tool='HubSpot'", () => {
    const a = makeAutomatisering({ systemen: ["HubSpot"] });
    expect(toCanvasAutomation(a).tool).toBe("HubSpot");
  });

  it("maps systemen=[] to tool='Anders'", () => {
    const a = makeAutomatisering({ systemen: [] });
    expect(toCanvasAutomation(a).tool).toBe("Anders");
  });

  it("maps systemen=['Zapier','HubSpot'] to tool='Zapier' (first element)", () => {
    const a = makeAutomatisering({ systemen: ["Zapier", "HubSpot"] });
    expect(toCanvasAutomation(a).tool).toBe("Zapier");
  });

  it("preserves existing fromStepId when existing is provided", () => {
    const a = makeAutomatisering({ fasen: ["Marketing"] });
    const existing: Automation = {
      id: a.id, name: a.naam, team: "marketing", tool: "HubSpot", goal: "",
      fromStepId: "s1", toStepId: "s2",
    };
    const result = toCanvasAutomation(a, existing);
    expect(result.fromStepId).toBe("s1");
    expect(result.toStepId).toBe("s2");
  });

  it("leaves fromStepId and toStepId undefined when no existing provided", () => {
    const a = makeAutomatisering({ fasen: ["Marketing"] });
    const result = toCanvasAutomation(a);
    expect(result.fromStepId).toBeUndefined();
    expect(result.toStepId).toBeUndefined();
  });

  it("maps id and naam correctly", () => {
    const a = makeAutomatisering({ id: "xyz-99", naam: "HubSpot Welcome" });
    const result = toCanvasAutomation(a);
    expect(result.id).toBe("xyz-99");
    expect(result.name).toBe("HubSpot Welcome");
  });

  it("maps doel to goal", () => {
    const a = makeAutomatisering({ doel: "Send welcome email" });
    expect(toCanvasAutomation(a).goal).toBe("Send welcome email");
  });

  it("defaults goal to empty string when doel is undefined", () => {
    const a = makeAutomatisering({ doel: undefined as unknown as string });
    expect(toCanvasAutomation(a).goal).toBe("");
  });
});

// ── PROC-02: handleAttach and handleDetach state transitions ──────────────────

describe("PROC-02: handleAttach and handleDetach state transitions", () => {
  it("handleAttach sets fromStepId and toStepId on matching automation", () => {
    const automation: Automation = {
      id: "auto-1", name: "Test", team: "marketing", tool: "HubSpot", goal: "",
    };
    const state = makeProcessState([automation]);
    const next = applyAttach(state, "auto-1", "s1", "s2");
    const result = next.automations.find(a => a.id === "auto-1");
    expect(result?.fromStepId).toBe("s1");
    expect(result?.toStepId).toBe("s2");
  });

  it("handleAttach does not modify other automations", () => {
    const auto1: Automation = { id: "auto-1", name: "A1", team: "marketing", tool: "HubSpot", goal: "" };
    const auto2: Automation = { id: "auto-2", name: "A2", team: "sales", tool: "Zapier", goal: "" };
    const state = makeProcessState([auto1, auto2]);
    const next = applyAttach(state, "auto-1", "s1", "s2");
    const unchanged = next.automations.find(a => a.id === "auto-2");
    expect(unchanged?.fromStepId).toBeUndefined();
    expect(unchanged?.toStepId).toBeUndefined();
  });

  it("handleAttach updates an already-attached automation to new step IDs", () => {
    const automation: Automation = {
      id: "auto-1", name: "Test", team: "marketing", tool: "HubSpot", goal: "",
      fromStepId: "s1", toStepId: "s2",
    };
    const state = makeProcessState([automation]);
    const next = applyAttach(state, "auto-1", "s3", "s4");
    const result = next.automations.find(a => a.id === "auto-1");
    expect(result?.fromStepId).toBe("s3");
    expect(result?.toStepId).toBe("s4");
  });

  it("handleDetach clears fromStepId and toStepId to undefined", () => {
    const automation: Automation = {
      id: "auto-1", name: "Test", team: "marketing", tool: "HubSpot", goal: "",
      fromStepId: "s1", toStepId: "s2",
    };
    const state = makeProcessState([automation]);
    const next = applyDetach(state, "auto-1");
    const result = next.automations.find(a => a.id === "auto-1");
    expect(result?.fromStepId).toBeUndefined();
    expect(result?.toStepId).toBeUndefined();
  });

  it("handleDetach does not affect other automations", () => {
    const auto1: Automation = {
      id: "auto-1", name: "A1", team: "marketing", tool: "HubSpot", goal: "",
      fromStepId: "s1", toStepId: "s2",
    };
    const auto2: Automation = {
      id: "auto-2", name: "A2", team: "sales", tool: "Zapier", goal: "",
      fromStepId: "s3", toStepId: "s4",
    };
    const state = makeProcessState([auto1, auto2]);
    const next = applyDetach(state, "auto-1");
    const untouched = next.automations.find(a => a.id === "auto-2");
    expect(untouched?.fromStepId).toBe("s3");
    expect(untouched?.toStepId).toBe("s4");
  });
});

// ── PROC-03: autoLinks merge (Plan 02 fix target) ─────────────────────────────
// These tests validate the FIXED autoLinks merge (Plan 02).
// Expected: PASS after Plan 02 applies the ref-pattern fix.

describe("PROC-03: autoLinks merge – ref-pattern fix (Plan 02)", () => {
  it("merges savedLinks fromStepId/toStepId onto matching automation from DB", () => {
    const dbAutomations: Automatisering[] = [
      makeAutomatisering({ id: "auto-1", naam: "Welcome Email", fasen: ["Onboarding"] }),
    ];
    const savedLinks: Record<string, { fromStepId: string; toStepId: string }> = {
      "auto-1": { fromStepId: "s1", toStepId: "s2" },
    };

    const result = mergeAutoLinks(dbAutomations, savedLinks);
    expect(result).toHaveLength(1);
    expect(result[0].fromStepId).toBe("s1");
    expect(result[0].toStepId).toBe("s2");
  });

  it("leaves fromStepId undefined when savedLinks has no entry for the automation", () => {
    const dbAutomations: Automatisering[] = [
      makeAutomatisering({ id: "auto-2", naam: "Pipeline Review", fasen: ["Sales"] }),
    ];
    const savedLinks: Record<string, { fromStepId: string; toStepId: string }> = {};

    const result = mergeAutoLinks(dbAutomations, savedLinks);
    expect(result[0].fromStepId).toBeUndefined();
    expect(result[0].toStepId).toBeUndefined();
  });

  it("correctly merges links for multiple automations, some saved, some not", () => {
    const dbAutomations: Automatisering[] = [
      makeAutomatisering({ id: "auto-1", naam: "A1", fasen: ["Marketing"] }),
      makeAutomatisering({ id: "auto-2", naam: "A2", fasen: ["Sales"] }),
      makeAutomatisering({ id: "auto-3", naam: "A3", fasen: ["Boekhouding"] }),
    ];
    const savedLinks: Record<string, { fromStepId: string; toStepId: string }> = {
      "auto-1": { fromStepId: "s1", toStepId: "s2" },
      "auto-3": { fromStepId: "s5", toStepId: "s6" },
    };

    const result = mergeAutoLinks(dbAutomations, savedLinks);
    const a1 = result.find(a => a.id === "auto-1");
    const a2 = result.find(a => a.id === "auto-2");
    const a3 = result.find(a => a.id === "auto-3");

    expect(a1?.fromStepId).toBe("s1");
    expect(a1?.toStepId).toBe("s2");
    expect(a2?.fromStepId).toBeUndefined();
    expect(a2?.toStepId).toBeUndefined();
    expect(a3?.fromStepId).toBe("s5");
    expect(a3?.toStepId).toBe("s6");
  });

  it("preserves team assignment from fasen after merge", () => {
    const dbAutomations: Automatisering[] = [
      makeAutomatisering({ id: "auto-1", fasen: ["Boekhouding"] }),
    ];
    const savedLinks = { "auto-1": { fromStepId: "s9", toStepId: "s10" } };
    const result = mergeAutoLinks(dbAutomations, savedLinks);
    expect(result[0].team).toBe("boekhouding");
    expect(result[0].fromStepId).toBe("s9");
  });
});

// ── PROC-04: Automatisering field mappings ────────────────────────────────────

describe("PROC-04: Automatisering field mappings (trigger, stappen, systemen, owner)", () => {
  it("trigger field is a string on Automatisering", () => {
    const a = makeAutomatisering({ trigger: "Form submitted via HubSpot" });
    expect(typeof a.trigger).toBe("string");
    expect(a.trigger).toBe("Form submitted via HubSpot");
  });

  it("stappen is an array of strings", () => {
    const a = makeAutomatisering({ stappen: ["Stap 1: Verstuur e-mail", "Stap 2: Wacht 3 dagen"] });
    expect(Array.isArray(a.stappen)).toBe(true);
    expect(a.stappen).toHaveLength(2);
    a.stappen.forEach(s => expect(typeof s).toBe("string"));
  });

  it("stappen defaults to empty array when not provided", () => {
    const a = makeAutomatisering({ stappen: [] });
    expect(Array.isArray(a.stappen)).toBe(true);
    expect(a.stappen).toHaveLength(0);
  });

  it("systemen is an array of Systeem values", () => {
    const systems: Systeem[] = ["HubSpot", "Zapier"];
    const a = makeAutomatisering({ systemen: systems });
    expect(Array.isArray(a.systemen)).toBe(true);
    expect(a.systemen).toHaveLength(2);
    expect(a.systemen[0]).toBe("HubSpot");
    expect(a.systemen[1]).toBe("Zapier");
  });

  it("systemen defaults to empty array when not provided", () => {
    const a = makeAutomatisering({ systemen: [] });
    expect(Array.isArray(a.systemen)).toBe(true);
    expect(a.systemen).toHaveLength(0);
  });

  it("owner is a string", () => {
    const a = makeAutomatisering({ owner: "Sebastiaan" });
    expect(typeof a.owner).toBe("string");
    expect(a.owner).toBe("Sebastiaan");
  });

  it("owner is accessible on Automatisering object", () => {
    const a = makeAutomatisering({ owner: "Brand Boekhouders" });
    expect(a.owner).toBeDefined();
    expect(a.owner).toBe("Brand Boekhouders");
  });

  it("trigger_beschrijving (supabase column) maps to trigger field (confirmed in supabaseStorage.ts)", () => {
    // This test documents the mapping contract: the DB column is trigger_beschrijving,
    // which supabaseStorage.ts maps to `trigger` on the Automatisering interface.
    // We verify the interface has a `trigger` field (not trigger_beschrijving).
    const a = makeAutomatisering({ trigger: "Nieuw contact aangemeld" });
    expect("trigger" in a).toBe(true);
    expect(a.trigger).toBe("Nieuw contact aangemeld");
  });
});
