import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FlowDetail from "@/pages/FlowDetail";
import type { Automatisering, Flow } from "@/lib/types";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";

const wefactFlow: Flow = {
  id: "f8164cda-51b2-4f80-ae49-cf58a4c9eda8",
  naam: "WeFact debiteur bijwerken",
  beschrijving: "",
  systemen: ["HubSpot", "GitLab", "WeFact"],
  automationIds: ["hs", "gl"],
  createdAt: "2026-05-11T00:00:00.000Z",
  updatedAt: "2026-05-11T00:00:00.000Z",
  status: "Actief",
};

const automations: Automatisering[] = [
  makeAutomation({
    id: "hs",
    naam: "Upsert WeFact client",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    systemen: ["HubSpot"],
    webhookPaths: ["/wefact/hubspot/upsert_debtor"],
    hubspotWorkflow: {
      name: "Upsert WeFact client",
      actions: [
        {
          index: 1,
          type: "WEBHOOK",
          label: "Webhook",
          webhookMethod: "POST",
          webhookPath: "/wefact/hubspot/upsert_debtor",
        },
      ],
    },
  }),
  makeAutomation({
    id: "gl",
    naam: "Upsert wefact debtor from hubspot",
    source: "gitlab",
    categorie: "Backend Script",
    systemen: ["GitLab", "HubSpot", "WeFact"],
    externalId: "gitlab::POST /wefact/hubspot/upsert_debtor",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/wefact/hubspot/upsert_debtor",
      handler: "upsert_wefact_debtor_from_hubspot",
    },
  }),
];

let openSuggestions: FlowSuggestie[] = [];
let currentFlows: Flow[] = [wefactFlow];
let currentAutomations: Automatisering[] = automations;

vi.mock("@/lib/hooks", () => ({
  useFlows: () => ({ data: currentFlows, isLoading: false }),
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: currentAutomations }),
  usePipelines: () => ({ data: [] }),
  useUpdateFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/queryHooks/automationLinks", () => ({
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  useBevestigFlowSuggestie: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVerwerpFlowSuggestie: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useOngedaanVerwerpFlowSuggestie: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useOpenSuggestiesVoorFlow: () => ({ data: openSuggestions }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function makeAutomation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "auto",
    naam: "Automation",
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["HubSpot"],
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
    ...overrides,
  };
}

function renderFlowDetail(): void {
  render(
    <MemoryRouter initialEntries={["/flows/f8164cda-51b2-4f80-ae49-cf58a4c9eda8"]}>
      <Routes>
        <Route path="/flows/:id" element={<FlowDetail />} />
        <Route path="/flows" element={<div>Flows</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FlowDetail presentation", () => {
  beforeEach(() => {
    openSuggestions = [];
    currentFlows = [wefactFlow];
    currentAutomations = automations;
    sessionStorage.clear();
  });

  it("shows the process journey dashboard sections", () => {
    renderFlowDetail();

    expect(screen.getByDisplayValue("WeFact debiteur bijwerken")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wat gebeurt er in deze procesreis?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kettingreactie van startpunt tot eindpunt" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^kettingreactie stap voor stap$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bewijs per overgang" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Wat verandert er?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Automations in deze procesreis" })).toBeInTheDocument();
  });

  it("puts the chain reaction before the process story so the graph is the first main section", () => {
    renderFlowDetail();

    const bodyText = document.body.textContent ?? "";
    const chainIndex = bodyText.indexOf("Kettingreactie van startpunt tot eindpunt");
    const storyIndex = bodyText.indexOf("Wat gebeurt er in deze procesreis?");

    expect(chainIndex).toBeGreaterThan(-1);
    expect(storyIndex).toBeGreaterThan(-1);
    expect(chainIndex).toBeLessThan(storyIndex);
  });

  it("links back to the remembered process journey overview context", () => {
    sessionStorage.setItem("automationNavigator.navigation.flows", JSON.stringify({
      pathname: "/flows",
      search: "",
      hash: "#concepten",
      scrollY: 280,
      updatedAt: Date.now(),
      data: { activeTab: "conceptprocesreizen" },
    }));

    renderFlowDetail();

    expect(screen.getByRole("link", { name: "Terug naar procesreizen" })).toHaveAttribute(
      "href",
      "/flows#concepten",
    );
  });

  it("keeps the step overview free of repeated WeFact intro copy", () => {
    renderFlowDetail();

    const stepOverview = screen.getByRole("region", { name: /^kettingreactie stap voor stap$/i });

    expect(within(stepOverview).queryByText("Van HubSpot-trigger naar backendverwerking en WeFact-update.")).not.toBeInTheDocument();
  });

  it("shows source-derived automation insights in the automation cards", () => {
    renderFlowDetail();

    const cards = screen.getByRole("heading", { name: "Automations in deze procesreis" }).closest("section");

    expect(cards).not.toBeNull();
    expect(within(cards!).getByText(/HubSpot webhook/i)).toBeInTheDocument();
    expect(within(cards!).getAllByText(/WeFact/i).length).toBeGreaterThan(0);
    expect(within(cards!).getAllByText(/Werkt bij/i).length).toBeGreaterThan(0);
  });

  it("shows an execution timeline and highlights steps for the selected automation", () => {
    currentFlows = [{
      ...wefactFlow,
      id: "flow-create-new-deal",
      naam: "Create new deal",
      automationIds: ["hs-create", "gl-create"],
    }];
    currentAutomations = [
      makeAutomation({
        id: "hs-create",
        naam: "Create new deal",
        source: "hubspot",
        categorie: "HubSpot Workflow",
        systemen: ["HubSpot"],
        trigger: "Deal voldoet aan de workflowcriteria",
        webhookPaths: ["/operations/hubspot/create_new_deal"],
        hubspotWorkflow: {
          name: "Create new deal",
          triggers: [{ label: "Deal voldoet aan de workflowcriteria", source: "HubSpot" }],
          actions: [
            {
              index: 1,
              type: "WEBHOOK",
              label: "Webhook",
              webhookPath: "/operations/hubspot/create_new_deal",
            },
          ],
        },
      }),
      makeAutomation({
        id: "gl-create",
        naam: "New create deal (POST /operations/hubspot/create_new_deal)",
        source: "gitlab",
        categorie: "Backend Script",
        systemen: ["GitLab", "HubSpot"],
        externalId: "app/API/operations.py::POST /operations/hubspot/create_new_deal",
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/operations/hubspot/create_new_deal",
          handler: "new_create_deal",
        },
      }),
    ];

    render(
      <MemoryRouter initialEntries={["/flows/flow-create-new-deal"]}>
        <Routes>
          <Route path="/flows/:id" element={<FlowDetail />} />
          <Route path="/flows" element={<div>Flows</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const timeline = screen.getByRole("region", { name: /^inhoudelijke uitvoeringslijn$/i });
    const sidebar = screen.getByRole("complementary", { name: /^betrokken automations$/i });

    within(timeline).getByText("Ontvangt deal-ID");
    within(timeline).getByText("Haalt gegevens op uit HubSpot");
    within(timeline).getByText("Schrijft terug naar HubSpot");
    within(timeline).getByText(/Line items/);
    expect(within(timeline).getAllByText(/Nieuwe HubSpot vervolgdeals/).length).toBeGreaterThan(0);
    within(timeline).getByText("Procesreis stopt hier");

    fireEvent.click(within(sidebar).getByRole("button", { name: /New create deal/i }));

    const lineItemsStep = within(timeline).getByText("Haalt gegevens op uit HubSpot").closest("[data-automation-id]");
    const hubspotStep = within(timeline).getByText(/\/operations\/hubspot\/create_new_deal/).closest("[data-automation-id]");

    expect(lineItemsStep).toHaveAttribute("data-automation-id", "gl-create");
    expect(lineItemsStep).toHaveAttribute("data-highlighted", "true");
    expect(hubspotStep).toHaveAttribute("data-automation-id", "hs-create");
    expect(hubspotStep).toHaveAttribute("data-dimmed", "true");
  });

  it("shows source nodes and transitions as a chain instead of separate in-between blocks", () => {
    renderFlowDetail();

    const chain = screen.getByLabelText("Procesreis kettingreactie");
    const transition = within(chain).getByRole("separator", {
      name: /webhook-match/i,
    });

    expect(transition).toBeInTheDocument();
    expect(within(chain).getByText("100% bewezen")).toBeInTheDocument();
    expect(within(chain).getByRole("link", { name: /Upsert WeFact client/i })).toHaveAttribute("href", "/automations/hs");
    expect(within(chain).getByRole("link", { name: /Upsert wefact debtor from hubspot/i })).toHaveAttribute("href", "/automations/gl");
    expect(screen.queryByText(/88%|95%/)).not.toBeInTheDocument();

    const stepOverview = screen.getByRole("region", { name: /^kettingreactie stap voor stap$/i });
    expect(within(stepOverview).queryByText(/^Van stap 1 naar stap 2$/i)).not.toBeInTheDocument();
    expect(within(stepOverview).queryByText(/^Stap 1 naar stap 2$/i)).not.toBeInTheDocument();
    expect(within(stepOverview).getByText("/wefact/hubspot/upsert_debtor")).toBeInTheDocument();
  });

  it("renders branching transitions as parallel columns instead of a chronological row", () => {
    currentFlows = [{
      ...wefactFlow,
      id: "flow-fanout",
      naam: "Correct Stage IB",
      automationIds: ["hs-correct-stage", "gl-prereqs", "gl-route"],
    }];
    currentAutomations = [
      makeAutomation({
        id: "hs-correct-stage",
        naam: "Correct Stage IB",
        source: "hubspot",
        categorie: "HubSpot Workflow",
        systemen: ["HubSpot"],
        webhookPaths: ["/properties/ib/prereqs_webhook", "/properties/ib/route_after_typeform"],
        hubspotWorkflow: {
          name: "Correct Stage IB",
          actions: [
            {
              index: 1,
              type: "WEBHOOK",
              label: "Webhook prereqs",
              webhookPath: "/properties/ib/prereqs_webhook",
            },
            {
              index: 2,
              type: "WEBHOOK",
              label: "Webhook route",
              webhookPath: "/properties/ib/route_after_typeform",
            },
          ],
        },
      }),
      makeAutomation({
        id: "gl-prereqs",
        naam: "Ib prereqs webhook",
        source: "gitlab",
        categorie: "Backend Script",
        systemen: ["GitLab"],
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/properties/ib/prereqs_webhook",
          handler: "ib_prereqs_webhook",
        },
      }),
      makeAutomation({
        id: "gl-route",
        naam: "Ib route after typeform and machtiging",
        source: "gitlab",
        categorie: "Backend Script",
        systemen: ["GitLab"],
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/properties/ib/route_after_typeform",
          handler: "ib_route_after_typeform",
        },
      }),
    ];

    render(
      <MemoryRouter initialEntries={["/flows/flow-fanout"]}>
        <Routes>
          <Route path="/flows/:id" element={<FlowDetail />} />
          <Route path="/flows" element={<div>Flows</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const chain = screen.getByLabelText("Procesreis kettingreactie");
    within(chain).getByText("Startpunt");
    within(chain).getByText("Meerdere eindpunten");
    expect(within(chain).getAllByText("Correct Stage IB")).toHaveLength(1);
    within(chain).getByText("Ib prereqs webhook");
    within(chain).getByText("Ib route after typeform and machtiging");
    within(chain).getByText("2 webhook-routes");

    const stepOverview = screen.getByRole("region", { name: /^kettingreactie stap voor stap$/i });
    within(stepOverview).getByRole("heading", { name: "Wat triggert wat?" });
    expect(within(stepOverview).getAllByText("Correct Stage IB").length).toBeGreaterThanOrEqual(1);
    expect(within(stepOverview).getAllByText(/Route-laag/).length).toBeGreaterThanOrEqual(2);
  });

  it("replaces legacy GitLab file nodes with the clickable active endpoint in the visual chain", () => {
    currentFlows = [{
      ...wefactFlow,
      id: "flow-typeform",
      naam: "Machtiging verwerken",
      automationIds: ["tf-income-tax", "AUTO-045"],
    }];
    currentAutomations = [
      makeAutomation({
        id: "tf-income-tax",
        naam: "Questionnaire income tax 2025",
        source: "typeform",
        categorie: "Typeform",
        systemen: ["Typeform"],
        importProposal: {
          typeform: {
            form: { id: "form-1", title: "Questionnaire income tax 2025", fields: [], hidden_fields: [] },
            webhooks: [
              {
                tag: "typeform-webhook",
                enabled: true,
                eventTypes: ["form_response"],
                path: "/typeform/webhook",
              },
            ],
          },
        },
      }),
      makeAutomation({
        id: "AUTO-045",
        naam: "Typeform Webhook Verwerking",
        source: "gitlab",
        status: "Uitgeschakeld",
        categorie: "Backend Script",
        systemen: ["GitLab", "Typeform"],
        endpoints: ["/typeform/webhook"],
        webhookPaths: ["/typeform/webhook"],
        gitlabFilePath: "app/API/typeform.py",
      }),
      makeAutomation({
        id: "AUTO-143",
        naam: "Typeform webhook (POST /typeform/webhook)",
        source: "gitlab",
        status: "Actief",
        categorie: "Backend Script",
        systemen: ["GitLab", "Typeform"],
        gitlabEndpoint: {
          method: "POST",
          endpoint: "/typeform/webhook",
          handler: "typeform_webhook",
        },
      }),
    ];

    render(
      <MemoryRouter initialEntries={["/flows/flow-typeform"]}>
        <Routes>
          <Route path="/flows/:id" element={<FlowDetail />} />
          <Route path="/flows" element={<div>Flows</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const chain = screen.getByLabelText("Procesreis kettingreactie");

    expect(within(chain).queryByRole("link", { name: /Typeform Webhook Verwerking/i })).not.toBeInTheDocument();
    expect(within(chain).getByRole("link", { name: /Typeform webhook \(POST \/typeform\/webhook\)/i })).toHaveAttribute(
      "href",
      "/automations/AUTO-143",
    );
  });

  it("shows open suggestions as separate gaps, not confirmed transitions", () => {
    openSuggestions = [
      {
        fromId: "gl",
        toId: "next-auto",
        fromNaam: "Upsert wefact debtor from hubspot",
        toNaam: "Controleer debiteurstatus",
        fromCategorie: "Backend Script",
        toCategorie: "Zapier Zap",
        fromSource: "gitlab",
        toSource: "zapier",
        zekerheid: "ai",
        redenering: "Mogelijk vervolg op basis van namen, nog niet bevestigd.",
        confirmed: false,
        rejected: false,
      },
    ];

    renderFlowDetail();

    expect(screen.getByRole("heading", { name: "Mogelijke vervolgen" })).toBeInTheDocument();
    expect(screen.getAllByText("Controleer debiteurstatus").length).toBeGreaterThan(0);

    const chain = screen.getByLabelText("Procesreis kettingreactie");
    expect(within(chain).queryByText("Controleer debiteurstatus")).not.toBeInTheDocument();
  });
});
