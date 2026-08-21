const PIPELINE_PROPS = new Set(["pipeline", "hs_pipeline"]);
const STAGE_PROPS = new Set(["dealstage", "hs_pipeline_stage"]);

type PipelineStageExtraction = {
  pipelineId: string | null;
  stageId: string | null;
};

export function extractPipelineStage(wf: any): PipelineStageExtraction {
  let pipelineId: string | null = null;
  let stageId: string | null = null;

  function checkFilter(filter: any) {
    const prop = String(filter?.property ?? filter?.propertyName ?? "").toLowerCase();
    const raw = firstDefined(filter?.value, filter?.propertyValue, Array.isArray(filter?.values) ? filter.values[0] : null);
    const value = raw == null ? "" : String(raw);

    if (!value || value === "null" || value === "undefined") return;
    if (PIPELINE_PROPS.has(prop)) pipelineId = value;
    if (STAGE_PROPS.has(prop)) stageId = value;
  }

  function walkBranch(branch: any) {
    for (const filter of branch?.filters ?? []) checkFilter(filter);
    for (const child of branch?.filterBranches ?? []) walkBranch(child);
  }

  walkBranch(wf?.enrollmentCriteria?.listFilterBranch);

  for (const triggerSet of wf?.triggerSets ?? []) {
    for (const filter of triggerSet?.filters ?? []) checkFilter(filter);
  }

  for (const triggerSet of wf?.reEnrollmentTriggerSets ?? []) {
    for (const filter of triggerSet?.filters ?? []) checkFilter(filter);
  }

  for (const group of wf?.segmentCriteria ?? []) {
    const filters = Array.isArray(group) ? group : [group];
    for (const filter of filters) checkFilter(filter);
  }

  return { pipelineId, stageId };
}

function firstDefined(...values: any[]) {
  return values.find((value) => value !== undefined && value !== null);
}
