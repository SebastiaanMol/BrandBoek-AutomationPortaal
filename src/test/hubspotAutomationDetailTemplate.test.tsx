import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AutomationDetailPage from "@/pages/AutomationDetailPage";
import type { Automatisering } from "@/lib/types";

const automations: Automatisering[] = [
  makeAutomation({
    id: "AUTO-HS-DETAIL",
    naam: "Create new deal",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    hubspotLastRunAt: "2026-05-25T10:30:00.000Z",
    lastSyncedAt: "2026-01-21T11:00:00.000Z",
    importProposal: {
      hubspot_workflow: {
        id: "1699666192",
        name: "Create new deal raw",
        revisionId: "16",
      },
    },
    hubspotWorkflow: {
      workflowId: "1699666192",
      name: "Create new deal",
      objectType: "0-3",
      shouldReEnroll: true,
      triggers: [
        { label: "activiteit is Actief", property: "activiteit", operator: "IS_ANY_OF", value: "Actief", source: "HubSpot" },
        { label: "pipeline is 5941173", property: "pipeline", operator: "IS_ANY_OF", value: "5941173", source: "HubSpot" },
      ],
      actions: [
        {
          index: 1,
          type: "WEBHOOK",
          label: "Webhook",
          webhookMethod: "POST",
          webhookUrl: "https://example.test/operations/hubspot/create_new_deal",
          webhookPath: "/operations/hubspot/create_new_deal",
        },
      ],
    },
  }),
  makeAutomation({
    id: "AUTO-TF-DETAIL",
    naam: "Typeform intake",
    source: "typeform",
    categorie: "Typeform",
    systemen: ["Typeform"],
  }),
  makeAutomation({
    id: "AUTO-HS-NO-ID",
    naam: "HubSpot zonder bronlink",
    source: "hubspot",
    categorie: "HubSpot Workflow",
    hubspotWorkflow: {
      name: "HubSpot zonder bronlink",
      triggers: [],
      actions: [],
    },
  }),
];

const useAutomationsMock = vi.fn();
const useJourneyAutomationsMock = vi.fn();

vi.mock("@/lib/hooks", () => ({
  useAutomatiseringen: () => useAutomationsMock(),
  useAutomatiseringenIncludingLegacyGitlab: () => useJourneyAutomationsMock(),
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

describe("HubSpot automation detail template", () => {
  it("uses the HubSpot template for HubSpot automations", () => {
    renderDetail("AUTO-HS-DETAIL");

    expect(screen.getByRole("link", { name: "Terug naar automations" })).toHaveAttribute("href", "/alle");

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Active")).toBeInTheDocument();
    expect(within(header).getByRole("heading", { name: "Create new deal" })).toBeInTheDocument();
    expect(within(header).getByText("HubSpot workflow")).toBeInTheDocument();
    expect(within(header).getByText("Deal object · 0-3")).toBeInTheDocument();
    expect(within(header).getByText("ID 1699666192")).toBeInTheDocument();
    expect(within(header).getByText("Revision 16")).toBeInTheDocument();
    expect(within(header).getByText("Updated Jan 21, 2026")).toBeInTheDocument();
    expect(within(header).getByRole("link", { name: "Edit" })).toHaveAttribute("href", "/bewerk/AUTO-HS-DETAIL");
    expect(within(header).getByRole("button", { name: "Raw data" })).toBeInTheDocument();
    expect(within(header).queryByRole("link", { name: "Vraag Brandy" })).not.toBeInTheDocument();

    const sourceLink = screen.getByRole("link", { name: "Open in HubSpot" });
    expect(sourceLink).toHaveAttribute(
      "href",
      "https://app.hubspot.com/workflows/6108551/platform/flow/1699666192/edit",
    );
    const hubspotTemplate = screen.getByLabelText("HubSpot automation detail");
    expect(within(hubspotTemplate).getByRole("heading", { name: "Wat doet deze automation?" })).toBeInTheDocument();
    expect(within(hubspotTemplate).getByText("Workflow state")).toBeInTheDocument();
    expect(within(hubspotTemplate).getByText("Startvoorwaarden")).toBeInTheDocument();
    expect(within(hubspotTemplate).getByText("Webhook Action")).toBeInTheDocument();
    expect(
      within(hubspotTemplate).getByText("Automation Ownership").compareDocumentPosition(
        within(hubspotTemplate).getByText("Webhook Action"),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(hubspotTemplate).getByText("/operations/hubspot/create_new_deal")).toBeInTheDocument();
    expect(within(hubspotTemplate).getByText("Gebruikte properties")).toBeInTheDocument();
    expect(within(hubspotTemplate).getByText("Field mappings niet beschikbaar in HubSpot workflowdata")).toBeInTheDocument();
    expect(screen.queryByLabelText("Standaard automation uitleg")).not.toBeInTheDocument();
  });

  it("opens raw HubSpot data from the detail header", () => {
    renderDetail("AUTO-HS-DETAIL");

    fireEvent.click(screen.getByRole("button", { name: "Raw data" }));

    const dialog = screen.getByRole("dialog", { name: "Raw HubSpot data" });
    expect(within(dialog).getByText("Workflow ID 1699666192")).toBeInTheDocument();
    expect(within(dialog).getByText(/Create new deal raw/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Kopieer JSON" })).toBeInTheDocument();
  });

  it("keeps non-HubSpot automations on their own detail templates", () => {
    renderDetail("AUTO-TF-DETAIL");

    expect(screen.queryByRole("link", { name: "Open in HubSpot" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("HubSpot automation detail")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Typeform automation detail")).toBeInTheDocument();
  });

  it("shows a disabled source link state for HubSpot automations without a workflow ID", () => {
    renderDetail("AUTO-HS-NO-ID");

    expect(screen.queryByRole("link", { name: "Open in HubSpot" })).not.toBeInTheDocument();
    expect(screen.getByText("Bronlink niet beschikbaar")).toBeInTheDocument();
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

function makeAutomation(input: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO-TEST",
    naam: "Automation",
    categorie: "Anders",
    doel: "Verwerkt automation data.",
    trigger: "Startsignaal",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "Linda",
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
