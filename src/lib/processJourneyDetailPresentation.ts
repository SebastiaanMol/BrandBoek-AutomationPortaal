import type { FlowEvidenceLevel } from "./flowEvidence";
import { getAutomationOverviewPresentation } from "./automationOverviewPresentation";
import { getGitLabAutomationMeaningPresentation } from "./gitlabAutomationMeaningPresentation";
import { getHubSpotAutomationDetailPresentation } from "./hubspotAutomationDetailPresentation";
import { buildProcessJourneyTrace, type ProcessJourneyTraceEdge } from "./processJourneyTrace";
import type { FlowSuggestie } from "./storage/automationLinks";
import { getTypeformAutomationDetailPresentation } from "./typeformAutomationDetailPresentation";
import type { Automatisering, Flow } from "./types";
import { getZapierAutomationDetailPresentation } from "./zapierAutomationDetailPresentation";

export interface ProcessJourneyConfirmedLink {
  sourceId: string;
  targetId: string;
  matchType?: string | null;
}

export interface ProcessJourneyMetricPresentation {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "good" | "warning";
}

export interface ProcessJourneyNodePresentation {
  id: string;
  title: string;
  source: string;
  sourceLabel: string;
  statusLabel: string;
  roleLabel: string;
  description: string;
  href: string;
  tone: "typeform" | "zapier" | "hubspot" | "gitlab" | "neutral";
  badges: string[];
}

export interface ProcessJourneyTransitionPresentation {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  evidenceLabel: string;
  evidenceLevel: FlowEvidenceLevel;
  score: number;
  description: string;
  tone: "good" | "warning" | "neutral";
}

export interface ProcessJourneyChangeSummary {
  receives: string[];
  reads: string[];
  determines: string[];
  writes: string[];
}

export interface ProcessJourneyEvidenceItem {
  title: string;
  description: string;
  tag: string;
  tone: "good" | "warning" | "critical" | "neutral";
}

export interface ProcessJourneyStepPresentation {
  id: string;
  index: number;
  automationId: string;
  automationIds: string[];
  automationTitle: string;
  title: string;
  description: string;
  sourceLabel: string;
  href: string;
  tone: ProcessJourneyNodePresentation["tone"];
  badges: string[];
  kind: "start" | "read" | "determine" | "write" | "handoff" | "stop";
}

export interface ProcessJourneyAutomationCardPresentation {
  id: string;
  title: string;
  sourceLabel: string;
  role: string;
  description: string;
  insights: string[];
  evidenceBadges: string[];
  stepCount: number;
  href: string;
  tone: ProcessJourneyNodePresentation["tone"];
}

export interface ProcessJourneyDetailPresentation {
  title: string;
  subtitle: string;
  statusBadges: string[];
  meta: string[];
  metrics: ProcessJourneyMetricPresentation[];
  storyParagraphs: string[];
  nodes: ProcessJourneyNodePresentation[];
  transitions: ProcessJourneyTransitionPresentation[];
  steps: ProcessJourneyStepPresentation[];
  evidenceItems: ProcessJourneyEvidenceItem[];
  gaps: ProcessJourneyEvidenceItem[];
  changeSummary: ProcessJourneyChangeSummary;
  automationCards: ProcessJourneyAutomationCardPresentation[];
  analysisQuality: "100% webhook" | "Keten stopt" | "Geen webhook-bewijs";
}

interface AutomationProcessEnrichment {
  description: string;
  insights: string[];
  storyFacts: string[];
  receives: string[];
  reads: string[];
  determines: string[];
  writes: string[];
}

interface ProcessJourneyPresentationInput {
  flow: Flow;
  automations: Automatisering[];
  confirmedLinks?: ProcessJourneyConfirmedLink[];
  openSuggestions?: FlowSuggestie[];
}

interface ParallelSourceGroup {
  key: string;
  targetId: string;
  route: string;
  members: Automatisering[];
  transition: ProcessJourneyTransitionPresentation;
}

export function getProcessJourneyDetailPresentation({
  flow,
  automations,
  confirmedLinks = [],
  openSuggestions = [],
}: ProcessJourneyPresentationInput): ProcessJourneyDetailPresentation {
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  const trace = buildProcessJourneyTrace({
    automations,
    seedIds: flow.automationIds,
  });
  const orderedIds = trace.orderedNodeIds.length > 0 ? trace.orderedNodeIds : flow.automationIds;
  const orderedAutomations = orderedIds
    .map((id) => autoMap.get(id))
    .filter((automation): automation is Automatisering => Boolean(automation));
  const nodes = orderedAutomations.map(buildNode);
  const transitions = buildTransitions(trace.edges, autoMap, confirmedLinks);
  const gaps = buildGaps(openSuggestions, autoMap);
  const changeSummary = buildChangeSummary(orderedAutomations);
  const analysisQuality = determineAnalysisQuality(transitions, nodes, gaps);
  const topology = buildJourneyTopology(orderedAutomations, transitions);
  const steps = buildExecutionTimeline(orderedAutomations, transitions);

  return {
    title: cleanText(flow.naam) || "Procesreis",
    subtitle: buildSubtitle(orderedAutomations),
    statusBadges: buildStatusBadges(nodes, transitions, gaps),
    meta: buildMeta(flow, topology, orderedAutomations),
    metrics: buildMetrics(nodes, transitions, orderedAutomations, analysisQuality),
    storyParagraphs: buildStoryParagraphs(flow, orderedAutomations, transitions, changeSummary, gaps, topology),
    nodes,
    transitions,
    steps,
    evidenceItems: buildEvidenceItems(transitions),
    gaps,
    changeSummary,
    automationCards: nodes.map((node) => {
      const automation = autoMap.get(node.id);
      const enrichment = automation ? buildAutomationProcessEnrichment(automation) : null;
      return {
        id: node.id,
        title: node.title,
        sourceLabel: node.sourceLabel,
        role: node.roleLabel,
        description: enrichment?.description ?? node.description,
        insights: enrichment?.insights ?? [],
        evidenceBadges: node.badges.slice(1, 4),
        stepCount: steps.filter((step) => step.automationIds.includes(node.id)).length,
        href: node.href,
        tone: node.tone,
      };
    }),
    analysisQuality,
  };
}

function buildNode(automation: Automatisering): ProcessJourneyNodePresentation {
  const overview = getAutomationOverviewPresentation(automation);
  const enrichment = buildAutomationProcessEnrichment(automation);
  const sourceLabel = formatSourceLabel(automation);
  const badges = [
    sourceLabel,
    automation.status === "Actief" ? "Active" : automation.status,
    ...overview.evidenceBadges.slice(0, 2).map((badge) => badge.label),
  ].filter(Boolean);

  return {
    id: automation.id,
    title: automation.naam || "Naamloze automation",
    source: automation.source ?? "manual",
    sourceLabel,
    statusLabel: automation.status === "Actief" ? "Active" : automation.status,
    roleLabel: buildRoleLabel(automation, overview.actionSummary),
    description: enrichment.description,
    href: `/automations/${encodeURIComponent(automation.id)}`,
    tone: sourceTone(automation),
    badges,
  };
}

function buildTransitions(
  traceEdges: ProcessJourneyTraceEdge[],
  autoMap: Map<string, Automatisering>,
  confirmedLinks: ProcessJourneyConfirmedLink[],
): ProcessJourneyTransitionPresentation[] {
  const transitions: ProcessJourneyTransitionPresentation[] = [];

  for (const edge of traceEdges) {
    const from = autoMap.get(edge.fromId);
    const to = autoMap.get(edge.toId);
    if (!from || !to) continue;

    const confirmed = confirmedLinks.find((link) => link.sourceId === from.id && link.targetId === to.id);
    if (confirmed?.matchType && confirmed.matchType !== "webhook") continue;

    transitions.push({
      id: `${from.id}->${to.id}`,
      fromId: from.id,
      toId: to.id,
      label: "100% webhook-match",
      evidenceLabel: "100% webhook-match",
      evidenceLevel: "confirmed",
      score: 100,
      description: buildWebhookTransitionDescription(from, to, edge.normalizedPath, Boolean(confirmed), edge.isCycle),
      tone: "good",
    });
  }

  return transitions;
}

function buildAutomationProcessEnrichment(automation: Automatisering): AutomationProcessEnrichment {
  const source = automation.source?.toLowerCase();
  const overview = getAutomationOverviewPresentation(automation);
  const fallbackDescription = firstText(overview.actionSummary, overview.outcomeLabel, automation.doel, automation.trigger, automation.naam);

  if (source === "typeform") return buildTypeformProcessEnrichment(automation, fallbackDescription);
  if (source === "zapier") return buildZapierProcessEnrichment(automation, fallbackDescription);
  if (source === "hubspot") return buildHubSpotProcessEnrichment(automation, fallbackDescription);
  if (source === "gitlab" || automation.gitlabEndpoint || automation.gitlabFilePath) return buildGitLabProcessEnrichment(automation, fallbackDescription);

  return {
    description: toPlainProcessText(fallbackDescription || "Deze automation voert een stap in de procesreis uit."),
    insights: uniqueLimited(overview.evidenceBadges.map((badge) => badge.detail ? `${badge.label}: ${badge.detail}` : badge.label), 4, []),
    storyFacts: uniqueLimited(overview.evidenceBadges.map((badge) => badge.label), 3, []),
    receives: overview.triggerLabel ? [overview.triggerLabel] : [],
    reads: [],
    determines: [],
    writes: overview.outcomeLabel ? [overview.outcomeLabel] : [],
  };
}

function buildTypeformProcessEnrichment(
  automation: Automatisering,
  fallbackDescription: string,
): AutomationProcessEnrichment {
  const detail = getTypeformAutomationDetailPresentation(automation);
  const questionLabel = detail.questions.length > 0
    ? `${detail.questions.length} ${detail.questions.length === 1 ? "vraag" : "vragen"} uit Typeform`
    : "";
  const hiddenLabel = detail.hiddenFields.length > 0
    ? `Verborgen contextvelden: ${detail.hiddenFields.slice(0, 4).join(", ")}`
    : "";
  const activeWebhookCount = detail.webhooks.filter((webhook) => webhook.status === "Actief").length;
  const webhookLabel = activeWebhookCount > 0
    ? `${activeWebhookCount} actieve Typeform-webhook${activeWebhookCount === 1 ? "" : "s"}`
    : "";
  const routingLabel = detail.routing.length > 0
    ? `Routing na verzenden: ${detail.routing.map((route) => route.label).slice(0, 2).join(", ")}`
    : "";

  return {
    description: toPlainProcessText(firstText(detail.summary, fallbackDescription)),
    insights: uniqueLimited([questionLabel, hiddenLabel, webhookLabel, routingLabel], 4, []),
    storyFacts: uniqueLimited([questionLabel, hiddenLabel, webhookLabel], 3, []),
    receives: uniqueLimited([
      questionLabel ? `${detail.questions.length} formulier${detail.questions.length === 1 ? "vraag" : "vragen"}` : "",
      detail.hiddenFields.length > 0 ? `${detail.hiddenFields.length} contextveld${detail.hiddenFields.length === 1 ? "" : "en"} uit Typeform` : "",
    ], 3, []),
    reads: [],
    determines: detail.routing.map((route) => route.label),
    writes: activeWebhookCount > 0 ? ["Typeform-inzending wordt doorgegeven aan de gekoppelde verwerking"] : [],
  };
}

function buildZapierProcessEnrichment(
  automation: Automatisering,
  fallbackDescription: string,
): AutomationProcessEnrichment {
  const detail = getZapierAutomationDetailPresentation(automation);
  const stepCount = detail.stepCards.length;
  const stepLabel = stepCount > 0 ? `${stepCount} Zapier-stappen` : "";
  const apps = uniqueText(detail.apps.map((app) => app.name)).slice(0, 4);
  const appLabel = apps.length > 0 ? `Zapier apps: ${apps.join(", ")}` : "";
  const conditionSteps = detail.stepCards.filter((step) => step.role === "condition");
  const lookupSteps = detail.stepCards.filter((step) => step.role === "lookup");
  const actionSteps = detail.stepCards.filter((step) => step.role === "action");
  const delayMetric = detail.metrics.find((metric) => metric.label === "Delay");
  const delayLabel = delayMetric && delayMetric.value !== "Geen delay" ? `Wachtstap: ${delayMetric.value}` : "";

  return {
    description: toPlainProcessText(firstText(detail.summary, fallbackDescription)),
    insights: uniqueLimited([
      stepLabel,
      appLabel,
      conditionSteps.length > 0 ? `${conditionSteps.length} filter- of conditiestap${conditionSteps.length === 1 ? "" : "pen"}` : "",
      delayLabel,
    ], 4, []),
    storyFacts: uniqueLimited([stepLabel, appLabel, delayLabel], 3, []),
    receives: detail.stepCards.find((step) => step.role === "trigger")
      ? [detail.stepCards.find((step) => step.role === "trigger")!.summary || detail.stepCards.find((step) => step.role === "trigger")!.title]
      : [],
    reads: lookupSteps.map((step) => step.summary || step.title),
    determines: conditionSteps.map((step) => step.filter?.condition || step.summary || step.title),
    writes: actionSteps.map((step) => step.summary || step.title),
  };
}

function buildHubSpotProcessEnrichment(
  automation: Automatisering,
  fallbackDescription: string,
): AutomationProcessEnrichment {
  const detail = getHubSpotAutomationDetailPresentation(automation);
  const conditionTitles = uniqueText(detail.conditions.map((condition) => condition.title)).slice(0, 3);
  const actionTitles = uniqueText(detail.actionDetails.map((action) => action.title)).slice(0, 3);
  const webhookTargets = uniqueText(detail.webhookActions.map((webhook) => webhook.path || webhook.url || webhook.title)).slice(0, 2);
  const propertyLabels = uniqueText(detail.properties.map((property) => `${property.property} ${property.rule} ${property.value}`)).slice(0, 3);
  const conditionLabel = conditionTitles.length > 0 ? `HubSpot voorwaarden: ${conditionTitles.join(", ")}` : "";
  const actionLabel = actionTitles.length > 0 ? `HubSpot acties: ${actionTitles.join(", ")}` : "";
  const webhookLabel = webhookTargets.length > 0 ? `HubSpot webhook: ${webhookTargets.join(", ")}` : "";

  return {
    description: toPlainProcessText(firstText(detail.summary, fallbackDescription)),
    insights: uniqueLimited([conditionLabel, actionLabel, webhookLabel], 4, []),
    storyFacts: uniqueLimited([conditionLabel, actionLabel, webhookLabel], 3, []),
    receives: detail.conditions.length > 0 ? [detail.conditions[0].title] : [],
    reads: detail.objectSources.map((source) => source.title),
    determines: [...conditionTitles, ...propertyLabels],
    writes: uniqueLimited([...actionTitles, ...webhookTargets], 4, []),
  };
}

function buildGitLabProcessEnrichment(
  automation: Automatisering,
  fallbackDescription: string,
): AutomationProcessEnrichment {
  const meaning = getGitLabAutomationMeaningPresentation(automation);
  const receives = meaning.ontvangt.map(formatGitLabFact);
  const reads = meaning.haaltOp.map(formatGitLabFact);
  const determines = meaning.berekent.map(formatGitLabFact);
  const writes = meaning.pastAan.map(formatGitLabFact);

  return {
    description: toPlainProcessText(firstText(meaning.summary, fallbackDescription)),
    insights: uniqueLimited([
      receives.length > 0 ? `Ontvangt: ${receives.slice(0, 2).map(toPlainProcessText).join(", ")}` : "",
      reads.length > 0 ? `Haalt op: ${reads.slice(0, 2).map(toPlainProcessText).join(", ")}` : "",
      determines.length > 0 ? `Bepaalt: ${determines.slice(0, 2).map(toPlainProcessText).join(", ")}` : "",
      writes.length > 0 ? `Werkt bij: ${writes.slice(0, 2).map(toPlainProcessText).join(", ")}` : "",
    ], 4, []),
    storyFacts: uniqueLimited([
      reads.length > 0 ? `GitLab haalt op: ${reads.slice(0, 2).map(toPlainProcessText).join(", ")}` : "",
      writes.length > 0 ? `GitLab werkt bij: ${writes.slice(0, 2).map(toPlainProcessText).join(", ")}` : "",
    ], 3, []),
    receives,
    reads,
    determines,
    writes,
  };
}

function formatGitLabFact(fact: { label: string; description: string }): string {
  const label = toPlainProcessText(fact.label);
  if (isGenericTechnicalFact(label)) return toPlainProcessText(fact.description);
  return label;
}

function isGenericTechnicalFact(value: string): boolean {
  return /^(get|post|put|patch|delete|request|response|call|api|dict|list|result)$/i.test(value.trim());
}

function buildChangeSummary(automations: Automatisering[]): ProcessJourneyChangeSummary {
  const receives: string[] = [];
  const reads: string[] = [];
  const determines: string[] = [];
  const writes: string[] = [];

  for (const automation of automations) {
    const enrichment = buildAutomationProcessEnrichment(automation);
    receives.push(...enrichment.receives);
    reads.push(...enrichment.reads);
    determines.push(...enrichment.determines);
    writes.push(...enrichment.writes);
  }

  return {
    receives: uniqueLimited(receives, 6, ["Startsignaal uit de eerste automation"]),
    reads: uniqueLimited(reads, 6, ["Geen concrete opgehaalde data bewezen"]),
    determines: uniqueLimited(determines, 6, ["Geen aparte beslislogica bewezen"]),
    writes: uniqueLimited(writes, 6, ["Eindresultaat nog beperkt gespecificeerd"]),
  };
}

function buildGaps(
  openSuggestions: FlowSuggestie[],
  autoMap: Map<string, Automatisering>,
): ProcessJourneyEvidenceItem[] {
  return openSuggestions
    .filter((suggestion) => !suggestion.confirmed && !suggestion.rejected)
    .map((suggestion) => {
      const from = autoMap.get(suggestion.fromId);
      return {
        title: suggestion.toNaam || "Mogelijk vervolgproces",
        description: suggestion.redenering
          ? toPlainProcessText(suggestion.redenering)
          : `${from?.naam ?? suggestion.fromNaam} kan mogelijk doorlopen naar ${suggestion.toNaam}, maar dit is nog niet bevestigd.`,
        tag: "Open gap",
        tone: suggestion.zekerheid === "webhook" ? "warning" : "neutral",
      };
    });
}

function buildStoryParagraphs(
  flow: Flow,
  automations: Automatisering[],
  transitions: ProcessJourneyTransitionPresentation[],
  changeSummary: ProcessJourneyChangeSummary,
  gaps: ProcessJourneyEvidenceItem[],
  topology: ProcessJourneyTopology,
): string[] {
  const approved = cleanText(flow.beschrijving);
  const paragraphs: string[] = [];
  if (approved && transitions.length === 0 && !isGenericFlowDescription(approved)) {
    paragraphs.push(toPlainProcessText(approved));
  }

  if (automations.length === 0) {
    return paragraphs.length > 0
      ? paragraphs
      : ["Deze procesreis heeft nog geen beschikbare automation-records. Voeg of herstel automations om de keten en het overgangsbewijs te kunnen tonen."];
  }

  const sourceList = [...new Set(automations.map(formatSourceLabel))].join(", ");
  const provenCount = transitions.filter((transition) => transition.tone === "good").length;
  const transitionCount = transitions.length;

  paragraphs.push(buildStartStory(topology, sourceList));
  const sourceFacts = buildAutomationSourceFactSentence(automations);
  paragraphs.push(
    sourceFacts
      ? `Vanuit de losse automations is bekend: ${sourceFacts}. De kaart "Wat verandert er?" splitst deze broninformatie uit naar binnenkomende data, opgehaalde gegevens, beslissingen en updates.`
      : "Onderweg wordt de relevante procesinformatie opgehaald, worden voorwaarden of beslissingen toegepast en worden waar bewezen de bijbehorende records in de betrokken systemen bijgewerkt. De kaart \"Wat verandert er?\" houdt de concrete broninformatie apart.",
  );
  paragraphs.push(
    transitionCount > 0
      ? `${provenCount} webhook-overgang${provenCount === 1 ? "" : "en"} heeft 100% webhook-bewijs. ${buildEndStory(topology)}${gaps.length > 0 ? " Mogelijke vervolgen staan als niet-bewezen gap apart van de keten." : ""}`
      : `Deze procesreis bevat nu ${automations.length} automation${automations.length === 1 ? "" : "s"}, maar zonder exacte webhook-overdracht wordt er geen procesreis-overgang getoond.`,
  );

  return paragraphs.slice(0, 4);
}

function buildAutomationSourceFactSentence(automations: Automatisering[]): string {
  const facts = uniqueText(
    automations.flatMap((automation) => buildAutomationProcessEnrichment(automation).storyFacts),
  ).slice(0, 6);

  return facts.join("; ");
}

function buildExecutionTimeline(
  automations: Automatisering[],
  transitions: ProcessJourneyTransitionPresentation[],
): ProcessJourneyStepPresentation[] {
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  const transitionBySource = new Map<string, ProcessJourneyTransitionPresentation[]>();
  for (const transition of transitions) {
    const current = transitionBySource.get(transition.fromId) ?? [];
    current.push(transition);
    transitionBySource.set(transition.fromId, current);
  }
  const parallelGroups = buildParallelSourceGroups(automations, transitions);
  const groupByRepresentativeId = new Map(
    parallelGroups.map((group) => [group.members[0].id, group]),
  );
  const groupedMemberIds = new Set(
    parallelGroups.flatMap((group) => group.members.slice(1).map((automation) => automation.id)),
  );

  const steps: ProcessJourneyStepPresentation[] = [];
  for (const automation of automations) {
    const group = groupByRepresentativeId.get(automation.id);
    if (group) {
      steps.push(...buildParallelSourceGroupSteps(group, autoMap));
      continue;
    }
    if (groupedMemberIds.has(automation.id)) continue;

    const automationSteps = buildAutomationExecutionSteps(
      automation,
      transitionBySource.get(automation.id) ?? [],
    );
    steps.push(...automationSteps);
  }

  const stopSteps = buildStopSteps(automations, transitions);
  steps.push(...stopSteps);

  return steps.map((step, index) => ({
    ...step,
    index: index + 1,
  }));
}

function buildParallelSourceGroups(
  automations: Automatisering[],
  transitions: ProcessJourneyTransitionPresentation[],
): ParallelSourceGroup[] {
  if (transitions.length < 2) return [];

  const incomingIds = new Set(transitions.map((transition) => transition.toId));
  const automationById = new Map(automations.map((automation) => [automation.id, automation]));
  const order = new Map(automations.map((automation, index) => [automation.id, index]));
  const groups = new Map<string, ParallelSourceGroup>();

  for (const transition of transitions) {
    const source = automationById.get(transition.fromId);
    if (!source || incomingIds.has(source.id)) continue;

    const route = extractRouteFromTransitionDescription(transition.description);
    if (!route) continue;

    const key = `${transition.toId}|${formatSourceLabel(source)}|${route}`;
    const existing = groups.get(key);
    if (existing) {
      existing.members.push(source);
      continue;
    }

    groups.set(key, {
      key,
      targetId: transition.toId,
      route,
      members: [source],
      transition,
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      members: uniqueAutomations(group.members)
        .sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)),
    }))
    .filter((group) => group.members.length > 1);
}

function buildParallelSourceGroupSteps(
  group: ParallelSourceGroup,
  autoMap: Map<string, Automatisering>,
): ProcessJourneyStepPresentation[] {
  const representative = group.members[0];
  const node = buildNode(representative);
  const target = autoMap.get(group.targetId);
  const groupName = formatGroupedAutomationNames(group.members.map((automation) => automation.naam));
  const automationIds = group.members.map((automation) => automation.id);
  const enrichment = buildAutomationProcessEnrichment(representative);
  const steps: Array<Omit<ProcessJourneyStepPresentation, "index">> = [];

  const addFacts = (
    kind: ProcessJourneyStepPresentation["kind"],
    prefix: string,
    values: string[],
    descriptionFactory: (value: string) => string,
  ) => {
    const firstValue = uniqueText(values)[0];
    if (!firstValue) return;
    const display = formatStepValue(firstValue);
    steps.push({
      id: `${group.key}-${kind}`,
      automationId: representative.id,
      automationIds,
      automationTitle: groupName,
      title: buildStepTitle(prefix, display),
      description: descriptionFactory(display),
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: [node.sourceLabel, stepKindLabel(kind)],
      kind,
    });
  };

  addFacts("start", "Ontvangt ", enrichment.receives, (value) =>
    `${groupName} starten met ${stripLeadingProcessVerb(value, ["ontvangt"])}.`,
  );
  addFacts("read", "Haalt op: ", enrichment.reads, (value) =>
    `${groupName} halen ${stripLeadingProcessVerb(value, ["haalt op", "leest"])} op voor deze processtap.`,
  );
  addFacts("determine", "Bepaalt: ", enrichment.determines, (value) =>
    `${groupName} bepalen ${stripLeadingProcessVerb(value, ["bepaalt"])} voordat er wordt doorgegeven of bijgewerkt.`,
  );
  addFacts("write", "Schrijft terug: ", enrichment.writes, (value) =>
    `${groupName} hebben als resultaat: ${lowerFirst(value)}.`,
  );

  steps.push({
    id: `${group.key}-handoff`,
    automationId: representative.id,
    automationIds,
    automationTitle: groupName,
    title: `Draagt over aan ${target?.naam ?? group.targetId}`,
    description: `${groupName} geven het werk via dezelfde exacte webhook-route (${group.route}) door aan ${target?.naam ?? group.targetId}.`,
    sourceLabel: node.sourceLabel,
    href: node.href,
    tone: node.tone,
    badges: [node.sourceLabel, group.transition.evidenceLabel],
    kind: "handoff",
  });

  return steps;
}

function buildAutomationExecutionSteps(
  automation: Automatisering,
  outgoingTransitions: ProcessJourneyTransitionPresentation[],
): ProcessJourneyStepPresentation[] {
  const node = buildNode(automation);
  if (automation.source?.toLowerCase() === "hubspot") {
    return buildHubSpotExecutionSteps(automation, node, outgoingTransitions);
  }
  if (automation.source?.toLowerCase() === "gitlab" || automation.gitlabEndpoint || automation.gitlabFilePath) {
    return buildGitLabExecutionSteps(automation, node, outgoingTransitions);
  }

  const enrichment = buildAutomationProcessEnrichment(automation);
  const steps: Array<Omit<ProcessJourneyStepPresentation, "index">> = [];
  const addFacts = (
    kind: ProcessJourneyStepPresentation["kind"],
    prefix: string,
    values: string[],
    descriptionFactory: (value: string) => string,
  ) => {
    for (const value of uniqueText(values).slice(0, 8)) {
      const display = formatStepValue(value);
      steps.push({
        id: `${automation.id}-${kind}-${steps.length}`,
        automationId: automation.id,
        automationIds: [automation.id],
        automationTitle: node.title,
        title: buildStepTitle(prefix, display),
        description: descriptionFactory(display),
        sourceLabel: node.sourceLabel,
        href: node.href,
        tone: node.tone,
        badges: [node.sourceLabel, stepKindLabel(kind)],
        kind,
      });
    }
  };

  addFacts("start", "Ontvangt ", enrichment.receives, (value) =>
    `${node.title} start met ${stripLeadingProcessVerb(value, ["ontvangt"])}.`,
  );
  addFacts("read", "Haalt op: ", enrichment.reads, (value) =>
    `${node.title} haalt ${stripLeadingProcessVerb(value, ["haalt op", "leest"])} op voor deze processtap.`,
  );
  addFacts("determine", "Bepaalt: ", enrichment.determines, (value) =>
    `${node.title} bepaalt ${stripLeadingProcessVerb(value, ["bepaalt"])} voordat er wordt doorgegeven of bijgewerkt.`,
  );
  addFacts("write", "Schrijft terug: ", enrichment.writes, (value) =>
    `${node.title} heeft als resultaat: ${lowerFirst(value)}.`,
  );

  for (const transition of outgoingTransitions) {
    steps.push({
      id: `${automation.id}-handoff-${transition.toId}`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title: `Draagt over aan ${transition.toId}`,
      description: transition.description,
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: [node.sourceLabel, transition.evidenceLabel],
      kind: "handoff",
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: `${automation.id}-summary`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title: node.roleLabel,
      description: node.description,
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: node.badges.slice(0, 3),
      kind: "start",
    });
  }

  return steps;
}

function buildHubSpotExecutionSteps(
  automation: Automatisering,
  node: ProcessJourneyNodePresentation,
  outgoingTransitions: ProcessJourneyTransitionPresentation[],
): ProcessJourneyStepPresentation[] {
  const detail = getHubSpotAutomationDetailPresentation(automation);
  const workflowActions = automation.hubspotWorkflow?.actions ?? [];
  const conditionFacts = uniqueText([
    ...detail.conditions
      .filter((condition) => !/geen startvoorwaarden/i.test(condition.title))
      .map(formatHubSpotConditionFact),
    ...detail.properties.map((property) => `${property.property} ${property.rule} ${property.value}`),
  ]);
  const writeFacts = uniqueText(
    workflowActions
      .filter((action) => !isHubSpotWebhookWorkflowAction(action))
      .map(formatHubSpotWorkflowAction)
      .filter(Boolean),
  );
  const steps: Array<Omit<ProcessJourneyStepPresentation, "index">> = [];

  if (conditionFacts.length > 0) {
    steps.push({
      id: `${automation.id}-start-hubspot`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title: "Start op HubSpot voorwaarden",
      description: `${node.title} start zodra een HubSpot-record aan de bekende workflowvoorwaarden voldoet.`,
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: [node.sourceLabel, stepKindLabel("start")],
      kind: "start",
    });
    steps.push({
      id: `${automation.id}-determine-hubspot`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title: "Controleert HubSpot voorwaarden",
      description: `Controleert deze HubSpot-voorwaarden voordat er wordt doorgegeven of bijgewerkt: ${joinDutch(conditionFacts, "de bekende voorwaarden")}.`,
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: [node.sourceLabel, stepKindLabel("determine")],
      kind: "determine",
    });
  }

  if (writeFacts.length > 0) {
    steps.push({
      id: `${automation.id}-write-hubspot`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title: "Werkt HubSpot bij",
      description: `Werkt HubSpot bij met: ${joinDutch(writeFacts, "de bekende HubSpot-acties")}.`,
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: [node.sourceLabel, stepKindLabel("write")],
      kind: "write",
    });
  }

  for (const transition of outgoingTransitions) {
    steps.push({
      id: `${automation.id}-handoff-${transition.toId}`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title: `Draagt over aan ${transition.toId}`,
      description: transition.description,
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: [node.sourceLabel, transition.evidenceLabel],
      kind: "handoff",
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: `${automation.id}-summary`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title: node.roleLabel,
      description: node.description,
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: node.badges.slice(0, 3),
      kind: "start",
    });
  }

  return steps;
}

function formatHubSpotConditionFact(condition: { title: string; subtitle?: string }): string {
  const title = formatStepValue(condition.title);
  const subtitle = formatStepValue(condition.subtitle ?? "");
  if (!subtitle || subtitle.toLocaleLowerCase("nl-NL").includes(title.toLocaleLowerCase("nl-NL"))) return title;
  return `${title} (${subtitle})`;
}

function formatHubSpotWorkflowAction(action: { label?: string; type?: string; propertyName?: string | null; propertyValue?: string | number | boolean | null }): string {
  const label = formatStepValue(action.label || action.type || "HubSpot actie");
  if (!action.propertyName) return label;
  const propertyUpdate = `${action.propertyName}${action.propertyValue !== null && action.propertyValue !== undefined ? ` = ${String(action.propertyValue)}` : ""}`;
  if (label.toLocaleLowerCase("nl-NL").includes(action.propertyName.toLocaleLowerCase("nl-NL"))) return label;
  return `${label} (${propertyUpdate})`;
}

function isHubSpotWebhookWorkflowAction(action: { type?: string; webhookPath?: string | null; webhookUrl?: string | null }): boolean {
  return Boolean(action.webhookPath || action.webhookUrl || /webhook/i.test(action.type ?? ""));
}

function buildGitLabExecutionSteps(
  automation: Automatisering,
  node: ProcessJourneyNodePresentation,
  outgoingTransitions: ProcessJourneyTransitionPresentation[],
): ProcessJourneyStepPresentation[] {
  const meaning = getGitLabAutomationMeaningPresentation(automation);
  const steps: Array<Omit<ProcessJourneyStepPresentation, "index">> = [];
  const addIndividualFacts = (
    kind: ProcessJourneyStepPresentation["kind"],
    prefix: string,
    facts: Array<{ label: string; description: string }>,
  ) => {
    for (const fact of facts.slice(0, 8)) {
      const display = formatStepValue(formatGitLabFact(fact));
      steps.push({
        id: `${automation.id}-${kind}-${steps.length}`,
        automationId: automation.id,
        automationIds: [automation.id],
        automationTitle: node.title,
        title: buildStepTitle(prefix, display),
        description: toPlainProcessText(fact.description),
        sourceLabel: node.sourceLabel,
        href: node.href,
        tone: node.tone,
        badges: [node.sourceLabel, stepKindLabel(kind)],
        kind,
      });
    }
  };
  const addGroupedFacts = (
    kind: ProcessJourneyStepPresentation["kind"],
    title: string,
    facts: Array<{ label: string; description: string }>,
    describe: (facts: Array<{ label: string; description: string }>) => string,
  ) => {
    if (facts.length === 0) return;
    steps.push({
      id: `${automation.id}-${kind}-group`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title,
      description: describe(facts),
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: [node.sourceLabel, stepKindLabel(kind)],
      kind,
    });
  };

  addIndividualFacts("start", "Ontvangt ", meaning.ontvangt);
  addGroupedFacts("read", "Haalt gegevens op uit HubSpot", meaning.haaltOp, describeGitLabReadFacts);
  addGroupedFacts("determine", "Controleert voorwaarden", meaning.berekent, describeGitLabDetermineFacts);
  addGroupedFacts("write", "Schrijft terug naar HubSpot", meaning.pastAan, describeGitLabWriteFacts);

  for (const transition of outgoingTransitions) {
    steps.push({
      id: `${automation.id}-handoff-${transition.toId}`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title: `Draagt over aan ${transition.toId}`,
      description: transition.description,
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: [node.sourceLabel, transition.evidenceLabel],
      kind: "handoff",
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: `${automation.id}-summary`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title: node.roleLabel,
      description: node.description,
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: node.badges.slice(0, 3),
      kind: "start",
    });
  }

  return steps;
}

function describeGitLabReadFacts(facts: Array<{ label: string; description: string }>): string {
  return `Haalt de benodigde gegevens op uit HubSpot: ${formatGroupedGitLabFacts(facts)}.`;
}

function describeGitLabDetermineFacts(facts: Array<{ label: string; description: string }>): string {
  return `Controleert of bepaalt de voorwaarden voor deze stap: ${formatGroupedGitLabFacts(facts)}.`;
}

function describeGitLabWriteFacts(facts: Array<{ label: string; description: string }>): string {
  return `Schrijft de bewezen uitkomst terug naar HubSpot: ${formatGroupedGitLabFacts(facts)}.`;
}

function formatGroupedGitLabFacts(facts: Array<{ label: string; description: string }>): string {
  const descriptions = facts
    .slice(0, 8)
    .map((fact) => formatGitLabFactDetail(fact))
    .filter(Boolean);
  return joinDutch(uniqueText(descriptions), "de bekende gegevens");
}

function formatGitLabFactDetail(fact: { label: string; description: string }): string {
  const label = formatStepValue(formatGitLabFact(fact));
  const description = toPlainProcessText(fact.description)
    .replace(/\s+/g, " ")
    .replace(/[.;:\s]+$/g, "")
    .trim();
  if (!label) return description;
  if (!description) return label;
  if (description.toLocaleLowerCase("nl-NL").includes(label.toLocaleLowerCase("nl-NL"))) {
    return description;
  }
  return `${label} (${description})`;
}

function buildStopSteps(
  automations: Automatisering[],
  transitions: ProcessJourneyTransitionPresentation[],
): Array<Omit<ProcessJourneyStepPresentation, "index">> {
  if (automations.length === 0) return [];
  const outgoing = new Set(transitions.map((transition) => transition.fromId));
  const leaves = transitions.length > 0
    ? automations.filter((automation) => !outgoing.has(automation.id))
    : [automations.at(-1)!];

  return leaves.map((automation) => {
    const node = buildNode(automation);
    const enrichment = buildAutomationProcessEnrichment(automation);
    const writes = enrichment.writes.length > 0
      ? ` Deze stap heeft als resultaat: ${joinDutch(enrichment.writes.slice(0, 2).map(formatStepValue), "de bewezen uitvoer")}.`
      : "";
    return {
      id: `${automation.id}-stop`,
      automationId: automation.id,
      automationIds: [automation.id],
      automationTitle: node.title,
      title: "Procesreis stopt hier",
      description: `Hier eindigt deze procesreis.${writes}`,
      sourceLabel: node.sourceLabel,
      href: node.href,
      tone: node.tone,
      badges: [node.sourceLabel, "Eindpunt"],
      kind: "stop",
    };
  });
}

function stepKindLabel(kind: ProcessJourneyStepPresentation["kind"]): string {
  if (kind === "start") return "Input";
  if (kind === "read") return "Ophalen";
  if (kind === "determine") return "Bepalen";
  if (kind === "write") return "Write";
  if (kind === "handoff") return "Overdracht";
  return "Eindpunt";
}

function formatStepValue(value: string): string {
  return toPlainProcessText(value)
    .replace(/\bdeal_id\b/gi, "deal-ID")
    .replace(/\bcompany_id\b/gi, "company-ID")
    .replace(/\bcontact_id\b/gi, "contact-ID")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.;:\s]+$/g, "")
    .trim();
}

function buildStepTitle(prefix: string, display: string): string {
  const cleanDisplay = formatStepValue(display);
  const normalizedPrefix = prefix.replace(/[:\s]+$/g, "").toLocaleLowerCase("nl-NL");
  if (cleanDisplay.toLocaleLowerCase("nl-NL").startsWith(`${normalizedPrefix} `)) return cleanDisplay;
  return `${prefix}${cleanDisplay}`;
}

function extractRouteFromTransitionDescription(description: string): string {
  return description.match(/\/[a-z0-9][a-z0-9/_{}.-]+/i)?.[0] ?? "";
}

function formatGroupedAutomationNames(names: string[]): string {
  const cleanNames = uniqueText(names);
  if (cleanNames.length <= 1) return cleanNames[0] ?? "Meerdere automations";

  const splitNames = cleanNames.map((name) => {
    const separatorIndex = name.lastIndexOf(" - ");
    if (separatorIndex === -1) return null;
    return {
      prefix: name.slice(0, separatorIndex),
      suffix: name.slice(separatorIndex + 3),
    };
  });

  const firstPrefix = splitNames[0]?.prefix;
  if (firstPrefix && splitNames.every((item) => item?.prefix === firstPrefix)) {
    return `${firstPrefix} - ${joinDutch(splitNames.map((item) => item?.suffix ?? "").filter(Boolean), cleanNames.join(", "))}`;
  }

  return joinDutch(cleanNames, "Meerdere automations");
}

function lowerFirst(value: string): string {
  const cleanValue = formatStepValue(value);
  return cleanValue ? `${cleanValue.charAt(0).toLocaleLowerCase("nl-NL")}${cleanValue.slice(1)}` : cleanValue;
}

function stripLeadingProcessVerb(value: string, verbs: string[]): string {
  let cleanValue = lowerFirst(value);
  for (const verb of verbs) {
    const pattern = new RegExp(`^${escapeRegExp(verb)}\\s+`, "i");
    cleanValue = cleanValue.replace(pattern, "");
  }
  return cleanValue;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function joinDutch(values: string[], fallback: string): string {
  const cleanValues = values.filter(Boolean);
  if (cleanValues.length === 0) return fallback;
  if (cleanValues.length === 1) return cleanValues[0];
  if (cleanValues.length === 2) return `${cleanValues[0]} en ${cleanValues[1]}`;
  return `${cleanValues.slice(0, -1).join(", ")} en ${cleanValues.at(-1)}`;
}

function uniqueAutomations(automations: Automatisering[]): Automatisering[] {
  const seen = new Set<string>();
  const result: Automatisering[] = [];
  for (const automation of automations) {
    if (seen.has(automation.id)) continue;
    seen.add(automation.id);
    result.push(automation);
  }
  return result;
}

function buildEvidenceItems(transitions: ProcessJourneyTransitionPresentation[]): ProcessJourneyEvidenceItem[] {
  if (transitions.length === 0) {
    return [{
      title: "Keten stopt zonder webhook-bewijs",
      description: "Er is geen exacte webhook-route gevonden die twee automations in deze volgorde met elkaar verbindt.",
      tag: "Geen webhook-match",
      tone: "warning",
    }];
  }

  return transitions.map((transition) => ({
    title: transition.label,
    description: transition.description,
    tag: transition.evidenceLabel,
    tone: transition.tone === "good" ? "good" : "warning",
  }));
}

function buildMetrics(
  nodes: ProcessJourneyNodePresentation[],
  transitions: ProcessJourneyTransitionPresentation[],
  automations: Automatisering[],
  analysisQuality: ProcessJourneyDetailPresentation["analysisQuality"],
): ProcessJourneyMetricPresentation[] {
  const sourceCount = new Set(nodes.map((node) => node.sourceLabel)).size;
  const provenCount = transitions.filter((transition) => transition.tone === "good").length;
  return [
    {
      label: "Automations",
      value: String(nodes.length),
      detail: sourceCount > 0 ? `${sourceCount} bron${sourceCount === 1 ? "" : "nen"} betrokken` : "Geen bronnen beschikbaar",
    },
    {
      label: "Overgangen",
      value: transitions.length > 0 ? `${provenCount}/${transitions.length}` : "0",
      detail: transitions.length > 0 ? "100% webhook-match" : "geen webhook-overgang",
      tone: provenCount === transitions.length && transitions.length > 0 ? "good" : "warning",
    },
    {
      label: "Business object",
      value: inferBusinessObject(automations),
      detail: "afgeleid uit brondata en automationnamen",
    },
    {
      label: "Bewijsstatus",
      value: analysisQuality,
      detail: analysisQuality === "100% webhook" ? "elke overgang exact bewezen" : "zonder extra webhook-match stopt de keten",
      tone: analysisQuality === "100% webhook" ? "good" : "warning",
    },
  ];
}

function buildStatusBadges(
  nodes: ProcessJourneyNodePresentation[],
  transitions: ProcessJourneyTransitionPresentation[],
  gaps: ProcessJourneyEvidenceItem[],
): string[] {
  const provenCount = transitions.filter((transition) => transition.tone === "good").length;
  return [
    "Webhook-bewezen procesreis",
    `${nodes.length} automation${nodes.length === 1 ? "" : "s"}`,
    `${provenCount} webhook-overgang${provenCount === 1 ? "" : "en"}`,
    provenCount > 0 ? "100% webhook-match" : null,
    gaps.length > 0 ? `${gaps.length} open gap${gaps.length === 1 ? "" : "s"}` : null,
  ].filter((badge): badge is string => Boolean(badge));
}

interface ProcessJourneyTopology {
  roots: Automatisering[];
  leaves: Automatisering[];
}

function buildJourneyTopology(
  automations: Automatisering[],
  transitions: ProcessJourneyTransitionPresentation[],
): ProcessJourneyTopology {
  if (automations.length === 0) return { roots: [], leaves: [] };
  if (transitions.length === 0) {
    return automations.length === 1
      ? { roots: automations, leaves: automations }
      : { roots: [], leaves: [] };
  }

  const incoming = new Set(transitions.map((transition) => transition.toId));
  const outgoing = new Set(transitions.map((transition) => transition.fromId));

  return {
    roots: automations.filter((automation) => !incoming.has(automation.id)),
    leaves: automations.filter((automation) => !outgoing.has(automation.id)),
  };
}

function buildMeta(
  flow: Flow,
  topology: ProcessJourneyTopology,
  automations: Automatisering[],
): string[] {
  return [
    formatTopologyMeta("Startpunt", "Startpunten", topology.roots),
    formatTopologyMeta("Eindpunt", "Eindpunten", topology.leaves),
    `Bronnen: ${formatSourceList(automations) || "geen"}`,
    `Laatst bijgewerkt: ${formatDate(flow.updatedAt || flow.createdAt)}`,
  ];
}

function formatTopologyMeta(
  singular: string,
  plural: string,
  automations: Automatisering[],
): string {
  if (automations.length === 0) return `${singular}: niet bewezen`;
  const sources = formatSourceList(automations);
  return automations.length === 1
    ? `${singular}: ${sources}`
    : `${plural}: ${automations.length} (${sources})`;
}

function buildStartStory(topology: ProcessJourneyTopology, sourceList: string): string {
  if (topology.roots.length > 1) {
    const names = topology.roots.map((automation) => automation.naam).join(", ");
    return `De procesreis heeft meerdere bewezen startpunten: ${names}. Daarna beweegt het werk door ${sourceList}, waarbij elke automation een eigen rol heeft maar alleen de overdracht tussen de automations de procesreis vormt.`;
  }

  if (topology.roots.length === 1) {
    const first = topology.roots[0];
    const firstOverview = getAutomationOverviewPresentation(first);
    const start = toPlainProcessText(firstOverview.triggerLabel || first.trigger || first.naam);
    return `De procesreis start bij ${start}. Daarna beweegt het werk door ${sourceList}, waarbij elke automation een eigen rol heeft maar alleen de overdracht tussen de automations de procesreis vormt.`;
  }

  return `Deze procesreis heeft nog geen bewezen startpunt. De pagina toont alleen webhook-overgangen waarvoor harde brondata bestaat.`;
}

function buildEndStory(topology: ProcessJourneyTopology): string {
  if (topology.leaves.length > 1) {
    return `De reis heeft ${topology.leaves.length} bewezen eindpunten: ${topology.leaves.map((automation) => automation.naam).join(", ")}.`;
  }
  if (topology.leaves.length === 1) {
    return `De reis eindigt bij ${formatSourceLabel(topology.leaves[0])}.`;
  }
  return "Het eindpunt is nog niet bewezen.";
}

function formatSourceList(automations: Automatisering[]): string {
  return [...new Set(automations.map(formatSourceLabel))].join(" / ");
}

function buildSubtitle(automations: Automatisering[]): string {
  if (automations.length === 0) return "Nog geen automation-records beschikbaar voor deze procesreis.";
  const sources = [...new Set(automations.map(formatSourceLabel))].join(", ");
  return `Keten van ${automations.length} automation${automations.length === 1 ? "" : "s"} over ${sources}.`;
}

function determineAnalysisQuality(
  transitions: ProcessJourneyTransitionPresentation[],
  nodes: ProcessJourneyNodePresentation[],
  gaps: ProcessJourneyEvidenceItem[],
): ProcessJourneyDetailPresentation["analysisQuality"] {
  void gaps;
  if (nodes.length <= 1) return "Geen webhook-bewijs";
  if (transitions.length >= nodes.length - 1) return "100% webhook";
  return "Keten stopt";
}

function buildRoleLabel(automation: Automatisering, actionSummary: string): string {
  const source = automation.source?.toLowerCase();
  if (source === "typeform") return "Formulierinzending verzamelen";
  if (source === "zapier") return "Zapier-stappen en voorwaarden uitvoeren";
  if (source === "hubspot") return "HubSpot workflowcriteria bewaken";
  if (source === "gitlab") {
    const meaning = getGitLabAutomationMeaningPresentation(automation);
    if (meaning.pastAan.length > 0) return "Backend haalt op, bepaalt en schrijft terug";
    return "Backendverwerking uitvoeren";
  }
  return toPlainProcessText(actionSummary || automation.doel || automation.naam);
}

function buildWebhookTransitionDescription(
  from: Automatisering,
  to: Automatisering,
  normalizedPath: string,
  storedAsLink: boolean,
  isCycle = false,
): string {
  const linkText = storedAsLink ? " en is opgeslagen als webhook-koppeling" : "";
  const cycleText = isCycle ? " Dit is een terugkerende route, dus de keten wordt hier niet opnieuw doorgelopen." : "";
  return `${from.naam} geeft het werk via dezelfde exacte webhook-route (${normalizedPath}) door aan ${to.naam}${linkText}.${cycleText}`;
}

/*
function buildTransitionDescription(
  from: Automatisering,
  to: Automatisering,
  confirmed: boolean,
  webhookMatch: boolean,
  fallbackReason: string,
): string {
  if (confirmed && webhookMatch) {
    return `${from.naam} geeft het werk via een bewezen webhook-overdracht door aan ${to.naam}.`;
  }
  if (confirmed) {
    return `${from.naam} is handmatig of eerder bevestigd gekoppeld aan ${to.naam}.`;
  }
  if (webhookMatch) {
    return `${from.naam} en ${to.naam} delen dezelfde webhookroute, maar de overgang is nog niet als officiële koppeling bevestigd.`;
  }
  return toPlainProcessText(fallbackReason || "Deze overgang is alleen uit de volgorde van de procesreis afgeleid.");
}

function hasWebhookMatch(from: Automatisering, to: Automatisering): boolean {
  const fromPaths = collectHandoffPaths(from);
  const toPaths = collectReceiverPaths(to);
  return fromPaths.some((fromPath) =>
    toPaths.some((toPath) => pathsMatch(fromPath, toPath)),
  );
}

function collectHandoffPaths(automation: Automatisering): string[] {
  return uniqueLimited([
    ...(automation.webhookPaths ?? []),
    ...((automation.hubspotWorkflow?.actions ?? []).map((action) => action.webhookPath || action.webhookUrl).filter(Boolean) as string[]),
    ...((automation.importProposal?.zap?.process?.webhookHandoffs ?? []).map((handoff) => handoff.path)),
    ...((automation.importProposal?.zap?.process?.steps ?? []).flatMap((step) => step.webhookPaths ?? [])),
    ...((automation.importProposal?.typeform?.webhooks ?? []).map((webhook) => webhook.path).filter(Boolean) as string[]),
    ...((automation.importProposal?.typeform?.process?.webhookHandoffs ?? []).map((handoff) => handoff.path)),
  ], 20, []);
}

function collectReceiverPaths(automation: Automatisering): string[] {
  return uniqueLimited([
    automation.gitlabEndpoint?.endpoint,
    automation.importProposal?.gitlab_endpoint?.endpoint,
    automation.importProposal?.gitlab?.endpoint?.path,
    ...(automation.endpoints ?? []),
    ...(automation.webhookPaths ?? []),
    ...((automation.importProposal?.zap?.process?.webhookHandoffs ?? []).map((handoff) => handoff.path)),
  ].filter((path): path is string => Boolean(path)), 20, []);
}

function pathsMatch(a: string, b: string): boolean {
  const left = normalizePath(a);
  const right = normalizePath(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function normalizePath(path: string): string {
  return path
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0]
    .replace(/\/+$/g, "")
    .trim()
    .toLowerCase();
}

*/
function inferBusinessObject(automations: Automatisering[]): string {
  const text = automations
    .map((automation) => `${automation.naam} ${automation.doel} ${automation.trigger} ${automation.gitlabEndpoint?.endpoint ?? ""}`)
    .join(" ")
    .toLowerCase();
  if (text.includes("deal")) return "Deal";
  if (text.includes("contact")) return "Contact";
  if (text.includes("company") || text.includes("bedrijf")) return "Bedrijf";
  if (text.includes("form") || text.includes("typeform")) return "Formulier";
  if (text.includes("factuur") || text.includes("wefact")) return "Debiteur";
  return "Procesdata";
}

function formatSourceLabel(automation: Automatisering): string {
  const source = automation.source?.toLowerCase();
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier") return "Zapier";
  if (source === "gitlab") return "GitLab";
  if (source === "typeform") return "Typeform";
  if (automation.gitlabFilePath || automation.gitlabEndpoint) return "GitLab";
  return automation.systemen[0] ?? "Automation";
}

function sourceTone(automation: Automatisering): ProcessJourneyNodePresentation["tone"] {
  const source = automation.source?.toLowerCase();
  if (source === "hubspot") return "hubspot";
  if (source === "zapier") return "zapier";
  if (source === "gitlab" || automation.gitlabFilePath || automation.gitlabEndpoint) return "gitlab";
  if (source === "typeform") return "typeform";
  return "neutral";
}

function toPlainProcessText(value: string): string {
  return cleanText(value)
    .replace(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/[^\s.]+/gi, "een binnenkomend signaal")
    .replace(/Backend\s+(endpoint|handler|verwerking)\s+[A-Za-z0-9_]+\s+verwerkt de request\.?/gi, "De backend verwerkt de gegevens.")
    .replace(/De backend verwerkt de request met de bekende code- en endpointinformatie\.?/gi, "De backend verwerkt de beschikbare gegevens.")
    .replace(/\bbatch-?update(?:t|n)?\b/gi, "werkt bij")
    .replace(/\bscheduled response\b/gi, "directe bevestiging")
    .replace(/\bachtergrondtaak\b/gi, "werk op de achtergrond")
    .replace(/\bvia get\b/gi, "op")
    .replace(/\bupsert wefact client\b/gi, "WeFact-klant aanmaken of bijwerken")
    .replace(/\bupsert wefact debtor from hubspot\b/gi, "WeFact-debiteur aanmaken of bijwerken vanuit HubSpot")
    .replace(/\bupsert debtor from hubspot\b/gi, "maakt of werkt WeFact-debiteur bij vanuit HubSpot")
    .replace(/\bupsert\b/gi, "maakt of werkt bij")
    .replace(/\bendpoint\b/gi, "verwerking")
    .replace(/\bhandler\b/gi, "verwerking")
    .replace(/\bpayload\b/gi, "gegevens")
    .replace(/\brequest\b/gi, "gegevens")
    .replace(/\bAPI\b/g, "koppeling")
    .replace(/\bproperty\b/gi, "veld")
    .replace(/HubSpot deal veld/gi, "HubSpot dealveld")
    .replace(/HubSpot dealveld dealname/gi, "HubSpot dealveld dealname")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueLimited(values: Array<string | null | undefined>, limit: number, fallback: string[]): string[] {
  const unique = [...new Set(values.map((value) => toPlainProcessText(value ?? "")).filter(Boolean))];
  return unique.length > 0 ? unique.slice(0, limit) : fallback;
}

function uniqueText(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => toPlainProcessText(value ?? "")).filter(Boolean))];
}

function firstText(...values: Array<string | undefined | null>): string {
  return values.map((value) => value?.trim()).find(Boolean) ?? "";
}

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function isGenericFlowDescription(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === "controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
