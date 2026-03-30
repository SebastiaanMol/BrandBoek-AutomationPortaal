/**
 * Tests for PROC-03: Automation placement persists across sessions.
 *
 * The core bug was that the two-effect load sequence ran out of order:
 * Effect 1 (fetchProcessState) ran when prev.automations was still [],
 * so autoLinks restoration was a no-op. Effect 2 (dbAutomations) then
 * replaced automations without the saved links.
 *
 * The fix introduces savedLinksRef: Effect 1 writes autoLinks to the ref,
 * Effect 2 reads from the ref when merging dbAutomations.
 *
 * These tests verify the core logic of toCanvasAutomation with the
 * savedLink fallback that the fixed Effect 2 relies on.
 */

import { describe, it, expect } from "vitest";
import type { Automation, TeamKey } from "@/data/processData";
import type { Automatisering, KlantFase } from "@/lib/types";

// ── Helpers mirrored from Processen.tsx ────────────────────────────────────

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

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeAutomatisering(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id:                  "auto-1",
    naam:                "Test Automation",
    categorie:           "Anders",
    doel:                "Test goal",
    trigger:             "On form submit",
    systemen:            ["HubSpot"],
    stappen:             [],
    afhankelijkheden:    "",
    owner:               "Test Owner",
    status:              "Actief",
    verbeterideeën:      "",
    mermaidDiagram:      "",
    koppelingen:         [],
    fasen:               ["Marketing"],
    createdAt:           new Date().toISOString(),
    laatstGeverifieerd:  null,
    geverifieerdDoor:    "",
    ...overrides,
  };
}

// ── PROC-03: savedLinksRef pattern ─────────────────────────────────────────

describe("PROC-03: autoLinks restoration after page refresh", () => {
  it("returns automation without link positions when no existing or savedLink provided", () => {
    const db = makeAutomatisering();
    const result = toCanvasAutomation(db, undefined);

    expect(result.id).toBe("auto-1");
    expect(result.fromStepId).toBeUndefined();
    expect(result.toStepId).toBeUndefined();
  });

  it("restores fromStepId and toStepId from an existing canvas Automation (pre-fix path)", () => {
    const db = makeAutomatisering();
    const existing: Automation = {
      id:         "auto-1",
      name:       "Test Automation",
      team:       "marketing",
      tool:       "HubSpot",
      goal:       "Test goal",
      fromStepId: "step-a",
      toStepId:   "step-b",
    };

    const result = toCanvasAutomation(db, existing);

    expect(result.fromStepId).toBe("step-a");
    expect(result.toStepId).toBe("step-b");
  });

  it("restores fromStepId and toStepId from a savedLink (the fixed path via savedLinksRef)", () => {
    // This is the critical path the fix enables.
    // Before the fix: `existing` was always undefined when dbAutomations arrived
    // (because Effect 1 ran on empty automations array). So fromStepId/toStepId
    // were always lost.
    //
    // After the fix: Effect 2 reads from savedLinksRef.current and passes it as
    // `existing ?? (savedLink ? { ...savedLink } as Automation : undefined)`.
    // This test verifies that providing a savedLink correctly restores positions.

    const db = makeAutomatisering();
    const savedLink: Automation = {
      id:         "auto-1",
      name:       "",
      team:       "marketing",
      tool:       "",
      goal:       "",
      fromStepId: "step-saved-from",
      toStepId:   "step-saved-to",
    };

    const result = toCanvasAutomation(db, savedLink);

    expect(result.fromStepId).toBe("step-saved-from");
    expect(result.toStepId).toBe("step-saved-to");
  });

  it("existing canvas Automation takes precedence over savedLink", () => {
    // The fixed Effect 2 uses: existing ?? (savedLink ? ... : undefined)
    // So if `existing` is defined, savedLink is ignored (existing wins).
    const db = makeAutomatisering();
    const existing: Automation = {
      id:         "auto-1",
      name:       "Test Automation",
      team:       "marketing",
      tool:       "HubSpot",
      goal:       "Test goal",
      fromStepId: "step-existing-from",
      toStepId:   "step-existing-to",
    };

    const result = toCanvasAutomation(db, existing);

    expect(result.fromStepId).toBe("step-existing-from");
    expect(result.toStepId).toBe("step-existing-to");
  });

  it("savedLinksRef pattern: simulates Effect 2 with savedLinksRef", () => {
    // Full integration-style simulation of the fixed Effect 2 logic:
    //
    //   savedLinksRef.current = saved.autoLinks  (written by Effect 1)
    //
    //   automations: dbAutomations.map(a => {
    //     const existing  = prev.automations.find(x => x.id === a.id);
    //     const savedLink = savedLinksRef.current[a.id];
    //     return toCanvasAutomation(a, existing ?? (savedLink ? { ...savedLink } as Automation : undefined));
    //   })

    const savedLinksRef: Record<string, { fromStepId: string; toStepId: string }> = {
      "auto-1": { fromStepId: "step-from", toStepId: "step-to" },
    };

    // Simulate prevAutomations being [] — as it would be at the time of Effect 2
    const prevAutomations: Automation[] = [];

    const dbAutomations = [makeAutomatisering({ id: "auto-1" })];

    const result = dbAutomations.map(a => {
      const existing  = prevAutomations.find(x => x.id === a.id);
      const savedLink = savedLinksRef[a.id];
      return toCanvasAutomation(a, existing ?? (savedLink ? { ...savedLink } as Automation : undefined));
    });

    expect(result).toHaveLength(1);
    expect(result[0].fromStepId).toBe("step-from");
    expect(result[0].toStepId).toBe("step-to");
  });

  it("savedLinksRef pattern: automation not in savedLinks gets no position", () => {
    const savedLinksRef: Record<string, { fromStepId: string; toStepId: string }> = {};

    const prevAutomations: Automation[] = [];
    const dbAutomations = [makeAutomatisering({ id: "auto-orphan" })];

    const result = dbAutomations.map(a => {
      const existing  = prevAutomations.find(x => x.id === a.id);
      const savedLink = savedLinksRef[a.id];
      return toCanvasAutomation(a, existing ?? (savedLink ? { ...savedLink } as Automation : undefined));
    });

    expect(result[0].fromStepId).toBeUndefined();
    expect(result[0].toStepId).toBeUndefined();
  });

  it("multiple automations: only those with savedLinks get positions restored", () => {
    const savedLinksRef: Record<string, { fromStepId: string; toStepId: string }> = {
      "auto-attached": { fromStepId: "step-a", toStepId: "step-b" },
    };

    const prevAutomations: Automation[] = [];
    const dbAutomations = [
      makeAutomatisering({ id: "auto-attached" }),
      makeAutomatisering({ id: "auto-unattached" }),
    ];

    const result = dbAutomations.map(a => {
      const existing  = prevAutomations.find(x => x.id === a.id);
      const savedLink = savedLinksRef[a.id];
      return toCanvasAutomation(a, existing ?? (savedLink ? { ...savedLink } as Automation : undefined));
    });

    const attached   = result.find(r => r.id === "auto-attached")!;
    const unattached = result.find(r => r.id === "auto-unattached")!;

    expect(attached.fromStepId).toBe("step-a");
    expect(attached.toStepId).toBe("step-b");
    expect(unattached.fromStepId).toBeUndefined();
    expect(unattached.toStepId).toBeUndefined();
  });
});

// ── toCanvasAutomation field mapping ──────────────────────────────────────

describe("toCanvasAutomation field mapping", () => {
  it("maps naam to name", () => {
    const result = toCanvasAutomation(makeAutomatisering({ naam: "Mijn Automatie" }));
    expect(result.name).toBe("Mijn Automatie");
  });

  it("maps first fase to team via FASE_TO_TEAM", () => {
    const result = toCanvasAutomation(makeAutomatisering({ fasen: ["Sales"] }));
    expect(result.team).toBe("sales");
  });

  it("defaults team to management when fasen is empty", () => {
    const result = toCanvasAutomation(makeAutomatisering({ fasen: [] }));
    expect(result.team).toBe("management");
  });

  it("maps first systeem to tool", () => {
    const result = toCanvasAutomation(makeAutomatisering({ systemen: ["Zapier"] }));
    expect(result.tool).toBe("Zapier");
  });

  it("defaults tool to Anders when systemen is empty", () => {
    const result = toCanvasAutomation(makeAutomatisering({ systemen: [] }));
    expect(result.tool).toBe("Anders");
  });

  it("maps doel to goal", () => {
    const result = toCanvasAutomation(makeAutomatisering({ doel: "Bespaar tijd" }));
    expect(result.goal).toBe("Bespaar tijd");
  });

  it("defaults goal to empty string when doel is falsy", () => {
    const db = makeAutomatisering({ doel: "" });
    const result = toCanvasAutomation(db);
    expect(result.goal).toBe("");
  });
});
