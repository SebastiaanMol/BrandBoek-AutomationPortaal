import type { ProcessStep } from "@/data/processData";
import type { Pipeline, PipelineStage } from "@/lib/types";

export interface DriftRename {
  stepId:   string;
  oldLabel: string;
  newLabel: string;
}

export interface DriftDeleted {
  stepId:  string;
  stageId: string;
  label:   string;
}

export interface DriftResult {
  driftNew:     PipelineStage[];
  driftRenamed: DriftRename[];
  driftDeleted: DriftDeleted[];
}

/**
 * Compare canvas steps against live pipeline stages and return what has changed.
 * Only steps with ID `stage-{stageId}` are considered (HubSpot-origin steps).
 * Manually added steps are ignored.
 *
 * Deleted source stages are surfaced as driftDeleted, so the canvas can mark
 * them red without removing process context or changing routes automatically.
 */
export function detectDrift(
  steps: ProcessStep[],
  pipeline: Pipeline,
  parkedSteps: ProcessStep[] = [],
): DriftResult {
  const knownSteps = [...steps, ...parkedSteps];
  const stageStepIds = new Set(knownSteps.map(s => s.id));
  const stageMap = new Map(pipeline.stages.map(s => [s.stage_id, s]));

  const driftNew = pipeline.stages.filter(
    s => !stageStepIds.has(`stage-${s.stage_id}`),
  );

  const driftRenamed: DriftRename[] = knownSteps
    .filter(s => s.id.startsWith("stage-"))
    .flatMap(s => {
      const stageId = s.id.slice("stage-".length);
      const stage = stageMap.get(stageId);
      if (!stage || stage.label === s.label) return [];
      return [{ stepId: s.id, oldLabel: s.label, newLabel: stage.label }];
    });

  const driftDeleted: DriftDeleted[] = knownSteps
    .filter(s => s.id.startsWith("stage-"))
    .flatMap(s => {
      const stageId = s.id.slice("stage-".length);
      if (stageMap.has(stageId)) return [];
      return [{ stepId: s.id, stageId, label: s.label }];
    });

  return { driftNew, driftRenamed, driftDeleted };
}
