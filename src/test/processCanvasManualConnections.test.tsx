import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import type { Automation, Connection, ProcessStep } from "@/data/processData";

const steps: ProcessStep[] = [
  { id: "intake", type: "task", label: "Intake", team: "sales", column: 0 },
  { id: "controle", type: "task", label: "Controle", team: "sales", column: 1 },
];

const steppedRows: ProcessStep[] = [
  { id: "start", type: "task", label: "Start", team: "sales", column: 0, row: 0 },
  { id: "later", type: "task", label: "Later", team: "sales", column: 1, row: 1 },
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
  return svg;
}

describe("ProcessCanvas manual connections in edit mode", () => {
  it("adds a manual route with the selected route type from the edit canvas", () => {
    const onAddConnection = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        selectedRouteType="optional"
        onAddConnection={onAddConnection}
      />,
    );
    const svg = mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("Verbindingspoort Intake"), {
      clientX: 247,
      clientY: 44,
      button: 0,
    });
    fireEvent.mouseMove(svg, { clientX: 384, clientY: 44 });
    fireEvent.mouseUp(svg, { clientX: 384, clientY: 44 });

    expect(onAddConnection).toHaveBeenCalledWith("intake", "controle", "optional", "right", "left", expect.any(Array));
  });

  it("emits default snapped waypoints when adding a new horizontal manual route", () => {
    const onAddConnection = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        selectedRouteType="optional"
        onAddConnection={onAddConnection}
      />,
    );
    const svg = mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("Verbindingspoort Intake"), {
      clientX: 247,
      clientY: 44,
      button: 0,
    });
    fireEvent.mouseMove(svg, { clientX: 384, clientY: 44 });
    fireEvent.mouseUp(svg, { clientX: 384, clientY: 44 });

    expect(onAddConnection).toHaveBeenCalledWith(
      "intake",
      "controle",
      "optional",
      "right",
      "left",
      [
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      ],
    );
    const waypoints = onAddConnection.mock.calls[0][5];
    expect(waypoints).toHaveLength(3);
    for (const point of waypoints) {
      expect(point.x % 14).toBe(0);
      expect(point.y % 14).toBe(0);
    }
  });

  it("stores a waypoint when dragging a selected manual route handle", () => {
    const onUpdateConnectionWaypoints = vi.fn();
    const connections: Connection[] = [
      {
        id: "manual-1",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "optional",
        waypoints: [
          { x: 280, y: 42 },
          { x: 336, y: 42 },
          { x: 392, y: 42 },
        ],
      },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={onUpdateConnectionWaypoints}
      />,
    );
    mockSvgRect(container);

    fireEvent.click(screen.getByLabelText("Handmatige correctie/optioneel route"));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Sleep knikpunt 1" }), {
      clientX: 285,
      clientY: 44,
    });
    fireEvent.mouseMove(window, {
      clientX: 320,
      clientY: 80,
    });
    fireEvent.mouseUp(window);

    const [[connId, waypoints]] = onUpdateConnectionWaypoints.mock.calls;
    expect(connId).toBe("manual-1");
    expect(waypoints).toHaveLength(3);
    expect(waypoints[0]).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it("does not synthesize draggable bend points for saved manual routes without waypoints", () => {
    const connections: Connection[] = [
      {
        id: "manual-default-bends",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "optional",
        waypoints: [],
      },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige correctie/optioneel route"));

    expect(screen.queryAllByRole("button", { name: /Sleep knikpunt/ })).toHaveLength(0);
  });

  it("does not expose manual waypoint handles in read-only viewer mode", () => {
    const connections: Connection[] = [
      {
        id: "manual-read-only",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "main",
        fromSide: "right",
        toSide: "left",
        waypoints: [
          { x: 280, y: 42 },
          { x: 308, y: 42 },
          { x: 336, y: 42 },
        ],
      },
    ];

    const updateWaypoints = vi.fn();
    const { rerender } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={updateWaypoints}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige hoofdroute route"));

    expect(screen.getAllByRole("button", { name: /Sleep knikpunt/ })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /Knikpunt toevoegen/ }).length).toBeGreaterThan(0);

    rerender(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        readOnly
        onUpdateConnectionWaypoints={updateWaypoints}
      />,
    );

    expect(screen.queryByRole("button", { name: /Sleep knikpunt/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Knikpunt toevoegen/ })).not.toBeInTheDocument();
  });

  it("renders saved manual waypoints as orthogonal route segments", () => {
    const connections: Connection[] = [
      {
        id: "manual-orthogonal",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "main",
        waypoints: [{ x: 300, y: 120 }],
      },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
      />,
    );

    const route = container.querySelector('path[aria-label="Handmatige hoofdroute route"]');

    expect(route?.getAttribute("d")).toContain("H 300 V 120");
    expect(route?.getAttribute("d")).not.toContain("L 300 120");
  });

  it("removes tiny waypoint offsets near the route axis", () => {
    const connections: Connection[] = [
      {
        id: "manual-micro-kink",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "main",
        waypoints: [
          { x: 280, y: 46 },
          { x: 300, y: 46 },
        ],
      },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
      />,
    );

    const route = container.querySelector('path[aria-label="Handmatige hoofdroute route"]');
    const path = route?.getAttribute("d") ?? "";

    expect(path).toContain("H 280");
    expect(path).not.toContain("V 46");
  });

  it("expands an existing single saved waypoint into multiple draggable bend points", () => {
    const connections: Connection[] = [
      {
        id: "manual-one-saved-bend",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "main",
        waypoints: [{ x: 300, y: 120 }],
      },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige hoofdroute route"));

    expect(screen.getAllByRole("button", { name: /Sleep knikpunt/ })).toHaveLength(3);
  });

  it("keeps existing manual waypoints instead of replacing them with default route waypoints", () => {
    const connections: Connection[] = [
      {
        id: "manual-preserved",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "main",
        fromSide: "right",
        toSide: "left",
        waypoints: [
          { x: 280, y: 86 },
          { x: 340, y: 114 },
        ],
      },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige hoofdroute route"));

    const handles = screen.getAllByRole("button", { name: /Sleep knikpunt/ });
    expect(handles).toHaveLength(2);
    expect(handles.map(handle => handle.getAttribute("cx"))).toEqual(["280", "340"]);
    expect(handles.map(handle => handle.getAttribute("cy"))).toEqual(["86", "114"]);
    expect(screen.getAllByRole("button", { name: /Knikpunt toevoegen/ })).toHaveLength(3);
  });

  it("can add another draggable bend point to a selected manual route", () => {
    const onUpdateConnectionWaypoints = vi.fn();
    const connections: Connection[] = [
      {
        id: "manual-extra-bend",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "optional",
        waypoints: [{ x: 300, y: 80 }],
      },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={onUpdateConnectionWaypoints}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige correctie/optioneel route"));
    fireEvent.click(screen.getAllByRole("button", { name: "Knikpunt toevoegen" })[0]);

    const [[connId, nextWaypoints]] = onUpdateConnectionWaypoints.mock.calls;
    expect(connId).toBe("manual-extra-bend");
    expect(nextWaypoints).toHaveLength(4);
    expect(nextWaypoints).toContainEqual({ x: 300, y: 80 });
  });

  it("renders regular corner routes with hard 90-degree corners", () => {
    const connections: Connection[] = [
      { id: "regular-corner", fromStepId: "start", toStepId: "later" },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steppedRows}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
      />,
    );

    const route = container.querySelector('path[aria-label="Hoofdproces route"]');
    const path = route?.getAttribute("d") ?? "";

    expect(path).toContain(" H ");
    expect(path).toContain(" V ");
    expect(path).not.toContain(" Q ");
  });

  it("shows the drag preview as an orthogonal path instead of a diagonal line", () => {
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        selectedRouteType="main"
        onAddConnection={vi.fn()}
      />,
    );
    const svg = mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("Verbindingspoort Intake"), {
      clientX: 247,
      clientY: 44,
      button: 0,
    });
    fireEvent.mouseMove(svg, { clientX: 360, clientY: 100 });

    const preview = container.querySelector('path[aria-label="Nieuwe verbinding preview"]');
    const diagonalPreview = container.querySelector("line[marker-end]");

    expect(preview?.getAttribute("d")).toContain(" H ");
    expect(preview?.getAttribute("d")).toContain(" V ");
    expect(diagonalPreview).toBeNull();
  });

  it("stores the chosen source and target side when drawing to a side port", () => {
    const onAddConnection = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        selectedRouteType="main"
        onAddConnection={onAddConnection}
      />,
    );
    const svg = mockSvgRect(container);

    expect(screen.getByLabelText("Verbindingspoort Intake links")).toBeInTheDocument();
    expect(screen.getByLabelText("Verbindingspoort Controle onder")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByLabelText("Verbindingspoort Intake links"), {
      clientX: 125,
      clientY: 44,
      button: 0,
    });
    fireEvent.mouseMove(svg, { clientX: 384, clientY: 65 });
    fireEvent.mouseUp(svg, { clientX: 384, clientY: 65 });

    expect(onAddConnection).toHaveBeenCalledWith("intake", "controle", "main", "left", "bottom", expect.any(Array));
  });

  it("creates a manual route when dropping just outside the task body but on a target port", () => {
    const onAddConnection = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        selectedRouteType="main"
        onAddConnection={onAddConnection}
      />,
    );
    const svg = mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("Verbindingspoort Intake"), {
      clientX: 247,
      clientY: 44,
      button: 0,
    });
    fireEvent.mouseMove(svg, { clientX: 322.5, clientY: 44 });
    fireEvent.mouseUp(svg, { clientX: 322.5, clientY: 44 });

    expect(onAddConnection).toHaveBeenCalledWith("intake", "controle", "main", "right", "left", expect.any(Array));
  });

  it("renders a configured target entry side on the selected task edge", () => {
    const connections: Connection[] = [
      {
        id: "manual-bottom-entry",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "main",
        fromSide: "right",
        toSide: "bottom",
        waypoints: [],
      },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
      />,
    );

    const route = container.querySelector('path[aria-label="Handmatige hoofdroute route"]');
    const path = route?.getAttribute("d") ?? "";

    expect(path).toContain("V 65");
    expect(path).toMatch(/H 384$/);
  });

  it("keeps a moved top-side target route entering vertically", () => {
    const movedTargetSteps: ProcessStep[] = [
      { id: "intake", type: "task", label: "Intake", team: "sales", column: 0, row: 0 },
      { id: "reactie", type: "decision", label: "Reactie?", team: "sales", column: 1, row: 1 },
    ];
    const connections: Connection[] = [
      {
        id: "manual-moved-target",
        fromStepId: "intake",
        toStepId: "reactie",
        manual: true,
        routeType: "main",
        fromSide: "right",
        toSide: "top",
        waypoints: [
          { x: 280, y: 44 },
          { x: 360, y: 44 },
        ],
      },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={movedTargetSteps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
      />,
    );

    const route = container.querySelector('path[aria-label="Handmatige hoofdroute route"]');
    const path = route?.getAttribute("d") ?? "";

    expect(path).toMatch(/H 384 V 103$/);
    expect(path).not.toMatch(/V 103 H 384$/);
  });

  it("straightens nearly vertical manual routes between stacked tasks", () => {
    const stackedSteps: ProcessStep[] = [
      { id: "from", type: "task", label: "Doorzetten", team: "sales", column: 0, row: 0 },
      { id: "to", type: "task", label: "Incasso", team: "sales", column: 0, row: 1 },
    ];
    const connections: Connection[] = [
      {
        id: "manual-stacked",
        fromStepId: "from",
        toStepId: "to",
        manual: true,
        routeType: "main",
        fromSide: "bottom",
        toSide: "top",
        waypoints: [
          { x: 190, y: 70 },
          { x: 204, y: 92 },
        ],
      },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={stackedSteps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
      />,
    );

    const route = container.querySelector('path[aria-label="Handmatige hoofdroute route"]');
    const path = route?.getAttribute("d") ?? "";

    expect(path).toBe("M 186 65 V 70 V 92 V 111");
  });

  it("chooses vertical ports and default waypoints for a new stacked manual route", () => {
    const onAddConnection = vi.fn();
    const stackedSteps: ProcessStep[] = [
      { id: "from", type: "task", label: "Doorzetten", team: "sales", column: 0, row: 0 },
      { id: "to", type: "task", label: "Incasso", team: "sales", column: 0, row: 1 },
    ];
    const { container } = render(
      <ProcessCanvas
        steps={stackedSteps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        selectedRouteType="main"
        onAddConnection={onAddConnection}
      />,
    );
    const svg = mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("Verbindingspoort Doorzetten onder"), {
      clientX: 186,
      clientY: 65,
      button: 0,
    });
    fireEvent.mouseMove(svg, { clientX: 186, clientY: 111 });
    fireEvent.mouseUp(svg, { clientX: 186, clientY: 111 });

    expect(onAddConnection).toHaveBeenCalledWith(
      "from",
      "to",
      "main",
      "bottom",
      "top",
      [
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      ],
    );
    const waypoints = onAddConnection.mock.calls[0][5];
    expect(waypoints).toHaveLength(3);
    for (const point of waypoints) {
      expect(point.x % 14).toBe(0);
      expect(point.y % 14).toBe(0);
    }
    expect(waypoints[0].x).toBe(waypoints[2].x);
  });

  it("snaps dragged bend points to the routing grid", () => {
    const onUpdateConnectionWaypoints = vi.fn();
    const connections: Connection[] = [
      {
        id: "manual-snap",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "optional",
        waypoints: [{ x: 300, y: 80 }],
      },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={onUpdateConnectionWaypoints}
      />,
    );
    mockSvgRect(container);

    fireEvent.click(screen.getByLabelText("Handmatige correctie/optioneel route"));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Sleep knikpunt 1" }), {
      clientX: 300,
      clientY: 80,
    });
    fireEvent.mouseMove(window, {
      clientX: 321,
      clientY: 83,
    });
    fireEvent.mouseUp(window);

    const [[, [point]]] = onUpdateConnectionWaypoints.mock.calls;
    expect(point.x % 14).toBe(0);
    expect(point.y % 14).toBe(0);
  });

  it("keeps bend insertion controls compact on manual routes", () => {
    const connections: Connection[] = [
      {
        id: "manual-many-bends",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "optional",
        waypoints: [
          { x: 280, y: 86 },
          { x: 340, y: 114 },
        ],
      },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige correctie/optioneel route"));

    expect(screen.getAllByRole("button", { name: /Knikpunt toevoegen/ })).toHaveLength(3);
  });

  it("inserts a new bend point at the selected insertion slot", () => {
    const onUpdateConnectionWaypoints = vi.fn();
    const connections: Connection[] = [
      {
        id: "manual-insert-slot",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "optional",
        waypoints: [
          { x: 280, y: 86 },
          { x: 340, y: 114 },
        ],
      },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={onUpdateConnectionWaypoints}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige correctie/optioneel route"));
    const insertionButtons = screen.getAllByRole("button", { name: /Knikpunt toevoegen/ });
    fireEvent.click(insertionButtons[insertionButtons.length - 1]);

    expect(onUpdateConnectionWaypoints).toHaveBeenCalledWith(
      "manual-insert-slot",
      [
        { x: 280, y: 86 },
        { x: 340, y: 114 },
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      ],
    );
  });

  it("does not insert a row on a single click of the separator", () => {
    const onInsertRowAfter = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steppedRows}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        displayStyle="viewer"
        onInsertRowAfter={onInsertRowAfter}
      />,
    );
    const svg = mockSvgRect(container);

    fireEvent.mouseMove(svg, { clientX: 250, clientY: 88 });
    fireEvent.click(screen.getByText("+ Stap"));

    expect(onInsertRowAfter).not.toHaveBeenCalled();
  });

  it("inserts a row on a double click of the separator", () => {
    const onInsertRowAfter = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steppedRows}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        displayStyle="viewer"
        onInsertRowAfter={onInsertRowAfter}
      />,
    );
    const svg = mockSvgRect(container);

    fireEvent.mouseMove(svg, { clientX: 250, clientY: 88 });
    fireEvent.doubleClick(screen.getByText("+ Stap"));

    expect(onInsertRowAfter).toHaveBeenCalledWith("sales", 0);
  });

  it("keeps the separator behind route click targets", () => {
    const connections: Connection[] = [
      {
        id: "manual-priority",
        fromStepId: "start",
        toStepId: "later",
        manual: true,
        routeType: "main",
        waypoints: [{ x: 300, y: 88 }],
      },
    ];
    const { container } = render(
      <ProcessCanvas
        steps={steppedRows}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        displayStyle="viewer"
        onInsertRowAfter={vi.fn()}
        onUpdateConnectionWaypoints={vi.fn()}
      />,
    );
    const svg = mockSvgRect(container);

    fireEvent.mouseMove(svg, { clientX: 300, clientY: 88 });

    const separator = screen.getByText("+ Stap").closest("g");
    const route = container.querySelector('path[aria-label="Handmatige hoofdroute route"]');

    expect(separator).toBeTruthy();
    expect(route).toBeTruthy();
    expect(separator!.compareDocumentPosition(route!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps automation split route segments separate around the automation dot", () => {
    const connections: Connection[] = [
      { id: "with-auto", fromStepId: "intake", toStepId: "controle" },
    ];
    const automations: Automation[] = [
      {
        id: "auto-1",
        name: "Check",
        team: "sales",
        tool: "HubSpot",
        goal: "Controle",
        fromStepId: "intake",
        toStepId: "controle",
      },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={automations}
        activeLanes={["sales"]}
      />,
    );

    const preDotRoute = container.querySelector('path[aria-label="Hoofdproces route"]');
    const postDotRoute = container.querySelector('path[aria-label="correctie/optioneel route"]');

    expect(preDotRoute?.getAttribute("d")).not.toEqual(postDotRoute?.getAttribute("d"));
    expect(preDotRoute?.getAttribute("d")).toMatch(/^M 247 44 H \d+/);
    expect(postDotRoute?.getAttribute("d")).toMatch(/^M \d+ 44 H 323$/);
  });
});
