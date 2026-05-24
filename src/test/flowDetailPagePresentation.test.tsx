import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import FlowDetail from "@/pages/FlowDetail";
import type { Automatisering, Flow } from "@/lib/types";

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

vi.mock("@/lib/hooks", () => ({
  useFlows: () => ({ data: [wefactFlow], isLoading: false }),
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations }),
  usePipelines: () => ({ data: [] }),
  useUpdateFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteFlow: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/queryHooks/automationLinks", () => ({
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  useBevestigFlowSuggestie: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVerwerpFlowSuggestie: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useOngedaanVerwerpFlowSuggestie: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useOpenSuggestiesVoorFlow: () => ({ data: [] }),
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
  it("keeps the step overview free of repeated WeFact intro copy", () => {
    renderFlowDetail();

    const stepOverview = screen.getByRole("region", { name: /^stap voor stap overzicht$/i });

    expect(within(stepOverview).queryByText("Van HubSpot-trigger naar backendverwerking en WeFact-update.")).not.toBeInTheDocument();
  });

  it("shows transitions as arrows instead of separate in-between blocks", () => {
    renderFlowDetail();

    const stepOverview = screen.getByRole("region", { name: /^stap voor stap overzicht$/i });
    const transition = within(stepOverview).getByRole("separator", {
      name: /overdracht naar backend/i,
    });

    expect(transition).toBeInTheDocument();
    expect(transition).toHaveClass("justify-center");
    expect(within(stepOverview).queryByText(/^Van stap 1 naar stap 2$/i)).not.toBeInTheDocument();
    expect(within(stepOverview).queryByText(/^Stap 1 naar stap 2$/i)).not.toBeInTheDocument();
  });
});
