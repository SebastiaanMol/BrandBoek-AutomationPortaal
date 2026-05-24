import { describe, expect, it } from "vitest";
import { exportToCSV } from "@/lib/supabaseStorage";
import type { Automatisering } from "@/lib/types";

function makeAutomation(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "AUTO-001",
    naam: 'Workflow "Nieuw"',
    categorie: "HubSpot Workflow",
    doel: "Klantgegevens bijwerken",
    trigger: "Deal verandert",
    systemen: ["HubSpot", "Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "Team",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Sales", "Onboarding"],
    createdAt: "2026-05-21T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  };
}

describe("exportToCSV", () => {
  it("exports semicolon-separated CSV that opens in columns in Dutch Excel", () => {
    const csv = exportToCSV([makeAutomation()]);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("sep=;");
    expect(lines[1]).toBe("ID;Naam;Categorie;Doel;Trigger;Systemen;Owner;Status;Fasen");
    expect(lines[2]).toContain('"AUTO-001";"Workflow ""Nieuw""";"HubSpot Workflow"');
    expect(lines[2]).toContain('"HubSpot, Backend"');
    expect(lines[2]).toContain('"Sales, Onboarding"');
  });
});
