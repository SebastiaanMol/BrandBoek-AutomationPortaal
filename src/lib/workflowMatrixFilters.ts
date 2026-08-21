import type { Pipeline, PipelineStage } from "@/lib/types";
import {
  isActiveWorkflow,
  pipelineIdForAutomation,
  type WorkflowMatrixAnalysis,
  type WorkflowMatrixAutomation,
} from "@/lib/workflowMatrixAnalysis";

export type WorkflowStatusFilter = "all" | "active" | "inactive";
export type WorkflowFocusFilter = "all" | "process_gaps" | "noise";

export type WorkflowMatrixViewFilters = {
  status: WorkflowStatusFilter;
  focus: WorkflowFocusFilter;
};

export type WorkflowMatrixFilteredStage = {
  stage: PipelineStage;
  workflows: WorkflowMatrixAutomation[];
};

export type WorkflowMatrixFilteredPipeline = {
  pipeline: Pipeline;
  stages: WorkflowMatrixFilteredStage[];
};

export type WorkflowMatrixFilteredView = {
  pipelines: WorkflowMatrixFilteredPipeline[];
  visibleStageCount: number;
  visibleWorkflowCount: number;
};

export function buildWorkflowMatrixFilteredView({
  pipelines,
  analysis,
  filters,
  now = new Date(),
}: {
  pipelines: Pipeline[];
  analysis: WorkflowMatrixAnalysis;
  filters: WorkflowMatrixViewFilters;
  now?: Date;
}): WorkflowMatrixFilteredView {
  const gapStageKeys = new Set(
    analysis.risks.emptyActiveStages.map(({ pipeline, stage }) => stageKey(pipeline.pipelineId, stage.stage_id)),
  );

  const visiblePipelines = pipelines
    .map((pipeline) => {
      const stages = pipeline.stages
        .map((stage) => {
          const allStageWorkflows = stageWorkflowsForPipeline(
            analysis.workflowsByStageId.get(stage.stage_id) ?? [],
            pipeline.pipelineId,
          );
          const workflows = allStageWorkflows.filter((workflow) => workflowPassesFilters(workflow, filters, now));
          return { stage, workflows };
        })
        .filter((entry) => {
          if (filters.focus === "process_gaps") {
            return gapStageKeys.has(stageKey(pipeline.pipelineId, entry.stage.stage_id));
          }
          if (filters.focus === "noise") {
            return entry.workflows.length > 0;
          }
          return true;
        })
        .map((entry) => ({
          ...entry,
          workflows: filters.focus === "process_gaps" ? [] : entry.workflows,
        }));

      return { pipeline, stages };
    })
    .filter((entry) => entry.stages.length > 0);

  return {
    pipelines: visiblePipelines,
    visibleStageCount: visiblePipelines.reduce((total, pipeline) => total + pipeline.stages.length, 0),
    visibleWorkflowCount: visiblePipelines.reduce(
      (total, pipeline) => total + pipeline.stages.reduce((stageTotal, stage) => stageTotal + stage.workflows.length, 0),
      0,
    ),
  };
}

export function isNoiseWorkflow(workflow: WorkflowMatrixAutomation, now = new Date()): boolean {
  if (!isActiveWorkflow(workflow.status)) return true;
  if (workflow.hubspotRunCount365d === 0) return true;
  if (!workflow.hubspotLastRunAt) return true;

  const lastRun = new Date(workflow.hubspotLastRunAt);
  if (Number.isNaN(lastRun.getTime())) return true;

  const daysSinceRun = (now.getTime() - lastRun.getTime()) / (24 * 60 * 60 * 1000);
  return daysSinceRun > 180;
}

function workflowPassesFilters(
  workflow: WorkflowMatrixAutomation,
  filters: WorkflowMatrixViewFilters,
  now: Date,
): boolean {
  if (filters.status === "active" && !isActiveWorkflow(workflow.status)) return false;
  if (filters.status === "inactive" && isActiveWorkflow(workflow.status)) return false;
  if (filters.focus === "noise" && !isNoiseWorkflow(workflow, now)) return false;
  return true;
}

function stageWorkflowsForPipeline(workflows: WorkflowMatrixAutomation[], pipelineId: string): WorkflowMatrixAutomation[] {
  return workflows.filter((workflow) => {
    const workflowPipelineId = pipelineIdForAutomation(workflow);
    if (/^\d+$/.test(workflowPipelineId)) return true;
    return !workflowPipelineId || workflowPipelineId === pipelineId;
  });
}

function stageKey(pipelineId: string, stageId: string): string {
  return `${pipelineId}::${stageId}`;
}
