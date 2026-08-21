import type { AutomationSentryIssuesQueryResult } from "@/lib/queryHooks/sentryIssues";
import type { SavedProcessStateWithUpdatedAt } from "@/lib/storage/processState";
import type { SentryIssueMatch } from "@/lib/sentryIssueMatching";
import type { Automatisering, AutomationSourceFinding, Pipeline } from "@/lib/types";

export type NotificationType =
  | "sentry_linked_error"
  | "pipeline_new_stage"
  | "pipeline_source_inactive"
  | "automation_source_missing"
  | "automation_source_changed"
  | "process_view_drift";

export type NotificationSeverity = "critical" | "warning" | "info";

export interface NotificationState {
  notificationKey: string;
  seenAt: string | null;
  archivedAt: string | null;
}

export interface NotificationItem {
  notificationKey: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  description: string;
  sourceLabel: string;
  href: string;
  timestamp: string | null;
  seenAt: string | null;
  archivedAt: string | null;
}

export interface NotificationCenterModel {
  items: NotificationItem[];
  openItems: NotificationItem[];
  seenItems: NotificationItem[];
  archivedItems: NotificationItem[];
  unseenCount: number;
}

export interface NotificationCenterInput {
  automations: Automatisering[];
  pipelines: Pipeline[];
  processStates: Record<string, SavedProcessStateWithUpdatedAt | undefined>;
  sentry?: AutomationSentryIssuesQueryResult;
  states: NotificationState[];
  now?: Date;
}

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

const TYPE_RANK: Record<NotificationType, number> = {
  sentry_linked_error: 60,
  automation_source_missing: 55,
  pipeline_source_inactive: 45,
  pipeline_new_stage: 35,
  process_view_drift: 30,
  automation_source_changed: 20,
};

const SOURCE_CHANGED_TYPES = new Set<AutomationSourceFinding["type"]>([
  "source_changed",
  "webhook_changed",
  "metadata_changed",
  "source_data_incomplete",
]);

export function buildNotificationCenterModel(input: NotificationCenterInput): NotificationCenterModel {
  const stateByKey = new Map(input.states.map((state) => [state.notificationKey, state]));
  const items = [
    ...buildSentryNotifications(input.automations, input.sentry),
    ...buildAutomationSourceNotifications(input.automations),
    ...buildPipelineNotifications(input.pipelines, input.processStates),
  ]
    .map((item) => applyNotificationState(item, stateByKey.get(item.notificationKey)))
    .sort(compareNotificationItems);
  const openItems = items.filter((item) => !item.seenAt && !item.archivedAt);
  const seenItems = items.filter((item) => item.seenAt && !item.archivedAt);

  return {
    items,
    openItems,
    seenItems,
    archivedItems: items.filter((item) => item.archivedAt),
    unseenCount: openItems.length,
  };
}

function buildSentryNotifications(
  automations: Automatisering[],
  sentry: AutomationSentryIssuesQueryResult | undefined,
): NotificationItem[] {
  if (!sentry) return [];
  const automationById = new Map(automations.map((automation) => [automation.id, automation]));
  const items: NotificationItem[] = [];

  for (const [automationId, matches] of Object.entries(sentry.matches.byAutomationId)) {
    const automation = automationById.get(automationId);
    if (!automation) continue;

    for (const match of matches.filter(isLinkedSentryMatch)) {
      items.push({
        notificationKey: `sentry_linked_error:${automationId}:${match.issue.id}`,
        type: "sentry_linked_error",
        severity: "critical",
        title: `Sentry error in ${automation.naam}`,
        description: `${match.issue.title} (${match.issue.count} events)`,
        sourceLabel: match.issue.shortId ? `Sentry ${match.issue.shortId}` : "Sentry",
        href: `/automations/${automationId}`,
        timestamp: match.issue.lastSeen ?? match.issue.firstSeen ?? sentry.fetchedAt ?? null,
        seenAt: null,
        archivedAt: null,
      });
    }
  }

  return items;
}

function buildAutomationSourceNotifications(automations: Automatisering[]): NotificationItem[] {
  return automations.flatMap((automation) =>
    (automation.sourceFindings ?? [])
      .filter((finding) => !finding.resolvedAt)
      .flatMap((finding) => {
        if (finding.type === "source_missing") {
          return [{
            notificationKey: `automation_source_missing:${automation.id}:${finding.dedupeKey ?? finding.id}`,
            type: "automation_source_missing" as const,
            severity: finding.severity === "info" ? "warning" : finding.severity,
            title: `Bron ontbreekt voor ${automation.naam}`,
            description: finding.message,
            sourceLabel: finding.source,
            href: `/automations/${automation.id}`,
            timestamp: finding.lastSeenAt ?? finding.firstSeenAt ?? null,
            seenAt: null,
            archivedAt: null,
          }];
        }

        if (SOURCE_CHANGED_TYPES.has(finding.type)) {
          return [{
            notificationKey: `automation_source_changed:${automation.id}:${finding.dedupeKey ?? finding.id}`,
            type: "automation_source_changed" as const,
            severity: finding.severity,
            title: `Bron gewijzigd voor ${automation.naam}`,
            description: finding.message,
            sourceLabel: finding.source,
            href: `/automations/${automation.id}`,
            timestamp: finding.lastSeenAt ?? finding.firstSeenAt ?? null,
            seenAt: null,
            archivedAt: null,
          }];
        }

        return [];
      }),
  );
}

function buildPipelineNotifications(
  pipelines: Pipeline[],
  processStates: Record<string, SavedProcessStateWithUpdatedAt | undefined>,
): NotificationItem[] {
  const items: NotificationItem[] = [];

  for (const pipeline of pipelines) {
    if (!pipeline.isActive) {
      items.push({
        notificationKey: `pipeline_source_inactive:${pipeline.pipelineId}`,
        type: "pipeline_source_inactive",
        severity: "warning",
        title: `${pipeline.naam} is geblokkeerd`,
        description: "Pipeline is inactief; hiervoor hoeft geen procesview gemaakt te worden.",
        sourceLabel: pipeline.source,
        href: "/procesviewer",
        timestamp: pipeline.updatedAt || pipeline.syncedAt || null,
        seenAt: null,
        archivedAt: null,
      });
      continue;
    }

    const processState = processStates[pipeline.pipelineId];
    if (!processState || processState.steps.length === 0) continue;

    const knownStageIds = getKnownStageStepIds(processState);
    const missingStages = pipeline.stages.filter((stage) => !knownStageIds.has(`stage-${stage.stage_id}`));
    const renamedStages = getRenamedStageCount(pipeline, processState);
    const parkedHubSpotStages = processState.parkedSteps.filter((step) => getStepId(step)?.startsWith("stage-"));

    for (const stage of missingStages) {
      items.push({
        notificationKey: `pipeline_new_stage:${pipeline.pipelineId}:${stage.stage_id}`,
        type: "pipeline_new_stage",
        severity: "warning",
        title: `Nieuwe stage in ${pipeline.naam}`,
        description: `${stage.label} staat in HubSpot maar nog niet in de procesview.`,
        sourceLabel: pipeline.source,
        href: "/procesviewer",
        timestamp: pipeline.updatedAt || pipeline.syncedAt || processState.updatedAt,
        seenAt: null,
        archivedAt: null,
      });
    }

    const driftCount = missingStages.length + renamedStages + parkedHubSpotStages.length;
    if (driftCount > 0) {
      items.push({
        notificationKey: `process_view_drift:${pipeline.pipelineId}`,
        type: "process_view_drift",
        severity: "warning",
        title: `Procesview wijkt af: ${pipeline.naam}`,
        description: buildProcessDriftDescription(missingStages.length, renamedStages, parkedHubSpotStages.length),
        sourceLabel: "Procesviewer",
        href: "/procesviewer",
        timestamp: latestIso(pipeline.updatedAt, processState.updatedAt),
        seenAt: null,
        archivedAt: null,
      });
    }
  }

  return items;
}

function isLinkedSentryMatch(match: SentryIssueMatch): boolean {
  return match.confidence === "exact" || match.confidence === "strong";
}

function applyNotificationState(item: NotificationItem, state: NotificationState | undefined): NotificationItem {
  if (!state) return item;
  return {
    ...item,
    seenAt: state.seenAt,
    archivedAt: state.archivedAt,
  };
}

function compareNotificationItems(a: NotificationItem, b: NotificationItem): number {
  return (
    SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
    TYPE_RANK[b.type] - TYPE_RANK[a.type] ||
    getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp) ||
    a.title.localeCompare(b.title)
  );
}

function getKnownStageStepIds(processState: SavedProcessStateWithUpdatedAt): Set<string> {
  return new Set(
    [...processState.steps, ...processState.parkedSteps]
      .map(getStepId)
      .filter((id): id is string => Boolean(id)),
  );
}

function getRenamedStageCount(pipeline: Pipeline, processState: SavedProcessStateWithUpdatedAt): number {
  const stageByStepId = new Map(pipeline.stages.map((stage) => [`stage-${stage.stage_id}`, stage]));
  return [...processState.steps, ...processState.parkedSteps].filter((step) => {
    const stepId = getStepId(step);
    const stepLabel = getStepLabel(step);
    if (!stepId?.startsWith("stage-") || !stepLabel) return false;
    const stage = stageByStepId.get(stepId);
    return Boolean(stage && stage.label !== stepLabel);
  }).length;
}

function getStepId(step: unknown): string | null {
  if (!step || typeof step !== "object") return null;
  const id = (step as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function getStepLabel(step: unknown): string | null {
  if (!step || typeof step !== "object") return null;
  const label = (step as { label?: unknown }).label;
  return typeof label === "string" ? label : null;
}

function buildProcessDriftDescription(missing: number, renamed: number, parked: number): string {
  const parts: string[] = [];
  if (missing > 0) parts.push(`${missing} stage${missing === 1 ? "" : "s"} ontbreekt`);
  if (renamed > 0) parts.push(`${renamed} stage${renamed === 1 ? "" : "s"} hernoemd`);
  if (parked > 0) parts.push(`${parked} HubSpot stage${parked === 1 ? "" : "s"} geparkeerd`);
  return parts.join(", ");
}

function latestIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

function getTimestampMs(timestamp: string | null): number {
  if (!timestamp) return 0;
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}
