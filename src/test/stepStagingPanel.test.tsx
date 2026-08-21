import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepStagingPanel } from "@/components/process/StepStagingPanel";
import type { ProcessStep } from "@/data/processData";

function step(overrides: Partial<ProcessStep>): ProcessStep {
  return {
    id: "manual-task",
    label: "Handmatige taak",
    team: "sales",
    column: 0,
    type: "task",
    ...overrides,
  };
}

describe("StepStagingPanel", () => {
  it("shows separate sections for new HubSpot stages and parked step types", () => {
    render(
      <StepStagingPanel
        driftNew={[{ stage_id: "new-stage", label: "Nieuwe HubSpot stage", display_order: 0, metadata: {} }]}
        driftRenamed={[]}
        parkedSteps={[
          step({ id: "stage-parked-stage", label: "Geparkeerde HubSpot stage" }),
          step({ id: "manual-task", label: "Losse handmatige taak", type: "task" }),
          step({ id: "manual-decision", label: "Handmatige keuze", type: "decision" }),
        ]}
        onApplyRename={vi.fn()}
        onDismissRename={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: /Nieuw in HubSpot/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Geparkeerde HubSpot stages/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Geparkeerde handmatige stappen/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Geparkeerde proceslogica/i })).toBeInTheDocument();
    expect(screen.getByText("Nieuwe HubSpot stage")).toBeInTheDocument();
    expect(screen.getByText("Geparkeerde HubSpot stage")).toBeInTheDocument();
    expect(screen.getByText("Losse handmatige taak")).toBeInTheDocument();
    expect(screen.getByText("Handmatige keuze")).toBeInTheDocument();
  });

  it("can collapse a parked section without removing other sections", async () => {
    render(
      <StepStagingPanel
        driftNew={[]}
        driftRenamed={[]}
        parkedSteps={[
          step({ id: "stage-parked-stage", label: "Geparkeerde HubSpot stage" }),
          step({ id: "manual-task", label: "Losse handmatige taak", type: "task" }),
        ]}
        onApplyRename={vi.fn()}
        onDismissRename={vi.fn()}
      />,
    );

    const hubspotSection = screen.getByTestId("step-staging-section-parked-hubspot");
    fireEvent.click(within(hubspotSection).getByRole("button", { name: /Geparkeerde HubSpot stages/i }));

    expect(screen.queryByText("Geparkeerde HubSpot stage")).not.toBeInTheDocument();
    expect(screen.getByText("Losse handmatige taak")).toBeInTheDocument();
  });
});
