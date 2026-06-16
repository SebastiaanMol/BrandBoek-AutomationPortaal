import { sanitizeForPrompt } from "./flowSuggestionAi";
import { buildConceptJourneys, type ConceptJourney } from "./conceptJourneys";
import {
  buildProcessJourneyNarrative,
  buildProcessJourneyTitleFromAutomations,
} from "./processJourneyCopy";
import type { FlowSuggestie } from "./storage/automationLinks";
import type { ProcessJourneyReviewItem } from "./storage/processJourneyReviewItems";
import type { Automatisering, AutomationSourceFinding, Flow, Systeem } from "./types";

export interface ProcessJourneyReviewQueueRow {
  id: string;
  kind: "concept" | "flow";
  title: string;
  description: string;
  automationCount: number;
  transitionCount: number;
  openItemCount: number;
  sourceLabels: string[];
  statusLabel: string;
}

export interface ProcessJourneyReviewNode {
  id: string;
  name: string;
  sourceLabel: string;
  status: string;
  href: string;
}

export interface ProcessJourneyReviewEdge {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  evidenceLabel: string;
  normalizedPath: string;
  method: string;
  sourceField: string;
  detail: string;
}

export interface ProcessJourneyReviewStopReason {
  nodeId: string;
  nodeName: string;
  description: string;
}

export interface ProcessJourneyReviewSourceWarning {
  automationId: string;
  automationName: string;
  type: string;
  severity: string;
  message: string;
}

export interface SelectedProcessJourneyReview {
  id: string;
  kind: "concept" | "flow";
  flowId?: string;
  conceptJourneyId?: string;
  title: string;
  description: string;
  currentTitle?: string;
  currentDescription?: string;
  proposedTitle: string;
  proposedDescription: string;
  saveLabel: string;
  structureLabel: string;
  automationCount: number;
  transitionCount: number;
  automationIds: string[];
  systemen: Systeem[];
  saveTransitions: Array<{ fromId: string; toId: string }>;
  nodes: ProcessJourneyReviewNode[];
  edges: ProcessJourneyReviewEdge[];
  stopReasons: ProcessJourneyReviewStopReason[];
  sourceQualityWarnings: ProcessJourneyReviewSourceWarning[];
  reviewItems: ProcessJourneyReviewItem[];
  prompt: string;
  markdown: string;
  approvalHref: string;
}

export interface ProcessJourneyReviewPresentation {
  queueRows: ProcessJourneyReviewQueueRow[];
  selectedJourney: SelectedProcessJourneyReview | null;
}

export interface ProcessJourneyReviewInput {
  automations: Automatisering[];
  suggestions: FlowSuggestie[];
  flows?: Flow[];
  confirmedLinks?: Array<{ sourceId: string; targetId: string; matchType?: string | null }>;
  reviewItems: ProcessJourneyReviewItem[];
  selectedJourneyId?: string | null;
}

const REVIEW_RELEVANT_FINDINGS = new Set(["source_missing", "source_data_incomplete", "webhook_changed"]);

export function getProcessJourneyReviewPresentation({
  automations,
  suggestions,
  reviewItems,
  selectedJourneyId,
}: ProcessJourneyReviewInput): ProcessJourneyReviewPresentation {
  const journeys = buildConceptJourneys(suggestions);
  const queueRows = journeys.map((journey) => buildQueueRow(journey, automations, reviewItems));
  const selectedRow = queueRows.find((row) => row.id === selectedJourneyId) ?? queueRows[0] ?? null;
  const journey = selectedRow ? journeys.find((item) => item.id === selectedRow.id) : null;

  return {
    queueRows,
    selectedJourney: journey ? buildSelectedJourney(journey, automations, suggestions, reviewItems) : null,
  };
}

function buildQueueRow(
  journey: ConceptJourney,
  automations: Automatisering[],
  reviewItems: ProcessJourneyReviewItem[],
): ProcessJourneyReviewQueueRow {
  const autos = automationsForJourney(journey, automations);
  return {
    id: journey.id,
    kind: "concept",
    title: journey.title,
    description: journey.description,
    automationCount: journey.automationCount,
    transitionCount: journey.transitionCount,
    openItemCount: reviewItems.filter((item) => item.conceptJourneyId === journey.id && item.status === "open").length,
    sourceLabels: [...new Set(autos.map((automation) => sourceLabel(automation.source)).filter(Boolean))],
    statusLabel: "Nog te doen",
  };
}

function buildSelectedJourney(
  journey: ConceptJourney,
  automations: Automatisering[],
  suggestions: FlowSuggestie[],
  reviewItems: ProcessJourneyReviewItem[],
): SelectedProcessJourneyReview {
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  const autos = automationsForJourney(journey, automations);
  const copy = buildCuratedCopy(autos, journey.title, journey.description, journey.endpoint);
  const nodes = journey.nodes.map((node) => {
    const automation = autoMap.get(node.id);
    return {
      id: node.id,
      name: automation?.naam ?? node.naam,
      sourceLabel: sourceLabel(automation?.source ?? node.source),
      status: automation?.status ?? "Onbekend",
      href: `/automations/${encodeURIComponent(node.id)}`,
    };
  });
  const edges = journey.transitions.map((transition) =>
    buildReviewEdge(transition.fromId, transition.toId, suggestions, autoMap),
  );
  const selectedItems = reviewItems.filter((item) => item.conceptJourneyId === journey.id);
  const sourceQualityWarnings = automationsForJourney(journey, automations).flatMap((automation) =>
    openReviewFindings(automation).map((finding) => ({
      automationId: automation.id,
      automationName: automation.naam,
      type: finding.type,
      severity: finding.severity,
      message: finding.message,
    })),
  );
  const stopReasons = buildStopReasons(nodes, edges);

  const selectedJourney = {
    id: journey.id,
    kind: "concept",
    conceptJourneyId: journey.id,
    title: copy.title,
    description: copy.description,
    proposedTitle: copy.title,
    proposedDescription: copy.description,
    saveLabel: "Opslaan en volgende",
    structureLabel: structureLabel(journey),
    automationCount: journey.automationCount,
    transitionCount: journey.transitionCount,
    automationIds: journey.automationIds,
    systemen: systemenForAutomations(autos),
    saveTransitions: journey.transitions,
    nodes,
    edges,
    stopReasons,
    sourceQualityWarnings,
    reviewItems: selectedItems,
    prompt: "",
    markdown: "",
    approvalHref: journey.href,
  } satisfies SelectedProcessJourneyReview;

  return {
    ...selectedJourney,
    prompt: buildReviewPrompt(selectedJourney, autos, suggestionsForJourney(journey, suggestions), selectedItems),
    markdown: buildReviewMarkdown(selectedJourney),
  };
}

function buildReviewEdge(
  fromId: string,
  toId: string,
  suggestions: FlowSuggestie[],
  autoMap: Map<string, Automatisering>,
): ProcessJourneyReviewEdge {
  const suggestion = suggestions.find((item) => item.fromId === fromId && item.toId === toId);
  const normalizedPath = normalizeEndpoint(extractEndpointFromReason(suggestion?.redenering ?? ""));
  return {
    id: `${fromId}->${toId}:${normalizedPath || "webhook"}`,
    fromId,
    toId,
    fromName: autoMap.get(fromId)?.naam ?? suggestion?.fromNaam ?? fromId,
    toName: autoMap.get(toId)?.naam ?? suggestion?.toNaam ?? toId,
    evidenceLabel: "100% webhook-match",
    normalizedPath,
    method: extractMethodFromReason(suggestion?.redenering ?? "") || "Methode onbekend",
    sourceField: "automatisering_ai_flows.reasoning",
    detail: suggestion?.redenering ?? "Webhook-match",
  };
}

function buildStopReasons(
  nodes: ProcessJourneyReviewNode[],
  edges: ProcessJourneyReviewEdge[],
): ProcessJourneyReviewStopReason[] {
  const outgoing = new Set(edges.map((edge) => edge.fromId));
  const terminalNodes = nodes.filter((node) => !outgoing.has(node.id));
  const fallback = terminalNodes.length > 0 ? terminalNodes : nodes.slice(-1);

  return fallback.map((node) => ({
    nodeId: node.id,
    nodeName: node.name,
    description: `Geen verdere harde technische overdracht vanaf "${node.name}". Hier stopt de procesreis totdat er een volgende exacte webhook/endpoint-match is.`,
  }));
}

function buildReviewPrompt(
  journey: SelectedProcessJourneyReview,
  automations: Automatisering[],
  suggestions: FlowSuggestie[],
  reviewItems: ProcessJourneyReviewItem[],
): string {
  const payload = sanitizeForPrompt({
    task: "Verrijk en review deze procesreis voor een developer-sessie.",
    guardrails: [
      "Gebruik alleen harde webhook/endpoint-bewijzen voor overgangen.",
      "AI mag beschrijven en vragen stellen, maar mag geen proof-sensitive fields of bewezen transitions aanpassen.",
      "Markeer onzekerheden als reviewItems of openQuestions.",
    ],
    journey: {
      id: journey.id,
      title: journey.title,
      description: journey.description,
      structureLabel: journey.structureLabel,
      nodes: journey.nodes,
      edges: journey.edges,
      stopReasons: journey.stopReasons,
      sourceQualityWarnings: journey.sourceQualityWarnings,
    },
    reviewItems,
    rawEvidence: {
      suggestions,
      automations,
    },
  });

  return [
    "Verrijk en review deze procesreis voor een developer-sessie.",
    "Return alleen gewone Nederlandse analyse of JSON als daarom gevraagd wordt. Verzin geen webhook-bewijs.",
    JSON.stringify(payload, null, 2),
  ].join("\n\n");
}

function buildReviewMarkdown(journey: SelectedProcessJourneyReview): string {
  return [
    `# Procesreis review: ${journey.title}`,
    "",
    journey.description,
    "",
    "## Keten",
    ...journey.nodes.map((node, index) => `${index + 1}. ${node.name} (${node.sourceLabel}, ${node.status})`),
    "",
    "## Bewijs",
    ...journey.edges.map((edge) =>
      `- ${edge.fromName} -> ${edge.toName}: ${edge.evidenceLabel} op ${edge.method} ${edge.normalizedPath}`,
    ),
    "",
    "## Waar stopt het bewijs?",
    ...journey.stopReasons.map((reason) => `- ${reason.description}`),
    "",
    "## Open review-items",
    ...(
      journey.reviewItems.filter((item) => item.status === "open").length > 0
        ? journey.reviewItems
          .filter((item) => item.status === "open")
          .map((item) => `- ${item.itemType}: ${item.note} (${item.proposedAction || "geen actie ingevuld"})`)
        : ["- Geen open review-items."]
    ),
  ].join("\n");
}

function automationsForJourney(journey: ConceptJourney, automations: Automatisering[]): Automatisering[] {
  const ids = new Set(journey.automationIds);
  return automations.filter((automation) => ids.has(automation.id));
}

function buildCuratedCopy(
  automations: Automatisering[],
  fallbackTitle: string,
  fallbackDescription: string,
  endpoint: string,
): { title: string; description: string } {
  const title = buildProcessJourneyTitleFromAutomations(automations, fallbackTitle) || fallbackTitle;
  const narrative = buildProcessJourneyNarrative({ automations, endpoint });
  const description = [
    narrative.opening,
    narrative.triggerIntro,
    narrative.hubspotStep,
    narrative.backendStep,
    narrative.hubspotUpdate,
    narrative.downstream,
  ]
    .filter((part) => part.trim().length > 0)
    .join(" ");

  return {
    title,
    description: description || fallbackDescription || "Deze procesreis is opgebouwd uit harde webhook-overgangen tussen de betrokken automations.",
  };
}

function systemenForAutomations(automations: Automatisering[]): Systeem[] {
  return [...new Set(automations.flatMap((automation) => {
    if ((automation.systemen ?? []).length > 0) return automation.systemen;
    const fallback = sourceToSysteem(automation.source);
    return fallback ? [fallback] : [];
  }))];
}

function sourceToSysteem(source: string | null | undefined): Systeem | null {
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  if (source === "gitlab") return "GitLab";
  return null;
}

function suggestionsForJourney(journey: ConceptJourney, suggestions: FlowSuggestie[]): FlowSuggestie[] {
  const edgeKeys = new Set(journey.transitions.map((transition) => `${transition.fromId}->${transition.toId}`));
  return suggestions.filter((suggestion) => edgeKeys.has(`${suggestion.fromId}->${suggestion.toId}`));
}

function openReviewFindings(automation: Automatisering): AutomationSourceFinding[] {
  return (automation.sourceFindings ?? []).filter((finding) =>
    !finding.resolvedAt && REVIEW_RELEVANT_FINDINGS.has(finding.type),
  );
}

function structureLabel(journey: ConceptJourney): string {
  if ((journey.parallelStartNodeIds?.length ?? 0) > 1) return "Parallelle start";
  if (/stuurt naar \d+ automations/i.test(journey.structureSummary)) return "Vertakking";
  if (journey.transitionCount > 1) return "Keten";
  return "Directe overdracht";
}

function sourceLabel(source: string | null | undefined): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  if (source === "gitlab") return "GitLab";
  return "Onbekend";
}

function extractEndpointFromReason(reason: string): string {
  const urlMatch = reason.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlMatch) return urlMatch[0];
  const pathMatch = reason.match(/\/[a-z0-9][a-z0-9/_{}.-]*/i);
  return pathMatch?.[0] ?? "";
}

function extractMethodFromReason(reason: string): string {
  const match = reason.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/i);
  return match?.[1]?.toUpperCase() ?? "";
}

function normalizeEndpoint(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed).pathname || "/";
  } catch {
    return trimmed;
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
