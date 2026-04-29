import type { ProcessStep } from "@/data/processData";
import type { Pipeline, PipelineStage } from "@/lib/types";

export interface DriftRename {
  stepId:   string;
  oldLabel: string;
  newLabel: string;
}

export interface DriftResult {
  driftNew:     PipelineStage[];
  driftRenamed: DriftRename[];
}

/**
 * Compare canvas steps against live pipeline stages and return what has changed.
 * Only steps with ID `stage-{stageId}` are considered (HubSpot-origin steps).
 * Manually added steps (e.g. `s-1234`) are ignored.
 * Deleted stages are NOT surfaced — they simply stop appearing as drift candidates.
 */
export function detectDrift(steps: ProcessStep[], pipeline: Pipeline): DriftResult {
  const stageStepIds = new Set(steps.map(s => s.id));
  const stageMap     = new Map(pipeline.stages.map(s => [s.stage_id, s]));

  // New: stages in pipeline that have no matching canvas step
  const driftNew = pipeline.stages.filter(
    s => !stageStepIds.has(`stage-${s.stage_id}`),
  );

  // Renamed: canvas steps whose label differs from the current stage label
  const driftRenamed: DriftRename[] = steps
    .filter(s => s.id.startsWith("stage-"))
    .flatMap(s => {
      const stageId = s.id.slice("stage-".length);
      const stage   = stageMap.get(stageId);
      if (!stage || stage.label === s.label) return [];
      return [{ stepId: s.id, oldLabel: s.label, newLabel: stage.label }];
    });

  return { driftNew, driftRenamed };
}
