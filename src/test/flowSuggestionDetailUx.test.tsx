import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FlowSuggestionDetail from "@/pages/FlowSuggestionDetail";
import { StepLogicDetails } from "@/components/flows/StepLogicDetails";
import { ProcessJourneyNarrative } from "@/components/flows/ProcessJourneyNarrative";
import type { Automatisering } from "@/lib/types";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";

const mocks = vi.hoisted(() => ({
  accepteerFlowKandidaat: vi.fn(),
  createFlow: vi.fn(),
  nameFlow: vi.fn(),
  verwerpFlowSuggestie: vi.fn(),
}));

vi.mock("@/lib/queryHooks/automationLinks", () => ({
  useAccepteerFlowKandidaat: () => ({ mutateAsync: mocks.accepteerFlowKandidaat, isPending: false }),
  useFlowSuggesties: () => ({ data: suggestions, isLoading: false }),
  useVerwerpFlowSuggestie: () => ({ mutateAsync: mocks.verwerpFlowSuggestie, isPending: false }),
}));

vi.mock("@/lib/queryHooks/automations", () => ({
  useAutomatiseringenIncludingLegacyGitlab: () => ({ data: automations }),
}));

vi.mock("@/lib/queryHooks/pipelines", () => ({
  usePipelines: () => ({ data: [] }),
}));

vi.mock("@/lib/queryHooks/flows", () => ({
  useCreateFlow: () => ({ mutateAsync: mocks.createFlow }),
}));

vi.mock("@/lib/storage/flows", () => ({
  nameFlow: mocks.nameFlow,
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
      calls: ["hubspot.properties.update"],
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createFlow.mockResolvedValue({ id: "flow-123" });
    mocks.nameFlow.mockResolvedValue({
      naam: "AI fallback naam",
      beschrijving: "AI fallback beschrijving",
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("shows the review cockpit with exact webhook proof and no probability language", () => {
    renderSuggestionDetail();

    expect(screen.getByText("Klaar voor review")).toBeInTheDocument();
    expect(screen.getByText("Bewijsstatus")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getAllByText("100% webhook-match").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /goedkeuren/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /verwerp/i })).toBeEnabled();
    expect(screen.queryByText(/waarschijnlijk|kans|probability|likely/i)).not.toBeInTheDocument();
  });

  it("shows the AI workbench with prompt copy, result input, and read-only guardrails", () => {
    renderSuggestionDetail();

    expect(screen.getByRole("heading", { name: /verrijk dit voorstel handmatig met ai/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /prompt kopi/i }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Analyseer onderstaande procesreis-kandidaat"));
    expect(screen.getByLabelText("AI-resultaat")).toBeInTheDocument();
    expect(screen.getByText("Blijft read-only")).toBeInTheDocument();
    expect(screen.getByText(/Webhook-bewijs, bewezen overgangen en goedkeuringsstatus/i)).toBeInTheDocument();
  });

  it("processes valid AI JSON as unproven review context in the cockpit", () => {
    renderSuggestionDetail();

    fireEvent.change(screen.getByLabelText("AI-resultaat"), {
      target: {
        value: JSON.stringify({
          title: "BTW kwartaalproces controleren",
          summary: "AI beschrijft het bewezen BTW-pad voor review.",
          businessObject: "BTW-dossier",
          processSteps: ["HubSpot verstuurt de bewezen webhook.", "GitLab werkt het kwartaal bij."],
          changeSummary: ["Het volgende kwartaal wordt bijgewerkt."],
          reviewNotes: ["Controleer of de businessnaam klopt."],
          aiSuggestions: [
            {
              label: "Mogelijk vervolg",
              description: "Controleer of een facturatieproces hierna start.",
              severity: "warning",
              tag: "AI-voorstel",
            },
          ],
          openQuestions: ["Moet finance eigenaar zijn van deze procesreis?"],
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /resultaat verwerken/i }));

    expect(screen.getByRole("heading", { name: "BTW kwartaalproces controleren" })).toBeInTheDocument();
    expect(screen.getByText("AI beschrijft het bewezen BTW-pad voor review.")).toBeInTheDocument();
    expect(screen.getByText("Mogelijk vervolg")).toBeInTheDocument();
    expect(screen.getByText("Controleer of een facturatieproces hierna start.")).toBeInTheDocument();
    expect(screen.getByText("Moet finance eigenaar zijn van deze procesreis?")).toBeInTheDocument();
    expect(screen.getAllByText("Niet bewezen").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Review nodig").length).toBeGreaterThan(0);
  });

  it("prefills the confirmation dialog from manual AI output when approving", () => {
    renderSuggestionDetail();

    fireEvent.change(screen.getByLabelText("AI-resultaat"), {
      target: {
        value: JSON.stringify({
          title: "AI titel voor goedkeuring",
          summary: "AI-samenvatting voor de opslagdialoog.",
          businessObject: "BTW-dossier",
          processSteps: ["Stap een", "Stap twee"],
          changeSummary: ["Wijziging een"],
          reviewNotes: ["Review dit later."],
          aiSuggestions: [
            {
              label: "Niet opslaan als bewijs",
              description: "Dit blijft reviewcontext.",
              severity: "warning",
              tag: "Niet bewezen",
            },
          ],
          openQuestions: ["Open reviewvraag."],
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /resultaat verwerken/i }));
    fireEvent.click(screen.getByRole("button", { name: /goedkeuren/i }));

    const dialog = screen.getByRole("dialog", { name: /procesreis opslaan/i });
    expect(within(dialog).getByDisplayValue("AI titel voor goedkeuring")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue(/AI-samenvatting voor de opslagdialoog/i)).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue(/AI-voorstellen, niet bewezen/i)).toBeInTheDocument();
    expect(mocks.nameFlow).not.toHaveBeenCalled();
  });

  it("calls flow naming AI when approving without manual AI output", async () => {
    renderSuggestionDetail();

    fireEvent.click(screen.getByRole("button", { name: /goedkeuren/i }));

    expect(mocks.nameFlow).toHaveBeenCalledWith(automations);
    const dialog = await screen.findByRole("dialog", { name: /procesreis opslaan/i });
    expect(within(dialog).getByLabelText("Naam")).toHaveValue("AI fallback naam");
    expect(within(dialog).getByLabelText("Beschrijving")).toHaveValue("AI fallback beschrijving");
  });

  it("saves the approved flow from the confirmation dialog path", async () => {
    renderSuggestionDetail();

    fireEvent.change(screen.getByLabelText("AI-resultaat"), {
      target: {
        value: JSON.stringify({
          title: "AI titel voor opslaan",
          summary: "AI-beschrijving voor opslaan.",
          businessObject: "",
          processSteps: [],
          changeSummary: [],
          reviewNotes: [],
          aiSuggestions: [],
          openQuestions: [],
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /resultaat verwerken/i }));
    fireEvent.click(screen.getByRole("button", { name: /goedkeuren/i }));

    const dialog = screen.getByRole("dialog", { name: /procesreis opslaan/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^procesreis opslaan$/i }));

    await waitFor(() => {
      expect(mocks.createFlow).toHaveBeenCalledWith({
        naam: "AI titel voor opslaan",
        beschrijving: "AI-beschrijving voor opslaan.",
        automationIds: ["AUTO-HS-BTW", "AUTO-GL-BTW"],
        systemen: ["HubSpot", "GitLab"],
      });
    });
    expect(mocks.accepteerFlowKandidaat).toHaveBeenCalledWith({
      nodeIds: ["AUTO-HS-BTW", "AUTO-GL-BTW"],
      flowId: "flow-123",
    });
  });

  it("uses a touch-friendly trigger for step logic details", () => {
    render(<StepLogicDetails logic="Deze logica verklaart de stap." />);

    const trigger = screen.getByRole("button", { name: /logica/i });
    expect(trigger).toHaveClass("min-h-[44px]");
    expect(trigger).toHaveClass("focus-visible:ring-2");
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
