import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Flows from "@/pages/Flows";
import type { Automatisering, Flow } from "@/lib/types";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";

const { automations, flows, suggestions } = vi.hoisted(() => {
  const baseAutomation = (overrides: Partial<Automatisering>): Automatisering => ({
    id: "automation",
    naam: "Automation",
    categorie: "HubSpot Workflow",
    doel: "",
    trigger: "",
    systemen: [],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-28T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  });

  const makeSuggestion = (
    fromId: string,
    toId: string,
    overrides: Partial<FlowSuggestie> = {},
  ): FlowSuggestie => ({
    fromId,
    toId,
    fromNaam: fromId,
    toNaam: toId,
    fromCategorie: "Workflow",
    toCategorie: "Backend Script",
    fromSource: "hubspot",
    toSource: "gitlab",
    zekerheid: "webhook",
    redenering: "Webhook-match: bron roept endpoint /endpoint aan.",
    confirmed: false,
    rejected: false,
    ...overrides,
  });

  const automations = [
    baseAutomation({
      id: "hubspot-deal",
      naam: "Deal update workflow",
      source: "hubspot",
      systemen: ["HubSpot"],
    }),
    baseAutomation({
      id: "gitlab-deal",
      naam: "Deal endpoint (POST /sales/deal)",
      categorie: "Backend Script",
      source: "gitlab",
      systemen: ["GitLab", "HubSpot"],
    }),
    baseAutomation({
      id: "gitlab-deal-file",
      naam: "Lead- en Dealbeheer voor Sales in HubSpot",
      categorie: "Backend Script",
      source: "gitlab",
      systemen: ["GitLab", "HubSpot"],
    }),
    baseAutomation({
      id: "typeform-intake",
      naam: "Intakeformulier",
      categorie: "Typeform",
      source: "typeform",
      systemen: ["Typeform"],
    }),
    baseAutomation({
      id: "gitlab-intake",
      naam: "Intake endpoint (POST /forms/intake)",
      categorie: "Backend Script",
      source: "gitlab",
      systemen: ["GitLab", "HubSpot"],
    }),
  ] satisfies Automatisering[];

  const suggestions = [
    makeSuggestion("hubspot-deal", "gitlab-deal", {
      fromNaam: "Deal update workflow",
      toNaam: "Deal endpoint (POST /sales/deal)",
      redenering: "Webhook-match: HubSpot roept endpoint /sales/deal aan.",
    }),
    makeSuggestion("hubspot-deal", "gitlab-deal-file", {
      fromNaam: "Deal update workflow",
      toNaam: "Lead- en Dealbeheer voor Sales in HubSpot",
      redenering: "Webhook-match: HubSpot roept endpoint /sales/deal aan.",
    }),
    makeSuggestion("typeform-intake", "gitlab-intake", {
      fromNaam: "Intakeformulier",
      toNaam: "Intake endpoint (POST /forms/intake)",
      fromCategorie: "Typeform",
      fromSource: "typeform",
      redenering: "Webhook-match: Typeform geeft formulierinzending door aan endpoint /forms/intake.",
    }),
  ] satisfies FlowSuggestie[];

  return { automations, flows: [] satisfies Flow[], suggestions };
});

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => ({ data: automations }),
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations }),
  useFlows: () => ({ data: flows }),
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  useFlowSuggesties: () => ({ data: suggestions }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/storage/edgeFunctions", () => ({ invokeEdgeFunction: vi.fn() }));
vi.mock("@/components/FlowSuggestiesTab", () => ({
  FlowSuggestiesTab: () => <div>Technische suggestielijst</div>,
}));

describe("concept journeys list", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("automationNavigator.navigation.flows", JSON.stringify({
      pathname: "/flows",
      search: "",
      hash: "#concepten",
      scrollY: 0,
      updatedAt: Date.now(),
      data: { activeTab: "conceptprocesreizen" },
    }));
  });

  it("shows concept journeys as review cards with automation and webhook counts", () => {
    render(
      <MemoryRouter>
        <Flows />
      </MemoryRouter>,
    );

    expect(screen.getByText("2 conceptreizen klaar voor review")).toBeInTheDocument();

    const dealCard = screen.getByRole("article", { name: /Deal update workflow/i });
    expect(within(dealCard).getByText("2 automations")).toBeInTheDocument();
    expect(within(dealCard).getByText("1 webhook-overgang")).toBeInTheDocument();
    expect(within(dealCard).queryByText("GitLab backendblok")).not.toBeInTheDocument();
    expect(within(dealCard).getByText("Stap 2")).toBeInTheDocument();
    expect(within(dealCard).queryByText("Stap 3")).not.toBeInTheDocument();
    expect(within(dealCard).getByText("100% webhook-match")).toBeInTheDocument();
    expect(within(dealCard).getByText("/sales/deal")).toBeInTheDocument();
    expect(within(dealCard).getByRole("button", { name: /Bekijk procesreis/i })).toBeInTheDocument();

    expect(screen.queryByText("Bronautomation")).not.toBeInTheDocument();
  });

  it("filters concept journey cards by search text", () => {
    render(
      <MemoryRouter>
        <Flows />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Zoek conceptreizen"), {
      target: { value: "intake" },
    });

    expect(screen.queryByRole("article", { name: /Deal update workflow/i })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: /Intakeformulier/i })).toBeInTheDocument();
  });
});
