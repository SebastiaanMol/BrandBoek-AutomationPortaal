import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import FlowSuggestionDetail from "@/pages/FlowSuggestionDetail";
import { StepLogicDetails } from "@/components/flows/StepLogicDetails";
import { ProcessJourneyNarrative } from "@/components/flows/ProcessJourneyNarrative";
import type { Automatisering } from "@/lib/types";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";

vi.mock("@/lib/queryHooks/automationLinks", () => ({
  useAccepteerFlowKandidaat: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFlowSuggesties: () => ({ data: suggestions, isLoading: false }),
  useVerwerpFlowSuggestie: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/queryHooks/automations", () => ({
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations }),
}));

vi.mock("@/lib/queryHooks/pipelines", () => ({
  usePipelines: () => ({ data: [] }),
}));

vi.mock("@/lib/queryHooks/flows", () => ({
  useCreateFlow: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/lib/storage/flows", () => ({
  nameFlow: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const suggestions: FlowSuggestie[] = [
  {
    fromId: "AUTO-HS-BTW",
    toId: "AUTO-GL-BTW",
    fromNaam: "BTW 2 maanden geboekt instellen",
    toNaam: "Update next quarter prev2m",
    fromCategorie: "HubSpot Workflow",
    toCategorie: "Backend Script",
    fromSource: "hubspot",
    toSource: "gitlab",
    zekerheid: "webhook",
    redenering: "/properties/btw/update_next_quarter_prev2m",
    confirmed: false,
    rejected: false,
  },
];

const automations: Automatisering[] = [
  makeAutomation({
    id: "AUTO-HS-BTW",
    naam: "BTW 2 maanden geboekt instellen",
    categorie: "HubSpot Workflow",
    source: "hubspot",
    systemen: ["HubSpot"],
    trigger: "btw_2_maanden_geboekt = true",
    hubspotWorkflow: {
      name: "BTW 2 maanden geboekt instellen",
      triggers: [
        {
          label: "de dealeigenschap 'btw_2_maanden_geboekt' gelijk is aan 'true'",
          source: "test",
        },
      ],
      actions: [
        {
          index: 0,
          type: "WEBHOOK",
          label: "Webhook",
          webhookMethod: "POST",
          webhookPath: "/properties/btw/update_next_quarter_prev2m",
        },
      ],
    },
    webhookPaths: ["/properties/btw/update_next_quarter_prev2m"],
  }),
  makeAutomation({
    id: "AUTO-GL-BTW",
    naam: "Update next quarter prev2m",
    categorie: "Backend Script",
    source: "gitlab",
    systemen: ["GitLab", "HubSpot"],
    doel: "Volgend BTW-kwartaal bijwerken",
    trigger: "POST /properties/btw/update_next_quarter_prev2m",
    gitlabFilePath: "app/API/operations.py",
    gitlabEndpoint: {
      method: "POST",
      endpoint: "/properties/btw/update_next_quarter_prev2m",
      handler: "update_next_quarter_prev2m",
    },
  }),
];

function makeAutomation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "AUTO",
    naam: "Automation",
    categorie: "Backend Script",
    doel: "Doel",
    trigger: "Trigger",
    systemen: ["HubSpot"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Boekhouding"],
    createdAt: "2026-05-01T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  };
}

function renderSuggestionDetail(): void {
  render(
    <MemoryRouter initialEntries={["/flows/suggesties/AUTO-HS-BTW__AUTO-GL-BTW"]}>
      <Routes>
        <Route path="/flows/suggesties/:id" element={<FlowSuggestionDetail />} />
        <Route path="/flows" element={<div>Flows</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FlowSuggestionDetail UX", () => {
  it("keeps the save action only in the review panel and allows long titles to wrap", () => {
    renderSuggestionDetail();

    expect(screen.getAllByRole("button", { name: /sla op als procesreis/i })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /sla op als procesreis/i })).toHaveClass("min-h-[44px]");
    expect(screen.getByRole("button", { name: /verwerp concept/i })).toHaveClass("min-h-[44px]");
    expect(screen.getByRole("heading", { level: 1 })).toHaveClass("line-clamp-2");
    expect(screen.getByRole("heading", { level: 1 })).not.toHaveClass("truncate");
  });

  it("presents downstream as a visible but unproven follow-up check", () => {
    renderSuggestionDetail();

    const downstreamStep = screen.getByRole("region", { name: /^vervolgcontrole$/i });

    expect(within(downstreamStep).getAllByText(/^vervolgcontrole$/i).length).toBeGreaterThan(0);
    expect(within(downstreamStep).getByText(/geen vervolgproces bewezen/i)).toBeInTheDocument();
    expect(downstreamStep).toHaveClass("border-dashed");
    expect(downstreamStep).toHaveClass("bg-blue-50/40");
    expect(downstreamStep).toHaveClass("text-blue-900");
    expect(screen.queryByText(/gekoppelde volgende procesreis/i)).not.toBeInTheDocument();
  });

  it("keeps start signal and follow-up outside the step-by-step overview", () => {
    renderSuggestionDetail();

    const startBlock = screen.getByRole("region", { name: /^startsignaal$/i });
    const stepOverview = screen.getByRole("region", { name: /^stap voor stap overzicht$/i });
    const followUpBlock = screen.getByRole("region", { name: /^vervolgcontrole$/i });

    expect(within(startBlock).getByText(/startsignaal/i)).toBeInTheDocument();
    expect(within(followUpBlock).getAllByText(/vervolgcontrole/i).length).toBeGreaterThan(0);

    expect(within(stepOverview).getAllByText(/1\./).length).toBeGreaterThan(0);
    expect(within(stepOverview).queryByText(/^startsignaal$/i)).not.toBeInTheDocument();
    expect(within(stepOverview).queryByText(/^vervolgcontrole$/i)).not.toBeInTheDocument();
    expect(within(stepOverview).queryByText(/geen vervolgproces bewezen/i)).not.toBeInTheDocument();
  });

  it("uses a compact arrow transition instead of a separate transition block", () => {
    renderSuggestionDetail();

    const stepOverview = screen.getByRole("region", { name: /^stap voor stap overzicht$/i });
    const transition = within(stepOverview).getByRole("separator", {
      name: /overdracht naar backend/i,
    });

    expect(transition).toBeInTheDocument();
    expect(transition).toHaveClass("justify-center");
    expect(within(stepOverview).queryByText(/^Van stap 1 naar stap 2$/i)).not.toBeInTheDocument();
    expect(within(stepOverview).queryByText(/^Stap 1 naar stap 2$/i)).not.toBeInTheDocument();
  });

  it("uses a touch-friendly trigger for step logic details", () => {
    render(<StepLogicDetails logic="Deze logica verklaart de stap." />);

    const trigger = screen.getByRole("button", { name: /logica/i });
    expect(trigger).toHaveClass("min-h-[44px]");
    expect(trigger).toHaveClass("focus-visible:ring-2");
  });

  it("uses a touch-friendly trigger for the technical trace", () => {
    renderSuggestionDetail();

    expect(screen.getByRole("button", { name: /toon technische trace/i })).toHaveClass("min-h-[44px]");
  });

  it("shows the approved flow description as the confirmed process story", () => {
    render(
      <ProcessJourneyNarrative
        automations={automations}
        pipelines={[]}
        autoMap={new Map(automations.map((automation) => [automation.id, automation]))}
        approvedDescription={[
          "Wanneer een klant of bedrijf in HubSpot klaarstaat om in WeFact te worden aangemaakt of bijgewerkt, start de workflow \"Upsert WeFact client\".",
          "Na afloop blijft HubSpot het startpunt voor de klantrelatie en is WeFact bijgewerkt voor facturatie.",
        ].join("\n\n")}
      />,
    );

    expect(screen.getByText(/WeFact te worden aangemaakt of bijgewerkt/i)).toBeInTheDocument();
    expect(screen.getByText(/WeFact bijgewerkt voor facturatie/i)).toBeInTheDocument();
    expect(screen.queryByText(/De procesreis start zodra/i)).not.toBeInTheDocument();
  });
});
