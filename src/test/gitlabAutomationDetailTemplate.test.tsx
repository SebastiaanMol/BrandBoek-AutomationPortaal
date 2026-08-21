import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AutomationDetailPage from "@/pages/AutomationDetailPage";
import type { Automatisering } from "@/lib/types";

const automations: Automatisering[] = [
  makeGitLabAutomation(),
  makeAutomation({
    id: "AUTO-HS-UPSTREAM",
    naam: "HubSpot klant sync workflow",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    systemen: ["HubSpot"],
    webhookPaths: ["/clockify/hubspot/upsert_client"],
  }),
  makeAutomation({
    id: "AUTO-ZAP-DETAIL",
    naam: "Zapier detail",
    source: "zapier",
    categorie: "Zapier Zap",
    systemen: ["Zapier"],
  }),
];

const confirmedLinks = [{ sourceId: "AUTO-HS-UPSTREAM", targetId: "AUTO-GL-CLOCKIFY" }];
const flowSuggesties = [
  {
    fromId: "AUTO-HS-UPSTREAM",
    toId: "AUTO-GL-CLOCKIFY",
    fromNaam: "HubSpot klant sync workflow",
    toNaam: "Upsert clockify client from hubspot",
    fromCategorie: "HubSpot Workflow",
    toCategorie: "Backend Script",
    fromSource: "hubspot",
    toSource: "gitlab",
    zekerheid: "webhook" as const,
    redenering: "Webhook-match: automation roept endpoint /clockify/hubspot/upsert_client aan.",
    confirmed: true,
    rejected: false,
  },
];

const useAutomationsMock = vi.fn();
const useJourneyAutomationsMock = vi.fn();

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => useAutomationsMock(),
  useAutomatiseringenIncludingLegacyGitlab: () => useJourneyAutomationsMock(),
  useAutomationSentryIssues: () => ({ isLoading: false, error: null, data: { limited: false, matches: { byAutomationId: {}, summariesByAutomationId: {}, unmatched: [] } } }),
  useFlows: () => ({ data: [] }),
  useAllConfirmedAutomationLinks: () => ({ data: confirmedLinks }),
  useFlowSuggesties: () => ({ data: flowSuggesties }),
  usePipelines: () => ({ data: [] }),
  useSetCleanupDeleteCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("GitLab automation detail template", () => {
  it("uses the GitLab template for GitLab endpoint automations", () => {
    renderDetail("AUTO-GL-CLOCKIFY");

    expect(screen.getByRole("link", { name: "Terug naar automations" })).toHaveAttribute("href", "/alle");

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Active")).toBeInTheDocument();
    expect(within(header).getByText("GitLab")).toBeInTheDocument();
    expect(within(header).getByRole("heading", { name: "Upsert clockify client from hubspot" })).toBeInTheDocument();
    expect(within(header).getByText("POST /clockify/hubspot/upsert_client")).toBeInTheDocument();
    expect(within(header).getByText("app/API/clockify.py")).toBeInTheDocument();
    expect(within(header).getByText("Handler upsert_client")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/bewerk/AUTO-GL-CLOCKIFY");
    expect(within(header).getByRole("button", { name: "Raw data" })).toBeInTheDocument();
    expect(within(header).queryByRole("link", { name: "Open in GitLab" })).not.toBeInTheDocument();
    expect(within(header).getByText("Bronlink niet beschikbaar")).toBeInTheDocument();

    const gitlabTemplate = screen.getByLabelText("GitLab automation detail");
    expect(within(gitlabTemplate).getByRole("heading", { name: "Wat doet deze backend automation?" })).toBeInTheDocument();
    const summaryCard = within(gitlabTemplate).getByLabelText("GitLab samenvatting");
    expect(within(summaryCard).queryByText("Endpoint")).not.toBeInTheDocument();
    expect(within(summaryCard).queryByText("Call graph")).not.toBeInTheDocument();
    expect(within(summaryCard).queryByText(/Analyse:/)).not.toBeInTheDocument();
    expect(within(gitlabTemplate).getByRole("heading", { name: "Wat gebeurt er precies?" })).toBeInTheDocument();
    expect(within(gitlabTemplate).getByText("Input")).toBeInTheDocument();
    expect(within(gitlabTemplate).getByText("Wordt opgehaald")).toBeInTheDocument();
    expect(within(gitlabTemplate).getByText("Wordt aangepast")).toBeInTheDocument();
    expect(within(gitlabTemplate).getByText("Response")).toBeInTheDocument();
    expect(within(gitlabTemplate).getAllByText("Endpoint").length).toBeGreaterThan(0);
    expect(within(gitlabTemplate).getAllByText("Call graph").length).toBeGreaterThan(0);
    expect(within(gitlabTemplate).getByRole("heading", { name: "Dataflow" })).toBeInTheDocument();
    expect(within(gitlabTemplate).getAllByText("HubSpot klant sync workflow").length).toBeGreaterThan(0);
    expect(within(gitlabTemplate).getByRole("heading", { name: "Backend uitvoering" })).toBeInTheDocument();
    expect(within(gitlabTemplate).getByRole("heading", { name: "GitLab locatie" })).toBeInTheDocument();
    expect(within(gitlabTemplate).getByRole("heading", { name: "Inkomende koppelingen" })).toBeInTheDocument();
    expect(within(gitlabTemplate).getByRole("heading", { name: "Issues & gaps" })).toBeInTheDocument();
    const linkedAutomationsHeading = within(gitlabTemplate).getByRole("heading", { name: "Gekoppelde automations" });
    expect(linkedAutomationsHeading).toBeInTheDocument();
    const meaningCard = within(gitlabTemplate).getByLabelText("GitLab betekenisanalyse");
    expect(linkedAutomationsHeading.compareDocumentPosition(meaningCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByLabelText("Standaard automation uitleg")).not.toBeInTheDocument();
  });

  it("opens raw GitLab data from the detail header", () => {
    renderDetail("AUTO-GL-CLOCKIFY");

    fireEvent.click(screen.getByRole("button", { name: "Raw data" }));

    const dialog = screen.getByRole("dialog", { name: "Raw GitLab data" });
    expect(within(dialog).getByText("Automation ID AUTO-GL-CLOCKIFY")).toBeInTheDocument();
    expect(within(dialog).getByText(/upsert_client/)).toBeInTheDocument();
    expect(within(dialog).getByText(/incomingLinks/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Kopieer JSON" })).toBeInTheDocument();
  });

  it("keeps non-GitLab automations on their existing templates", () => {
    renderDetail("AUTO-ZAP-DETAIL");

    expect(screen.queryByLabelText("GitLab automation detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Wat doet deze backend automation?" })).not.toBeInTheDocument();
  });

  it("opens legacy GitLab records without endpoint on their specific detail page", () => {
    const legacyAutomation = makeAutomation({
      id: "AUTO-GL-LEGACY-FILE",
      naam: "Legacy helper without endpoint",
      source: "gitlab",
      categorie: "Backend Script",
      systemen: ["GitLab"],
      gitlabFilePath: "legacy/helper.py",
      externalId: "legacy/helper.py",
    });
    vi.mocked(useAutomationsMock).mockReturnValue({ data: [], isLoading: false });
    vi.mocked(useJourneyAutomationsMock).mockReturnValue({ data: [legacyAutomation] });

    render(
      <MemoryRouter initialEntries={["/automations/AUTO-GL-LEGACY-FILE"]}>
        <Routes>
          <Route path="/automations/:id" element={<AutomationDetailPage />} />
          <Route path="/alle" element={<div>Automations beheer</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Automations beheer")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Legacy helper without endpoint", level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText("GitLab automation detail")).toBeInTheDocument();
    expect(screen.getByText("Oude GitLab bestandsimport, geen specifiek endpoint gevonden.", { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText("Geen specifiek endpoint").length).toBeGreaterThan(0);
  });
});

function renderDetail(id: string): void {
  vi.mocked(useAutomationsMock).mockReturnValue({ data: automations, isLoading: false });
  vi.mocked(useJourneyAutomationsMock).mockReturnValue({ data: automations });

  render(
    <MemoryRouter initialEntries={[`/automations/${id}`]}>
      <Routes>
        <Route path="/automations/:id" element={<AutomationDetailPage />} />
        <Route path="/alle" element={<div>Automations</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeGitLabAutomation(): Automatisering {
  return makeAutomation({
    id: "AUTO-GL-CLOCKIFY",
    naam: "Upsert clockify client from hubspot",
    source: "gitlab",
    categorie: "Backend Script",
    doel: "Werkt een Clockify klant bij op basis van HubSpot bedrijfsgegevens.",
    trigger: "API endpoint POST /clockify/hubspot/upsert_client",
    systemen: ["GitLab", "HubSpot", "Clockify"],
    stappen: [
      "Het script ontvangt een POST-verzoek met HubSpot bedrijfsgegevens.",
      "Het valideert de API-sleutel voor authenticatie.",
      "Het probeert een Clockify-klant bij te werken of te creëren.",
    ],
    externalId: "app/API/clockify.py::POST /clockify/hubspot/upsert_client",
    gitlabFilePath: "app/API/clockify.py",
    gitlabLastCommit: "c2fdbd671d33f04f9b838892e4f6a22a9dc22ff1",
    lastSyncedAt: "2026-05-05T08:44:32.673Z",
    endpoints: ["/clockify/hubspot/upsert_client"],
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/clockify/hubspot/upsert_client",
      api_file: "app/API/clockify.py",
      handler: "upsert_client",
      calls: [
        { depth: 0, kind: "await_call", from: "app.API.clockify::upsert_client", to: "app.service.clockify::upsert_client", file: "app/service/clockify/clockify.py" },
        { depth: 1, kind: "hubspot_repository_call", from: "app.service.clockify::upsert_client", to: "app.repository.hubspot::get_company_info", file: "app/repository/hubspot.py" },
        { depth: 1, kind: "call", from: "app.service.clockify::upsert_client", to: "app.clockify_client::create_client", file: "app/clockify_client.py" },
      ],
    },
    importProposal: {
      source: "gitlab",
      read_only: true,
      gitlab_endpoint: {
        method: "POST",
        endpoint: "/clockify/hubspot/upsert_client",
        api_file: "app/API/clockify.py",
        handler: "upsert_client",
        calls: [],
      },
    },
  });
}

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Anders",
    doel: "Verwerkt automation data.",
    trigger: "Startsignaal",
    systemen: ["GitLab"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Sales"],
    createdAt: "2026-05-22T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...input,
  } as Automatisering;
}
