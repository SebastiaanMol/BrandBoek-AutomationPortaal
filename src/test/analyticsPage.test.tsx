import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Analyse from "@/pages/Analyse";
import type { Automatisering, Flow } from "@/lib/types";

const { automations, flows } = vi.hoisted(() => {
  const baseAutomation = (overrides: Partial<Automatisering>): Automatisering => ({
    id: "auto",
    naam: "Automation",
    categorie: "Anders",
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
    createdAt: "2026-05-29T00:00:00.000Z",
    laatstGeverifieerd: "2026-05-29T00:00:00.000Z",
    geverifieerdDoor: "Tester",
    lastSyncedAt: "2026-05-29T00:00:00.000Z",
    ...overrides,
  } as Automatisering);

  const automations = [
    baseAutomation({
      id: "hs-create",
      naam: "Create new deal",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      hubspotWorkflow: {
        name: "Create new deal",
        triggers: [{ label: "Deal meets criteria", source: "HubSpot" }],
        actions: [
          {
            index: 1,
            type: "WEBHOOK",
            label: "Send webhook",
            webhookMethod: "POST",
            webhookPath: "/operations/hubspot/create_new_deal",
          },
        ],
      },
    }),
    baseAutomation({
      id: "hs-unmatched",
      naam: "Unmatched HubSpot webhook",
      source: "hubspot",
      categorie: "HubSpot Workflow",
      systemen: ["HubSpot"],
      hubspotWorkflow: {
        name: "Unmatched HubSpot webhook",
        triggers: [{ label: "Deal changed", source: "HubSpot" }],
        actions: [
          {
            index: 1,
            type: "WEBHOOK",
            label: "Send webhook",
            webhookMethod: "POST",
            webhookPath: "/missing/receiver",
          },
        ],
      },
    }),
    baseAutomation({
      id: "gl-create",
      naam: "New create deal",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab", "API"],
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/create_new_deal",
        handler: "new_create_deal",
        api_file: "app/api/operations.py",
        calls: [{ depth: 1, kind: "call", from: "new_create_deal", to: "create_new_deal", file: "operations.py" }],
      },
      endpoints: ["/operations/hubspot/create_new_deal"],
    }),
    baseAutomation({
      id: "gl-gap",
      naam: "Check pipeline usage",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab"],
      gitlabEndpoint: {
        method: "GET",
        endpoint: "/internal/check_pipeline_usage",
        handler: "check_pipeline_usage",
        calls: [{ depth: 1, kind: "call", from: "check_pipeline_usage", to: "read_pipeline", file: "internal.py" }],
      },
    }),
  ] satisfies Automatisering[];

  const flows = [
    {
      id: "flow-1",
      naam: "Create new deal journey",
      beschrijving: "",
      systemen: ["HubSpot", "GitLab"],
      automationIds: ["hs-create", "gl-create"],
      createdAt: "2026-05-29T00:00:00.000Z",
      updatedAt: "2026-05-29T00:00:00.000Z",
    },
  ] satisfies Flow[];

  return { automations, flows };
});

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => ({ data: automations, isLoading: false }),
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations, isLoading: false }),
  useFlows: () => ({ data: flows }),
  useSetCleanupDeleteCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: () => ({ data: [], isLoading: false }),
  };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

describe("Analytics process health page", () => {
  it("renders the new process health cockpit with tabs and metrics", () => {
    render(
      <MemoryRouter>
        <Analyse />
      </MemoryRouter>,
    );

    screen.getByRole("heading", { name: "Procesgezondheid" });
    screen.getByText("Developer-cockpit voor bronkwaliteit, webhook-bewijs en procesreis-dekking.", { exact: false });
    screen.getByText("Gezondheid");
    screen.getByText("GitLab endpoint gap");
    screen.getByRole("tab", { name: "Overzicht" });
    screen.getByRole("tab", { name: "GitLab endpoint gaps" });
    screen.getByRole("tab", { name: "Webhook dekking" });
    screen.getByRole("tab", { name: "Bronkwaliteit" });
    screen.getByRole("tab", { name: "Legacy analyse" });
  });

  it("shows expandable GitLab endpoint diagnostics with route evidence", () => {
    render(
      <MemoryRouter>
        <Analyse />
      </MemoryRouter>,
    );

    clickTab("GitLab endpoint gaps");

    screen.getByRole("heading", { name: "Waarom vormt een endpoint wel of geen procesreis?" });
    const endpointButton = screen.getByRole("button", { name: /New create deal/i });
    fireEvent.click(endpointButton);

    screen.getByRole("heading", { name: "Matchende senders" });
    screen.getByText("Create new deal");
    screen.getByText("hubspot_workflow.actions");
    screen.getByText("automatiseringen.endpoints");
    screen.getByText("Geen inkomende webhook");
  });

  it("shows webhook coverage, source quality and keeps the legacy analysis tab", () => {
    render(
      <MemoryRouter>
        <Analyse />
      </MemoryRouter>,
    );

    clickTab("Webhook dekking");
    const coveragePanel = screen.getByRole("tabpanel", { name: "Webhook dekking" });
    within(coveragePanel).getByText("Outgoing routes en receiver-matches");
    within(coveragePanel).getByText("100% match");
    expect(within(coveragePanel).getAllByText("Geen receiver").length).toBeGreaterThanOrEqual(1);

    clickTab("Bronkwaliteit");
    const sourcePanel = screen.getByRole("tabpanel", { name: "Bronkwaliteit" });
    within(sourcePanel).getByText("HubSpot");
    within(sourcePanel).getByText("GitLab/API");

    clickTab("Legacy analyse");
    screen.getByText("Inzicht in impact, complexiteit en afhankelijkheden van alle automations.");
  });
});

function clickTab(name: string): void {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}
