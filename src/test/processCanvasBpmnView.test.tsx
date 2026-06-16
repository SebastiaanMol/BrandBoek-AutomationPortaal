import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import type { CustomLane, ProcessStep } from "@/data/processData";

const customLanes: CustomLane[] = [
  {
    key: "sales",
    label: "Intake",
    bg: "hsl(215 80% 97%)",
    stroke: "hsl(215 80% 50%)",
    text: "hsl(215 70% 32%)",
    dot: "hsl(215 75% 55%)",
  },
  {
    key: "boekhouding",
    label: "Controle & Afronding",
    bg: "hsl(35 85% 97%)",
    stroke: "hsl(35 85% 50%)",
    text: "hsl(35 75% 28%)",
    dot: "hsl(35 80% 55%)",
  },
];

const steps: ProcessStep[] = [
  { id: "start", type: "start", label: "Start", team: "sales", column: 0 },
  { id: "s1", type: "task", label: "Dossier openen", team: "sales", column: 1 },
  { id: "s2", type: "decision", label: "Akkoord?", team: "boekhouding", column: 2 },
  { id: "end", type: "end", label: "Einde", team: "boekhouding", column: 3 },
];

describe("ProcessCanvas BPMN-like structural view", () => {
  it("renders a numbered phase bar using active lane labels", () => {
    render(
      <ProcessCanvas
        steps={steps}
        connections={[
          { id: "c1", fromStepId: "start", toStepId: "s1" },
          { id: "c2", fromStepId: "s1", toStepId: "s2" },
        ]}
        automations={[]}
        activeLanes={["sales", "boekhouding"]}
        customLanes={customLanes}
        readOnly
      />,
    );

    expect(screen.getByTestId("process-phase-bar")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Intake")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Controle & Afronding")).toBeInTheDocument();
  });

  it("shows the compact BPMN legend", () => {
    render(
      <ProcessCanvas
        steps={steps}
        connections={[{ id: "c1", fromStepId: "s1", toStepId: "end" }]}
        automations={[]}
        activeLanes={["sales", "boekhouding"]}
        customLanes={customLanes}
        readOnly
      />,
    );

    expect(screen.getByText("Legenda")).toBeInTheDocument();
    expect(screen.getByText("Hoofdproces")).toBeInTheDocument();
    expect(screen.getByText("Correctie / optioneel")).toBeInTheDocument();
    expect(screen.getByText("Uitzondering / einde")).toBeInTheDocument();
    expect(screen.getByText("Start/einde")).toBeInTheDocument();
    expect(screen.getByText("Taak")).toBeInTheDocument();
    expect(screen.getByText("Gateway")).toBeInTheDocument();
  });

  it("reserves vertical canvas space for the bottom legend", () => {
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales", "boekhouding"]}
        customLanes={customLanes}
        readOnly
      />,
    );

    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("height")).toBe("220");
  });

  it("marks routes to end events as exception/end routes", () => {
    render(
      <ProcessCanvas
        steps={steps}
        connections={[{ id: "c-end", fromStepId: "s2", toStepId: "end" }]}
        automations={[]}
        activeLanes={["sales", "boekhouding"]}
        customLanes={customLanes}
        readOnly
      />,
    );

    expect(screen.getByLabelText("Uitzondering of einde route")).toBeInTheDocument();
  });

  it("renders gateway diamonds 20 percent smaller than the original size", () => {
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales", "boekhouding"]}
        customLanes={customLanes}
        readOnly
      />,
    );

    const diamond = Array.from(container.querySelectorAll("polygon"))
      .find((polygon) => polygon.getAttribute("points")?.includes("539,"));

    expect(diamond?.getAttribute("points")).toBe("539,103 568,132 539,161 510,132");
  });
});
