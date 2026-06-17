import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessenEditor } from "@/components/process/ProcessenEditor";

const queryClient = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
}));

const saveProcessStateMock = vi.hoisted(() => vi.fn());

function createSavedProcessState() {
  return {
    steps: [
      { id: "intake", label: "Intake", team: "sales", column: 0 },
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
}

let savedProcessState = createSavedProcessState();
let automations: unknown[] = [];

const savedProcessStateWithIntakeRoute = {
  steps: [
    { id: "intake", label: "Intake", team: "sales", column: 0 },
    { id: "s2", label: "Controle", team: "sales", column: 1 },
  ],
  connections: [
    { id: "connection-intake-controle", fromStepId: "intake", toStepId: "s2" },
  ],
  autoLinks: {
    automationRoute: { fromStepId: "intake", toStepId: "s2" },
  },
  parkedSteps: [],
  activeLanes: ["sales"],
  customLanes: [],
  flowLinks: {
    flowRoute: { fromStepId: "intake", toStepId: "s2" },
  },
  attachments: [
    {
      id: "attachment-connection",
      type: "annotation",
      label: "Route note",
      attachedTo: { kind: "connection", id: "connection-intake-controle" },
    },
  ],
};

const savedProcessStateWithManualStep = {
  ...createSavedProcessState(),
  connections: [],
  artifacts: [
    {
      id: "artifact-manual",
      type: "manualExceptionBlock",
      title: "Manual acties",
      position: { x: 360, y: 220 },
      stepIds: ["intake"],
    },
  ],
};

const savedProcessStateWithTwoManualSteps = {
  ...createSavedProcessState(),
  connections: [],
  artifacts: [
    {
      id: "artifact-manual",
      type: "manualExceptionBlock",
      title: "Manual acties",
      position: { x: 360, y: 220 },
      stepIds: ["s2", "intake"],
    },
  ],
};

const savedProcessStateWithManualStepAndStaleRoute = {
  ...savedProcessStateWithIntakeRoute,
  artifacts: [
    {
      id: "artifact-manual",
      type: "manualExceptionBlock",
      title: "Manual acties",
      position: { x: 360, y: 220 },
      stepIds: ["intake"],
    },
  ],
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
  useAutomatiseringen: () => ({ data: automations }),
}));

vi.mock("@/lib/queryHooks/processState", () => ({
  useProcessState: () => ({
    isLoading: false,
    data: savedProcessState,
  }),
}));

describe("ProcessenEditor edit mode", () => {
  beforeEach(() => {
    savedProcessState = createSavedProcessState();
    automations = [];
    queryClient.invalidateQueries.mockClear();
    queryClient.setQueryData.mockClear();
    saveProcessStateMock.mockReset();
    saveProcessStateMock.mockResolvedValue(undefined);
  });

  function mockCanvasRect(container: HTMLElement) {
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
    return svg;
  }

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
            fromStepId: "intake",
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

  it("moves a step into a manual block, removes its routes, and saves the manual step id", async () => {
    savedProcessState = savedProcessStateWithIntakeRoute;
    automations = [
      {
        id: "automationRoute",
        naam: "Route automation",
        fasen: ["Sales"],
        systemen: ["HubSpot"],
        doel: "Route follow-up",
      },
    ];

    const { container } = render(<ProcessenEditor pipelineId="pipe-1" onSwitchPipeline={() => undefined} />);

    await screen.findByText("Intake");
    mockCanvasRect(container);

    fireEvent.click(screen.getByRole("button", { name: /Toevoegen/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Manual exception/i }));

    const step = container.querySelector('[data-step-id="intake"] rect') as SVGRectElement;
    fireEvent.mouseDown(step, { button: 0, clientX: 186, clientY: 44 });
    fireEvent.mouseMove(window, { clientX: 390, clientY: 240 });
    fireEvent.mouseUp(window, { clientX: 390, clientY: 240 });

    fireEvent.click(screen.getByRole("button", { name: /Opslaan/i }));

    await waitFor(() => expect(saveProcessStateMock).toHaveBeenCalledOnce());
    const persisted = saveProcessStateMock.mock.calls[0][1] as {
      connections: Array<{ fromStepId?: string; toStepId?: string }>;
    };
    expect(saveProcessStateMock).toHaveBeenCalledWith(
      "pipe-1",
      expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            type: "manualExceptionBlock",
            stepIds: ["intake"],
          }),
        ],
        attachments: expect.not.arrayContaining([
          expect.objectContaining({ attachedTo: { kind: "connection", id: "connection-intake-controle" } }),
        ]),
        autoLinks: expect.not.objectContaining({
          automationRoute: expect.anything(),
        }),
        flowLinks: expect.not.objectContaining({
          flowRoute: expect.anything(),
        }),
      }),
    );
    expect(persisted.connections).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ fromStepId: "intake" }),
      ]),
    );
    expect(persisted.connections).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ toStepId: "intake" }),
      ]),
    );
  });

  it("deletes a manual block without re-exposing stale routes for contained steps", async () => {
    savedProcessState = savedProcessStateWithManualStepAndStaleRoute;
    automations = [
      {
        id: "automationRoute",
        naam: "Route automation",
        fasen: ["Sales"],
        systemen: ["HubSpot"],
        doel: "Route follow-up",
      },
    ];

    render(<ProcessenEditor pipelineId="pipe-1" onSwitchPipeline={() => undefined} />);

    await screen.findByLabelText("Manual exception step Intake");
    fireEvent.contextMenu(screen.getByLabelText("Manual exception block Manual acties"), {
      clientX: 390,
      clientY: 240,
    });
    fireEvent.click(screen.getByText("Artifact verwijderen"));
    fireEvent.click(screen.getByRole("button", { name: /Opslaan/i }));

    await waitFor(() => expect(saveProcessStateMock).toHaveBeenCalledOnce());
    expect(saveProcessStateMock).toHaveBeenCalledWith(
      "pipe-1",
      expect.objectContaining({
        artifacts: [],
        connections: [],
        attachments: [],
        autoLinks: {},
        flowLinks: {},
      }),
    );
  });

  it("returns a manual step to the canvas without recreating lines and saves the updated artifact", async () => {
    savedProcessState = savedProcessStateWithManualStep;

    const { container } = render(<ProcessenEditor pipelineId="pipe-1" onSwitchPipeline={() => undefined} />);

    await screen.findByLabelText("Manual exception step Intake");
    mockCanvasRect(container);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Manual stap Intake terugplaatsen" }), {
      button: 0,
      clientX: 485,
      clientY: 337,
    });
    fireEvent.mouseMove(window, { clientX: 180, clientY: 44 });
    fireEvent.mouseUp(window, { clientX: 180, clientY: 44 });
    fireEvent.click(screen.getByRole("button", { name: /Opslaan/i }));

    await waitFor(() => expect(saveProcessStateMock).toHaveBeenCalledOnce());
    const persisted = saveProcessStateMock.mock.calls[0][1] as { artifacts: Array<{ id: string; stepIds?: string[] }> };
    expect(saveProcessStateMock).toHaveBeenCalledWith(
      "pipe-1",
      expect.objectContaining({
        steps: expect.arrayContaining([
          expect.objectContaining({ id: "intake", team: "sales", column: expect.any(Number), row: expect.any(Number) }),
        ]),
        connections: [],
      }),
    );
    expect(persisted.artifacts).toEqual([
      expect.objectContaining({ id: "artifact-manual" }),
    ]);
    expect(persisted.artifacts[0].stepIds ?? []).toEqual([]);
  });

  it("reorders manual steps and saves the artifact step order", async () => {
    savedProcessState = savedProcessStateWithTwoManualSteps;

    const { container } = render(<ProcessenEditor pipelineId="pipe-1" onSwitchPipeline={() => undefined} />);

    await screen.findByLabelText("Manual exception step Intake");
    mockCanvasRect(container);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Manual stap Intake sorteren" }), {
      button: 0,
      clientX: 405,
      clientY: 389,
    });
    fireEvent.mouseMove(window, { clientX: 405, clientY: 337 });
    fireEvent.mouseUp(window, { clientX: 405, clientY: 337 });
    fireEvent.click(screen.getByRole("button", { name: /Opslaan/i }));

    await waitFor(() => expect(saveProcessStateMock).toHaveBeenCalledOnce());
    expect(saveProcessStateMock).toHaveBeenCalledWith(
      "pipe-1",
      expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            id: "artifact-manual",
            stepIds: ["intake", "s2"],
          }),
        ],
      }),
    );
  });

  it("adds and saves a manual exception artifact", async () => {
    render(
      <ProcessenEditor
        pipelineId="pipe-1"
        onSwitchPipeline={() => undefined}
      />,
    );

    await screen.findByText("Intake");

    fireEvent.click(screen.getByRole("button", { name: /Toevoegen/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Manual exception/i }));
    fireEvent.click(screen.getByRole("button", { name: /Opslaan/i }));

    await waitFor(() => {
      expect(saveProcessStateMock).toHaveBeenCalledOnce();
    });
    expect(saveProcessStateMock).toHaveBeenCalledWith(
      "pipe-1",
      expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            type: "manualExceptionBlock",
            title: "Altijd beschikbare handmatige actie",
            association: expect.objectContaining({
              anchor: "process",
              label: "Mogelijk vanuit elke pipeline stage",
            }),
          }),
        ],
      }),
    );
  });
});
