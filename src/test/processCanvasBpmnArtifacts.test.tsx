import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import type { Connection, ProcessAttachment, ProcessStep } from "@/data/processData";

const steps: ProcessStep[] = [
  { id: "intake", type: "task", label: "Intake", team: "sales", column: 0 },
  { id: "controle", type: "task", label: "Controle", team: "sales", column: 1 },
];

const connections: Connection[] = [
  { id: "route-1", fromStepId: "intake", toStepId: "controle" },
];

const addControlSteps: ProcessStep[] = [
  { id: "step-1", type: "task", label: "Stap 1", team: "sales", column: 0 },
  { id: "step-2", type: "task", label: "Stap 2", team: "sales", column: 1 },
];

const addControlConnections: Connection[] = [
  { id: "conn-1", fromStepId: "step-1", toStepId: "step-2" },
];

function mockSvgRect(container: HTMLElement) {
  const svg = container.querySelector("svg") as SVGSVGElement;
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
}

describe("ProcessCanvas BPMN attachments", () => {
  it("renders linked BPMN artifacts for step and connection targets", () => {
    const attachments: ProcessAttachment[] = [
      {
        id: "note-1",
        type: "annotation",
        label: "Controle op volledigheid",
        attachedTo: { kind: "step", id: "intake" },
      },
      {
        id: "document-1",
        type: "dataObject",
        label: "Aanvraagformulier",
        attachedTo: { kind: "connection", id: "route-1" },
      },
      {
        id: "source-1",
        type: "dataStore",
        label: "CRM",
        attachedTo: { kind: "step", id: "controle" },
      },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        attachments={attachments}
      />,
    );

    expect(screen.getByLabelText("BPMN notitie Controle op volledigheid")).toBeInTheDocument();
    expect(screen.getByLabelText("BPMN data/document Aanvraagformulier")).toBeInTheDocument();
    expect(screen.getByLabelText("BPMN databron CRM")).toBeInTheDocument();
  });

  it("keeps connection artifacts clickable above route hit paths", () => {
    const onAttachmentClick = vi.fn();
    const attachment: ProcessAttachment = {
      id: "document-over-route",
      type: "dataObject",
      label: "Route dossier",
      attachedTo: { kind: "connection", id: "route-1" },
      offset: { x: -43, y: -22 },
    };

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        attachments={[attachment]}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    const routeHitPath = container.querySelector('path[stroke="transparent"][stroke-width="22"]');
    const artifact = screen.getByLabelText("BPMN data/document Route dossier");

    expect(routeHitPath).toBeTruthy();
    expect(routeHitPath!.compareDocumentPosition(artifact) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(artifact);

    expect(onAttachmentClick).toHaveBeenCalledWith(attachment);
  });

  it("edits annotation text from the artifact editor", () => {
    const onUpdateAttachment = vi.fn();
    const attachment: ProcessAttachment = {
      id: "note-editable",
      type: "annotation",
      label: "Notitie",
      description: "Oude tekst",
      attachedTo: { kind: "connection", id: "route-1" },
      offset: { x: -43, y: -22 },
    };

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        attachments={[attachment]}
        onUpdateAttachment={onUpdateAttachment}
      />,
    );

    fireEvent.click(screen.getByLabelText("BPMN notitie Notitie"));
    fireEvent.change(screen.getByLabelText("Notitie tekst"), {
      target: { value: "Nieuwe tekst voor deze notitie" },
    });

    expect(onUpdateAttachment).toHaveBeenCalledWith("note-editable", {
      description: "Nieuwe tekst voor deze notitie",
    });
  });

  it("closes the artifact editor with a close button and when clicking the canvas background", () => {
    const onUpdateAttachment = vi.fn();
    const attachment: ProcessAttachment = {
      id: "note-closable",
      type: "annotation",
      label: "Sluitbare notitie",
      attachedTo: { kind: "connection", id: "route-1" },
      offset: { x: -43, y: -22 },
    };

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        attachments={[attachment]}
        onUpdateAttachment={onUpdateAttachment}
      />,
    );

    fireEvent.click(screen.getByLabelText("BPMN notitie Sluitbare notitie"));
    expect(screen.getByLabelText("Notitie tekst")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Notitie editor sluiten"));
    expect(screen.queryByLabelText("Notitie tekst")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("BPMN notitie Sluitbare notitie"));
    expect(screen.getByLabelText("Notitie tekst")).toBeInTheDocument();

    fireEvent.click(container.querySelector("svg")!);
    expect(screen.queryByLabelText("Notitie tekst")).not.toBeInTheDocument();
  });

  it("drags an artifact as a relative offset in edit mode", () => {
    const onMoveAttachment = vi.fn();
    const attachment: ProcessAttachment = {
      id: "note-draggable",
      type: "annotation",
      label: "Sleepnotitie",
      attachedTo: { kind: "step", id: "intake" },
      offset: { x: 30, y: -10 },
    };

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        attachments={[attachment]}
        onMoveAttachment={onMoveAttachment}
      />,
    );
    mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("BPMN notitie Sleepnotitie"), {
      button: 0,
      clientX: 120,
      clientY: 40,
    });
    fireEvent.mouseMove(window, {
      clientX: 145,
      clientY: 55,
    });
    fireEvent.mouseUp(window);

    expect(onMoveAttachment).toHaveBeenCalledWith("note-draggable", {
      x: expect.any(Number),
      y: expect.any(Number),
    });
    expect(onMoveAttachment.mock.calls.at(-1)?.[1]).toEqual({ x: 55, y: 5 });
  });

  it("does not drag artifacts on a read-only canvas", () => {
    const onMoveAttachment = vi.fn();
    const attachment: ProcessAttachment = {
      id: "readonly-note",
      type: "annotation",
      label: "Alleen lezen",
      attachedTo: { kind: "step", id: "intake" },
      offset: { x: 30, y: -10 },
    };

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        attachments={[attachment]}
        readOnly
        onMoveAttachment={onMoveAttachment}
      />,
    );
    mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("BPMN notitie Alleen lezen"), {
      button: 0,
      clientX: 120,
      clientY: 40,
    });
    fireEvent.mouseMove(window, {
      clientX: 145,
      clientY: 55,
    });
    fireEvent.mouseUp(window);

    expect(onMoveAttachment).not.toHaveBeenCalled();
  });

  it("deletes an artifact from the attachment context menu in edit mode", () => {
    const onDeleteAttachment = vi.fn();
    const attachment: ProcessAttachment = {
      id: "note-delete",
      type: "annotation",
      label: "Verwijderbare notitie",
      attachedTo: { kind: "step", id: "intake" },
      offset: { x: 30, y: -10 },
    };

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        attachments={[attachment]}
        onDeleteAttachment={onDeleteAttachment}
      />,
    );

    fireEvent.contextMenu(screen.getByLabelText("BPMN notitie Verwijderbare notitie"), {
      clientX: 140,
      clientY: 50,
    });
    fireEvent.click(screen.getByText("Artifact verwijderen"));

    expect(onDeleteAttachment).toHaveBeenCalledWith("note-delete");
  });

  it("does not expose artifact delete controls on a read-only canvas", () => {
    const onDeleteAttachment = vi.fn();
    const attachment: ProcessAttachment = {
      id: "readonly-delete-note",
      type: "annotation",
      label: "Readonly delete",
      attachedTo: { kind: "step", id: "intake" },
    };

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        attachments={[attachment]}
        readOnly
        onDeleteAttachment={onDeleteAttachment}
      />,
    );

    fireEvent.contextMenu(screen.getByLabelText("BPMN notitie Readonly delete"), {
      clientX: 140,
      clientY: 50,
    });

    expect(screen.queryByText("Artifact verwijderen")).not.toBeInTheDocument();
    expect(onDeleteAttachment).not.toHaveBeenCalled();
  });

  it("does not expose route edit or delete controls on a read-only canvas", () => {
    const onUpdateConnectionLabel = vi.fn();
    const onDeleteConnection = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[{ ...connections[0], label: "Route label" }]}
        automations={[]}
        activeLanes={["sales"]}
        readOnly
        onUpdateConnectionLabel={onUpdateConnectionLabel}
        onDeleteConnection={onDeleteConnection}
      />,
    );

    fireEvent.click(screen.getByLabelText("Hoofdproces route"));
    fireEvent.click(container.querySelector('path[stroke="transparent"][stroke-width="22"]')!);
    fireEvent.contextMenu(container.querySelector('path[stroke="transparent"][stroke-width="22"]')!, {
      clientX: 300,
      clientY: 44,
    });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Verbinding verwijderen")).not.toBeInTheDocument();
    expect(onUpdateConnectionLabel).not.toHaveBeenCalled();
    expect(onDeleteConnection).not.toHaveBeenCalled();
  });

  it("does not show add attachment controls when selecting a step", () => {
    const onAddAttachment = vi.fn();

    const { container } = render(
      <ProcessCanvas
        steps={addControlSteps}
        connections={addControlConnections}
        automations={[]}
        activeLanes={["sales"]}
        onAddAttachment={onAddAttachment}
      />,
    );

    fireEvent.click(container.querySelector('rect[width="122"][height="42"]')!);

    expect(screen.queryByLabelText("Notitie toevoegen")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Data/document toevoegen")).not.toBeInTheDocument();
    expect(onAddAttachment).not.toHaveBeenCalled();
  });

  it("shows add attachment controls only from the connection context menu", () => {
    const onAddAttachment = vi.fn();

    const { container } = render(
      <ProcessCanvas
        steps={addControlSteps}
        connections={addControlConnections}
        automations={[]}
        activeLanes={["sales"]}
        onAddAttachment={onAddAttachment}
      />,
    );

    fireEvent.click(screen.getByLabelText("Hoofdproces route"));
    expect(screen.queryByLabelText("Data/document toevoegen")).not.toBeInTheDocument();

    fireEvent.contextMenu(container.querySelector('path[stroke="transparent"][stroke-width="22"]')!, {
      clientX: 280,
      clientY: 44,
    });

    const svg = container.querySelector("svg")!;
    fireEvent.mouseDown(screen.getByLabelText("Data/document toevoegen"), {
      button: 0,
      clientX: 240,
      clientY: 44,
    });
    fireEvent.click(screen.getByLabelText("Data/document toevoegen"));

    expect(svg).toHaveStyle({ cursor: "grab" });
    expect(onAddAttachment).toHaveBeenCalledWith("dataObject", { kind: "connection", id: "conn-1" });
  });

  it("adds an annotation attachment from the connection context menu", () => {
    const onAddAttachment = vi.fn();

    const { container } = render(
      <ProcessCanvas
        steps={addControlSteps}
        connections={addControlConnections}
        automations={[]}
        activeLanes={["sales"]}
        onAddAttachment={onAddAttachment}
      />,
    );

    fireEvent.contextMenu(container.querySelector('path[stroke="transparent"][stroke-width="22"]')!, {
      clientX: 280,
      clientY: 44,
    });
    fireEvent.click(screen.getByLabelText("Notitie toevoegen"));

    expect(onAddAttachment).toHaveBeenCalledWith("annotation", { kind: "connection", id: "conn-1" });
  });

  it("does not show add attachment controls on a read-only canvas with artifacts", () => {
    const attachment: ProcessAttachment = {
      id: "readonly-document",
      type: "dataObject",
      label: "Readonly document",
      attachedTo: { kind: "connection", id: "conn-1" },
    };

    render(
      <ProcessCanvas
        steps={addControlSteps}
        connections={addControlConnections}
        automations={[]}
        activeLanes={["sales"]}
        attachments={[attachment]}
        readOnly
        onAddAttachment={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Hoofdproces route"));

    expect(screen.queryByLabelText("Notitie toevoegen")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Data/document toevoegen")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Databron toevoegen")).not.toBeInTheDocument();
  });

  it("renders a manual exception block with a process-context association and no arrow marker", () => {
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-manual",
            type: "manualExceptionBlock",
            title: "Betalingsregeling",
            description: "Mogelijk vanuit elke pipeline stage",
            position: { x: 360, y: 160 },
            size: { width: 250, height: 112 },
            association: { anchor: "process", label: "Mogelijk vanuit elke pipeline stage" },
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Manual exception block Betalingsregeling")).toBeInTheDocument();
    expect(screen.getAllByText("Mogelijk vanuit elke pipeline stage").length).toBeGreaterThan(0);
    expect(container.querySelector('[data-process-association="artifact-manual"]')).toHaveAttribute("stroke-dasharray", "4 5");
    expect(container.querySelector('[data-process-association="artifact-manual"]')).not.toHaveAttribute("marker-end");
  });

  it("renders artifact-contained steps inside the manual block and not in the main flow", () => {
    const { container } = render(
      <ProcessCanvas
        steps={[
          { id: "start", type: "start", label: "Start", team: "sales", column: 0 },
          { id: "main", type: "task", label: "Hoofdproces", team: "sales", column: 1 },
          { id: "manual-step", type: "task", label: "Bel klant", team: "sales", column: 2 },
          { id: "end", type: "end", label: "Einde", team: "sales", column: 3 },
        ]}
        connections={[
          { id: "main-route", fromStepId: "start", toStepId: "main" },
          { id: "manual-route", fromStepId: "main", toStepId: "manual-step" },
          { id: "end-route", fromStepId: "manual-step", toStepId: "end" },
        ]}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-contained",
            type: "manualExceptionBlock",
            title: "Manual pad",
            position: { x: 360, y: 160 },
            stepIds: ["manual-step"],
          },
        ]}
      />,
    );

    const manualBlock = screen.getByLabelText("Manual exception block Manual pad");
    const containedStep = screen.getByLabelText("Manual exception step Bel klant");

    expect(manualBlock).toContainElement(containedStep);
    expect(container.querySelector('[data-step-id="manual-step"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-route-id="manual-route"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-route-id="end-route"]')).not.toBeInTheDocument();
  });

  it("renders multiple manual steps in stepIds order", () => {
    render(
      <ProcessCanvas
        steps={[
          { id: "first", type: "task", label: "Eerste", team: "sales", column: 0 },
          { id: "second", type: "task", label: "Tweede", team: "sales", column: 1 },
          { id: "third", type: "task", label: "Derde", team: "sales", column: 2 },
        ]}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-ordered",
            type: "manualExceptionBlock",
            title: "Manual volgorde",
            position: { x: 360, y: 160 },
            stepIds: ["third", "first", "second"],
          },
        ]}
      />,
    );

    const labels = Array.from(
      screen.getByLabelText("Manual exception block Manual volgorde").querySelectorAll("[data-manual-step-id]"),
    ).map(element => element.textContent);

    expect(labels).toEqual(["Derde", "Eerste", "Tweede"]);
  });

  it("shows contained manual steps in read-only mode without manual step drag or sort controls", () => {
    const { container } = render(
      <ProcessCanvas
        steps={[
          { id: "manual-one", type: "task", label: "Bel klant", team: "sales", column: 0 },
          { id: "manual-two", type: "task", label: "Leg afspraak vast", team: "sales", column: 1 },
        ]}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        readOnly
        artifacts={[
          {
            id: "artifact-readonly-steps",
            type: "manualExceptionBlock",
            title: "Readonly manual",
            position: { x: 360, y: 160 },
            stepIds: ["manual-one", "manual-two"],
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Manual exception step Bel klant")).toBeInTheDocument();
    expect(screen.getByLabelText("Manual exception step Leg afspraak vast")).toBeInTheDocument();
    expect(container.querySelector("[data-manual-step-drag-handle]")).not.toBeInTheDocument();
    expect(container.querySelector("[data-manual-step-sort-control]")).not.toBeInTheDocument();
  });

  it("calls onMoveStepToArtifact when a canvas step is dropped on a manual block", () => {
    const onMoveStepToArtifact = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={[
          ...steps,
          { id: "move-me", type: "task", label: "Betalingsregeling", team: "sales", column: 2 },
        ]}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-manual",
            type: "manualExceptionBlock",
            title: "Manual acties",
            position: { x: 360, y: 160 },
          },
        ]}
        onMoveStepToArtifact={onMoveStepToArtifact}
      />,
    );
    mockSvgRect(container);

    const stepNode = container.querySelector('[data-step-id="move-me"] rect');
    expect(stepNode).toBeInTheDocument();

    fireEvent.mouseDown(stepNode!, {
      button: 0,
      clientX: 500,
      clientY: 44,
    });
    fireEvent.mouseMove(window, { clientX: 390, clientY: 190 });
    fireEvent.mouseUp(window, { clientX: 390, clientY: 190 });

    expect(onMoveStepToArtifact).toHaveBeenCalledWith("move-me", "artifact-manual");
  });

  it("calls onMoveManualStepToCanvas when dragging a manual step back to the canvas", () => {
    const onMoveManualStepToCanvas = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={[
          ...steps,
          { id: "manual-step", type: "task", label: "Betalingsregeling", team: "sales", column: 2 },
        ]}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-manual",
            type: "manualExceptionBlock",
            title: "Manual acties",
            position: { x: 360, y: 160 },
            stepIds: ["manual-step"],
          },
        ]}
        onMoveManualStepToCanvas={onMoveManualStepToCanvas}
      />,
    );
    mockSvgRect(container);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Manual stap Betalingsregeling terugplaatsen" }), {
      button: 0,
      clientX: 390,
      clientY: 245,
    });
    fireEvent.mouseMove(window, { clientX: 180, clientY: 44 });
    fireEvent.mouseUp(window, { clientX: 180, clientY: 44 });

    expect(onMoveManualStepToCanvas).toHaveBeenCalledWith("artifact-manual", "manual-step", {
      team: "sales",
      column: expect.any(Number),
      row: expect.any(Number),
    });
  });

  it("calls onReorderManualArtifactStep when a manual step is dropped over another manual step", () => {
    const onReorderManualArtifactStep = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={[
          ...steps,
          { id: "manual-one", type: "task", label: "Betalingsregeling", team: "sales", column: 2 },
          { id: "manual-two", type: "task", label: "Escalatie", team: "sales", column: 3 },
        ]}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-manual",
            type: "manualExceptionBlock",
            title: "Manual acties",
            position: { x: 360, y: 160 },
            stepIds: ["manual-one", "manual-two"],
          },
        ]}
        onReorderManualArtifactStep={onReorderManualArtifactStep}
      />,
    );
    mockSvgRect(container);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Manual stap Escalatie sorteren" }), {
      button: 0,
      clientX: 385,
      clientY: 286,
    });
    fireEvent.mouseMove(window, { clientX: 385, clientY: 244 });
    fireEvent.mouseUp(window, { clientX: 385, clientY: 244 });

    expect(onReorderManualArtifactStep).toHaveBeenCalledWith("artifact-manual", "manual-two", 0);
  });

  it("drags manual exception blocks in edit mode", () => {
    const onMoveArtifact = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-draggable",
            type: "manualExceptionBlock",
            title: "Manual actie",
            position: { x: 360, y: 160 },
          },
        ]}
        onMoveArtifact={onMoveArtifact}
      />,
    );
    mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("Manual exception block Manual actie"), {
      button: 0,
      clientX: 370,
      clientY: 170,
    });
    fireEvent.mouseMove(window, { clientX: 400, clientY: 190 });
    fireEvent.mouseUp(window);

    expect(onMoveArtifact).toHaveBeenCalledWith("artifact-draggable", { x: 390, y: 180 });
  });

  it("edits manual exception block title and description in edit mode", () => {
    const onUpdateArtifact = vi.fn();
    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-editable",
            type: "manualExceptionBlock",
            title: "Manual actie",
            description: "Oud",
            position: { x: 360, y: 160 },
          },
        ]}
        onUpdateArtifact={onUpdateArtifact}
      />,
    );

    fireEvent.click(screen.getByLabelText("Manual exception block Manual actie"));
    fireEvent.change(screen.getByLabelText("Manual exception titel"), {
      target: { value: "Betalingsregeling" },
    });
    fireEvent.change(screen.getByLabelText("Manual exception beschrijving"), {
      target: { value: "Kan altijd gekozen worden" },
    });

    expect(onUpdateArtifact).toHaveBeenCalledWith("artifact-editable", { title: "Betalingsregeling" });
    expect(onUpdateArtifact).toHaveBeenCalledWith("artifact-editable", { description: "Kan altijd gekozen worden" });
  });

  it("does not show manual exception edit controls or drag in read-only mode", () => {
    const onMoveArtifact = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        readOnly
        artifacts={[
          {
            id: "artifact-readonly",
            type: "manualExceptionBlock",
            title: "Alleen lezen",
            position: { x: 360, y: 160 },
          },
        ]}
        onMoveArtifact={onMoveArtifact}
      />,
    );
    mockSvgRect(container);

    fireEvent.click(screen.getByLabelText("Manual exception block Alleen lezen"));
    fireEvent.mouseDown(screen.getByLabelText("Manual exception block Alleen lezen"), {
      button: 0,
      clientX: 370,
      clientY: 170,
    });
    fireEvent.mouseMove(window, { clientX: 400, clientY: 190 });
    fireEvent.mouseUp(window);

    expect(screen.queryByLabelText("Manual exception titel")).not.toBeInTheDocument();
    expect(onMoveArtifact).not.toHaveBeenCalled();
  });

  it("deletes a manual exception block from the context menu in edit mode", () => {
    const onDeleteArtifact = vi.fn();
    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-delete",
            type: "manualExceptionBlock",
            title: "Verwijderbare actie",
            position: { x: 360, y: 160 },
          },
        ]}
        onDeleteArtifact={onDeleteArtifact}
      />,
    );

    fireEvent.contextMenu(screen.getByLabelText("Manual exception block Verwijderbare actie"), {
      clientX: 380,
      clientY: 180,
    });
    fireEvent.click(screen.getByText("Artifact verwijderen"));

    expect(onDeleteArtifact).toHaveBeenCalledWith("artifact-delete");
  });
});
