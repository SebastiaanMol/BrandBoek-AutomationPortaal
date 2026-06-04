import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Flows from "@/pages/Flows";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type { Automatisering, Flow } from "@/lib/types";

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
    verbeterideeen: "",
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
    endpoint: string,
    overrides: Partial<FlowSuggestie> = {},
  ): FlowSuggestie => ({
    fromId,
    toId,
    fromNaam: fromId,
    toNaam: toId,
    fromCategorie: "Zapier Zap",
    toCategorie: "Backend Script",
    fromSource: "zapier",
    toSource: "gitlab",
    zekerheid: "webhook",
    redenering: `Webhook-match: bron roept endpoint ${endpoint} aan.`,
    confirmed: false,
    rejected: false,
    ...overrides,
  });

  const automations = [
    baseAutomation({
      id: "active-start",
      naam: "Active start",
      source: "hubspot",
      systemen: ["HubSpot"],
      webhookPaths: ["/active-flow"],
    }),
    baseAutomation({
      id: "active-backend",
      naam: "Active backend",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab"],
      endpoints: ["/active-flow"],
    }),
    baseAutomation({
      id: "disabled-start",
      naam: "Disabled start",
      source: "hubspot",
      systemen: ["HubSpot"],
      webhookPaths: ["/disabled-flow"],
    }),
    baseAutomation({
      id: "disabled-backend",
      naam: "Disabled backend",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab"],
      status: "Uitgeschakeld",
      endpoints: ["/disabled-flow"],
    }),
    baseAutomation({
      id: "active-concept-start",
      naam: "Active concept start",
      source: "zapier",
      categorie: "Zapier Zap",
      systemen: ["Zapier"],
    }),
    baseAutomation({
      id: "active-concept-backend",
      naam: "Active concept backend",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab"],
    }),
    baseAutomation({
      id: "disabled-concept-start",
      naam: "Disabled concept start",
      source: "zapier",
      categorie: "Zapier Zap",
      systemen: ["Zapier"],
    }),
    baseAutomation({
      id: "disabled-concept-backend",
      naam: "Disabled concept backend",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab"],
      status: "disabled",
    }),
  ] satisfies Automatisering[];

  const flows = [
    {
      id: "active-flow",
      naam: "Active saved process journey",
      beschrijving: "",
      systemen: ["HubSpot", "GitLab"],
      automationIds: ["active-start"],
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
    },
    {
      id: "disabled-flow",
      naam: "Disabled saved process journey",
      beschrijving: "",
      systemen: ["HubSpot", "GitLab"],
      automationIds: ["disabled-start"],
      createdAt: "2026-05-28T00:00:00.000Z",
      updatedAt: "2026-05-28T00:00:00.000Z",
    },
  ] satisfies Flow[];

  const suggestions = [
    makeSuggestion("active-concept-start", "active-concept-backend", "/active-concept", {
      fromNaam: "Active concept start",
      toNaam: "Active concept backend",
    }),
    makeSuggestion("disabled-concept-start", "disabled-concept-backend", "/disabled-concept", {
      fromNaam: "Disabled concept start",
      toNaam: "Disabled concept backend",
    }),
  ] satisfies FlowSuggestie[];

  return { automations, flows, suggestions };
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

describe("Flows inactive automation filtering", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("shows only active saved and concept journeys in the main tabs and moves disabled ones to a separate tab", () => {
    render(
      <MemoryRouter>
        <Flows />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /Active saved process journey/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Disabled saved process journey/i })).not.toBeInTheDocument();

    const conceptTab = screen.getByRole("tab", { name: /Conceptprocesreizen/i });
    fireEvent.mouseDown(conceptTab);
    fireEvent.click(conceptTab);

    expect(screen.getByRole("article", { name: /Active concept start/i })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: /Disabled concept start/i })).not.toBeInTheDocument();

    const disabledTab = screen.getByRole("tab", { name: /Uitgeschakelde automations/i });
    fireEvent.mouseDown(disabledTab);
    fireEvent.click(disabledTab);

    const disabledPanel = screen.getByRole("tabpanel", { name: /Uitgeschakelde automations/i });
    within(disabledPanel).getByRole("heading", { name: "Procesreizen met uitgeschakelde automations" });
    within(disabledPanel).getByText("Disabled saved process journey");
    within(disabledPanel).getByText(/Disabled backend/);
    within(disabledPanel).getAllByText(/Disabled concept start/);
    within(disabledPanel).getAllByText(/Disabled concept backend/);
  });
});
