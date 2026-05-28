import {
  collectWebhookHandoffPaths,
  collectWebhookReceiverPaths,
  normalizeWebhookRoute,
} from "./webhookProof";
import type { Automatisering } from "./types";

export type SourceQualitySource = "hubspot" | "zapier" | "gitlab" | "typeform";
export type SourceQualityClassification = "matchable" | "native" | "incomplete" | "legacy";

export interface SourceQualitySummaryCard {
  source: SourceQualitySource;
  label: string;
  total: number;
  matchable: number;
  missing: number;
  incomplete: number;
  interpretation: string;
}

export interface SourceQualityAutomationRow {
  id: string;
  name: string;
  source: SourceQualitySource;
  sourceLabel: string;
  status: string;
  classification: SourceQualityClassification;
  classificationLabel: string;
  routeEvidence: string;
  reason: string;
  href: string;
}

export interface SourceQualityRoute {
  automationId: string;
  automationName: string;
  source: SourceQualitySource;
  sourceLabel: string;
  path: string;
  normalizedPath: string;
}

export interface SourceQualityWebhookMatch {
  id: string;
  sourceAutomationId: string;
  sourceAutomationName: string;
  sourceLabel: string;
  targetAutomationId: string;
  targetAutomationName: string;
  targetLabel: string;
  sourcePath: string;
  targetPath: string;
  normalizedPath: string;
  evidenceLabel: "100% webhook-match";
}

export interface SourceQualityMatrixPresentation {
  summaryCards: SourceQualitySummaryCard[];
  rows: SourceQualityAutomationRow[];
  senders: SourceQualityRoute[];
  receivers: SourceQualityRoute[];
  matches: SourceQualityWebhookMatch[];
  unmatchedWebhooks: SourceQualityRoute[];
  unmatchedEndpoints: SourceQualityRoute[];
}

const SOURCES: SourceQualitySource[] = ["hubspot", "zapier", "typeform", "gitlab"];

export function getSourceQualityMatrixPresentation(
  automations: Automatisering[],
): SourceQualityMatrixPresentation {
  const sourceAutomations = automations.filter((automation) => getSource(automation) !== null);
  const rows = sourceAutomations.map(buildRow);
  const senders = sourceAutomations.flatMap(buildSenderRoutes);
  const receivers = sourceAutomations.flatMap(buildReceiverRoutes);
  const matches = buildMatches(senders, receivers);
  const matchedSenderKeys = new Set(
    matches.map((match) => routeKey(match.sourceAutomationId, match.normalizedPath)),
  );
  const matchedReceiverKeys = new Set(
    matches.map((match) => routeKey(match.targetAutomationId, match.normalizedPath)),
  );

  return {
    summaryCards: buildSummaryCards(rows),
    rows,
    senders,
    receivers,
    matches,
    unmatchedWebhooks: senders.filter(
      (route) => !matchedSenderKeys.has(routeKey(route.automationId, route.normalizedPath)),
    ),
    unmatchedEndpoints: receivers.filter(
      (route) => !matchedReceiverKeys.has(routeKey(route.automationId, route.normalizedPath)),
    ),
  };
}

function buildRow(automation: Automatisering): SourceQualityAutomationRow {
  const source = getSource(automation) ?? "hubspot";
  const routes = source === "gitlab" ? buildReceiverRoutes(automation) : buildSenderRoutes(automation);
  const classification = classifyAutomation(automation, routes);

  return {
    id: automation.id,
    name: automation.naam,
    source,
    sourceLabel: sourceLabel(source),
    status: automation.status,
    classification,
    classificationLabel: classificationLabel(classification),
    routeEvidence: routes.map((route) => route.normalizedPath).join(", "),
    reason: reasonFor(automation, classification),
    href: `/automations/${encodeURIComponent(automation.id)}`,
  };
}

function buildSenderRoutes(automation: Automatisering): SourceQualityRoute[] {
  const source = getSource(automation);
  if (!source || source === "gitlab") return [];

  return collectWebhookHandoffPaths(automation)
    .map((path) => buildRoute(automation, source, path))
    .filter((route): route is SourceQualityRoute => Boolean(route));
}

function buildReceiverRoutes(automation: Automatisering): SourceQualityRoute[] {
  const source = getSource(automation);
  if (source !== "gitlab") return [];

  return collectWebhookReceiverPaths(automation)
    .map((path) => buildRoute(automation, source, path))
    .filter((route): route is SourceQualityRoute => Boolean(route));
}

function buildRoute(
  automation: Automatisering,
  source: SourceQualitySource,
  path: string,
): SourceQualityRoute | null {
  const normalizedPath = normalizeWebhookRoute(path);
  if (!normalizedPath) return null;

  return {
    automationId: automation.id,
    automationName: automation.naam,
    source,
    sourceLabel: sourceLabel(source),
    path,
    normalizedPath,
  };
}

function classifyAutomation(
  automation: Automatisering,
  routes: SourceQualityRoute[],
): SourceQualityClassification {
  if (routes.length > 0) return "matchable";

  const source = getSource(automation);
  if (source === "gitlab") {
    return isLegacyGitLabFile(automation) ? "legacy" : "incomplete";
  }
  if (source === "hubspot") {
    const workflow = getHubSpotWorkflow(automation);
    const actions = getHubSpotActions(automation);
    if (!workflow || actions.length === 0) return "incomplete";
    return "native";
  }
  if (source === "zapier") {
    return getZapierSteps(automation).length > 0 ? "native" : "incomplete";
  }
  if (source === "typeform") {
    return "incomplete";
  }
  return "incomplete";
}

function reasonFor(
  automation: Automatisering,
  classification: SourceQualityClassification,
): string {
  if (classification === "matchable") return "Matchbare route gevonden.";
  if (classification === "legacy") {
    return "Oude GitLab bestandsimport zonder specifiek endpoint-record.";
  }

  const source = getSource(automation);
  if (source === "hubspot") {
    const workflow = getHubSpotWorkflow(automation);
    const actions = getHubSpotActions(automation);
    if (!workflow) return "HubSpot workflowdata ontbreekt.";
    if (actions.length === 0) {
      return "HubSpot actions ontbreken; webhook-overdracht kan niet worden beoordeeld.";
    }
    return "Geen webhook-action in HubSpot workflow-actions.";
  }
  if (source === "zapier") {
    return getZapierSteps(automation).length > 0
      ? "Geen webhook-handoff in Zapier stappen."
      : "Zapier step flow ontbreekt; webhook-overdracht kan niet worden beoordeeld.";
  }
  if (source === "typeform") {
    const webhooks = automation.importProposal?.typeform?.webhooks;
    return Array.isArray(webhooks) && webhooks.length > 0
      ? "Geen actieve Typeform webhook met route gevonden."
      : "Geen Typeform webhooks opgeslagen.";
  }
  if (source === "gitlab") return "GitLab endpoint ontbreekt of is niet matchbaar.";
  return "Brondata ontbreekt.";
}

function buildMatches(
  senders: SourceQualityRoute[],
  receivers: SourceQualityRoute[],
): SourceQualityWebhookMatch[] {
  return senders.flatMap((sender) =>
    receivers
      .filter((receiver) => receiver.normalizedPath === sender.normalizedPath)
      .map((receiver) => ({
        id: `${sender.automationId}->${receiver.automationId}:${sender.normalizedPath}`,
        sourceAutomationId: sender.automationId,
        sourceAutomationName: sender.automationName,
        sourceLabel: sender.sourceLabel,
        targetAutomationId: receiver.automationId,
        targetAutomationName: receiver.automationName,
        targetLabel: receiver.sourceLabel,
        sourcePath: sender.path,
        targetPath: receiver.path,
        normalizedPath: sender.normalizedPath,
        evidenceLabel: "100% webhook-match" as const,
      })),
  );
}

function buildSummaryCards(rows: SourceQualityAutomationRow[]): SourceQualitySummaryCard[] {
  return SOURCES.map((source) => {
    const sourceRows = rows.filter((row) => row.source === source);
    const matchable = sourceRows.filter((row) => row.classification === "matchable").length;
    const incomplete = sourceRows.filter((row) => row.classification === "incomplete").length;
    const missing = sourceRows.length - matchable;

    return {
      source,
      label: sourceLabel(source),
      total: sourceRows.length,
      matchable,
      missing,
      incomplete,
      interpretation: summaryInterpretation(source, matchable, missing),
    };
  });
}

function summaryInterpretation(
  source: SourceQualitySource,
  matchable: number,
  missing: number,
): string {
  if (source === "gitlab") {
    return missing === 0
      ? "Alle GitLab/API records hebben een matchbaar receiver-endpoint."
      : "Niet elk GitLab/API record heeft een specifiek receiver-endpoint.";
  }
  if (matchable > 0 && missing === 0) {
    return "Alle bronrecords hebben webhook-routes voor exacte matching.";
  }
  if (matchable > 0) return "Een deel van deze bron kan exact op endpoints worden gematcht.";
  return "Geen exact matchbare webhook-routes gevonden voor deze bron.";
}

function getSource(automation: Automatisering): SourceQualitySource | null {
  const source = automation.source?.toLowerCase();
  if (source === "hubspot" || automation.categorie === "HubSpot Workflow") return "hubspot";
  if (source === "zapier" || automation.categorie === "Zapier Zap") return "zapier";
  if (source === "typeform" || automation.categorie === "Typeform") return "typeform";
  if (source === "gitlab" || automation.gitlabEndpoint || automation.gitlabFilePath) return "gitlab";
  return null;
}

function sourceLabel(source: SourceQualitySource): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  return "GitLab/API";
}

function classificationLabel(classification: SourceQualityClassification): string {
  if (classification === "matchable") return "Matchbaar";
  if (classification === "native") return "Individueel/native";
  if (classification === "legacy") return "Legacy import";
  return "Brondata incompleet";
}

function getHubSpotWorkflow(automation: Automatisering): Record<string, unknown> | null {
  return getRecord(automation.hubspotWorkflow) ?? getRecord(automation.importProposal?.hubspot_workflow);
}

function getHubSpotActions(automation: Automatisering): unknown[] {
  const workflow = getHubSpotWorkflow(automation);
  return arrayValue(workflow?.actions);
}

function getZapierSteps(automation: Automatisering): unknown[] {
  const zap = getRecord(automation.importProposal?.zap);
  const process = getRecord(zap?.process);
  return [
    ...arrayValue(process?.steps),
    ...arrayValue(zap?.steps),
  ];
}

function isLegacyGitLabFile(automation: Automatisering): boolean {
  return Boolean(automation.gitlabFilePath || automation.externalId) && !automation.gitlabEndpoint;
}

function routeKey(automationId: string, normalizedPath: string): string {
  return `${automationId}:${normalizedPath}`;
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
