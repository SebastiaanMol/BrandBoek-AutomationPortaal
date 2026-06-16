import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessviewerCanvas } from "@/components/procesviewer/ProcessviewerCanvas";
import type { ProcessState } from "@/data/processData";

const baseState: ProcessState = {
  steps: [
    { id: "start", type: "start", label: "Start", team: "sales", column: 0 },
    { id: "intake", type: "task", label: "Intake", team: "sales", column: 1 },
    { id: "controle", type: "task", label: "Controle", team: "sales", column: 2 },
    { id: "einde", type: "end", label: "Einde", team: "sales", column: 3 },
  ],
  connections: [],
  automations: [],
  activeLanes: ["sales"],
};

describe("ProcessviewerCanvas manual connections", () => {
  it("does not expose manual editing controls without a state-change handler", () => {
    render(<ProcessviewerCanvas processState={baseState} />);

    expect(screen.queryByRole("button", { name: /lijn tekenen/i })).not.toBeInTheDocument();
  });

  it("adds a manual main route by clicking a start and end step", () => {
    const onProcessStateChange = vi.fn();

    render(
      <ProcessviewerCanvas
        processState={baseState}
        onProcessStateChange={onProcessStateChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /lijn tekenen/i }));
    fireEvent.click(screen.getByRole("button", { name: "Stap Intake" }));
    fireEvent.click(screen.getByRole("button", { name: "Stap Controle" }));

    expect(onProcessStateChange).toHaveBeenCalledTimes(1);
    expect(onProcessStateChange.mock.calls[0][0].connections).toEqual([
      expect.objectContaining({
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "main",
        waypoints: [],
      }),
    ]);
  });

  it("uses the selected route type for a new manual route", () => {
    const onProcessStateChange = vi.fn();

    render(
      <ProcessviewerCanvas
        processState={baseState}
        onProcessStateChange={onProcessStateChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /lijn tekenen/i }));
    fireEvent.click(screen.getByRole("button", { name: /correctie \/ optioneel/i }));
    fireEvent.click(screen.getByRole("button", { name: "Stap Intake" }));
    fireEvent.click(screen.getByRole("button", { name: "Stap Controle" }));

    expect(onProcessStateChange.mock.calls[0][0].connections).toEqual([
      expect.objectContaining({
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "optional",
      }),
    ]);
  });

  it("stores clicked canvas waypoints before completing a manual route", () => {
    const onProcessStateChange = vi.fn();

    render(
      <ProcessviewerCanvas
        processState={baseState}
        onProcessStateChange={onProcessStateChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /lijn tekenen/i }));
    fireEvent.click(screen.getByRole("button", { name: "Stap Intake" }));
    fireEvent.click(screen.getByTestId("processviewer-svg"), {
      clientX: 260,
      clientY: 160,
    });
    fireEvent.click(screen.getByRole("button", { name: "Stap Einde" }));

    expect(onProcessStateChange.mock.calls[0][0].connections).toEqual([
      expect.objectContaining({
        fromStepId: "intake",
        toStepId: "einde",
        manual: true,
        routeType: "main",
        waypoints: [expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })],
      }),
    ]);
  });

  it("shows waypoint handles after selecting a manual route", () => {
    const stateWithManualRoute: ProcessState = {
      ...baseState,
      connections: [
        {
          id: "manual-1",
          fromStepId: "intake",
          toStepId: "einde",
          manual: true,
          routeType: "main",
          waypoints: [{ x: 520, y: 140 }],
        },
      ],
    };

    render(<ProcessviewerCanvas processState={stateWithManualRoute} onProcessStateChange={vi.fn()} />);

    fireEvent.click(screen.getByLabelText("Handmatige hoofdroute route"));

    expect(screen.getByRole("button", { name: "Sleep knikpunt 1" })).toBeInTheDocument();
  });

  it("renders saved manual waypoints as orthogonal viewer routes", () => {
    const stateWithManualRoute: ProcessState = {
      ...baseState,
      connections: [
        {
          id: "manual-orthogonal-viewer",
          fromStepId: "intake",
          toStepId: "einde",
          manual: true,
          routeType: "main",
          waypoints: [
            { x: 520, y: 140 },
            { x: 620, y: 240 },
          ],
        },
      ],
    };

    render(<ProcessviewerCanvas processState={stateWithManualRoute} />);

    const route = screen.getByLabelText("Handmatige hoofdroute route");
    const path = route.getAttribute("d") ?? "";

    expect(path).toContain(" H ");
    expect(path).toContain(" V ");
    expect(path).not.toContain("L 520 140");
    expect(path).not.toContain("L 620 240");
  });

  it("updates a manual route waypoint when dragging its handle", () => {
    const onProcessStateChange = vi.fn();
    const stateWithManualRoute: ProcessState = {
      ...baseState,
      connections: [
        {
          id: "manual-1",
          fromStepId: "intake",
          toStepId: "einde",
          manual: true,
          routeType: "optional",
          waypoints: [{ x: 520, y: 140 }],
        },
      ],
    };

    render(
      <ProcessviewerCanvas
        processState={stateWithManualRoute}
        onProcessStateChange={onProcessStateChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige correctie/optioneel route"));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Sleep knikpunt 1" }), {
      clientX: 520,
      clientY: 140,
    });
    fireEvent.mouseMove(window, {
      clientX: 620,
      clientY: 220,
    });
    fireEvent.mouseUp(window);

    expect(onProcessStateChange).toHaveBeenCalled();
    const updated = onProcessStateChange.mock.calls.at(-1)?.[0] as ProcessState;
    expect(updated.connections[0]).toEqual(expect.objectContaining({
      id: "manual-1",
      routeType: "optional",
      waypoints: [expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })],
    }));
    expect(updated.connections[0].waypoints?.[0]).not.toEqual({ x: 520, y: 140 });
  });

  it("shows a default draggable handle for a manual route without saved waypoints", () => {
    const onProcessStateChange = vi.fn();
    const stateWithManualRoute: ProcessState = {
      ...baseState,
      connections: [
        {
          id: "manual-empty-waypoints",
          fromStepId: "intake",
          toStepId: "controle",
          manual: true,
          routeType: "main",
          waypoints: [],
        },
      ],
    };

    render(
      <ProcessviewerCanvas
        processState={stateWithManualRoute}
        onProcessStateChange={onProcessStateChange}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige hoofdroute route"));
    fireEvent.mouseDown(screen.getByRole("button", { name: "Sleep knikpunt 1" }), {
      clientX: 450,
      clientY: 120,
    });
    fireEvent.mouseMove(window, {
      clientX: 560,
      clientY: 180,
    });
    fireEvent.mouseUp(window);

    const updated = onProcessStateChange.mock.calls.at(-1)?.[0] as ProcessState;
    expect(updated.connections[0]).toEqual(expect.objectContaining({
      id: "manual-empty-waypoints",
      waypoints: [expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })],
    }));
  });
});
