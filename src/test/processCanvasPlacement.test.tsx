import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import type { Automation, Connection, ProcessAction, ProcessArtifact, ProcessStep } from "@/data/processData";

const steps: ProcessStep[] = [
  { id: "intake", label: "Intake", team: "sales", column: 0 },
  { id: "controle", label: "Controle", team: "sales", column: 1 },
];

const connections: Connection[] = [
  { id: "route", fromStepId: "intake", toStepId: "controle" },
];

const automations: Automation[] = [
  { id: "auto-1", name: "Welkom automation", team: "sales", tool: "HubSpot", goal: "Welkom", status: "Actief" },
];

const processActions: ProcessAction[] = [
  { id: "action-wait", type: "wait", label: "Wacht 3 dagen" },
];

function dataTransfer(values: Record<string, string>) {
  const types = Object.keys(values);
  return {
    types,
    getData: vi.fn((key: string) => values[key] ?? ""),
    setData: vi.fn(),
    effectAllowed: "move",
  };
}

function dropWithPoint(
  element: Element,
  point: { clientX: number; clientY: number },
  values: Record<string, string>,
) {
  const event = createEvent.drop(element, { dataTransfer: dataTransfer(values) });
  Object.defineProperty(event, "clientX", { value: point.clientX });
  Object.defineProperty(event, "clientY", { value: point.clientY });
  fireEvent(element, event);
}

function renderCanvas(props: Partial<React.ComponentProps<typeof ProcessCanvas>> = {}) {
  return render(
    <ProcessCanvas
      steps={steps}
      connections={connections}
      automations={automations}
      activeLanes={["sales"]}
      showLegend={false}
      {...props}
    />,
  );
}

describe("ProcessCanvas placements", () => {
  it("attaches an automation to a step when dropped on the step card", () => {
    const onAttachAutomationToStep = vi.fn();
    const { container } = renderCanvas({ onAttachAutomationToStep });

    const stepGroup = container.querySelector('[data-step-id="intake"]') as SVGGElement;
    fireEvent.dragOver(stepGroup, { dataTransfer: dataTransfer({ automationId: "auto-1" }) });
    fireEvent.drop(stepGroup, { dataTransfer: dataTransfer({ automationId: "auto-1" }) });

    expect(onAttachAutomationToStep).toHaveBeenCalledWith("auto-1", "intake", expect.any(Number));
  });

  it("attaches a process journey to a step when dropped on the step card", () => {
    const onAttachFlowToStep = vi.fn();
    const { container } = renderCanvas({
      flows: [{ id: "flow-1", naam: "Welkom reis", automationIds: [] }],
      onAttachFlowToStep,
    });

    const stepGroup = container.querySelector('[data-step-id="intake"]') as SVGGElement;
    fireEvent.dragOver(stepGroup, { dataTransfer: dataTransfer({ flowId: "flow-1" }) });
    fireEvent.drop(stepGroup, { dataTransfer: dataTransfer({ flowId: "flow-1" }) });

    expect(onAttachFlowToStep).toHaveBeenCalledWith("flow-1", "intake", expect.any(Number));
  });

  it("attaches a process action to a step when dropped on the step card", () => {
    const onAttachProcessActionToStep = vi.fn();
    const { container } = renderCanvas({
      processActions,
      onAttachProcessActionToStep,
    });

    const stepGroup = container.querySelector('[data-step-id="intake"]') as SVGGElement;
    fireEvent.dragOver(stepGroup, { dataTransfer: dataTransfer({ processActionId: "action-wait" }) });
    fireEvent.drop(stepGroup, { dataTransfer: dataTransfer({ processActionId: "action-wait" }) });

    expect(onAttachProcessActionToStep).toHaveBeenCalledWith("action-wait", "intake", expect.any(Number));
  });

  it("renders automation and process journey dots on the bottom edge of a step card", () => {
    renderCanvas({
      automations: [
        {
          ...automations[0],
          placement: { kind: "step", stepId: "intake", order: 0 },
        },
      ],
      flows: [{ id: "flow-1", naam: "Welkom reis", automationIds: [] }],
      flowLinks: {
        "flow-1": { kind: "step", stepId: "intake", order: 1 },
      },
    });

    expect(screen.getByLabelText("Automation Welkom automation op stap Intake")).toBeInTheDocument();
    expect(screen.getByLabelText("Procesreis Welkom reis op stap Intake")).toBeInTheDocument();
  });

  it("renders pipeline-wide automations as a central hub above the flow", () => {
    const onAutomationClick = vi.fn();
    renderCanvas({
      automations: [
        {
          ...automations[0],
          id: "nightly-sync",
          name: "Nachtelijke debiteuren sync",
          placement: {
            kind: "pipeline_wide",
            syncTiming: "Dagelijks 02:00",
            checksSummary: "Controleert open deals zonder recente betaalstatus",
            actionSummary: "Zet deals terug op de juiste debiteurenfase",
            affectedStageIds: ["open", "eerste", "tweede", "betaald"],
          },
        },
      ],
      onAutomationClick,
    });

    expect(screen.getByRole("button", { name: "Pipeline-brede automation Nachtelijke debiteuren sync openen" })).toBeInTheDocument();
    expect(screen.getByText("Dagelijks 02:00")).toBeInTheDocument();
    expect(screen.getByText("Controleert open deals zonder recente betaalstatus")).toBeInTheDocument();
    expect(screen.getByText("Zet deals terug op de juiste debiteurenfase")).toBeInTheDocument();
    expect(screen.getByText("+4 geraakte stages")).toBeInTheDocument();
    expect(screen.queryByLabelText("Automation Nachtelijke debiteuren sync op lijn Intake naar Controle")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pipeline-brede automation Nachtelijke debiteuren sync openen" }));

    expect(onAutomationClick).toHaveBeenCalledWith(expect.objectContaining({ id: "nightly-sync" }));
  });

  it("expands the process pool when a manual block is moved below the current lane height", () => {
    const manualBlock: ProcessArtifact = {
      id: "manual-low",
      type: "manualExceptionBlock",
      title: "Manual",
      description: "Altijd beschikbare handmatige actie",
      position: { x: 24, y: 300 },
      size: { width: 250, height: 112 },
      association: { anchor: "process" },
    };
    const { container } = renderCanvas({ artifacts: [manualBlock] });

    const salesPhase = container.querySelector('g[aria-label="Fase 1: Sales"]');
    const poolBackground = salesPhase?.querySelector('rect[x="106"]');

    expect(Number(poolBackground?.getAttribute("height"))).toBeGreaterThanOrEqual(412);
  });

  it("allows placing a task below the first row when the lane is expanded by a manual block", () => {
    const onPlaceStagedStep = vi.fn();
    const parkedStep: ProcessStep = {
      id: "parked-task",
      label: "Nieuwe taak",
      team: "sales",
      column: 0,
      row: 0,
      type: "task",
    };
    const manualBlock: ProcessArtifact = {
      id: "manual-low",
      type: "manualExceptionBlock",
      title: "Manual",
      description: "Altijd beschikbare handmatige actie",
      position: { x: 24, y: 300 },
      size: { width: 250, height: 112 },
      association: { anchor: "process" },
    };
    const { container } = renderCanvas({
      artifacts: [manualBlock],
      onPlaceStagedStep,
    });

    const svg = container.querySelector("svg") as SVGSVGElement;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 982,
      bottom: 412,
      width: 982,
      height: 412,
      toJSON: () => ({}),
    });

    dropWithPoint(svg, { clientX: 250, clientY: 176 }, { stagedStep: JSON.stringify(parkedStep) });

    expect(onPlaceStagedStep).toHaveBeenCalledWith(parkedStep, "sales", expect.any(Number), expect.any(Number));
    expect(onPlaceStagedStep.mock.calls[0][3]).toBeGreaterThan(0);
  });

  it("adds top canvas space when a manual block is moved above the process pool", () => {
    const manualBlock: ProcessArtifact = {
      id: "manual-high",
      type: "manualExceptionBlock",
      title: "Manual",
      description: "Altijd beschikbare handmatige actie",
      position: { x: 24, y: -120 },
      size: { width: 250, height: 112 },
      association: { anchor: "process" },
    };
    const { container } = renderCanvas({ artifacts: [manualBlock] });

    const svg = container.querySelector("svg") as SVGSVGElement;
    const manualRect = screen.getByLabelText("Manual exception block Manual").querySelector("rect");
    const salesPhase = container.querySelector('g[aria-label="Fase 1: Sales"]');
    const poolBackground = salesPhase?.querySelector('rect[x="106"]');
    const routePath = container.querySelector('[data-route-visible-path="true"]');

    expect(Number(svg.getAttribute("height"))).toBeGreaterThan(200);
    expect(svg.getAttribute("viewBox")).toMatch(/^0 -120 /);
    expect(manualRect).toHaveAttribute("y", "-120");
    expect(poolBackground).toHaveAttribute("y", "0");
    expect(routePath).toHaveAttribute("d", "M 247 44 H 323");
  });

  it("renders an automatic sync artifact with manual text and linked automation chips inside the process pool", () => {
    const syncBlock: ProcessArtifact = {
      id: "sync-low",
      type: "automaticSyncBlock",
      title: "Nachtelijke VPB sync",
      description: "Controleert elke nacht alle VPB deals en zet afwijkingen terug.",
      position: { x: 24, y: 300 },
      size: { width: 280, height: 132 },
      association: { anchor: "process" },
      automationIds: ["auto-1"],
    };
    const { container } = renderCanvas({ artifacts: [syncBlock] });

    expect(screen.getByLabelText("Automatic sync block Nachtelijke VPB sync")).toBeInTheDocument();
    expect(screen.getByText("Automatic sync")).toBeInTheDocument();
    expect(screen.getByText("Nachtelijke VPB sync")).toBeInTheDocument();
    expect(screen.getByText("Controleert elke nacht alle VPB deals en zet afwijkingen terug.")).toBeInTheDocument();
    expect(screen.getByText("Welkom automation")).toBeInTheDocument();

    const salesPhase = container.querySelector('g[aria-label="Fase 1: Sales"]');
    const poolBackground = salesPhase?.querySelector('rect[x="106"]');

    expect(Number(poolBackground?.getAttribute("height"))).toBeGreaterThanOrEqual(432);
  });

  it("marks pipeline steps that disappeared from the source in red without removing them", () => {
    const { container } = renderCanvas({
      steps: [
        { id: "stage-open", label: "Open", team: "sales", column: 0 },
        { id: "stage-old", label: "Oude fase", team: "sales", column: 1 },
      ],
      connections: [{ id: "old-route", fromStepId: "stage-open", toStepId: "stage-old" }],
      sourceMissingStepIds: ["stage-old"],
    });

    const oldStep = container.querySelector('[data-step-id="stage-old"]');
    const body = oldStep?.querySelector('[data-step-body="true"]');

    expect(oldStep).toBeInTheDocument();
    expect(body).toHaveAttribute("stroke", "#dc2626");
    expect(screen.getByText("Niet in bron")).toBeInTheDocument();
  });

  it("attaches an automation to an automatic sync artifact when dropped on the block", () => {
    const onAttachAutomationToArtifact = vi.fn();
    const syncBlock: ProcessArtifact = {
      id: "sync-drop",
      type: "automaticSyncBlock",
      title: "Nachtelijke VPB sync",
      description: "Controleert elke nacht de pipeline.",
      position: { x: 24, y: 120 },
      size: { width: 280, height: 132 },
      association: { anchor: "process" },
    };
    const { container } = renderCanvas({
      artifacts: [syncBlock],
      onAttachAutomationToArtifact,
    });

    const svg = container.querySelector("svg") as SVGSVGElement;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 982,
      bottom: 320,
      width: 982,
      height: 320,
      toJSON: () => ({}),
    });
    dropWithPoint(svg, { clientX: 80, clientY: 170 }, { automationId: "auto-1" });

    expect(onAttachAutomationToArtifact).toHaveBeenCalledWith("auto-1", "sync-drop");
  });

  it("renders process actions as neutral grey dots on the bottom edge of a step card", () => {
    renderCanvas({
      processActions: [
        {
          ...processActions[0],
          placement: { kind: "step", stepId: "intake", order: 0 },
        },
      ],
    });

    const actionDot = Array.from(screen.getByLabelText("Procesactie Wacht 3 dagen op stap Intake").querySelectorAll("circle"))
      .find(circle => circle.getAttribute("r") === "13" && circle.getAttribute("fill") !== "white");

    expect(actionDot).toHaveAttribute("fill", "#e5e7eb");
  });

  it("renders process action icons large enough to identify the action type", () => {
    renderCanvas({
      processActions: [
        {
          ...processActions[0],
          placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 0 },
        },
      ],
    });

    const actionIcon = screen
      .getByLabelText("Procesactie Wacht 3 dagen op lijn Intake naar Controle")
      .querySelector("foreignObject svg");

    expect(actionIcon).toHaveAttribute("width", "12");
    expect(actionIcon).toHaveAttribute("height", "12");
  });

  it("keeps process action detail hidden on the canvas until the action is opened", () => {
    renderCanvas({
      processActions: [
        {
          ...processActions[0],
          detail: "3 dagen",
          placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 0 },
        },
      ],
    });

    expect(screen.queryByText("3 dagen")).not.toBeInTheDocument();
  });

  it("keeps step-card placement dots away from the center connector port", () => {
    renderCanvas({
      automations: [
        {
          ...automations[0],
          placement: { kind: "step", stepId: "intake", order: 0 },
        },
      ],
    });

    const bottomPort = screen.getByRole("button", { name: "Verbindingspoort Intake onder" });
    const dot = screen.getByLabelText("Automation Welkom automation op stap Intake");
    const visibleDot = Array.from(dot.querySelectorAll("circle")).find(circle =>
      circle.getAttribute("r") === "13" && circle.getAttribute("fill") !== "white",
    );

    expect(visibleDot).toBeTruthy();
    expect(visibleDot?.getAttribute("cx")).not.toBe(bottomPort.getAttribute("cx"));
  });

  it("uses orange for automations and blue for process journeys", () => {
    renderCanvas({
      automations: [
        {
          ...automations[0],
          placement: { kind: "step", stepId: "intake", order: 0 },
        },
      ],
      flows: [{ id: "flow-1", naam: "Welkom reis", automationIds: [] }],
      flowLinks: {
        "flow-1": { kind: "step", stepId: "intake", order: 1 },
      },
    });

    const automationDot = Array.from(screen.getByLabelText("Automation Welkom automation op stap Intake").querySelectorAll("circle"))
      .find(circle => circle.getAttribute("r") === "13" && circle.getAttribute("fill") !== "white");
    const flowDot = Array.from(screen.getByLabelText("Procesreis Welkom reis op stap Intake").querySelectorAll("circle"))
      .find(circle => circle.getAttribute("r") === "13" && circle.getAttribute("fill") !== "white");

    expect(automationDot).toHaveAttribute("fill", "#fed7aa");
    expect(flowDot).toHaveAttribute("fill", "#2563eb");
  });

  it("marks placed inactive automations as red", () => {
    renderCanvas({
      automations: [
        {
          ...automations[0],
          status: "Uitgeschakeld",
          placement: { kind: "step", stepId: "intake", order: 0 },
        },
      ],
    });

    const automationDot = Array.from(screen.getByLabelText("Automation Welkom automation op stap Intake").querySelectorAll("circle"))
      .find(circle => circle.getAttribute("r") === "13" && circle.getAttribute("fill") !== "white");

    expect(automationDot).toHaveAttribute("fill", "#fecaca");
  });

  it("marks process journeys as red when one of their automations is inactive", () => {
    renderCanvas({
      automations: [
        {
          ...automations[0],
          id: "auto-inactive",
          status: "Uitgeschakeld",
        },
      ],
      flows: [{ id: "flow-1", naam: "Welkom reis", automationIds: ["auto-inactive"] }],
      flowLinks: {
        "flow-1": { kind: "step", stepId: "intake", order: 0 },
      },
    });

    const flowDot = Array.from(screen.getByLabelText("Procesreis Welkom reis op stap Intake").querySelectorAll("circle"))
      .find(circle => circle.getAttribute("r") === "13" && circle.getAttribute("fill") !== "white");

    expect(flowDot).toHaveAttribute("fill", "#fecaca");
  });

  it("opens hidden step-card placements from the overflow dot", () => {
    const onAutomationClick = vi.fn();
    const extraAutomations: Automation[] = Array.from({ length: 4 }, (_, index) => ({
      ...automations[0],
      id: `auto-${index + 1}`,
      name: `Automation ${index + 1}`,
      placement: { kind: "step", stepId: "intake", order: index },
    }));
    renderCanvas({
      automations: extraAutomations,
      onAutomationClick,
    });

    fireEvent.click(screen.getByRole("button", { name: "1 extra plaatsing op stap Intake" }));
    fireEvent.click(screen.getByRole("button", { name: "Automation Automation 4 openen" }));

    expect(onAutomationClick).toHaveBeenCalledWith(expect.objectContaining({ id: "auto-4" }));
  });

  it("opens hidden process actions from the overflow dot", () => {
    const onProcessActionClick = vi.fn();
    renderCanvas({
      processActions: [
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `action-${index + 1}`,
          type: "wait" as const,
          label: `Wacht actie ${index + 1}`,
          placement: { kind: "step" as const, stepId: "intake", order: index },
        })),
        {
          id: "action-email",
          type: "email",
          label: "Stuur e-mail",
          placement: { kind: "step", stepId: "intake", order: 3 },
        },
      ],
      onProcessActionClick,
    });

    fireEvent.click(screen.getByRole("button", { name: "1 extra plaatsing op stap Intake" }));
    fireEvent.click(screen.getByRole("button", { name: "Procesactie Stuur e-mail openen" }));

    expect(onProcessActionClick).toHaveBeenCalledWith(expect.objectContaining({ id: "action-email" }));
  });

  it("can start dragging an automation that is already placed on a step card", () => {
    const setData = vi.fn();
    renderCanvas({
      automations: [
        {
          ...automations[0],
          placement: { kind: "step", stepId: "intake", order: 0 },
        },
      ],
    });

    fireEvent.dragStart(screen.getByLabelText("Automation Welkom automation op stap Intake"), {
      dataTransfer: {
        setData,
        effectAllowed: "move",
      },
    });

    expect(setData).toHaveBeenCalledWith("automationId", "auto-1");
  });

  it("renders a browser-draggable overlay on placed step dots", () => {
    renderCanvas({
      automations: [
        {
          ...automations[0],
          placement: { kind: "step", stepId: "intake", order: 0 },
        },
      ],
    });

    const dot = screen.getByLabelText("Automation Welkom automation op stap Intake");

    expect(dot.querySelector('foreignObject div[draggable="true"]')).toBeInTheDocument();
  });

  it("exposes connection placement dots with matching drag labels", () => {
    const setData = vi.fn();
    renderCanvas({
      automations: [
        {
          ...automations[0],
          placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 0 },
        },
      ],
      flows: [{ id: "flow-1", naam: "Welkom reis", automationIds: [] }],
      flowLinks: {
        "flow-1": { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1 },
      },
    });

    fireEvent.dragStart(screen.getByLabelText("Automation Welkom automation op lijn Intake naar Controle"), {
      dataTransfer: {
        setData,
        effectAllowed: "move",
      },
    });

    expect(setData).toHaveBeenCalledWith("automationId", "auto-1");
    expect(screen.getByLabelText("Procesreis Welkom reis op lijn Intake naar Controle")).toBeInTheDocument();
  });

  it("exposes process action line dots with matching drag labels", () => {
    const setData = vi.fn();
    renderCanvas({
      processActions: [
        {
          ...processActions[0],
          placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 0 },
        },
      ],
    });

    fireEvent.dragStart(screen.getByLabelText("Procesactie Wacht 3 dagen op lijn Intake naar Controle"), {
      dataTransfer: {
        setData,
        effectAllowed: "move",
      },
    });

    expect(setData).toHaveBeenCalledWith("processActionId", "action-wait");
  });

  it("renders automation and process journey line dots at the same visible size", () => {
    renderCanvas({
      automations: [
        {
          ...automations[0],
          placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 0 },
        },
      ],
      flows: [{ id: "flow-1", naam: "Welkom reis", automationIds: [] }],
      flowLinks: {
        "flow-1": { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1 },
      },
    });

    const automationCircles = screen
      .getByLabelText("Automation Welkom automation op lijn Intake naar Controle")
      .querySelectorAll("circle");
    const flowCircles = screen
      .getByLabelText("Procesreis Welkom reis op lijn Intake naar Controle")
      .querySelectorAll("circle");

    expect(automationCircles[1]).toHaveAttribute("r", flowCircles[1].getAttribute("r"));
  });

  it("passes a deterministic order when an automation is dropped on a connection", () => {
    const onAttachAutomation = vi.fn();
    const { container } = renderCanvas({ onAttachAutomation });

    const dropPath = container.querySelector('[data-route-id="route"] path[stroke="transparent"]') as SVGPathElement;
    dropWithPoint(dropPath, { clientX: 260, clientY: 44 }, { automationId: "auto-1" });

    expect(onAttachAutomation).toHaveBeenCalledWith("auto-1", "intake", "controle", expect.any(Number), expect.any(Number));
  });

  it("passes a deterministic order and position when a process action is dropped on a connection", () => {
    const onAttachProcessAction = vi.fn();
    const { container } = renderCanvas({
      processActions,
      onAttachProcessAction,
    });

    const dropPath = container.querySelector('[data-route-id="route"] path[stroke="transparent"]') as SVGPathElement;
    dropWithPoint(dropPath, { clientX: 310, clientY: 44 }, { processActionId: "action-wait" });

    expect(onAttachProcessAction).toHaveBeenCalledWith("action-wait", "intake", "controle", expect.any(Number), expect.closeTo(0.83, 1));
  });

  it("uses the drop position to reorder an automation on the same connection", () => {
    const onAttachAutomation = vi.fn();
    const { container } = renderCanvas({
      automations: [
        {
          ...automations[0],
          id: "auto-1",
          name: "Eerste automation",
          placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 0 },
        },
        {
          ...automations[0],
          id: "auto-2",
          name: "Tweede automation",
          placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1 },
        },
      ],
      onAttachAutomation,
    });

    const dropPath = container.querySelector('[data-route-id="route"] path[stroke="transparent"]') as SVGPathElement;
    dropWithPoint(dropPath, { clientX: 250, clientY: 44 }, { automationId: "auto-2" });

    expect(onAttachAutomation).toHaveBeenCalledWith("auto-2", "intake", "controle", 0, expect.any(Number));
  });

  it("passes the relative route position when an automation is dropped further along the same connection", () => {
    const onAttachAutomation = vi.fn();
    const { container } = renderCanvas({
      automations: [
        {
          ...automations[0],
          id: "auto-1",
          name: "Eerste automation",
          placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 0, position: 0.35 },
        },
      ],
      onAttachAutomation,
    });

    const dropPath = container.querySelector('[data-route-id="route"] path[stroke="transparent"]') as SVGPathElement;
    dropWithPoint(dropPath, { clientX: 310, clientY: 44 }, { automationId: "auto-1" });

    expect(onAttachAutomation).toHaveBeenCalledWith("auto-1", "intake", "controle", 0, expect.closeTo(0.83, 1));
  });

  it("does not attach when the automation is dropped away from the visible connection line", () => {
    const onAttachAutomation = vi.fn();
    const { container } = renderCanvas({ onAttachAutomation });

    const dropPath = container.querySelector('[data-route-id="route"] path[stroke="transparent"]') as SVGPathElement;
    dropWithPoint(dropPath, { clientX: 260, clientY: 140 }, { automationId: "auto-1" });

    expect(onAttachAutomation).not.toHaveBeenCalled();
  });
});
