import { createEvent, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import type { ProcessStep } from "@/data/processData";

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

function newStepDataTransfer(type: ProcessStep["type"]) {
  return {
    types: ["newstep"],
    getData: (key: string) => (key === "newStep" ? type : ""),
  };
}

function dropNewStep(svg: SVGSVGElement, type: ProcessStep["type"], clientX: number, clientY: number) {
  const event = createEvent.drop(svg, {
    dataTransfer: newStepDataTransfer(type),
  });
  Object.defineProperty(event, "clientX", { value: clientX });
  Object.defineProperty(event, "clientY", { value: clientY });
  fireEvent(svg, event);
}

describe("ProcessCanvas event drops", () => {
  it("keeps moved start events on the cursor row", () => {
    const onMoveStep = vi.fn();
    const steps: ProcessStep[] = [
      { id: "start", type: "start", label: "Start", team: "sales", column: 0, row: 0 },
      { id: "task", type: "task", label: "Taak", team: "sales", column: 1, row: 0 },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        onMoveStep={onMoveStep}
      />,
    );

    const svg = mockSvgRect(container);
    const startCircle = container.querySelector('circle[fill="#dcfce7"]') as SVGCircleElement;

    fireEvent.mouseDown(startCircle, { clientX: 172, clientY: 44, button: 0 });
    fireEvent.mouseMove(svg, { clientX: 172, clientY: 220, buttons: 1 });
    fireEvent.mouseUp(svg, { clientX: 172, clientY: 220 });

    expect(onMoveStep).toHaveBeenCalledWith("start", "sales", expect.any(Number), 2);
  });

  it("keeps dropped events on the cursor row even without an existing event anchor", () => {
    const onAddStep = vi.fn();
    const steps: ProcessStep[] = [
      { id: "task", type: "task", label: "Taak", team: "sales", column: 0, row: 0 },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        onAddStep={onAddStep}
      />,
    );

    const svg = mockSvgRect(container);

    dropNewStep(svg, "start", 180, 220);

    expect(onAddStep).toHaveBeenCalledWith("sales", expect.any(Number), 2, "start");
  });

  it("keeps dropped start and end events on the target event row", () => {
    const onAddStep = vi.fn();
    const steps: ProcessStep[] = [
      { id: "task", type: "task", label: "Taak", team: "sales", column: 0, row: 0 },
      { id: "event-row-anchor", type: "start", label: "Start", team: "sales", column: 0, row: 2 },
    ];

    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        onAddStep={onAddStep}
      />,
    );

    const svg = mockSvgRect(container);

    dropNewStep(svg, "end", 180, 220);

    expect(onAddStep).toHaveBeenCalledWith("sales", expect.any(Number), 2, "end");
  });
});
