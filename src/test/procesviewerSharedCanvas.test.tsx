import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Procesviewer from "@/pages/Procesviewer";

const fixtures = vi.hoisted(() => ({
  pipeline: {
    pipelineId: "pipe-debiteuren",
    naam: "Debiteurenbeheer",
    stages: [{ id: "stage-1", label: "Betaalt op tijd" }],
    syncedAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
  },
  btwPipeline: {
    pipelineId: "pipe-btw",
    naam: "BTW Pipeline",
    stages: [
      { stage_id: "btw-open", label: "Open", display_order: 0, metadata: {} },
      { stage_id: "btw-ready", label: "Gegevens gereed", display_order: 1, metadata: {} },
    ],
    syncedAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
  },
  savedState: {
    steps: [
      { id: "s1", type: "task", label: "Betaalt op tijd", team: "sales", column: 0 },
      { id: "s2", type: "task", label: "1e herinnering", team: "sales", column: 1 },
    ],
    connections: [
      { id: "c1", fromStepId: "s1", toStepId: "s2", manual: true, waypoints: [{ x: 320, y: 120 }] },
    ],
    autoLinks: {},
    parkedSteps: [],
    activeLanes: ["sales"],
    customLanes: [],
    flowLinks: {},
    attachments: [
      {
        id: "att-1",
        type: "annotation",
        label: "Viewer uitleg",
        attachedTo: { kind: "step", id: "s1" },
      },
    ],
    artifacts: [
      {
        id: "artifact-1",
        type: "manualExceptionBlock",
        title: "Betalingsregeling",
        description: "Mogelijk vanuit elke pipeline stage",
        position: { x: 360, y: 180 },
        stepIds: ["s2"],
      },
    ],
  },
  emptySavedState: {
    steps: [],
    connections: [],
    autoLinks: {},
    parkedSteps: [],
    activeLanes: [],
    customLanes: [],
    flowLinks: {},
    attachments: [],
    artifacts: [],
  },
}));

vi.mock("@/lib/hooks", () => ({
  usePipelines: () => ({ data: [fixtures.pipeline, fixtures.btwPipeline] }),
  useAutomatiseringen: () => ({ data: [] }),
  useProcessState: (pipelineId: string | null) => ({
    data: pipelineId === "pipe-btw"
      ? fixtures.emptySavedState
      : pipelineId
        ? fixtures.savedState
        : null,
  }),
}));

vi.mock("@/lib/queryHooks/pipelines", () => ({
  useRenameCustomPipeline: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/procesviewer/ProcessviewerCanvas", () => ({
  ProcessviewerCanvas: () => <div data-testid="legacy-processviewer-canvas" />,
}));

vi.mock("@/components/process/ProcessCanvas", () => ({
  ProcessCanvas: ({
    steps = [],
    attachments = [],
    artifacts = [],
  }: {
    steps?: Array<{ id: string; label: string }>;
    attachments?: Array<{ id: string; label: string }>;
    artifacts?: Array<{ id: string; title: string; stepIds?: string[] }>;
  }) => (
    <div data-testid="shared-process-canvas" style={{ width: 800, height: 400 }}>
      {steps.map((step) => (
        <span key={step.id}>{step.label}</span>
      ))}
      {attachments.map((attachment) => (
        <span key={attachment.id}>{attachment.label}</span>
      ))}
      {artifacts.map((artifact) => (
        <span key={artifact.id}>{`${artifact.title}:${artifact.stepIds?.join(",") ?? ""}`}</span>
      ))}
    </div>
  ),
}));

describe("Procesviewer canvas renderer", () => {
  it("uses the shared ProcessCanvas in view mode so view and edit render the same layout", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: /Debiteurenbeheer/i }));

    expect(await screen.findByTestId("shared-process-canvas")).toBeInTheDocument();
    expect(screen.queryByTestId("legacy-processviewer-canvas")).not.toBeInTheDocument();
  });

  it("wraps the shared canvas with viewer pan zoom controls and the BPMN legend", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: /Debiteurenbeheer/i }));

    expect(await screen.findByTestId("shared-process-canvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom uit" })).toBeInTheDocument();
    expect(screen.getByText("Legenda")).toBeInTheDocument();
    expect(screen.getByText("Hoofdroute")).toBeInTheDocument();
    expect(screen.getByText("Correctie / optioneel")).toBeInTheDocument();
    expect(screen.getByText("Uitzondering / einde")).toBeInTheDocument();
    expect(screen.queryByText("Actie / correctie")).not.toBeInTheDocument();
    expect(screen.queryByText("Uitzondering")).not.toBeInTheDocument();
    expect(screen.getByText("Terminate")).toBeInTheDocument();
    expect(screen.getByText("Timer")).toBeInTheDocument();
    expect(screen.getByText("Bericht")).toBeInTheDocument();
    expect(screen.getByText("AND gateway")).toBeInTheDocument();
    expect(screen.getByText("Notitie")).toBeInTheDocument();
    expect(screen.getByText("Data/document")).toBeInTheDocument();
    expect(screen.getByText("Databron")).toBeInTheDocument();
    expect(screen.getByText("Manual block")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /lijn tekenen/i })).not.toBeInTheDocument();
  });

  it("passes saved BPMN attachments into the shared viewer canvas", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: /Debiteurenbeheer/i }));

    expect(await screen.findByTestId("shared-process-canvas")).toBeInTheDocument();
    expect(screen.getByText("Viewer uitleg")).toBeInTheDocument();
  });

  it("passes saved process artifacts into the shared viewer canvas", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: /Debiteurenbeheer/i }));

    expect(await screen.findByTestId("shared-process-canvas")).toBeInTheDocument();
    expect(screen.getByText("Betalingsregeling:s2")).toBeInTheDocument();
  });

  it("falls back to pipeline stages when a saved process state is empty", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: /BTW Pipeline/i }));

    expect(await screen.findByTestId("shared-process-canvas")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("Gegevens gereed")).toBeInTheDocument();
  });

  it("zooms the shared viewer canvas without replacing the shared renderer", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: /Debiteurenbeheer/i }));

    const viewport = await screen.findByTestId("procesviewer-shared-viewport-inner");
    const before = viewport.style.transform;

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));

    expect(viewport.style.transform).not.toBe(before);
    expect(screen.getByTestId("shared-process-canvas")).toBeInTheDocument();
  });
});
