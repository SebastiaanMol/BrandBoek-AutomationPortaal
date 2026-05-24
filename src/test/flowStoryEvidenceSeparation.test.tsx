import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { FlowHeader } from "@/components/flows/FlowHeader";
import { GitLabLocationCard } from "@/components/GitLabLocationCard";
import type { Automatisering, Flow } from "@/lib/types";

function makeFlow(overrides: Partial<Flow> = {}): Flow {
  return {
    id: "flow-1",
    naam: "Create new deal naar New create deal",
    beschrijving: "Dit gebruikersverhaal hoort alleen in Procesverhaal.",
    systemen: ["HubSpot", "GitLab"],
    automationIds: ["hs", "gl"],
    createdAt: "2026-05-11T00:00:00.000Z",
    updatedAt: "2026-05-11T00:00:00.000Z",
    status: "Actief",
    ...overrides,
  };
}

function makeGitLabAutomation(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "gl",
    naam: "New create deal (POST /operations/hubspot/create_new_deal)",
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["GitLab", "HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-11T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    source: "gitlab",
    externalId: "gitlabtest/app/API/operations.py::POST /operations/hubspot/create_new_deal",
    gitlabFilePath: "gitlabtest/app/API/operations.py",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/operations/hubspot/create_new_deal",
      api_file: "gitlabtest/app/API/operations.py",
      handler: "new_create_deal",
    },
    ...overrides,
  };
}

describe("gebruikersverhaal en technisch bewijs scheiden", () => {
  it("toont geen procesbeschrijving meer in de flowheader", () => {
    render(
      <MemoryRouter>
        <FlowHeader
          flow={makeFlow()}
          automationCount={2}
          naam="Create new deal naar New create deal"
          setNaam={vi.fn()}
          isDirty={false}
          onSave={vi.fn()}
          isSaving={false}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByPlaceholderText("Beschrijving...")).not.toBeInTheDocument();
    expect(screen.queryByText("Dit gebruikersverhaal hoort alleen in Procesverhaal.")).not.toBeInTheDocument();
  });

  it("verbergt GitLab-route en bestandspad standaard achter technisch bewijs in compacte weergave", () => {
    render(<GitLabLocationCard automation={makeGitLabAutomation()} compact />);

    expect(screen.getByRole("button", { name: /technisch bewijs tonen/i })).toBeInTheDocument();
    expect(screen.queryByText(/POST \/operations\/hubspot\/create_new_deal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gitlabtest\/app\/API\/operations\.py/i)).not.toBeInTheDocument();
  });
});
