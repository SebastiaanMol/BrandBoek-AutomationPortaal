import { sanitizeForPrompt } from "./flowSuggestionAi";
import { buildConceptJourneys, type ConceptJourney } from "./conceptJourneys";
import { getExactWebhookProofBetween } from "./automationRouteGraph";
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
  flows = [],
  confirmedLinks = [],
  reviewItems,
  selectedJourneyId,
}: ProcessJourneyReviewInput): ProcessJourneyReviewPresentation {
  const journeys = buildConceptJourneys(suggestions);
  const flowRows = flows.map((flow) => buildFlowQueueRow(flow, automations, reviewItems, confirmedLinks));
  const conceptRows = journeys.map((journey) => buildQueueRow(journey, automations, reviewItems));
  const queueRows = [...conceptRows, ...flowRows];
  const selectedRow = queueRows.find((row) => row.id === selectedJourneyId) ?? queueRows[0] ?? null;

  let selectedJourney: SelectedProcessJourneyReview | null = null;
  if (selectedRow?.kind === "flow") {
    selectedJourney = buildSelectedFlow(
      selectedRow.id.replace(/^flow:/, ""),
      flows,
      automations,
      reviewItems,
      confirmedLinks,
    );
  } else if (selectedRow) {
    const journey = journeys.find((item) => item.id === selectedRow.id);
    selectedJourney = journey ? buildSelectedJourney(journey, automations, suggestions, reviewItems) : null;
  }

  return {
    queueRows,
    selectedJourney,
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

function buildFlowQueueRow(
  flow: Flow,
  automations: Automatisering[],
  reviewItems: ProcessJourneyReviewItem[],
  confirmedLinks: Array<{ sourceId: string; targetId: string; matchType?: string | null }>,
): ProcessJourneyReviewQueueRow {
  const autos = flowAutomations(flow, automations);
  const edges = buildFlowEdges(flow, automations, confirmedLinks);
  return {
    id: `flow:${flow.id}`,
    kind: "flow",
    title: flow.naam,
    description: flow.beschrijving || "Goedgekeurde procesreis zonder beschrijving.",
    automationCount: autos.length,
    transitionCount: edges.length,
    openItemCount: reviewItems.filter((item) => item.flowId === flow.id && item.status === "open").length,
    sourceLabels: [...new Set(autos.map((automation) => sourceLabel(automation.source)).filter(Boolean))],
    statusLabel: "Goedgekeurd",
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

function buildSelectedFlow(
  flowId: string,
  flows: Flow[],
  automations: Automatisering[],
  reviewItems: ProcessJourneyReviewItem[],
  confirmedLinks: Array<{ sourceId: string; targetId: string; matchType?: string | null }>,
): SelectedProcessJourneyReview | null {
  const flow = flows.find((item) => item.id === flowId);
  if (!flow) return null;

  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  const autos = flowAutomations(flow, automations);
  const copy = buildCuratedCopy(autos, flow.naam, flow.beschrijving, "");
  const nodes = flow.automationIds.map((id) => {
    const automation = autoMap.get(id);
    return {
      id,
      name: automation?.naam ?? id,
      sourceLabel: sourceLabel(automation?.source),
      status: automation?.status ?? "Onbekend",
      href: `/automations/${encodeURIComponent(id)}`,
    };
  });
  const edges = buildFlowEdges(flow, automations, confirmedLinks);
  const selectedItems = reviewItems.filter((item) => item.flowId === flow.id);
  const sourceQualityWarnings = autos.flatMap((automation) =>
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
    id: `flow:${flow.id}`,
    kind: "flow",
    flowId: flow.id,
    title: flow.naam,
    description: flow.beschrijving || copy.description,
    currentTitle: flow.naam,
    currentDescription: flow.beschrijving,
    proposedTitle: copy.title,
    proposedDescription: copy.description,
    saveLabel: "Bijwerken en volgende",
    structureLabel: edges.length > 1 ? "Keten" : "Goedgekeurde reis",
    automationCount: nodes.length,
    transitionCount: edges.length,
    automationIds: flow.automationIds,
    systemen: flow.systemen,
    saveTransitions: edges.map((edge) => ({ fromId: edge.fromId, toId: edge.toId })),
    nodes,
    edges,
    stopReasons,
    sourceQualityWarnings,
    reviewItems: selectedItems,
    prompt: "",
    markdown: "",
    approvalHref: `/flows/${encodeURIComponent(flow.id)}`,
  } satisfies SelectedProcessJourneyReview;

  return {
    ...selectedJourney,
    prompt: buildReviewPrompt(selectedJourney, autos, [], selectedItems),
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

function flowAutomations(flow: Flow, automations: Automatisering[]): Automatisering[] {
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  return flow.automationIds
    .map((id) => autoMap.get(id))
    .filter((automation): automation is Automatisering => Boolean(automation));
}

function buildFlowEdges(
  flow: Flow,
  automations: Automatisering[],
  confirmedLinks: Array<{ sourceId: string; targetId: string; matchType?: string | null }>,
): ProcessJourneyReviewEdge[] {
  const flowIds = new Set(flow.automationIds);
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));

  return confirmedLinks
    .filter((link) => flowIds.has(link.sourceId) && flowIds.has(link.targetId))
    .filter((link) => link.matchType === "webhook" || link.matchType === "exact" || !link.matchType)
    .map((link) => {
      const from = autoMap.get(link.sourceId);
      const to = autoMap.get(link.targetId);
      const proof = getExactWebhookProofBetween(from, to);
      const normalizedPath = proof?.normalizedPath ?? "";
      return {
        id: `${link.sourceId}->${link.targetId}:${normalizedPath || "confirmed-link"}`,
        fromId: link.sourceId,
        toId: link.targetId,
        fromName: from?.naam ?? link.sourceId,
        toName: to?.naam ?? link.targetId,
        evidenceLabel: proof ? "100% webhook-match" : "Bevestigde link, route opnieuw checken",
        normalizedPath,
        method: "Methode onbekend",
        sourceField: proof?.sourceField ?? "automation_links",
        detail: proof
          ? `${proof.sourceField} -> ${proof.targetField}`
          : "Deze goedgekeurde procesreis heeft een confirmed automation_link, maar de actuele route-data levert geen exact pad terug.",
      };
    });
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
