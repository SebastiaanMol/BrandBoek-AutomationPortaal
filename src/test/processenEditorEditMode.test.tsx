import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessenEditor } from "@/components/process/ProcessenEditor";

const queryClient = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
}));

const saveProcessStateMock = vi.hoisted(() => vi.fn());

const savedProcessState = {
  steps: [
    { id: "s1", label: "Intake", team: "sales", column: 0 },
    { id: "s2", label: "Controle", team: "sales", column: 1 },
  ],
  connections: [],
  autoLinks: {},
  parkedSteps: [],
  activeLanes: ["sales"],
  customLanes: [],
  flowLinks: {},
  attachments: [],
};

const pipelines = [
  {
    pipelineId: "pipe-1",
    naam: "Sales",
    stages: [],
    syncedAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
  },
];
const emptyList: unknown[] = [];

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("react-router-dom", () => ({
  useBlocker: () => ({ state: "unblocked" }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClient,
}));

vi.mock("@/lib/storage/processState", () => ({
  saveProcessState: saveProcessStateMock,
}));

vi.mock("@/lib/queryHooks/pipelines", () => ({
  usePipelines: () => ({
    data: pipelines,
  }),
}));

vi.mock("@/lib/queryHooks/flows", () => ({
  useFlows: () => ({ data: emptyList }),
}));

vi.mock("@/lib/queryHooks/automations", () => ({
  useAutomatiseringen: () => ({ data: emptyList }),
}));

vi.mock("@/lib/queryHooks/processState", () => ({
  useProcessState: () => ({
    isLoading: false,
    data: savedProcessState,
  }),
}));

describe("ProcessenEditor edit mode", () => {
  beforeEach(() => {
    queryClient.invalidateQueries.mockClear();
    queryClient.setQueryData.mockClear();
    saveProcessStateMock.mockReset();
    saveProcessStateMock.mockResolvedValue(undefined);
  });

  it("mounts saved process state without runtime reference errors", async () => {
    render(
      <ProcessenEditor
        pipelineId="pipe-1"
        onSwitchPipeline={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Intake")).toBeInTheDocument();
    });
  });

  it("updates the process state query cache after saving so the viewer sees the edit immediately", async () => {
    render(
      <ProcessenEditor
        pipelineId="pipe-1"
        onSwitchPipeline={() => undefined}
      />,
    );

    await screen.findByText("Intake");

    fireEvent.click(screen.getByRole("button", { name: /Toevoegen/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^Start$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Opslaan/i }));

    await waitFor(() => {
      expect(saveProcessStateMock).toHaveBeenCalledOnce();
    });
    expect(queryClient.setQueryData).toHaveBeenCalledWith(
      ["processState", "pipe-1"],
      expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({ type: "start", label: "Start" }),
        ]),
      }),
    );
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["processState", "pipe-1"] });
  });

  it("saves newly drawn manual routes with snapped sides and default waypoints", async () => {
    const { container } = render(
      <ProcessenEditor
        pipelineId="pipe-1"
        onSwitchPipeline={() => undefined}
      />,
    );

    await screen.findByText("Intake");
    const svg = container.querySelector(".process-canvas-wrap svg") as SVGSVGElement;
    const width = Number(svg.getAttribute("width")) || 900;
    const height = Number(svg.getAttribute("height")) || 500;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(screen.getByLabelText("Verbindingspoort Intake"), {
      clientX: 247,
      clientY: 44,
      button: 0,
    });
    fireEvent.mouseMove(svg, { clientX: 384, clientY: 44 });
    fireEvent.mouseUp(svg, { clientX: 384, clientY: 44 });
    fireEvent.click(screen.getByRole("button", { name: /Opslaan/i }));

    await waitFor(() => {
      expect(saveProcessStateMock).toHaveBeenCalledOnce();
    });
    expect(saveProcessStateMock).toHaveBeenCalledWith(
      "pipe-1",
      expect.objectContaining({
        connections: [
          expect.objectContaining({
            fromStepId: "s1",
            toStepId: "s2",
            manual: true,
            fromSide: "right",
            toSide: "left",
            waypoints: [
              expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
              expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
              expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
            ],
          }),
        ],
      }),
    );
  });
});
