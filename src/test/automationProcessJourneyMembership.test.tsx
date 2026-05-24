import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  AutomationProcessJourneyMembership,
  getProcessJourneyMemberships,
} from "@/components/AutomationProcessJourneyMembership";
import type { Automatisering, Flow } from "@/lib/types";

const automations: Automatisering[] = [
  makeAutomation("hs", "Upsert WeFact client", "hubspot", "HubSpot Workflow", ["HubSpot"]),
  makeAutomation("gl", "Upsert wefact debtor from hubspot (POST /wefact/hubspot/upsert_debtor)", "gitlab", "Backend Script", ["GitLab", "Backend", "WeFact"]),
  makeAutomation("tf", "IB intake Typeform", "typeform", "Typeform", ["Typeform"]),
];

const flow: Flow = {
  id: "flow-wefact",
  naam: "WeFact debiteur bijwerken",
  beschrijving: "Zodra HubSpot start, roept het proces POST /wefact/hubspot/upsert_debtor aan.",
  systemen: ["HubSpot", "GitLab", "WeFact"],
  automationIds: ["hs", "gl"],
  createdAt: "2026-05-22T08:00:00.000Z",
  updatedAt: "2026-05-22T08:00:00.000Z",
};

describe("AutomationProcessJourneyMembership", () => {
  it("shows confirmed process journeys with the expanded automation list and highlights the current automation", () => {
    render(
      <MemoryRouter>
        <AutomationProcessJourneyMembership
          automation={automations[2]}
          automations={automations}
          flows={[flow]}
          confirmedLinks={[{ sourceId: "gl", targetId: "tf" }]}
        />
      </MemoryRouter>,
    );

    screen.getByText("Onderdeel van procesreis");
    const journey = screen.getByRole("article", { name: /WeFact debiteur bijwerken/i });
    within(journey).getByRole("link", { name: /Open procesreis WeFact debiteur bijwerken/i });
    expect(within(journey).getByRole("link", { name: /Open procesreis WeFact debiteur bijwerken/i }))
      .toHaveAttribute("href", "/flows/flow-wefact");

    within(journey).getByText("Upsert WeFact client");
    within(journey).getByText("Upsert wefact debtor from hubspot");
    within(journey).getByText("IB intake Typeform");
    within(journey).getByText("Huidige automation");
    expect(within(journey).queryByText(/POST \/wefact\/hubspot\/upsert_debtor/i)).not.toBeInTheDocument();

    expect(screen.queryByText("HubSpot Workflows")).not.toBeInTheDocument();
    expect(screen.queryByText("Backend Script")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggestie")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bevestig/i })).not.toBeInTheDocument();
  });

  it("returns no memberships when the automation is not part of a confirmed process journey", () => {
    const memberships = getProcessJourneyMemberships({
      automationId: "unrelated",
      automations,
      flows: [flow],
      confirmedLinks: [{ sourceId: "gl", targetId: "tf" }],
    });

    expect(memberships).toEqual([]);
  });

  it("shows neutral context when the automation is not linked to a confirmed process journey", () => {
    const standaloneAutomation = makeAutomation("unrelated", "Losse automation", "zapier", "Zapier Zap", ["Zapier"]);

    render(
      <MemoryRouter>
        <AutomationProcessJourneyMembership
          automation={standaloneAutomation}
          automations={[...automations, standaloneAutomation]}
          flows={[flow]}
          confirmedLinks={[]}
        />
      </MemoryRouter>,
    );

    screen.getByText("Nog niet gekoppeld aan een procesreis");
    screen.getByText(
      "Deze automation staat op dit moment los in het portaal. Er is nog geen bevestigde procesreis gevonden waarin deze automation meedoet. Een koppeling wordt pas getoond wanneer een procesreis of bewezen overgang dit expliciet bevestigt.",
    );
    expect(screen.queryByText("Onderdeel van procesreis")).not.toBeInTheDocument();
    expect(screen.queryByText("Bevestigde procesreis")).not.toBeInTheDocument();
    expect(screen.queryByText("HubSpot Workflows")).not.toBeInTheDocument();
    expect(screen.queryByText("Backend Script")).not.toBeInTheDocument();
    expect(screen.queryByText("Suggestie")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bevestig/i })).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("POST");
  });
});

function makeAutomation(
  id: string,
  naam: string,
  source: string,
  categorie: Automatisering["categorie"],
  systemen: Automatisering["systemen"],
): Automatisering {
  return {
    id,
    naam,
    categorie,
    doel: `${naam} houdt het proces actueel.`,
    trigger: "",
    systemen,
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-22T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source,
  } as Automatisering;
}
