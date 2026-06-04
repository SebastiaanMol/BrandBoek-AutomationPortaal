import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Automatisering } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  automationRows: [] as unknown[],
  koppelingenRows: [] as unknown[],
  findingRows: [] as unknown[],
  inserts: [] as unknown[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      if (table === "automatiseringen") {
        return {
          select() {
            return makeQuery({ data: mocks.automationRows, error: null });
          },
          insert(payload: unknown) {
            mocks.inserts.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "koppelingen") {
        return {
          select() {
            return makeQuery({ data: mocks.koppelingenRows, error: null });
          },
          insert(payload: unknown) {
            mocks.inserts.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === "automation_source_findings") {
        return {
          select() {
            return makeQuery({ data: mocks.findingRows, error: null });
          },
        };
      }

      return {};
    },
  },
}));

function makeQuery(result: unknown) {
  const query = {
    eq: () => query,
    is: () => query,
    or: () => query,
    order: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => void) => Promise.resolve(resolve(result)),
  };
  return query;
}

const baseAutomation: Automatisering = {
  id: "auto-1",
  naam: "Automation",
  categorie: "Data",
  doel: "Doel",
  trigger: "Trigger",
  systemen: ["HubSpot"],
  stappen: ["Stap"],
  afhankelijkheden: "",
  owner: "Team",
  status: "Actief",
  verbeterideeën: "Maak foutafhandeling explicieter",
  mermaidDiagram: "",
  koppelingen: [],
  fasen: [],
  createdAt: "2026-06-03T00:00:00.000Z",
  laatstGeverifieerd: null,
  geverifieerdDoor: "",
};

describe("automations storage", () => {
  beforeEach(() => {
    mocks.automationRows = [];
    mocks.koppelingenRows = [];
    mocks.findingRows = [];
    mocks.inserts = [];
  });

  it("maps the verbeterideeen database column to the verbeterideeën domain field", async () => {
    mocks.automationRows = [
      {
        id: "auto-1",
        naam: "Automation",
        categorie: "Data",
        doel: "Doel",
        trigger_beschrijving: "Trigger",
        systemen: ["HubSpot"],
        stappen: ["Stap"],
        afhankelijkheden: "",
        owner: "Team",
        status: "Actief",
        verbeterideeen: "Maak foutafhandeling explicieter",
        mermaid_diagram: "",
        fasen: [],
        created_at: "2026-06-03T00:00:00.000Z",
        laatst_geverifieerd: null,
        geverifieerd_door: "",
        source: null,
        external_id: null,
        import_proposal: null,
        reviewer_overrides: null,
      },
    ];

    const { fetchAutomatiseringen } = await import("@/lib/storage/automations");

    const [automation] = await fetchAutomatiseringen();

    expect(automation.verbeterideeën).toBe("Maak foutafhandeling explicieter");
    expect("verbeterideeen" in automation).toBe(false);
  });

  it("does not expose malformed JSON branches as domain branches", async () => {
    mocks.automationRows = [
      {
        id: "auto-1",
        naam: "Automation",
        categorie: "Data",
        doel: "Doel",
        trigger_beschrijving: "Trigger",
        systemen: ["HubSpot"],
        stappen: ["Stap"],
        afhankelijkheden: "",
        owner: "Team",
        status: "Actief",
        verbeterideeen: "",
        mermaid_diagram: "",
        fasen: [],
        created_at: "2026-06-03T00:00:00.000Z",
        laatst_geverifieerd: null,
        geverifieerd_door: "",
        source: null,
        external_id: null,
        import_proposal: null,
        reviewer_overrides: null,
        branches: "not-an-array",
      },
    ];

    const { fetchAutomatiseringen } = await import("@/lib/storage/automations");

    const [automation] = await fetchAutomatiseringen();

    expect(automation.branches).toBeUndefined();
  });

  it("writes the verbeterideeën domain field back to the verbeterideeen database column", async () => {
    const { insertAutomatisering } = await import("@/lib/storage/automations");

    await insertAutomatisering(baseAutomation);

    expect(mocks.inserts[0]).toMatchObject({
      id: "auto-1",
      verbeterideeen: "Maak foutafhandeling explicieter",
    });
  });
});
