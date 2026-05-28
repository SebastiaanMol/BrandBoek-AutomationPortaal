import type { FlowEvidenceLevel } from "./flowEvidence";
import { getAutomationOverviewPresentation } from "./automationOverviewPresentation";
import { getGitLabAutomationMeaningPresentation } from "./gitlabAutomationMeaningPresentation";
import type { FlowSuggestie } from "./storage/automationLinks";
import type { Automatisering, Flow } from "./types";
import { getExactWebhookProof } from "./webhookProof";

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
  index: number;
  title: string;
  description: string;
  sourceLabel: string;
  href: string;
  tone: ProcessJourneyNodePresentation["tone"];
  badges: string[];
}

export interface ProcessJourneyAutomationCardPresentation {
  id: string;
  title: string;
  sourceLabel: string;
  role: string;
  description: string;
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

interface ProcessJourneyPresentationInput {
  flow: Flow;
  automations: Automatisering[];
  confirmedLinks?: ProcessJourneyConfirmedLink[];
  openSuggestions?: FlowSuggestie[];
}

export function getProcessJourneyDetailPresentation({
  flow,
  automations,
  confirmedLinks = [],
  openSuggestions = [],
}: ProcessJourneyPresentationInput): ProcessJourneyDetailPresentation {
  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  const orderedAutomations = flow.automationIds
    .map((id) => autoMap.get(id))
    .filter((automation): automation is Automatisering => Boolean(automation));
  const nodes = orderedAutomations.map(buildNode);
  const transitions = buildTransitions(orderedAutomations, confirmedLinks);
  const gaps = buildGaps(openSuggestions, autoMap);
  const changeSummary = buildChangeSummary(orderedAutomations);
  const analysisQuality = determineAnalysisQuality(transitions, nodes, gaps);

  return {
    title: cleanText(flow.naam) || "Procesreis",
    subtitle: buildSubtitle(orderedAutomations),
    statusBadges: buildStatusBadges(nodes, transitions, gaps),
    meta: buildMeta(flow, orderedAutomations),
    metrics: buildMetrics(nodes, transitions, orderedAutomations, analysisQuality),
    storyParagraphs: buildStoryParagraphs(flow, orderedAutomations, transitions, changeSummary, gaps),
    nodes,
    transitions,
    steps: orderedAutomations.map((automation, index) => buildStep(automation, index)),
    evidenceItems: buildEvidenceItems(transitions),
    gaps,
    changeSummary,
    automationCards: nodes.map((node) => ({
      id: node.id,
      title: node.title,
      sourceLabel: node.sourceLabel,
      role: node.roleLabel,
      description: node.description,
      href: node.href,
      tone: node.tone,
    })),
    analysisQuality,
  };
}

function buildNode(automation: Automatisering): ProcessJourneyNodePresentation {
  const overview = getAutomationOverviewPresentation(automation);
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
    description: toPlainProcessText(firstText(overview.actionSummary, overview.outcomeLabel, automation.doel, automation.trigger)),
    href: `/automations/${encodeURIComponent(automation.id)}`,
    tone: sourceTone(automation),
    badges,
  };
}

function buildTransitions(
  automations: Automatisering[],
  confirmedLinks: ProcessJourneyConfirmedLink[],
): ProcessJourneyTransitionPresentation[] {
  const transitions: ProcessJourneyTransitionPresentation[] = [];

  for (let index = 0; index < automations.length - 1; index += 1) {
    const from = automations[index];
    const to = automations[index + 1];
    const confirmed = confirmedLinks.find((link) => link.sourceId === from.id && link.targetId === to.id);
    if (confirmed?.matchType && confirmed.matchType !== "webhook") continue;

    const proof = getExactWebhookProof(from, to);
    if (!proof) continue;

    transitions.push({
      id: `${from.id}->${to.id}`,
      fromId: from.id,
      toId: to.id,
      label: "100% webhook-match",
      evidenceLabel: "100% webhook-match",
      evidenceLevel: "confirmed",
      score: 100,
      description: buildWebhookTransitionDescription(from, to, proof.normalizedPath, Boolean(confirmed)),
      tone: "good",
    });
  }

  return transitions;
}

function buildChangeSummary(automations: Automatisering[]): ProcessJourneyChangeSummary {
  const receives: string[] = [];
  const reads: string[] = [];
  const determines: string[] = [];
  const writes: string[] = [];

  for (const automation of automations) {
    const source = automation.source?.toLowerCase();
    const overview = getAutomationOverviewPresentation(automation);

    if (source === "typeform") {
      const fields = automation.importProposal?.typeform?.form?.fields?.length ?? 0;
      const hidden = automation.importProposal?.typeform?.form?.hidden_fields?.length ?? 0;
      if (fields > 0) receives.push(`${fields} formulier${fields === 1 ? "vraag" : "vragen"}`);
      if (hidden > 0) receives.push(`${hidden} contextveld${hidden === 1 ? "" : "en"} uit Typeform`);
    } else if (source === "zapier") {
      const process = automation.importProposal?.zap?.process;
      if (process?.trigger) receives.push(toPlainProcessText(process.trigger));
      if ((process?.dataLookups?.length ?? 0) > 0) reads.push("Zapier lookup-gegevens");
      if ((process?.conditions?.length ?? 0) > 0) determines.push("Zapier voorwaarden voor doorgang");
    } else if (source === "hubspot") {
      const triggers = automation.hubspotWorkflow?.triggers?.length ?? 0;
      const actions = automation.hubspotWorkflow?.actions?.length ?? 0;
      if (triggers > 0) determines.push("HubSpot workflowcriteria");
      if (actions > 0) writes.push("HubSpot workflowactie of overdracht");
    } else if (source === "gitlab") {
      const meaning = getGitLabAutomationMeaningPresentation(automation);
      receives.push(...meaning.ontvangt.map((fact) => toPlainProcessText(fact.label)));
      reads.push(...meaning.haaltOp.map((fact) => toPlainProcessText(fact.label)));
      determines.push(...meaning.berekent.map((fact) => toPlainProcessText(fact.label)));
      writes.push(...meaning.pastAan.map((fact) => toPlainProcessText(fact.label)));
    } else if (overview.triggerLabel) {
      receives.push(toPlainProcessText(overview.triggerLabel));
    }
  }

  return {
    receives: uniqueLimited(receives, 4, ["Startsignaal uit de eerste automation"]),
    reads: uniqueLimited(reads, 4, ["Geen concrete opgehaalde data bewezen"]),
    determines: uniqueLimited(determines, 4, ["Geen aparte beslislogica bewezen"]),
    writes: uniqueLimited(writes, 4, ["Eindresultaat nog beperkt gespecificeerd"]),
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
): string[] {
  const approved = cleanText(flow.beschrijving);
  const paragraphs: string[] = [];
  if (approved && !isGenericFlowDescription(approved)) {
    paragraphs.push(toPlainProcessText(approved));
  }

  if (automations.length === 0) {
    return paragraphs.length > 0
      ? paragraphs
      : ["Deze procesreis heeft nog geen beschikbare automation-records. Voeg of herstel automations om de keten en het overgangsbewijs te kunnen tonen."];
  }

  const first = automations[0];
  const last = automations.at(-1);
  const firstOverview = getAutomationOverviewPresentation(first);
  const start = toPlainProcessText(firstOverview.triggerLabel || first.trigger || first.naam);
  const sourceList = [...new Set(automations.map(formatSourceLabel))].join(", ");
  const provenCount = transitions.filter((transition) => transition.tone === "good").length;
  const transitionCount = transitions.length;

  paragraphs.push(
    `De procesreis start bij ${start}. Daarna beweegt het werk door ${sourceList}, waarbij elke automation een eigen rol heeft maar alleen de overdracht tussen de automations de procesreis vormt.`,
  );
  paragraphs.push(
    "Onderweg wordt de relevante procesinformatie opgehaald, worden voorwaarden of beslissingen toegepast en worden waar bewezen de bijbehorende records in de betrokken systemen bijgewerkt. De kaart \"Wat verandert er?\" houdt de concrete broninformatie apart.",
  );
  paragraphs.push(
    transitionCount > 0
      ? `${provenCount} van de ${automations.length - 1} mogelijke overgangen heeft 100% webhook-bewijs. De reis eindigt bij ${last ? formatSourceLabel(last) : "de laatste automation"}${gaps.length > 0 ? "; mogelijke vervolgen staan als niet-bewezen gap apart van de keten." : "."}`
      : `Deze procesreis bevat nu ${automations.length} automation${automations.length === 1 ? "" : "s"}, maar zonder exacte webhook-overdracht wordt er geen procesreis-overgang getoond.`,
  );

  return paragraphs.slice(0, 4);
}

function buildStep(automation: Automatisering, index: number): ProcessJourneyStepPresentation {
  const node = buildNode(automation);
  return {
    index: index + 1,
    title: node.roleLabel,
    description: node.description,
    sourceLabel: node.sourceLabel,
    href: node.href,
    tone: node.tone,
    badges: node.badges.slice(0, 3),
  };
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
    `${provenCount} 100% webhook-overgang${provenCount === 1 ? "" : "en"}`,
    gaps.length > 0 ? `${gaps.length} open gap${gaps.length === 1 ? "" : "s"}` : null,
  ].filter((badge): badge is string => Boolean(badge));
}

function buildMeta(flow: Flow, automations: Automatisering[]): string[] {
  const first = automations[0];
  const last = automations.at(-1);
  return [
    first ? `Start: ${formatSourceLabel(first)}` : "Start: onbekend",
    last ? `Eindpunt: ${formatSourceLabel(last)}` : "Eindpunt: onbekend",
    `Bronnen: ${[...new Set(automations.map(formatSourceLabel))].join(" / ") || "geen"}`,
    `Laatst bijgewerkt: ${formatDate(flow.updatedAt || flow.createdAt)}`,
  ];
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
  if (transitions.length === nodes.length - 1) return "100% webhook";
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
): string {
  const linkText = storedAsLink ? " en is opgeslagen als webhook-koppeling" : "";
  return `${from.naam} geeft het werk via dezelfde exacte webhook-route (${normalizedPath}) door aan ${to.naam}${linkText}.`;
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
