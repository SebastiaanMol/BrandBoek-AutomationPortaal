import { describe, expect, it } from "vitest";
import type { ProcessStep } from "@/data/processData";
import type { PipelineStage } from "@/lib/types";
import { buildStepStagingModel } from "@/lib/processStepStagingModel";

function stage(stageId: string, label: string): PipelineStage {
  return { stage_id: stageId, label, display_order: 0, metadata: {} };
}

function step(overrides: Partial<ProcessStep>): ProcessStep {
  return {
    id: "manual-1",
    label: "Handmatige stap",
    team: "sales",
    column: 0,
    type: "task",
    ...overrides,
  };
}

describe("buildStepStagingModel", () => {
  it("separates new HubSpot stages from parked HubSpot stages and manual parked steps", () => {
    const model = buildStepStagingModel({
      driftNew: [stage("stage-new", "Nieuwe HubSpot stage")],
      driftRenamed: [],
      parkedSteps: [
        step({ id: "stage-stage-parked", label: "Geparkeerde HubSpot stage" }),
        step({ id: "manual-task", label: "Losse handmatige taak", type: "task" }),
        step({ id: "manual-decision", label: "Handmatige keuze", type: "decision" }),
      ],
    });

    expect(model.newHubSpotStages.map(item => item.label)).toEqual(["Nieuwe HubSpot stage"]);
    expect(model.parkedHubSpotStages.map(item => item.label)).toEqual(["Geparkeerde HubSpot stage"]);
    expect(model.parkedManualTasks.map(item => item.label)).toEqual(["Losse handmatige taak"]);
    expect(model.parkedManualLogic.map(item => item.label)).toEqual(["Handmatige keuze"]);
    expect(model.totalCount).toBe(4);
  });

  it("treats event and gateway step types as parked process logic", () => {
    const model = buildStepStagingModel({
      driftNew: [],
      driftRenamed: [],
      parkedSteps: [
        step({ id: "manual-start", label: "Startpunt", type: "start" }),
        step({ id: "manual-and", label: "Parallel", type: "and" }),
      ],
    });

    expect(model.parkedManualLogic.map(item => item.label)).toEqual(["Startpunt", "Parallel"]);
    expect(model.parkedManualTasks).toEqual([]);
  });
});
