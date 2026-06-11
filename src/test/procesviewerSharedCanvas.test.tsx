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
  },
}));

vi.mock("@/lib/hooks", () => ({
  usePipelines: () => ({ data: [fixtures.pipeline] }),
  useAutomatiseringen: () => ({ data: [] }),
  useProcessState: (pipelineId: string | null) => ({
    data: pipelineId ? fixtures.savedState : null,
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
    attachments = [],
    steps = [],
    onStepClick,
  }: {
    attachments?: Array<{ id: string; label: string }>;
    steps?: Array<{ id: string; label: string }>;
    onStepClick?: (step: { id: string; label: string }) => void;
  }) => (
    <div data-testid="shared-process-canvas" style={{ width: 800, height: 400 }}>
      {steps.map((step) => (
        <button key={step.id} type="button" onClick={() => onStepClick?.(step)}>
          {step.label}
        </button>
      ))}
      {attachments.map((attachment) => (
        <span key={attachment.id}>{attachment.label}</span>
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
    expect(screen.getByText("Notitie")).toBeInTheDocument();
    expect(screen.getByText("Data/document")).toBeInTheDocument();
    expect(screen.getByText("Databron")).toBeInTheDocument();
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

  it("opens and closes the replacement detail menu when a task is clicked", async () => {
    HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter>
        <Procesviewer />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", { name: /Debiteurenbeheer/i }));

    fireEvent.click(await screen.findByRole("button", { name: "Betaalt op tijd" }));

    expect(screen.getByRole("complementary", { name: "Taak detailmenu" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Sluit detailmenu" }));

    expect(screen.queryByRole("complementary", { name: "Taak detailmenu" })).not.toBeInTheDocument();
  });
});
