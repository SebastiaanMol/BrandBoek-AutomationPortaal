import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProcessCanvas } from "@/components/process/ProcessCanvas";
import { StepDialog } from "@/components/process/StepDialog";
import type { ProcessState, ProcessStep } from "@/data/processData";
import { buildProcessStateFromSaved, buildSavedProcessState } from "@/lib/processStateMapping";

const timerStep: ProcessStep = {
  id: "timer-1",
  type: "timer",
  label: "Wacht 3 dagen",
  team: "sales",
  column: 1,
};

describe("BPMN timer event", () => {
  it("renders a timer/wait event on the process canvas", () => {
    render(
      <ProcessCanvas
        steps={[
          { id: "start", type: "start", label: "Start", team: "sales", column: 0 },
          timerStep,
          { id: "next", type: "task", label: "Volgende taak", team: "sales", column: 2 },
        ]}
        connections={[
          { id: "c1", fromStepId: "start", toStepId: "timer-1" },
          { id: "c2", fromStepId: "timer-1", toStepId: "next" },
        ]}
        automations={[]}
        activeLanes={["sales"]}
        readOnly
      />,
    );

    expect(screen.getByLabelText("BPMN timer event Wacht 3 dagen")).toBeInTheDocument();
    expect(screen.getByText("Wacht 3 dagen")).toBeInTheDocument();
  });

  it("offers Timer / Wachttijd as a step type in the step dialog", () => {
    const onSave = vi.fn();
    render(
      <StepDialog
        open
        step={null}
        maxColumn={1}
        defaultValues={{ team: "sales", column: 1, type: "timer" }}
        activeLanes={["sales"]}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Timer / wachttijd")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("bijv. Intake gesprek"), {
      target: { value: "Wacht 3 dagen" },
    });
    fireEvent.click(screen.getByText("Toevoegen"));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      label: "Wacht 3 dagen",
      type: "timer",
    }));
  });

  it("preserves timer events through saved process state mapping", () => {
    const state: ProcessState = {
      steps: [timerStep],
      connections: [],
      automations: [],
    };

    const saved = buildSavedProcessState(state, [], ["sales"], []);
    const mapped = buildProcessStateFromSaved(saved, []);

    expect(mapped.steps[0]).toMatchObject({
      id: "timer-1",
      type: "timer",
      label: "Wacht 3 dagen",
    });
  });
});
