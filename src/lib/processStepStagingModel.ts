import type { ProcessStep } from "@/data/processData";
import type { PipelineStage } from "@/lib/types";
import type { DriftRename } from "@/lib/processDrift";

export interface StepStagingModel {
  newHubSpotStages: PipelineStage[];
  renamedHubSpotStages: DriftRename[];
  parkedHubSpotStages: ProcessStep[];
  parkedManualTasks: ProcessStep[];
  parkedManualLogic: ProcessStep[];
  totalCount: number;
}

const LOGIC_STEP_TYPES = new Set<ProcessStep["type"]>([
  "start",
  "end",
  "timer",
  "decision",
  "terminate",
  "send",
  "receive",
  "and",
]);

export function isHubSpotStageStep(step: ProcessStep): boolean {
  return step.id.startsWith("stage-");
}

export function isProcessLogicStep(step: ProcessStep): boolean {
  return LOGIC_STEP_TYPES.has(step.type);
}

export function buildStepStagingModel(input: {
  driftNew: PipelineStage[];
  driftRenamed: DriftRename[];
  parkedSteps: ProcessStep[];
}): StepStagingModel {
  const parkedHubSpotStages: ProcessStep[] = [];
  const parkedManualTasks: ProcessStep[] = [];
  const parkedManualLogic: ProcessStep[] = [];

  for (const step of input.parkedSteps) {
    if (isHubSpotStageStep(step)) {
      parkedHubSpotStages.push(step);
    } else if (isProcessLogicStep(step)) {
      parkedManualLogic.push(step);
    } else {
      parkedManualTasks.push(step);
    }
  }

  return {
    newHubSpotStages: input.driftNew,
    renamedHubSpotStages: input.driftRenamed,
    parkedHubSpotStages,
    parkedManualTasks,
    parkedManualLogic,
    totalCount:
      input.driftNew.length +
      input.driftRenamed.length +
      parkedHubSpotStages.length +
      parkedManualTasks.length +
      parkedManualLogic.length,
  };
}
