import {
  collectIncomingRoutes,
  collectOutgoingRoutes,
  selectPreferredIncomingRoutes,
  type AutomationRoute,
} from "./automationRouteGraph";
import { getAutomationSourceQualityPresentation } from "./automationSourceQuality";
import { getSourceQualityMatrixPresentation } from "./sourceQualityMatrixPresentation";
import { isSpecificGitLabEndpointAutomation } from "./gitlabAutomationIdentity";
import type { Automatisering, Flow } from "./types";
import { getVerificatieStatus } from "./types";

export type AnalyticsHealthMetricTone = "good" | "warning" | "critical" | "neutral" | "info";

export interface AnalyticsHealthMetric {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: AnalyticsHealthMetricTone;
}

export interface AnalyticsHealthScoreBreakdown {
  id: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface AnalyticsHealthScore {
  value: number;
  label: string;
  explanation: string;
  breakdown: AnalyticsHealthScoreBreakdown[];
}

export interface AnalyticsPriorityItem {
  id: string;
  title: string;
  description: string;
  tag: string;
  tone: AnalyticsHealthMetricTone;
  href?: string;
}

export type GitLabEndpointGapClassification =
  | "in_process_journey"
  | "shared_endpoint"
  | "no_incoming_webhook"
  | "duplicate_supporting_evidence"
  | "alternative_hard_match"
  | "method_mismatch"
  | "source_incomplete";

export interface AnalyticsRouteEvidence {
  automationId: string;
  automationName: string;
  sourceLabel: string;
  status: string;
  method: string;
  path: string;
  normalizedPath: string;
  sourceField: string;
  detail: string;
}

export interface GitLabEndpointDiagnosticItem {
  kind: "match" | "gap" | "supporting" | "alternative" | "method";
  label: string;
  description: string;
}

export interface GitLabEndpointGapRow {
  id: string;
  automationId: string;
  automationName: string;
  status: string;
  method: string;
  path: string;
  normalizedPath: string;
  sourceField: string;
  detail: string;
  classification: GitLabEndpointGapClassification;
  classificationLabel: string;
  matchedSenders: AnalyticsRouteEvidence[];
  conflictingSenders: AnalyticsRouteEvidence[];
  supportingEvidence: AnalyticsRouteEvidence[];
  diagnostics: GitLabEndpointDiagnosticItem[];
  nextAction: string;
  href: string;
}

export interface WebhookCoverageRow {
  id: string;
  sourceAutomationName: string;
  sourceLabel: string;
  targetAutomationName?: string;
  targetLabel?: string;
  normalizedPath: string;
  method: string;
  status: "matched" | "unmatched" | "ambiguous" | "method_mismatch";
  statusLabel: string;
  sourceField: string;
  targetField?: string;
}

export interface SourceAnalyticsRow {
  source: string;
  label: string;
  total: number;
  matchable: number;
  incomplete: number;
  readyPercentage: number;
  interpretation: string;
}

export interface DisabledJourneyAutomation {
  automationId: string;
  automationName: string;
  status: string;
  journeyId: string;
  journeyName: string;
  href: string;
}

export interface AnalyticsHealthPresentation {
  healthScore: AnalyticsHealthScore;
  metrics: AnalyticsHealthMetric[];
  priorities: AnalyticsPriorityItem[];
  sourceRows: SourceAnalyticsRow[];
  gitlabEndpointGaps: GitLabEndpointGapRow[];
  webhookCoverageRows: WebhookCoverageRow[];
  disabledJourneyAutomations: DisabledJourneyAutomation[];
}

interface AnalyticsHealthInput {
  automations: Automatisering[];
  flows?: Flow[];
  verificationPeriodDays?: number;
}

interface GitLabEndpointGroup {
  primary: AutomationRoute;
  supporting: AutomationRoute[];
}

const BLOCKING_SOURCE_FINDINGS = new Set(["source_missing", "source_data_incomplete", "webhook_changed"]);

export function getAnalyticsHealthPresentation({
  automations,
  flows = [],
  verificationPeriodDays = 90,
}: AnalyticsHealthInput): AnalyticsHealthPresentation {
  const activeAutomations = automations.filter(isAutomationActive);
  const sourceQualityMatrix = getSourceQualityMatrixPresentation(automations);
  const outgoingRoutes = automations.flatMap(collectOutgoingRoutes);
  const activeOutgoingRoutes = activeAutomations.flatMap(collectOutgoingRoutes);
  const gitlabEndpointGaps = buildGitLabEndpointGapRows(automations, outgoingRoutes);
  const webhookCoverageRows = buildWebhookCoverageRows(automations);
  const disabledJourneyAutomations = buildDisabledJourneyAutomations(automations, flows);
  const sourceRows = sourceQualityMatrix.summaryCards.map((card) => ({
    source: card.source,
    label: card.label,
    total: card.total,
    matchable: card.matchable,
    incomplete: card.incomplete,
    readyPercentage: percentage(card.total - card.incomplete, card.total),
    interpretation: card.interpretation,
  }));

  const sourceQualityReady = activeAutomations.filter(
    (automation) => getAutomationSourceQualityPresentation(automation).isProcessJourneyReady,
  ).length;
  const syncedOrVerified = activeAutomations.filter((automation) =>
    Boolean(automation.lastSyncedAt) || getVerificatieStatus(automation, verificationPeriodDays) === "geverifieerd",
  ).length;
  const activeFlows = flows.filter((flow) => !flowHasInactiveAutomation(flow, automations));

  const webhookCoverage = percentage(
    webhookCoverageRows.filter((row) => row.status === "matched").length,
    activeOutgoingRoutes.length,
  );
  const gitlabCoverage = percentage(
    gitlabEndpointGaps.filter(
      (row) => row.classification === "in_process_journey" || row.classification === "shared_endpoint",
    ).length,
    gitlabEndpointGaps.length,
  );
  const sourceQualityReadiness = percentage(sourceQualityReady, activeAutomations.length);
  const processJourneyIntegrity = percentage(activeFlows.length, flows.length);
  const syncVerificationCoverage = percentage(syncedOrVerified, activeAutomations.length);

  const breakdown: AnalyticsHealthScoreBreakdown[] = [
    {
      id: "webhook-route-coverage",
      label: "Webhook route coverage",
      score: webhookCoverage,
      weight: 35,
      detail: `${webhookCoverageRows.filter((row) => row.status === "matched").length}/${activeOutgoingRoutes.length} actieve outgoing routes matchen hard.`,
    },
    {
      id: "gitlab-endpoint-coverage",
      label: "GitLab endpoint coverage",
      score: gitlabCoverage,
      weight: 25,
      detail: `${gitlabEndpointGaps.filter((row) => row.classification === "in_process_journey" || row.classification === "shared_endpoint").length}/${gitlabEndpointGaps.length} GitLab endpointroutes zitten bewezen in een procesreis of gedeeld endpoint.`,
    },
    {
      id: "source-quality-readiness",
      label: "Source quality readiness",
      score: sourceQualityReadiness,
      weight: 25,
      detail: `${sourceQualityReady}/${activeAutomations.length} actieve automations hebben procesreis-kritieke brondata.`,
    },
    {
      id: "active-process-journey-integrity",
      label: "Actieve procesreis-integriteit",
      score: processJourneyIntegrity,
      weight: 10,
      detail: `${activeFlows.length}/${flows.length} opgeslagen procesreizen bevatten geen uitgeschakelde automation.`,
    },
    {
      id: "sync-verification-coverage",
      label: "Sync/verificatie-basisdekking",
      score: syncVerificationCoverage,
      weight: 5,
      detail: `${syncedOrVerified}/${activeAutomations.length} actieve automations zijn gesynct of recent geverifieerd.`,
    },
  ];

  const healthValue = Math.round(
    breakdown.reduce((total, item) => total + item.score * item.weight, 0) /
      breakdown.reduce((total, item) => total + item.weight, 0),
  );

  const sourceIncompleteCount = activeAutomations.filter(hasBlockingSourceQuality).length;
  const unmatchedWebhookCount = webhookCoverageRows.filter((row) => row.status === "unmatched").length;
  const endpointGapCount = gitlabEndpointGaps.filter((row) =>
    row.classification !== "in_process_journey" && row.classification !== "shared_endpoint",
  ).length;

  return {
    healthScore: {
      value: healthValue,
      label: healthValue >= 80 ? "Sterk" : healthValue >= 60 ? "Aandacht nodig" : "Kwetsbaar",
      explanation: "Bewijsgerichte score op basis van webhookmatches, GitLab endpoint coverage, bronkwaliteit, actieve procesreizen en sync/verificatie.",
      breakdown,
    },
    metrics: [
      metric("health-score", "Gezondheid", `${healthValue}%`, "bewijsgerichte procesgezondheid", toneForScore(healthValue)),
      metric("process-journeys", "Procesreizen", String(activeFlows.length), `${flows.length} opgeslagen, ${disabledJourneyAutomations.length} met uitgeschakelde automation`, "info"),
      metric("gitlab-gap", "GitLab endpoint gap", String(endpointGapCount), `${gitlabEndpointGaps.length} GitLab endpointroutes geanalyseerd`, endpointGapCount > 0 ? "warning" : "good"),
      metric("source-incomplete", "Brondata incompleet", String(sourceIncompleteCount), "blokkeert procesreis-bewijs", sourceIncompleteCount > 0 ? "critical" : "good"),
      metric("unmatched-webhooks", "Webhook gaps", String(unmatchedWebhookCount), "outgoing routes zonder receiver", unmatchedWebhookCount > 0 ? "warning" : "good"),
    ],
    priorities: buildPriorities(endpointGapCount, sourceIncompleteCount, unmatchedWebhookCount, disabledJourneyAutomations.length),
    sourceRows,
    gitlabEndpointGaps,
    webhookCoverageRows,
    disabledJourneyAutomations,
  };
}

function buildGitLabEndpointGapRows(
  automations: Automatisering[],
  outgoingRoutes: AutomationRoute[],
): GitLabEndpointGapRow[] {
  const gitlabAutomations = automations.filter(isGitLabAutomation);
  const gitlabEndpointGroups = groupGitLabEndpointRoutes(gitlabAutomations);
  const preferredActiveReceiverKeys = new Set(
    selectPreferredIncomingRoutes(
      gitlabAutomations.flatMap(collectIncomingRoutes),
    )
      .filter((route) => isRouteActive(route))
      .map(routeIdentity),
  );

  return gitlabEndpointGroups.map((group) => {
    const primary = group.primary;
    const samePathSenders = outgoingRoutes.filter((route) =>
      route.normalizedPath === primary.normalizedPath && route.automationId !== primary.automationId,
    );
    const matchedSenders = samePathSenders.filter((route) => methodsMatch(route.method, primary.method));
    const conflictingSenders = samePathSenders.filter((route) => methodsConflict(route.method, primary.method));
    const isPreferredActiveReceiver = preferredActiveReceiverKeys.has(routeIdentity(primary));
    const hasSourceProblem = hasBlockingSourceQualityById(automations, primary.automationId);
    const classification = classifyGitLabEndpointGap({
      primary,
      matchedSenders,
      conflictingSenders,
      isPreferredActiveReceiver,
      hasSourceProblem,
    });
    const supportingEvidence = group.supporting.map(toRouteEvidence);

    return {
      id: `${primary.automationId}:${primary.normalizedPath}:${primary.method || "unknown"}`,
      automationId: primary.automationId,
      automationName: primary.automationName,
      status: primary.automationStatus,
      method: primary.method || "Methode onbekend",
      path: primary.path,
      normalizedPath: primary.normalizedPath,
      sourceField: primary.sourceField,
      detail: primary.detail,
      classification,
      classificationLabel: gapClassificationLabel(classification),
      matchedSenders: matchedSenders.map(toRouteEvidence),
      conflictingSenders: conflictingSenders.map(toRouteEvidence),
      supportingEvidence,
      diagnostics: buildGitLabDiagnostics(classification, primary, matchedSenders, conflictingSenders, supportingEvidence),
      nextAction: gapNextAction(classification),
      href: `/automations/${encodeURIComponent(primary.automationId)}`,
    };
  }).sort(compareGitLabEndpointRows);
}

function groupGitLabEndpointRoutes(gitlabAutomations: Automatisering[]): GitLabEndpointGroup[] {
  const groups = new Map<string, AutomationRoute[]>();

  for (const route of gitlabAutomations.flatMap(collectIncomingRoutes)) {
    const key = `${route.automationId}|${route.normalizedPath}`;
    groups.set(key, [...(groups.get(key) ?? []), route]);
  }

  return [...groups.values()].map((routes) => {
    const sorted = [...routes].sort((left, right) => right.priority - left.priority || Boolean(right.method).valueOf() - Boolean(left.method).valueOf());
    return {
      primary: sorted[0],
      supporting: sorted.slice(1),
    };
  });
}

function classifyGitLabEndpointGap({
  primary,
  matchedSenders,
  conflictingSenders,
  isPreferredActiveReceiver,
  hasSourceProblem,
}: {
  primary: AutomationRoute;
  matchedSenders: AutomationRoute[];
  conflictingSenders: AutomationRoute[];
  isPreferredActiveReceiver: boolean;
  hasSourceProblem: boolean;
}): GitLabEndpointGapClassification {
  if (hasSourceProblem) return "source_incomplete";
  if (matchedSenders.length > 0 && !isPreferredActiveReceiver) return "alternative_hard_match";
  if (matchedSenders.length > 1) return "shared_endpoint";
  if (matchedSenders.length === 1) return "in_process_journey";
  if (conflictingSenders.length > 0) return "method_mismatch";
  return "no_incoming_webhook";
}

function buildWebhookCoverageRows(automations: Automatisering[]): WebhookCoverageRow[] {
  const outgoingRoutes = automations.filter(isAutomationActive).flatMap(collectOutgoingRoutes);
  const incomingRoutes = selectPreferredIncomingRoutes(
    automations.filter(isGitLabAutomation).flatMap(collectIncomingRoutes),
  );

  return outgoingRoutes.map((sender) => {
    const samePathReceivers = incomingRoutes.filter((receiver) => receiver.normalizedPath === sender.normalizedPath);
    const matchedReceivers = samePathReceivers.filter((receiver) => methodsMatch(sender.method, receiver.method));
    const conflictingReceivers = samePathReceivers.filter((receiver) => methodsConflict(sender.method, receiver.method));
    const receiver = matchedReceivers[0] ?? conflictingReceivers[0];
    const status: WebhookCoverageRow["status"] =
      matchedReceivers.length > 1
        ? "ambiguous"
        : matchedReceivers.length === 1
          ? "matched"
          : conflictingReceivers.length > 0
            ? "method_mismatch"
            : "unmatched";

    return {
      id: `${sender.automationId}:${sender.normalizedPath}:${sender.method || "unknown"}`,
      sourceAutomationName: sender.automationName,
      sourceLabel: sourceLabel(sender.automationSource),
      targetAutomationName: receiver?.automationName,
      targetLabel: receiver ? sourceLabel(receiver.automationSource) : undefined,
      normalizedPath: sender.normalizedPath,
      method: sender.method || "Methode onbekend",
      status,
      statusLabel: webhookCoverageStatusLabel(status),
      sourceField: sender.sourceField,
      targetField: receiver?.sourceField,
    };
  });
}

function buildDisabledJourneyAutomations(
  automations: Automatisering[],
  flows: Flow[],
): DisabledJourneyAutomation[] {
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  const rows: DisabledJourneyAutomation[] = [];
  const seen = new Set<string>();

  for (const flow of flows) {
    for (const automationId of flow.automationIds) {
      const automation = autoMap.get(automationId);
      if (!automation || isAutomationActive(automation)) continue;
      const key = `${flow.id}:${automation.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        automationId: automation.id,
        automationName: automation.naam,
        status: automation.status,
        journeyId: flow.id,
        journeyName: flow.naam,
        href: `/automations/${encodeURIComponent(automation.id)}`,
      });
    }
  }

  return rows;
}

function buildPriorities(
  endpointGapCount: number,
  sourceIncompleteCount: number,
  unmatchedWebhookCount: number,
  disabledJourneyCount: number,
): AnalyticsPriorityItem[] {
  const priorities: AnalyticsPriorityItem[] = [];
  if (endpointGapCount > 0) {
    priorities.push({
      id: "gitlab-gap",
      title: `${endpointGapCount} GitLab endpointroutes zitten niet hard in een procesreis`,
      description: "Open de GitLab endpoint gaps-tab om per endpoint te zien of de oorzaak ontbrekende sender, methode mismatch, legacy of incomplete brondata is.",
      tag: "Diagnose",
      tone: "warning",
    });
  }
  if (sourceIncompleteCount > 0) {
    priorities.push({
      id: "source-incomplete",
      title: `${sourceIncompleteCount} automations missen procesreis-kritieke brondata`,
      description: "Deze automations kunnen niet betrouwbaar als procesreisbewijs worden gebruikt tot brondata of source findings zijn opgelost.",
      tag: "Blokkerend",
      tone: "critical",
    });
  }
  if (unmatchedWebhookCount > 0) {
    priorities.push({
      id: "unmatched-webhooks",
      title: `${unmatchedWebhookCount} outgoing webhooks hebben geen receiver-match`,
      description: "Controleer of het GitLab endpoint bestaat, de route gewijzigd is of de externe bron nog niet goed gesynct is.",
      tag: "Webhook gap",
      tone: "info",
    });
  }
  if (disabledJourneyCount > 0) {
    priorities.push({
      id: "disabled-journeys",
      title: `${disabledJourneyCount} uitgeschakelde automations raken procesreizen`,
      description: "Deze reizen horen apart bekeken te worden omdat ze niet als actieve procesgezondheid mogen meetellen.",
      tag: "Uitgeschakeld",
      tone: "warning",
    });
  }
  if (priorities.length === 0) {
    priorities.push({
      id: "healthy",
      title: "Geen blokkerende procesgezondheidsgaps gevonden",
      description: "De actieve route- en bronkwaliteitssignalen geven geen directe actiepunten.",
      tag: "Gezond",
      tone: "good",
    });
  }
  return priorities;
}

function buildGitLabDiagnostics(
  classification: GitLabEndpointGapClassification,
  primary: AutomationRoute,
  matchedSenders: AutomationRoute[],
  conflictingSenders: AutomationRoute[],
  supportingEvidence: AnalyticsRouteEvidence[],
): GitLabEndpointDiagnosticItem[] {
  const diagnostics: GitLabEndpointDiagnosticItem[] = [
    {
      kind: "supporting",
      label: "Receiver endpoint",
      description: `${primary.sourceField} levert ${primary.method || "methode onbekend"} ${primary.normalizedPath}.`,
    },
  ];
  if (matchedSenders.length > 0) {
    diagnostics.push({
      kind: classification === "alternative_hard_match" ? "alternative" : "match",
      label: "Harde technische match",
      description: `${matchedSenders.length} outgoing route${matchedSenders.length === 1 ? "" : "s"} matchen exact op normalized path en methode.`,
    });
  }
  if (conflictingSenders.length > 0) {
    diagnostics.push({
      kind: "method",
      label: "Methode botst",
      description: `${conflictingSenders.length} route${conflictingSenders.length === 1 ? "" : "s"} hebben hetzelfde path maar een andere methode.`,
    });
  }
  if (supportingEvidence.length > 0) {
    diagnostics.push({
      kind: "supporting",
      label: "Ondersteunend bewijs",
      description: `${supportingEvidence.length} extra routevermelding${supportingEvidence.length === 1 ? "" : "en"} voor hetzelfde endpoint.`,
    });
  }
  if (classification === "no_incoming_webhook") {
    diagnostics.push({
      kind: "gap",
      label: "Geen sender gevonden",
      description: "Geen HubSpot/Zapier/Typeform outgoing route matcht exact op dit normalized path.",
    });
  }
  if (classification === "source_incomplete") {
    diagnostics.push({
      kind: "gap",
      label: "Brondata blokkeert",
      description: "Er staat een open source finding of de endpointanalyse mist procesreis-kritieke data.",
    });
  }
  return diagnostics;
}

function gapClassificationLabel(classification: GitLabEndpointGapClassification): string {
  if (classification === "in_process_journey") return "In procesreis";
  if (classification === "shared_endpoint") return "Gedeeld endpoint";
  if (classification === "duplicate_supporting_evidence") return "Duplicate/ondersteunend bewijs";
  if (classification === "alternative_hard_match") return "Alternatieve harde match";
  if (classification === "method_mismatch") return "Methode mismatch";
  if (classification === "source_incomplete") return "Brondata incompleet";
  return "Geen inkomende webhook";
}

function gapNextAction(classification: GitLabEndpointGapClassification): string {
  if (classification === "in_process_journey") return "Geen actie nodig; dit endpoint heeft een harde inkomende route-match.";
  if (classification === "shared_endpoint") return "Toon deze bronautomations als parallelle starters die samenkomen op hetzelfde endpoint.";
  if (classification === "alternative_hard_match") return "Niet opnemen als hoofdnode zolang een actievere of specifiekere endpoint-node bestaat.";
  if (classification === "method_mismatch") return "Controleer de methode in brondata; path matcht, maar bekende methodes botsen.";
  if (classification === "source_incomplete") return "Los de source finding of ontbrekende endpointanalyse op voordat dit endpoint als procesreisbewijs telt.";
  if (classification === "duplicate_supporting_evidence") return "Gebruik als ondersteunend bewijs, niet als extra procesreis.";
  return "Leg de aanroepende bron vast of verbeter de bronsync zodat de inkomende webhook bewezen kan worden.";
}

function webhookCoverageStatusLabel(status: WebhookCoverageRow["status"]): string {
  if (status === "matched") return "100% match";
  if (status === "ambiguous") return "Dubbele receiver";
  if (status === "method_mismatch") return "Methode mismatch";
  return "Geen receiver";
}

function toRouteEvidence(route: AutomationRoute): AnalyticsRouteEvidence {
  return {
    automationId: route.automationId,
    automationName: route.automationName,
    sourceLabel: sourceLabel(route.automationSource),
    status: route.automationStatus,
    method: route.method || "Methode onbekend",
    path: route.path,
    normalizedPath: route.normalizedPath,
    sourceField: route.sourceField,
    detail: route.detail,
  };
}

function compareGitLabEndpointRows(left: GitLabEndpointGapRow, right: GitLabEndpointGapRow): number {
  const leftRank = classificationRank(left.classification);
  const rightRank = classificationRank(right.classification);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.normalizedPath.localeCompare(right.normalizedPath);
}

function classificationRank(classification: GitLabEndpointGapClassification): number {
  if (classification === "source_incomplete") return 0;
  if (classification === "method_mismatch") return 1;
  if (classification === "no_incoming_webhook") return 2;
  if (classification === "alternative_hard_match") return 3;
  if (classification === "shared_endpoint") return 4;
  if (classification === "in_process_journey") return 5;
  return 6;
}

function metric(
  id: string,
  label: string,
  value: string,
  detail: string,
  tone: AnalyticsHealthMetricTone,
): AnalyticsHealthMetric {
  return { id, label, value, detail, tone };
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 100;
  return Math.round((numerator / denominator) * 100);
}

function toneForScore(score: number): AnalyticsHealthMetricTone {
  if (score >= 80) return "good";
  if (score >= 60) return "warning";
  return "critical";
}

function methodsMatch(left: string, right: string): boolean {
  if (!left || !right) return true;
  return left === right;
}

function methodsConflict(left: string, right: string): boolean {
  if (!left || !right) return false;
  return left !== right;
}

function isGitLabAutomation(automation: Automatisering): boolean {
  return isSpecificGitLabEndpointAutomation(automation);
}

function isAutomationActive(automation: Automatisering): boolean {
  const status = automation.status?.trim().toLowerCase();
  return status === "actief" || status === "active" || status === "enabled";
}

function isRouteActive(route: AutomationRoute): boolean {
  const status = route.automationStatus?.trim().toLowerCase();
  return status === "actief" || status === "active" || status === "enabled";
}

function hasBlockingSourceQuality(automation: Automatisering): boolean {
  return hasOpenBlockingFinding(automation) || !getAutomationSourceQualityPresentation(automation).isProcessJourneyReady;
}

function hasBlockingSourceQualityById(automations: Automatisering[], automationId: string): boolean {
  const automation = automations.find((item) => item.id === automationId);
  return automation ? hasOpenBlockingFinding(automation) : false;
}

function hasOpenBlockingFinding(automation: Automatisering): boolean {
  return (automation.sourceFindings ?? []).some((finding) =>
    !finding.resolvedAt && BLOCKING_SOURCE_FINDINGS.has(finding.type),
  );
}

function flowHasInactiveAutomation(flow: Flow, automations: Automatisering[]): boolean {
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  return flow.automationIds.some((id) => {
    const automation = autoMap.get(id);
    return Boolean(automation && !isAutomationActive(automation));
  });
}

function sourceLabel(source?: string | null): string {
  const normalized = source?.toLowerCase();
  if (normalized === "hubspot") return "HubSpot";
  if (normalized === "zapier") return "Zapier";
  if (normalized === "typeform") return "Typeform";
  if (normalized === "gitlab") return "GitLab/API";
  return "Onbekend";
}

function routeIdentity(route: AutomationRoute): string {
  return `${route.automationId}|${route.normalizedPath}|${route.method}`;
}
