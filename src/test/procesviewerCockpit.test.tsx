import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Procesviewer from "@/pages/Procesviewer";

const updateManualStatusMock = vi.hoisted(() => vi.fn());

const fixtures = vi.hoisted(() => ({
  pipelines: [
    {
      pipelineId: "pipe-sales",
      naam: "Sales Pipeline",
      stages: [
        { stage_id: "s1", label: "Start", display_order: 0, metadata: {} },
        { stage_id: "s2", label: "Klaar", display_order: 1, metadata: {} },
      ],
      syncedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      beschrijving: null,
      isActive: true,
      source: "hubspot",
    },
    {
      pipelineId: "pipe-btw",
      naam: "BTW Pipeline",
      stages: [{ stage_id: "btw-1", label: "Open", display_order: 0, metadata: {} }],
      syncedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      beschrijving: null,
      isActive: true,
      source: "hubspot",
    },
    {
      pipelineId: "pipe-archived",
      naam: "Oude Pipeline",
      stages: [{ stage_id: "old-1", label: "Oud", display_order: 0, metadata: {} }],
      syncedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      beschrijving: null,
      isActive: false,
      source: "hubspot",
    },
  ],
  processStates: {
    "pipe-sales": {
      steps: [{ id: "stage-s1", type: "task", label: "Start", team: "sales", column: 0 }],
      connections: [],
      autoLinks: { "auto-1": { fromStepId: "stage-s1", toStepId: "stage-s2" } },
      parkedSteps: [],
      activeLanes: ["sales"],
      customLanes: [],
      flowLinks: {},
      attachments: [],
      artifacts: [],
      manualStatus: "in_review",
      updatedAt: "2026-06-24T09:00:00.000Z",
    },
  },
  automation: {
    id: "auto-1",
    naam: "Sales automation",
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Sales"],
    createdAt: "2026-01-01T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
  },
}));

vi.mock("@/lib/hooks", () => ({
  usePipelines: () => ({ data: fixtures.pipelines }),
  useAutomatiseringen: () => ({ data: [fixtures.automation] }),
  useFlows: () => ({ data: [] }),
  useAllProcessStates: () => ({ data: fixtures.processStates, isLoading: false }),
  useUpdateProcessManualStatus: () => ({ mutate: updateManualStatusMock, isPending: false }),
  useProcessState: (pipelineId: string | null) => ({
    data: pipelineId ? fixtures.processStates[pipelineId as keyof typeof fixtures.processStates] ?? null : null,
  }),
  useAutomationSentryIssueOverview: () => ({
    data: {
      issues: [],
      limited: false,
      fetchedAt: "2026-06-24T10:00:00.000Z",
      matches: {
        byAutomationId: {},
        summariesByAutomationId: {
          "auto-1": {
            linkedIssueCount: 1,
            possibleIssueCount: 0,
            eventCount: 3,
            latestSeen: "2026-06-24T09:30:00.000Z",
          },
        },
        unmatched: [],
      },
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/lib/queryHooks/pipelines", () => ({
  useRenameCustomPipeline: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/process/ProcessCanvas", () => ({
  ProcessCanvas: ({ steps = [] }: { steps?: Array<{ id: string; label: string }> }) => (
    <svg data-testid="shared-process-canvas" width="800" height="400">
      {steps.map((step, index) => (
        <text key={step.id} x={10} y={20 + index * 20}>{step.label}</text>
      ))}
    </svg>
  ),
}));

vi.mock("@/components/process/ProcessenEditor", () => ({
  ProcessenEditor: ({ pipelineId }: { pipelineId: string }) => (
    <div data-testid="processen-editor">Editor voor {pipelineId}</div>
  ),
}));

describe("Procesviewer cockpit", () => {
  beforeEach(() => {
    updateManualStatusMock.mockReset();
  });

  it("starts on the cockpit with KPI cards and pipeline rows", () => {
    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /Proces Cockpit/i })).toBeInTheDocument();
    expect(screen.getByText("Actieve pipelines")).toBeInTheDocument();
    expect(screen.getByText("Opgeslagen procesviews")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Sales Pipeline/i })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /BTW Pipeline/i })).toBeInTheDocument();
  });

  it("uses manual process statuses in the Processtatus column", () => {
    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    const salesRow = screen.getByRole("row", { name: /Sales Pipeline/i });
    const btwRow = screen.getByRole("row", { name: /BTW Pipeline/i });

    expect(within(salesRow).getByRole("button", { name: "Processtatus Sales Pipeline" })).toHaveAttribute("data-status-value", "in_review");
    expect(within(salesRow).getByText("In review")).toBeInTheDocument();
    expect(within(btwRow).getByRole("button", { name: "Processtatus BTW Pipeline" })).toHaveAttribute("data-status-value", "niet_ingericht");
    expect(within(btwRow).getByText("Niet ingericht")).toBeInTheDocument();
    expect(screen.queryByText("Op orde")).not.toBeInTheDocument();
  });

  it("filters cockpit rows by manual process status", () => {
    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByDisplayValue("Alle statussen"), {
      target: { value: "in_review" },
    });

    expect(screen.getByRole("row", { name: /Sales Pipeline/i })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /BTW Pipeline/i })).not.toBeInTheDocument();
  });

  it("renders the manual process status as an app dropdown trigger", () => {
    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    const row = screen.getByRole("row", { name: /Sales Pipeline/i });
    const trigger = within(row).getByRole("button", { name: "Processtatus Sales Pipeline" });

    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("data-status-value", "in_review");
  });

  it("shows inactive pipelines as blocked and not selectable for process work", () => {
    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    const row = screen.getByRole("row", { name: /Oude Pipeline/i });

    expect(within(row).getByText(/hubspot \/ Inactief/i)).toBeInTheDocument();
    expect(within(row).getByText("Geblokt")).toBeInTheDocument();
    expect(within(row).getByText("Pipeline is inactief; hiervoor hoeft geen procesview gemaakt te worden. Wil je dit wel aanpassen? Zet de pipeline eerst weer actief in de bron of portal.")).toBeInTheDocument();
    expect(within(row).getByRole("checkbox", { name: /Selecteer Oude Pipeline/i })).toBeDisabled();
    expect(within(row).getByRole("button", { name: /Open viewer/i })).toBeDisabled();
    expect(within(row).getByRole("button", { name: /Bewerken/i })).toBeDisabled();
  });

  it("filters pipelines with the default manual status", () => {
    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByDisplayValue("Alle statussen"), {
      target: { value: "niet_ingericht" },
    });

    expect(screen.getByRole("row", { name: /BTW Pipeline/i })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Oude Pipeline/i })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Sales Pipeline/i })).not.toBeInTheDocument();
  });

  it("opens the existing viewer from a cockpit row and returns to the cockpit", async () => {
    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    const row = screen.getByRole("row", { name: /Sales Pipeline/i });
    fireEvent.click(within(row).getByRole("button", { name: /Open viewer/i }));

    expect(await screen.findByTestId("shared-process-canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Terug naar cockpit/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Terug naar cockpit/i }));

    expect(screen.getByRole("heading", { name: /Proces Cockpit/i })).toBeInTheDocument();
  });

  it("selects pipelines for bulk export and enables the export button", () => {
    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /Download selectie/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: /Selecteer Sales Pipeline/i }));

    expect(screen.getByRole("button", { name: /Download selectie/i })).not.toBeDisabled();
    expect(screen.getByText("1 geselecteerd")).toBeInTheDocument();
  });

  it("filters pipelines and opens the editor from a cockpit row", async () => {
    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole("textbox", { name: /Zoek pipeline/i }), {
      target: { value: "btw" },
    });

    expect(screen.queryByRole("row", { name: /Sales Pipeline/i })).not.toBeInTheDocument();

    const row = screen.getByRole("row", { name: /BTW Pipeline/i });
    fireEvent.click(within(row).getByRole("button", { name: /Bewerken/i }));

    expect(await screen.findByTestId("processen-editor")).toHaveTextContent("pipe-btw");
    expect(screen.getByRole("button", { name: /Terug naar viewer/i })).toBeInTheDocument();
  });
});
