import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AutomationDetailPage from "@/pages/AutomationDetailPage";
import type { Automatisering } from "@/lib/types";

const hubspotAutomation = makeAutomation({
  id: "AUTO-HS-WEBHOOK",
  naam: "Whatsapp",
  categorie: "HubSpot Workflow",
  source: "hubspot",
  systemen: ["HubSpot"],
  doel: "Deze workflow stuurt een POST naar https://example.test/private-webhook.",
  trigger: "contact eigenschap",
  stappen: ["Webhook -> https://example.test/private-webhook"],
  beschrijvingInSimpeleTaal: [
    "Stap 1: De automatisering start zodra Deal stage een van deze waarden is '1284704094'.",
    "Stap 2: Er wordt een POST-verzoek gestuurd naar 'https://example.test/private-webhook' om een extern systeem te informeren.",
  ],
  hubspotWorkflow: {
    name: "Whatsapp",
    objectType: "contact",
    enrollmentType: "CONTACT_BASED",
    shouldReEnroll: true,
    triggers: [
      {
        label: "Contact is associated to: Any Meeting",
        source: "HubSpot",
      },
    ],
    actions: [
      {
        index: 1,
        type: "WEBHOOK",
        label: "Webhook -> https://example.test/private-webhook",
        webhookUrl: "https://example.test/private-webhook",
        webhookMethod: "POST",
        webhookPath: "/private-webhook",
      },
    ],
  },
  webhookPaths: ["/private-webhook"],
});

const zapierAutomation = makeAutomation({
  id: "AUTO-ZAP-TRUSTOO",
  naam: "Trustoo Leads - Rotterdam",
  categorie: "Zapier Zap",
  source: "zapier",
  systemen: ["Zapier", "Webhook"],
  doel: "Deze Zap verwerkt een Trustoo-lead en geeft die door aan de Brand backend.",
  trigger: "Zapier trigger: nieuwe lead vanuit Trustoo",
  stappen: [
    "1. Ontvangt een nieuwe lead vanuit Trustoo.",
    "2. Geeft gegevens door aan de backend via /sales/leads/hubspot/trustoo.",
  ],
  importProposal: {
    source: "zapier",
    read_only: true,
    zap: {
      title: "Trustoo Leads - Rotterdam",
      process: {
        trigger: "Ontvangt een nieuwe lead vanuit Trustoo.",
        outcome: "Geeft gegevens door aan de backend.",
        conditions: [],
        emails: [],
        webhookHandoffs: [{ method: "POST", path: "/sales/leads/hubspot/trustoo" }],
        dataLookups: [],
        steps: [
          {
            index: 1,
            appName: "Trustoo",
            title: "Nieuwe lead",
            type: "trigger",
            kind: "trigger",
            summary: "Ontvangt een nieuwe lead vanuit Trustoo.",
            details: ["Bron: Trustoo leadtrigger in Zapier."],
            webhookPaths: [],
          },
          {
            index: 2,
            appName: "Webhooks by Zapier",
            title: "Webhook",
            type: "action",
            kind: "webhook",
            summary: "Geeft gegevens door aan de backend.",
            details: ["Doelsysteem: backend."],
            webhookPaths: ["/sales/leads/hubspot/trustoo"],
          },
        ],
      },
    },
  },
});

const gitlabAutomation = makeAutomation({
  id: "AUTO-GL-CONTACT",
  naam: "Contact change endpoint (POST /operations/hubspot/contact/updating_dealname)",
  categorie: "Backend Script",
  source: "gitlab",
  systemen: ["GitLab", "Backend"],
  externalId: "gitlab::POST /operations/hubspot/contact/updating_dealname",
  gitlabEndpoint: {
    method: "POST",
    endpoint: "/operations/hubspot/contact/updating_dealname",
    api_file: "gitlabtest/app/API/operations.py",
    handler: "contact_change_endpoint",
  },
});

function renderDetail(automation: Automatisering, allAutomations: Automatisering[] = [automation]): void {
  vi.mocked(useAutomationsMock).mockReturnValue({ data: allAutomations, isLoading: false });
  vi.mocked(useJourneyAutomationsMock).mockReturnValue({ data: allAutomations });

  render(
    <MemoryRouter initialEntries={[`/automations/${automation.id}`]}>
      <Routes>
        <Route path="/automations/:id" element={<AutomationDetailPage />} />
        <Route path="/alle" element={<div>Automations</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const useAutomationsMock = vi.fn();
const useJourneyAutomationsMock = vi.fn();

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => useAutomationsMock(),
  useAutomatiseringenIncludingLegacyGitlab: () => useJourneyAutomationsMock(),
  useAutomationSentryIssues: () => ({ isLoading: false, error: null, data: { limited: false, matches: { byAutomationId: {}, summariesByAutomationId: {}, unmatched: [] } } }),
  useFlows: () => ({ data: [] }),
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  useFlowSuggesties: () => ({ data: [] }),
  usePipelines: () => ({ data: [] }),
  useSetCleanupDeleteCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("Automation detail presentation", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("keeps HubSpot webhook URLs and POST language out of the main detail copy", () => {
    renderDetail(hubspotAutomation);

    const hubspotTemplate = screen.getByLabelText("HubSpot automation detail");
    expect(within(hubspotTemplate).getByRole("heading", { name: "Wat doet deze automation?" })).toBeInTheDocument();
    expect(within(hubspotTemplate).getByText("Startvoorwaarden")).toBeInTheDocument();
    expect(within(hubspotTemplate).getByText("Webhook Action")).toBeInTheDocument();
    expect(within(hubspotTemplate).getByText("Field mappings niet beschikbaar in HubSpot workflowdata")).toBeInTheDocument();

    const summaryText = within(hubspotTemplate).getByRole("heading", { name: "Wat doet deze automation?" }).closest("section")?.textContent ?? "";
    expect(summaryText).not.toContain("POST");
    expect(summaryText).not.toContain("https://example.test/private-webhook");
    expect(summaryText).not.toContain("Webhook ->");
    expect(summaryText).not.toContain("1284704094");
    expect(within(hubspotTemplate).getByText("/private-webhook")).toBeInTheDocument();
  });

  it("uses the Zapier detail template for Zapier automations", () => {
    renderDetail(zapierAutomation);

    const zapierTemplate = screen.getByLabelText("Zapier automation detail");
    expect(within(zapierTemplate).getByRole("heading", { name: "Wat doet deze Zap?" })).toBeInTheDocument();
    expect(within(zapierTemplate).getByRole("heading", { name: "Betrokken apps" })).toBeInTheDocument();
    expect(within(zapierTemplate).getByRole("heading", { name: "Zapier metadata" })).toBeInTheDocument();
    expect(within(zapierTemplate).getByRole("heading", { name: "Gaps in deze Zap" })).toBeInTheDocument();
    expect(within(zapierTemplate).getAllByText("Trustoo").length).toBeGreaterThan(0);
    expect(within(zapierTemplate).getAllByText("Webhooks by Zapier").length).toBeGreaterThan(0);

    const summaryText = within(zapierTemplate).getByRole("heading", { name: "Wat doet deze Zap?" }).closest("section")?.textContent ?? "";
    expect(summaryText).not.toContain("POST");
    expect(summaryText).not.toContain("/sales/leads/hubspot/trustoo");
    expect(summaryText).not.toContain("handler");
    expect(screen.queryByLabelText("Standaard automation uitleg")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Brondetails")).not.toBeInTheDocument();
  });

  it("links back to the remembered automation catalog context", () => {
    sessionStorage.setItem("automationNavigator.navigation.automations", JSON.stringify({
      pathname: "/alle",
      search: "?source=hubspot",
      hash: "#catalog",
      scrollY: 360,
      updatedAt: Date.now(),
      data: { query: "Whatsapp" },
    }));

    renderDetail(hubspotAutomation);

    expect(screen.getByRole("link", { name: "Terug naar automations" })).toHaveAttribute(
      "href",
      "/alle?source=hubspot#catalog",
    );
  });

  it("uses a clean display name for GitLab endpoint automations on the detail header", () => {
    renderDetail(gitlabAutomation);

    screen.getByRole("heading", { level: 1, name: "Contact change endpoint" });
    expect(screen.queryByRole("heading", { name: /POST \/operations/ })).not.toBeInTheDocument();

    const gitlabTemplate = screen.getByLabelText("GitLab automation detail");
    expect(within(gitlabTemplate).getByRole("heading", { name: "Wat doet deze backend automation?" })).toBeInTheDocument();
    expect(within(gitlabTemplate).getByRole("heading", { name: "Backend uitvoering" })).toBeInTheDocument();
    expect(within(gitlabTemplate).getByRole("heading", { name: "GitLab locatie" })).toBeInTheDocument();
    expect(within(gitlabTemplate).getByRole("heading", { name: "Call graph" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Standaard automation uitleg")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Brondetails")).not.toBeInTheDocument();
  });

  it("shows the chain reaction card with webhook proof and a stop gap", () => {
    const createNewDeal = makeAutomation({
      id: "AUTO-HS-CREATE",
      naam: "Create new deal",
      categorie: "HubSpot Workflow",
      source: "hubspot",
      systemen: ["HubSpot"],
      hubspotWorkflow: {
        name: "Create new deal",
        objectType: "deal",
        enrollmentType: "LIST_BASED",
        shouldReEnroll: true,
        triggers: [{ label: "Sales deal stage is Actief", source: "HubSpot" }],
        actions: [
          {
            index: 1,
            type: "WEBHOOK",
            label: "Send a webhook",
            webhookMethod: "POST",
            webhookPath: "/operations/hubspot/create_new_deal",
            webhookUrl: "https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal",
          },
        ],
      },
      webhookPaths: ["/operations/hubspot/create_new_deal"],
    });
    const backend = makeAutomation({
      id: "AUTO-GL-CREATE",
      naam: "New create deal",
      categorie: "Backend Script",
      source: "gitlab",
      systemen: ["GitLab", "HubSpot"],
      externalId: "gitlab::POST /operations/hubspot/create_new_deal",
      endpoints: ["/operations/hubspot/create_new_deal"],
      gitlabEndpoint: {
        method: "POST",
        endpoint: "/operations/hubspot/create_new_deal",
        api_file: "gitlabtest/app/API/operations.py",
        handler: "new_create_deal",
      },
    });

    renderDetail(createNewDeal, [createNewDeal, backend]);

    const chainCard = screen.getByLabelText("Kettingreactie vanaf deze automation");
    expect(within(chainCard).getByRole("heading", { name: "Kettingreactie vanaf deze automation" })).toBeInTheDocument();
    expect(within(chainCard).getByText("https://composed-month-production.up.railway.app/operations/hubspot/create_new_deal")).toBeInTheDocument();
    expect(within(chainCard).getByText("New create deal")).toBeInTheDocument();
    expect(within(chainCard).getByText("HubSpot vervolgdeals")).toBeInTheDocument();
    expect(within(chainCard).getByText("Hier stopt het bewijs")).toBeInTheDocument();
    expect(chainCard.textContent).not.toMatch(/waarschijnlijk|mogelijk|88%|95%|30%/i);
  });
});

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Anders",
    doel: "",
    trigger: "",
    systemen: ["Anders"],
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
    ...input,
  } as Automatisering;
}
