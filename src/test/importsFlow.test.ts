/**
 * importsFlow.test.ts
 * Unit tests for Phase 2 data-completeness logic.
 *
 * IMPORTS-01: inferFasen – keyword-based KlantFase inference from workflow name
 * IMPORTS-02: Approve block logic – blocks approve when fasen is empty/undefined
 * IMPORTS-03: handleSave patch shape – patch object includes fasen and owner keys
 *
 * NOTE: inferFasen is duplicated here from supabase/functions/hubspot-sync/index.ts
 * (Deno edge function cannot be imported into Vitest directly).
 * The pure logic is duplicated here for testability — same pattern as processCanvas.test.ts.
 * Keep in sync with the edge function if the keyword logic ever changes.
 */

import { describe, it, expect } from "vitest";

// ── Duplicated pure logic from supabase/functions/hubspot-sync/index.ts ────────
// Copy of inferFasen for testability.
// Keep in sync with the edge function if keyword logic changes.

function inferFasen(wf: any): string[] {
  const naam = (wf?.name ?? "").toLowerCase();
  const fasen: string[] = [];
  if (/onboarding|welkom|welcome|intake|aanmeld/.test(naam)) fasen.push("Onboarding");
  if (/marketing|nieuwsbrief|newsletter|lead|campagne|campaign/.test(naam)) fasen.push("Marketing");
  if (/sales|offerte|quote|deal|pipeline/.test(naam)) fasen.push("Sales");
  if (/boekhoud|factuur|invoice|betaling|payment|wefact/.test(naam)) fasen.push("Boekhouding");
  if (/offboard|opzegg|churn|verloop|exit/.test(naam)) fasen.push("Offboarding");
  return fasen;
}

// ── Approve block logic helper ────────────────────────────────────────────────

function isApproveBlocked(item: { fasen?: string[] }): boolean {
  return !item.fasen || item.fasen.length === 0;
}

// ── handleSave patch shape helper ────────────────────────────────────────────

function buildSavePatch(draft: {
  naam: string;
  doel: string;
  trigger: string;
  categorie: string;
  fasen: string[];
  owner: string;
}) {
  return {
    naam: draft.naam,
    doel: draft.doel,
    trigger_beschrijving: draft.trigger,
    categorie: draft.categorie,
    fasen: draft.fasen,
    owner: draft.owner,
  };
}

// ── IMPORTS-01: inferFasen ─────────────────────────────────────────────────────

describe("inferFasen", () => {
  it("returns ['Onboarding'] for name containing 'Onboarding'", () => {
    expect(inferFasen({ name: "Onboarding nieuwe klant" })).toEqual(["Onboarding"]);
  });

  it("returns ['Onboarding'] for name containing 'welkom'", () => {
    expect(inferFasen({ name: "Welkom email voor intake" })).toEqual(["Onboarding"]);
  });

  it("returns ['Marketing'] for name containing 'Marketing'", () => {
    expect(inferFasen({ name: "Marketing nieuwsbrief campagne" })).toEqual(["Marketing"]);
  });

  it("returns ['Sales'] for name containing 'sales' and 'deal'", () => {
    expect(inferFasen({ name: "Sales offerte deal pipeline" })).toEqual(["Sales"]);
  });

  it("returns ['Boekhouding'] for name containing 'Boekhouding'", () => {
    expect(inferFasen({ name: "Boekhouding factuur betaling" })).toEqual(["Boekhouding"]);
  });

  it("returns ['Offboarding'] for name containing 'Offboarding'", () => {
    expect(inferFasen({ name: "Offboarding opzegging churn" })).toEqual(["Offboarding"]);
  });

  it("returns ['Onboarding', 'Sales'] for multi-phase workflow name", () => {
    expect(inferFasen({ name: "Onboarding sales flow" })).toEqual(["Onboarding", "Sales"]);
  });

  it("returns [] for name with no keyword match", () => {
    expect(inferFasen({ name: "Workflow 12345" })).toEqual([]);
  });

  it("returns [] for empty name", () => {
    expect(inferFasen({ name: "" })).toEqual([]);
  });

  it("returns [] when name property is missing", () => {
    expect(inferFasen({})).toEqual([]);
  });
});

// ── IMPORTS-02: Approve block logic ───────────────────────────────────────────

describe("Approve block logic", () => {
  it("isApproveBlocked returns true when fasen is empty array", () => {
    expect(isApproveBlocked({ fasen: [] })).toBe(true);
  });

  it("isApproveBlocked returns true when fasen is undefined", () => {
    expect(isApproveBlocked({})).toBe(true);
  });

  it("isApproveBlocked returns false when fasen has at least one value", () => {
    expect(isApproveBlocked({ fasen: ["Onboarding"] })).toBe(false);
  });
});

// ── IMPORTS-03: handleSave patch shape ────────────────────────────────────────

describe("handleSave patch shape", () => {
  it("patch object includes fasen and owner keys", () => {
    const draft = {
      naam: "Test Automation",
      doel: "Test doel",
      trigger: "Form submitted",
      categorie: "E-mail marketing",
      fasen: ["Onboarding"],
      owner: "Jan",
    };
    const patch = buildSavePatch(draft);
    expect("fasen" in patch).toBe(true);
    expect("owner" in patch).toBe(true);
  });

  it("patch fasen value matches draft fasen", () => {
    const draft = {
      naam: "Test",
      doel: "",
      trigger: "",
      categorie: "",
      fasen: ["Marketing", "Sales"],
      owner: "Piet",
    };
    const patch = buildSavePatch(draft);
    expect(patch.fasen).toEqual(["Marketing", "Sales"]);
    expect(patch.owner).toBe("Piet");
  });

  it("patch uses trigger_beschrijving (not trigger) as DB column name", () => {
    const draft = {
      naam: "N",
      doel: "D",
      trigger: "Form ingediend",
      categorie: "C",
      fasen: [],
      owner: "",
    };
    const patch = buildSavePatch(draft);
    expect("trigger_beschrijving" in patch).toBe(true);
    expect("trigger" in patch).toBe(false);
    expect(patch.trigger_beschrijving).toBe("Form ingediend");
  });
});
