import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import AutomationDetailPage from "@/pages/AutomationDetailPage";
import type { Automatisering } from "@/lib/types";

const automations: Automatisering[] = [
  makeAutomation({
    id: "AUTO-ZAP-DETAIL",
    naam: "Deal stage update na 4 dagen: Chase -> Alert chase!",
    source: "zapier",
    categorie: "Zapier Zap",
    status: "Uitgeschakeld",
    systemen: ["Zapier", "HubSpot"],
    externalId: "235361233",
    koppelingen: [{ doelId: "AUTO-HS-LINK", label: "Gerelateerde HubSpot workflow" }],
    importProposal: {
      source: "zapier",
      read_only: true,
      zap: {
        id: "235361233",
        title: "Deal stage update na 4 dagen: Chase -> Alert chase!",
        status: "Uitgeschakeld",
        process: {
          trigger: "HubSpot dealstage wordt aangepast.",
          outcome: "HubSpot dealstage wordt bijgewerkt.",
          conditions: ["dealstage blijft 112417868"],
          emails: [],
          webhookHandoffs: [],
          dataLookups: ["HubSpot deal ophalen"],
          steps: [
            makeStep(1, "HubSpot", "Updated Deal Stage", "trigger", "HubSpot dealstage wordt aangepast."),
            makeStep(2, "Delay by Zapier", "Delay For", "delay", "Zapier wacht 4 dagen."),
            makeStep(3, "HubSpot", "Get Deal by ID", "lookup", "Zapier haalt de deal opnieuw op."),
            makeStep(4, "Filter by Zapier", "Only continue if", "condition", "Zapier controleert of de dealstage nog klopt."),
            makeStep(5, "HubSpot", "Update CRM Deal", "action", "Zapier werkt de HubSpot deal bij."),
          ],
        },
      },
      zapier_export: {
        read_only: true,
        node_count: 5,
        sanitized_nodes: {
          "235361233": {
            id: 235361233,
            meta: { timezone: "Europe/Amsterdam" },
            title: "Deal stage update na 4 dagen: Chase -> Alert chase!",
            action: "updated_deal_stage",
            params: { pipeline: "5941173", dealstage: "112417868" },
            paused: true,
            created_at: "2024-04-12T13:22:50+00:00",
            last_changed: "2026-04-27T08:35:30+00:00",
            selected_api: "HubSpotCLIAPI@1.14.0",
            account_id: 7263385,
            authentication_id: 21109035,
            parent_id: null,
          },
          "235361234": {
            id: 235361234,
            action: "get_deal_by_id",
            params: { id: "{{235361233__dealId}}", properties_to_retrieve: ["dealstage"] },
            paused: true,
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: 235361236,
          },
          "235361236": {
            id: 235361236,
            action: "delay_for",
            params: { delay_for_unit: "days", delay_for_value: "4" },
            paused: true,
            selected_api: "DelayCLIAPI@1.1.1",
            parent_id: 235361233,
          },
          "235361237": {
            id: 235361237,
            action: "filter",
            params: {
              filter_criteria: [{ key: "235361234__dealstage", match: "iexact", value: "112417868", action: "continue" }],
            },
            paused: true,
            selected_api: "FilterAPI",
            parent_id: 235361234,
          },
          "235361238": {
            id: 235361238,
            action: "update_crm_deal",
            params: { id: "{{235361234__id}}", pipeline: "5941173", dealstage: "34210945" },
            paused: true,
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: 235361237,
          },
        },
      },
    },
  }),
  makeAutomation({
    id: "AUTO-ZAP-PREVIOUS",
    naam: "Deal stage update na 4 dagen: Afwachting -> Chase",
    source: "zapier",
    categorie: "Zapier Zap",
    status: "Uitgeschakeld",
    systemen: ["Zapier", "HubSpot"],
    externalId: "235354907",
    importProposal: {
      source: "zapier",
      read_only: true,
      zapier_export: {
        read_only: true,
        node_count: 2,
        sanitized_nodes: {
          "235354907": {
            id: 235354907,
            action: "updated_deal_stage",
            params: { pipeline: "5941173", dealstage: "5941262" },
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: null,
          },
          "235355539": {
            id: 235355539,
            action: "update_crm_deal",
            params: { id: "{{235354907__dealId}}", pipeline: "5941173", dealstage: "112417868" },
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: 235354907,
          },
        },
      },
    },
  }),
  makeAutomation({
    id: "AUTO-ZAP-ALERT",
    naam: "Alert Chase! mail naar Joost",
    source: "zapier",
    categorie: "Zapier Zap",
    status: "Uitgeschakeld",
    systemen: ["Zapier", "HubSpot"],
    externalId: "244360792",
    importProposal: {
      source: "zapier",
      read_only: true,
      zapier_export: {
        read_only: true,
        node_count: 1,
        sanitized_nodes: {
          "244360792": {
            id: 244360792,
            action: "updated_deal_stage",
            params: { pipeline: "5941173", dealstage: "34210945" },
            selected_api: "HubSpotCLIAPI@1.14.0",
            parent_id: null,
          },
        },
      },
    },
  }),
  makeAutomation({
    id: "AUTO-HS-LINK",
    naam: "Gerelateerde HubSpot workflow",
    source: "hubspot",
    categorie: "HubSpot Workflow",
  }),
  makeAutomation({
    id: "AUTO-TF-DETAIL",
    naam: "Typeform intake",
    source: "typeform",
    categorie: "Typeform",
    systemen: ["Typeform"],
  }),
];

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

describe("Zapier automation detail template", () => {
  it("uses the Zapier template for Zapier automations", () => {
    renderDetail("AUTO-ZAP-DETAIL");

    const header = screen.getByRole("banner");
    expect(within(header).getByText("Zapier")).toBeInTheDocument();
    expect(within(header).getByText("Disabled")).toBeInTheDocument();
    expect(within(header).getByText("Zap ID 235361233")).toBeInTheDocument();
    expect(within(header).getByText("Created 12 apr 2024")).toBeInTheDocument();
    expect(within(header).getByText("Last updated 27 apr 2026")).toBeInTheDocument();
    expect(within(header).getByText("Timezone Europe/Amsterdam")).toBeInTheDocument();
    const editAction = within(header).getByRole("link", { name: "Edit" });
    const rawDataAction = within(header).getByRole("button", { name: "Raw data" });
    const openInZapierAction = within(header).getByRole("link", { name: "Open in Zapier" });
    expect(editAction).toHaveAttribute("href", "/bewerk/AUTO-ZAP-DETAIL");
    expect(openInZapierAction).toHaveAttribute("href", "https://zapier.com/app/editor/235361233");
    expect(editAction.compareDocumentPosition(rawDataAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rawDataAction.compareDocumentPosition(openInZapierAction) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(header).queryByRole("link", { name: "Open in HubSpot" })).not.toBeInTheDocument();

    const zapierTemplate = screen.getByLabelText("Zapier automation detail");
    const summaryCard = within(zapierTemplate).getByLabelText("Zapier samenvatting");
    expect(within(summaryCard).getByRole("heading", { name: "Wat doet deze Zap?" })).toBeInTheDocument();
    expect(within(summaryCard).getByText(/Deze Zap start wanneer HubSpot dealstage verandert/)).toBeInTheDocument();
    expect(within(summaryCard).getByText("Filter check")).toBeInTheDocument();

    const stepsCard = within(zapierTemplate).getByLabelText("Zapier stappenplan");
    expect(within(stepsCard).getByRole("heading", { name: "Zapier stappenplan" })).toBeInTheDocument();
    expect(within(stepsCard).getByText("5 stappen")).toBeInTheDocument();
    expect(within(stepsCard).queryByRole("heading", { name: "Wat doet deze Zap?" })).not.toBeInTheDocument();
    expect(within(stepsCard).getByText("Start wanneer HubSpot dealstage verandert")).toBeInTheDocument();
    expect(within(stepsCard).getByText("Wacht 4 dagen")).toBeInTheDocument();
    expect(within(stepsCard).getByText("Controleert of de deal nog aan de voorwaarde voldoet")).toBeInTheDocument();
    expect(within(stepsCard).getByText("dealstage gelijk is aan Chase (112417868)")).toBeInTheDocument();
    expect(within(stepsCard).getByText(/Alert chase! \(34210945\)/i)).toBeInTheDocument();
    expect(within(stepsCard).getByText("Ja: Verder")).toBeInTheDocument();
    expect(within(stepsCard).getByText("Nee: Stop")).toBeInTheDocument();
    expect(within(zapierTemplate).getByRole("heading", { name: "Betrokken apps" })).toBeInTheDocument();
    expect(within(zapierTemplate).getByRole("heading", { name: "Zapier metadata" })).toBeInTheDocument();
    expect(within(zapierTemplate).getByText("Account ID")).toBeInTheDocument();
    expect(within(zapierTemplate).getByText("7263385")).toBeInTheDocument();
    expect(within(zapierTemplate).getByRole("heading", { name: "Gaps in deze Zap" })).toBeInTheDocument();
    expect(within(zapierTemplate).getByText("Gekoppelde automatiseringen")).toBeInTheDocument();
    expect(within(zapierTemplate).getByText("Handmatig gedocumenteerd")).toBeInTheDocument();
    expect(within(zapierTemplate).getByText("Startsignaal")).toBeInTheDocument();
    expect(within(zapierTemplate).getByRole("link", { name: /Gerelateerde HubSpot workflow/ })).toHaveAttribute("href", "/automations/AUTO-HS-LINK");
    expect(screen.queryByLabelText("Standaard automation uitleg")).not.toBeInTheDocument();
  });

  it("opens raw Zapier data from the detail header", () => {
    renderDetail("AUTO-ZAP-DETAIL");

    fireEvent.click(screen.getByRole("button", { name: "Raw data" }));

    const dialog = screen.getByRole("dialog", { name: "Raw Zapier data" });
    expect(within(dialog).getByText("Zap ID 235361233")).toBeInTheDocument();
    expect(within(dialog).getByText(/updated_deal_stage/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Kopieer JSON" })).toBeInTheDocument();
  });

  it("starts at the top when a Zapier detail page opens", () => {
    document.documentElement.scrollTop = 1400;
    document.body.scrollTop = 1400;

    renderDetail("AUTO-ZAP-DETAIL");

    expect(document.documentElement.scrollTop).toBe(0);
    expect(document.body.scrollTop).toBe(0);
  });

  it("keeps non-Zapier automations on their existing templates", () => {
    renderDetail("AUTO-TF-DETAIL");

    expect(screen.queryByLabelText("Zapier automation detail")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Typeform automation detail")).toBeInTheDocument();
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
    systemen: ["Zapier"],
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

function makeStep(index: number, appName: string, title: string, kind: string, summary: string) {
  return {
    index,
    appName,
    title,
    type: kind,
    kind,
    summary,
    details: [],
    webhookPaths: [],
  };
}
