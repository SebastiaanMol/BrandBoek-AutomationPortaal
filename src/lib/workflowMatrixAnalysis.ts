import type { Automatisering, Pipeline, PipelineStage } from "@/lib/types";

export type WorkflowMatrixAutomation = Automatisering & {
  pipeline_id?: string | null;
  stage_id?: string | null;
  external_id?: string | null;
};

export type WorkflowStageMatchType = "direct" | "display_order" | "label_fallback";

export type WorkflowStageMatch = {
  automation: WorkflowMatrixAutomation;
  pipeline: Pipeline;
  stage: PipelineStage;
  matchType: WorkflowStageMatchType;
  rawStageIds: string[];
};

export type WorkflowMatrixAnalysis = {
  kpis: {
    totalWorkflows: number;
    linkedWorkflows: number;
    unlinkedWorkflows: number;
    activeWorkflows: number;
    disabledWorkflows: number;
    activePipelines: number;
    inactivePipelines: number;
    emptyActiveStages: number;
  };
  workflowsByStageId: Map<string, WorkflowMatrixAutomation[]>;
  matchesByAutomationId: Map<string, WorkflowStageMatch[]>;
  risks: {
    activePipelineInactiveWorkflows: WorkflowStageMatch[];
    inactivePipelineActiveWorkflows: WorkflowStageMatch[];
    emptyActiveStages: Array<{ pipeline: Pipeline; stage: PipelineStage }>;
    multiStageWorkflows: Array<{ automation: WorkflowMatrixAutomation; rawStageIds: string[]; matches: WorkflowStageMatch[] }>;
    fallbackMatchedWorkflows: Array<{ automation: WorkflowMatrixAutomation; matches: WorkflowStageMatch[] }>;
    unmatchedStageWorkflows: Array<{ automation: WorkflowMatrixAutomation; rawStageIds: string[] }>;
    missingRunDataWorkflows: Array<{ automation: WorkflowMatrixAutomation; reason: string }>;
  };
  pipelineSummaries: Array<{
    pipeline: Pipeline;
    stageCount: number;
    activeWorkflowCount: number;
    inactiveWorkflowCount: number;
    emptyStageCount: number;
    recommendedAction: string;
  }>;
};

export function buildWorkflowMatrixAnalysis(input: {
  pipelines: Pipeline[];
  automations: WorkflowMatrixAutomation[];
}): WorkflowMatrixAnalysis {
  const pipelines = input.pipelines
    .filter((pipeline) => pipeline.source === "hubspot")
    .map((pipeline) => ({
      ...pipeline,
      stages: [...pipeline.stages].sort((a, b) => a.display_order - b.display_order),
    }));

  const allStages = pipelines.flatMap((pipeline) => pipeline.stages.map((stage) => ({ pipeline, stage })));
  const stageById = new Map(allStages.map((entry) => [entry.stage.stage_id, entry]));
  const workflowsByStageId = new Map<string, WorkflowMatrixAutomation[]>();
  const matchesByAutomationId = new Map<string, WorkflowStageMatch[]>();
  const unmatchedStageWorkflows: WorkflowMatrixAnalysis["risks"]["unmatchedStageWorkflows"] = [];

  for (const automation of input.automations) {
    const rawStageIds = rawStageIdsForAutomation(automation);
    if (rawStageIds.length === 0) continue;
    const matches = stageMatchesForAutomation(automation, rawStageIds, allStages, stageById);

    if (matches.length === 0) {
      unmatchedStageWorkflows.push({ automation, rawStageIds });
      continue;
    }

    matchesByAutomationId.set(automation.id, matches);
    for (const match of matches) {
      const workflows = workflowsByStageId.get(match.stage.stage_id) ?? [];
      workflows.push(automation);
      workflowsByStageId.set(match.stage.stage_id, workflows);
    }
  }

  for (const [stageId, workflows] of workflowsByStageId) {
    workflowsByStageId.set(stageId, uniqueAutomations(workflows).sort((a, b) => a.naam.localeCompare(b.naam)));
  }

  const uniqueLinkedIds = new Set(matchesByAutomationId.keys());
  const emptyActiveStages = allStages
    .filter(({ pipeline, stage }) => pipeline.isActive && !hasActiveWorkflows(workflowsByStageId.get(stage.stage_id) ?? []))
    .map(({ pipeline, stage }) => ({ pipeline, stage }));

  const activePipelineInactiveWorkflows = uniqueMatches(
    [...matchesByAutomationId.values()].flat().filter((match) => match.pipeline.isActive && !isActiveWorkflow(match.automation.status)),
  );
  const inactivePipelineActiveWorkflows = uniqueMatches(
    [...matchesByAutomationId.values()].flat().filter((match) => !match.pipeline.isActive && isActiveWorkflow(match.automation.status)),
  );

  const multiStageWorkflows = input.automations
    .map((automation) => ({
      automation,
      rawStageIds: rawStageIdsForAutomation(automation),
      matches: matchesByAutomationId.get(automation.id) ?? [],
    }))
    .filter((entry) => entry.rawStageIds.length > 1);

  const fallbackMatchedWorkflows = input.automations
    .map((automation) => ({
      automation,
      matches: matchesByAutomationId.get(automation.id) ?? [],
    }))
    .filter((entry) => entry.matches.some((match) => match.matchType !== "direct"));

  const missingRunDataWorkflows = input.automations
    .filter((automation) => isHubSpotAutomation(automation))
    .flatMap((automation) => {
      if (!automation.hubspotLastRunAt) return [{ automation, reason: "Geen laatste run bekend" }];
      if (automation.hubspotRunCount365d === 0) return [{ automation, reason: "0 runs in 365 dagen" }];
      return [];
    });

  const pipelineSummaries = pipelines.map((pipeline) => {
    const pipelineStageIds = new Set(pipeline.stages.map((stage) => stage.stage_id));
    const pipelineWorkflows = uniqueAutomations(
      [...pipelineStageIds].flatMap((stageId) => workflowsByStageId.get(stageId) ?? []),
    );
    const emptyStages = pipeline.stages.filter((stage) => !hasActiveWorkflows(workflowsByStageId.get(stage.stage_id) ?? []));
    const inactiveCount = pipelineWorkflows.filter((automation) => !isActiveWorkflow(automation.status)).length;
    const activeCount = pipelineWorkflows.filter((automation) => isActiveWorkflow(automation.status)).length;

    return {
      pipeline,
      stageCount: pipeline.stages.length,
      activeWorkflowCount: activeCount,
      inactiveWorkflowCount: inactiveCount,
      emptyStageCount: emptyStages.length,
      recommendedAction: recommendedPipelineAction(pipeline, emptyStages.length, inactiveCount),
    };
  });

  return {
    kpis: {
      totalWorkflows: input.automations.length,
      linkedWorkflows: uniqueLinkedIds.size,
      unlinkedWorkflows: input.automations.length - uniqueLinkedIds.size,
      activeWorkflows: input.automations.filter((automation) => isActiveWorkflow(automation.status)).length,
      disabledWorkflows: input.automations.filter((automation) => !isActiveWorkflow(automation.status)).length,
      activePipelines: pipelines.filter((pipeline) => pipeline.isActive).length,
      inactivePipelines: pipelines.filter((pipeline) => !pipeline.isActive).length,
      emptyActiveStages: emptyActiveStages.length,
    },
    workflowsByStageId,
    matchesByAutomationId,
    risks: {
      activePipelineInactiveWorkflows,
      inactivePipelineActiveWorkflows,
      emptyActiveStages,
      multiStageWorkflows,
      fallbackMatchedWorkflows,
      unmatchedStageWorkflows,
      missingRunDataWorkflows,
    },
    pipelineSummaries,
  };
}

export function isActiveWorkflow(status: string | undefined): boolean {
  const normalized = status?.trim().toLowerCase();
  return normalized === "actief" || normalized === "active" || normalized === "enabled";
}

export function rawStageIdsForAutomation(automation: WorkflowMatrixAutomation): string[] {
  const rawStageId = stringValue(automation.stage_id ?? automation.stageId);
  if (!rawStageId) return [];

  return [...new Set(
    rawStageId
      .split(",")
      .map((stageId) => stageId.trim())
      .filter(Boolean),
  )];
}

export function pipelineIdForAutomation(automation: WorkflowMatrixAutomation): string {
  return stringValue(automation.pipeline_id ?? automation.pipelineId);
}

function stageMatchesForAutomation(
  automation: WorkflowMatrixAutomation,
  rawStageIds: string[],
  allStages: Array<{ pipeline: Pipeline; stage: PipelineStage }>,
  stageById: Map<string, { pipeline: Pipeline; stage: PipelineStage }>,
): WorkflowStageMatch[] {
  const matches = new Map<string, WorkflowStageMatch>();

  for (const rawStageId of rawStageIds) {
    const direct = stageById.get(rawStageId);
    if (direct && pipelineAllowsMatch(automation, direct.pipeline)) {
      matches.set(direct.stage.stage_id, {
        automation,
        pipeline: direct.pipeline,
        stage: direct.stage,
        matchType: "direct",
        rawStageIds,
      });
      continue;
    }

    const numericId = Number(rawStageId);
    if (Number.isInteger(numericId)) {
      for (const entry of allStages) {
        if (!pipelineAllowsMatch(automation, entry.pipeline)) continue;
        if (entry.stage.display_order === numericId || entry.stage.display_order + 1 === numericId) {
          matches.set(entry.stage.stage_id, {
            automation,
            pipeline: entry.pipeline,
            stage: entry.stage,
            matchType: "display_order",
            rawStageIds,
          });
        }
      }
    }
  }

  if (matches.size === 0) {
    for (const entry of allStages) {
      if (!pipelineAllowsMatch(automation, entry.pipeline)) continue;
      if (!stageLabelMatchesWorkflowName(entry.stage, automation)) continue;
      matches.set(entry.stage.stage_id, {
        automation,
        pipeline: entry.pipeline,
        stage: entry.stage,
        matchType: "label_fallback",
        rawStageIds,
      });
    }
  }

  return [...matches.values()];
}

function pipelineAllowsMatch(automation: WorkflowMatrixAutomation, pipeline: Pipeline): boolean {
  const pipelineId = pipelineIdForAutomation(automation);
  if (!pipelineId || /^\d+$/.test(pipelineId)) return true;
  return pipelineId === pipeline.pipelineId;
}

function stageLabelMatchesWorkflowName(stage: PipelineStage, automation: WorkflowMatrixAutomation): boolean {
  const workflowName = normalizeMatchText(automation.naam);
  const stageLabel = normalizeMatchText(stage.label);
  if (!workflowName || !stageLabel) return false;
  if (workflowName.includes(stageLabel) || stageLabel.includes(workflowName)) return true;

  const stageTokens = stageLabel
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 5);

  return stageTokens.some((token) => workflowName.includes(token));
}

function normalizeMatchText(value: unknown): string {
  return stringValue(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasActiveWorkflows(workflows: WorkflowMatrixAutomation[]): boolean {
  return workflows.some((workflow) => isActiveWorkflow(workflow.status));
}

function uniqueAutomations(workflows: WorkflowMatrixAutomation[]): WorkflowMatrixAutomation[] {
  return [...new Map(workflows.map((workflow) => [workflow.id, workflow])).values()];
}

function uniqueMatches(matches: WorkflowStageMatch[]): WorkflowStageMatch[] {
  return [...new Map(matches.map((match) => [match.automation.id, match])).values()];
}

function recommendedPipelineAction(pipeline: Pipeline, emptyStageCount: number, inactiveWorkflowCount: number): string {
  if (!pipeline.isActive && inactiveWorkflowCount === 0) return "Controleer of actieve workflows nog in deze oude pipeline thuishoren.";
  if (emptyStageCount > 0 && inactiveWorkflowCount > 0) {
    return `Controleer ${emptyStageCount} lege actieve stage${emptyStageCount === 1 ? "" : "s"} en ${inactiveWorkflowCount} uitgeschakelde workflow${inactiveWorkflowCount === 1 ? "" : "s"}.`;
  }
  if (emptyStageCount > 0) return `Controleer ${emptyStageCount} lege actieve stage${emptyStageCount === 1 ? "" : "s"}.`;
  if (inactiveWorkflowCount > 0) return `Controleer ${inactiveWorkflowCount} uitgeschakelde workflow${inactiveWorkflowCount === 1 ? "" : "s"}.`;
  return "Geen directe beheeractie nodig.";
}

function isHubSpotAutomation(automation: WorkflowMatrixAutomation): boolean {
  const source = stringValue(automation.source).toLowerCase();
  return !source || source === "hubspot" || automation.systemen?.includes("HubSpot");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
