import type { Automatisering, Pipeline } from "@/lib/types";
import type { AutomationSentryIssuesQueryResult } from "@/lib/queryHooks/sentryIssues";
import {
  DEFAULT_PROCESS_MANUAL_STATUS,
  type ProcessManualStatus,
  type SavedProcessStateWithUpdatedAt,
} from "@/lib/storage/processState";

export interface ProcessCockpitQuality {
  hasSavedState: boolean;
  savedStateIsEmpty: boolean;
  missingStageCount: number;
  parkedHubSpotStageCount: number;
  linkedAutomationCount: number;
  stepCount: number;
  connectionCount: number;
  artifactCount: number;
  attachmentCount: number;
  stale: boolean;
}

export interface ProcessCockpitSentrySummary {
  issueCount: number;
  eventCount: number;
  latestSeen: string | null;
}

export interface ProcessCockpitRow {
  pipelineId: string;
  name: string;
  source: Pipeline["source"];
  isActive: boolean;
  stageCount: number;
  updatedAt: string | null;
  manualStatus: ProcessManualStatus;
  readinessScore: number;
  exportReady: boolean;
  needsAttention: boolean;
  blockedReason: string | null;
  attentionReasons: string[];
  quality: ProcessCockpitQuality;
  sentry: ProcessCockpitSentrySummary;
}

export interface ProcessCockpitModel {
  kpis: {
    totalPipelines: number;
    activePipelines: number;
    savedProcessViews: number;
    missingProcessViews: number;
    linkedAutomations: number;
    openSentryIssues: number;
    selectedForExport: number;
  };
  rows: ProcessCockpitRow[];
  maintenanceQueue: ProcessCockpitRow[];
}

export interface BuildProcessCockpitModelInput {
  pipelines: Pipeline[];
  processStates: Record<string, SavedProcessStateWithUpdatedAt | undefined>;
  automations: Automatisering[];
  sentry?: AutomationSentryIssuesQueryResult;
  selectedPipelineIds?: string[];
  now?: Date;
}

const STALE_PROCESS_DAYS = 90;
const INACTIVE_PIPELINE_BLOCKED_REASON =
  "Pipeline is inactief; hiervoor hoeft geen procesview gemaakt te worden. Wil je dit wel aanpassen? Zet de pipeline eerst weer actief in de bron of portal.";

export function buildProcessCockpitModel(input: BuildProcessCockpitModelInput): ProcessCockpitModel {
  const now = input.now ?? new Date();
  const rows = input.pipelines
    .map((pipeline) =>
      buildPipelineRow({
        pipeline,
        processState: input.processStates[pipeline.pipelineId],
        automations: input.automations,
        sentry: input.sentry,
        now,
      }),
    )
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));

  return {
    kpis: {
      totalPipelines: rows.length,
      activePipelines: rows.filter((row) => row.isActive).length,
      savedProcessViews: rows.filter((row) => row.quality.hasSavedState).length,
      missingProcessViews: rows.filter((row) => row.isActive && !row.quality.hasSavedState).length,
      linkedAutomations: rows.reduce((total, row) => total + row.quality.linkedAutomationCount, 0),
      openSentryIssues: rows.reduce((total, row) => total + row.sentry.issueCount, 0),
      selectedForExport: input.selectedPipelineIds?.length ?? 0,
    },
    rows,
    maintenanceQueue: rows
      .filter((row) => row.needsAttention)
      .sort((a, b) => a.readinessScore - b.readinessScore || a.name.localeCompare(b.name)),
  };
}

function buildPipelineRow({
  pipeline,
  processState,
  automations,
  sentry,
  now,
}: {
  pipeline: Pipeline;
  processState: SavedProcessStateWithUpdatedAt | undefined;
  automations: Automatisering[];
  sentry?: AutomationSentryIssuesQueryResult;
  now: Date;
}): ProcessCockpitRow {
  const steps = processState?.steps ?? [];
  const connections = processState?.connections ?? [];
  const parkedSteps = processState?.parkedSteps ?? [];
  const autoLinks = processState?.autoLinks ?? {};
  const hasSavedState = Boolean(processState && steps.length > 0);
  const savedStateIsEmpty = Boolean(processState && steps.length === 0);
  const stageStepIds = new Set([
    ...steps.map((step) => getUnknownId(step)),
    ...parkedSteps.map((step) => getUnknownId(step)),
  ].filter(Boolean));
  const missingStageCount = hasSavedState
    ? pipeline.stages.filter((stage) => !stageStepIds.has(`stage-${stage.stage_id}`)).length
    : pipeline.stages.length;
  const parkedHubSpotStageCount = parkedSteps.filter((step) => getUnknownId(step)?.startsWith("stage-")).length;
  const linkedAutomationIds = new Set([
    ...Object.keys(autoLinks),
    ...automations
      .filter((automation) => automation.pipelineId === pipeline.pipelineId)
      .map((automation) => automation.id),
  ]);
  const sentrySummary = summarizePipelineSentry(Array.from(linkedAutomationIds), sentry);
  const stale = isStale(processState?.updatedAt ?? null, now);
  const quality: ProcessCockpitQuality = {
    hasSavedState,
    savedStateIsEmpty,
    missingStageCount,
    parkedHubSpotStageCount,
    linkedAutomationCount: linkedAutomationIds.size,
    stepCount: steps.length,
    connectionCount: connections.length,
    artifactCount: (processState?.artifacts ?? []).length,
    attachmentCount: (processState?.attachments ?? []).length,
    stale,
  };
  const attentionReasons = buildAttentionReasons(quality, sentrySummary);

  return {
    pipelineId: pipeline.pipelineId,
    name: pipeline.naam,
    source: pipeline.source,
    isActive: pipeline.isActive,
    stageCount: pipeline.stages.length,
    updatedAt: processState?.updatedAt ?? null,
    manualStatus: processState?.manualStatus ?? DEFAULT_PROCESS_MANUAL_STATUS,
    readinessScore: calculateReadinessScore(pipeline, quality, sentrySummary),
    exportReady: pipeline.isActive && hasSavedState,
    needsAttention: pipeline.isActive && attentionReasons.length > 0,
    blockedReason: pipeline.isActive ? null : INACTIVE_PIPELINE_BLOCKED_REASON,
    attentionReasons,
    quality,
    sentry: sentrySummary,
  };
}

function summarizePipelineSentry(
  automationIds: string[],
  sentry?: AutomationSentryIssuesQueryResult,
): ProcessCockpitSentrySummary {
  if (!sentry) return { issueCount: 0, eventCount: 0, latestSeen: null };

  return automationIds.reduce<ProcessCockpitSentrySummary>((summary, automationId) => {
    const automationSummary = sentry.matches.summariesByAutomationId[automationId];
    if (!automationSummary) return summary;

    return {
      issueCount: summary.issueCount + automationSummary.linkedIssueCount,
      eventCount: summary.eventCount + automationSummary.eventCount,
      latestSeen: latestIso(summary.latestSeen, automationSummary.latestSeen),
    };
  }, { issueCount: 0, eventCount: 0, latestSeen: null });
}

function buildAttentionReasons(
  quality: ProcessCockpitQuality,
  sentry: ProcessCockpitSentrySummary,
): string[] {
  const reasons: string[] = [];
  if (!quality.hasSavedState) reasons.push("Geen procesview opgeslagen");
  if (quality.savedStateIsEmpty) reasons.push("Lege procesview");
  if (quality.missingStageCount > 0 && quality.hasSavedState) reasons.push("HubSpot stages ontbreken");
  if (quality.parkedHubSpotStageCount > 0) reasons.push("Geparkeerde HubSpot stages");
  if (quality.stale) reasons.push("Procesview verouderd");
  if (sentry.issueCount > 0) reasons.push("Sentry errors gekoppeld");
  return reasons;
}

function calculateReadinessScore(
  pipeline: Pipeline,
  quality: ProcessCockpitQuality,
  sentry: ProcessCockpitSentrySummary,
): number {
  if (!quality.hasSavedState) return 0;

  const stageCoverage = pipeline.stages.length === 0
    ? 25
    : Math.round(((pipeline.stages.length - quality.missingStageCount) / pipeline.stages.length) * 25);
  const connectionScore = quality.connectionCount > 0 ? 15 : 0;
  const automationScore = quality.linkedAutomationCount > 0 ? 15 : 0;
  const contextScore = Math.min(10, quality.artifactCount * 4 + quality.attachmentCount * 2);
  const freshnessScore = quality.stale ? 0 : 15;
  const parkedPenalty = Math.min(10, quality.parkedHubSpotStageCount * 5);
  const sentryPenalty = Math.min(20, sentry.issueCount * 10);

  return clampScore(35 + stageCoverage + connectionScore + automationScore + contextScore + freshnessScore - parkedPenalty - sentryPenalty);
}

function isStale(updatedAt: string | null, now: Date): boolean {
  if (!updatedAt) return false;
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return false;
  return now.getTime() - timestamp > STALE_PROCESS_DAYS * 24 * 60 * 60 * 1000;
}

function latestIso(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return Date.parse(candidate) > Date.parse(current) ? candidate : current;
}

function getUnknownId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
