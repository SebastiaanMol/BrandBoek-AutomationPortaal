import { buildAutomationFunnel, parseGitLabExternalEndpoint } from "./automationFunnel";
import { getBackendAutomationTrace } from "./backendAutomationTrace";
import {
  getGitLabAutomationMeaningPresentation,
  type GitLabAutomationMeaningPresentation,
} from "./gitlabAutomationMeaningPresentation";
import type { Automatisering, GitLabCallInfo } from "./types";
import type { FlowSuggestie } from "./storage/automationLinks";

export interface GitLabConfirmedLink {
  sourceId: string;
  targetId: string;
}

export interface GitLabDetailOptions {
  allAutomations?: Automatisering[];
  confirmedLinks?: GitLabConfirmedLink[];
  flowSuggesties?: FlowSuggestie[];
}

export interface GitLabDetailMetric {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning" | "danger";
}

export interface GitLabDataflowNode {
  name: string;
  subtitle: string;
  role: "source" | "endpoint" | "handler" | "destination";
  arrowLabel?: string;
}

export interface GitLabExecutionStep {
  index: number;
  title: string;
  description: string;
  technicalDetail?: string;
  kind: "start" | "handler" | "read" | "compute" | "write" | "response";
}

export interface GitLabCallGraphRow {
  depth: number;
  kind: string;
  from: string;
  to: string;
  file: string;
}

export interface GitLabLinkedAutomation {
  id: string;
  name: string;
  subtitle: string;
  href: string;
  evidence: string;
  direction: "incoming" | "outgoing";
}

export interface GitLabIssue {
  severity: "critical" | "gap" | "info" | "ok";
  title: string;
  subtitle: string;
}

export interface GitLabAutomationDetailPresentation {
  isLegacyFileRecord: boolean;
  statusLabel: string;
  sourceUrl: string | null;
  rawData: unknown;
  headerMeta: string[];
  metrics: GitLabDetailMetric[];
  summary: string;
  meaning: GitLabAutomationMeaningPresentation;
  evidenceBadges: string[];
  dataflow: GitLabDataflowNode[];
  executionSteps: GitLabExecutionStep[];
  locationMeta: Array<{ label: string; value: string }>;
  sourceMeta: Array<{ label: string; value: string }>;
  linkedAutomations: GitLabLinkedAutomation[];
  incomingLinks: GitLabLinkedAutomation[];
  callGraph: GitLabCallGraphRow[];
  issues: GitLabIssue[];
}

export function isGitLabAutomation(automation: Pick<Automatisering, "source" | "gitlabFilePath" | "gitlabEndpoint" | "externalId" | "systemen">): boolean {
  return (
    automation.source === "gitlab" ||
    Boolean(automation.gitlabFilePath) ||
    Boolean(automation.gitlabEndpoint) ||
    Boolean(automation.externalId?.includes("::")) ||
    (automation.systemen ?? []).includes("GitLab")
  );
}

export function getGitLabAutomationDetailPresentation(
  automation: Automatisering,
  options: GitLabDetailOptions = {},
): GitLabAutomationDetailPresentation {
  const endpointInfo = getEndpointInfo(automation);
  const calls = endpointInfo.calls;
  const isLegacyFileRecord = isGitLabAutomation(automation) && !endpointInfo.endpoint;
  const linkedAutomations = buildLinkedAutomations(automation, options);
  const incomingLinks = linkedAutomations.filter((link) => link.direction === "incoming");
  const trace = getBackendAutomationTrace(automation);
  const funnel = buildAutomationFunnel(automation);
  const destination = inferDestinationSystem(automation, calls);
  const meaning = getGitLabAutomationMeaningPresentation(automation);
  const summary = isLegacyFileRecord
    ? buildSummary(automation, endpointInfo, destination, isLegacyFileRecord)
    : meaning.summary;

  return {
    isLegacyFileRecord,
    statusLabel: statusLabel(automation.status),
    sourceUrl: getGitLabSourceUrl(automation),
    rawData: buildRawData(automation, linkedAutomations, options, meaning),
    headerMeta: buildHeaderMeta(automation, endpointInfo),
    metrics: buildMetrics(endpointInfo, incomingLinks, isLegacyFileRecord),
    summary,
    meaning,
    evidenceBadges: buildEvidenceBadges(endpointInfo, calls, linkedAutomations, automation, meaning),
    dataflow: buildDataflow(automation, endpointInfo, linkedAutomations, destination),
    executionSteps: buildExecutionSteps(automation, trace, funnel),
    locationMeta: buildLocationMeta(automation, endpointInfo),
    sourceMeta: buildSourceMeta(automation, linkedAutomations, options),
    linkedAutomations,
    incomingLinks,
    callGraph: calls.map((call) => ({
      depth: call.depth,
      kind: readableKind(call.kind),
      from: call.from,
      to: call.to,
      file: call.file ?? "Onbekend bestand",
    })),
    issues: buildIssues(automation, endpointInfo, calls, linkedAutomations, isLegacyFileRecord, meaning),
  };
}

interface EndpointInfo {
  method?: string;
  endpoint?: string;
  file?: string;
  handler?: string;
  calls: GitLabCallInfo[];
}

function getEndpointInfo(automation: Automatisering): EndpointInfo {
  const parsed = parseGitLabExternalEndpoint(automation.externalId);
  const importEndpoint = automation.importProposal?.gitlab?.endpoint;
  const endpoint = automation.gitlabEndpoint?.endpoint
    ?? automation.importProposal?.gitlab_endpoint?.endpoint
    ?? importEndpoint?.path
    ?? parsed.endpoint
    ?? automation.endpoints?.[0];
  const method = automation.gitlabEndpoint?.method
    ?? automation.importProposal?.gitlab_endpoint?.method
    ?? importEndpoint?.method
    ?? parsed.method
    ?? inferMethodFromTrigger(automation.trigger);
  const file = automation.gitlabEndpoint?.api_file
    ?? automation.importProposal?.gitlab_endpoint?.api_file
    ?? importEndpoint?.api_file
    ?? automation.gitlabFilePath
    ?? automation.externalId;
  const handler = automation.gitlabEndpoint?.handler
    ?? automation.importProposal?.gitlab_endpoint?.handler
    ?? importEndpoint?.handler
    ?? inferHandlerFromName(automation);
  const calls = automation.gitlabEndpoint?.calls
    ?? automation.importProposal?.gitlab_endpoint?.calls
    ?? automation.importProposal?.gitlab?.calls
    ?? [];

  return { method, endpoint, file, handler, calls };
}

function buildHeaderMeta(automation: Automatisering, endpointInfo: EndpointInfo): string[] {
  return [
    automation.categorie,
    formatEndpoint(endpointInfo),
    endpointInfo.file,
    endpointInfo.handler ? `Handler ${endpointInfo.handler}` : null,
    automation.gitlabLastCommit ? `Commit ${shortCommit(automation.gitlabLastCommit)}` : null,
    automation.lastSyncedAt ? `Synced ${formatDateNl(automation.lastSyncedAt)}` : null,
  ].filter((item): item is string => Boolean(item));
}

function buildMetrics(
  endpointInfo: EndpointInfo,
  incomingLinks: GitLabLinkedAutomation[],
  isLegacyFileRecord: boolean,
): GitLabDetailMetric[] {
  const callCount = endpointInfo.calls.length;
  return [
    {
      label: "Endpoint",
      value: endpointInfo.method || (isLegacyFileRecord ? "Bestand" : "Onbekend"),
      detail: endpointInfo.endpoint || endpointInfo.file || "Geen endpoint gevonden",
      tone: endpointInfo.endpoint ? "success" : "warning",
    },
    {
      label: "Handler",
      value: endpointInfo.handler || "Onbekend",
      detail: endpointInfo.handler ? "Functie die de request verwerkt" : "Handler niet gevonden in brondata",
      tone: endpointInfo.handler ? "default" : "warning",
    },
    {
      label: "Call graph",
      value: `${callCount} ${callCount === 1 ? "call" : "calls"}`,
      detail: callCount > 0 ? "Afgeleid uit GitLab endpoint-analyse" : "Geen calls beschikbaar",
      tone: callCount > 0 ? "default" : "warning",
    },
    {
      label: "Koppelingen",
      value: `${incomingLinks.length} inkomend`,
      detail: incomingLinks.length > 0 ? "Webhook/link bewijs gevonden" : "Geen inkomende link bevestigd",
      tone: incomingLinks.length > 0 ? "success" : "warning",
    },
  ];
}

function buildSummary(
  automation: Automatisering,
  endpointInfo: EndpointInfo,
  destination: string,
  isLegacyFileRecord: boolean,
): string {
  if (isLegacyFileRecord) {
    return `Oude GitLab bestandsimport, geen specifiek endpoint gevonden. Dit record verwijst naar ${endpointInfo.file || automation.externalId || "een GitLab-bestand"} en toont alleen de beschikbare bestands- en procesmetadata.`;
  }

  const endpointLabel = formatEndpoint(endpointInfo);
  const handler = endpointInfo.handler ? ` De handler ${endpointInfo.handler} verwerkt deze request.` : "";
  const destinationText = destination === "HubSpot"
    ? "De bekende verwerking raakt vooral HubSpot-data."
    : `De bekende verwerking raakt vooral ${destination}.`;
  const purpose = cleanSentence(automation.doel) || "De backend voert de bekende proceslogica uit.";
  return `Deze GitLab backend automation ontvangt een backend request via ${endpointLabel}.${handler} ${purpose} ${destinationText}`;
}

function buildEvidenceBadges(
  endpointInfo: EndpointInfo,
  calls: GitLabCallInfo[],
  linkedAutomations: GitLabLinkedAutomation[],
  automation: Automatisering,
  meaning: GitLabAutomationMeaningPresentation,
): string[] {
  return [
    ...meaning.evidenceBadges,
    endpointInfo.endpoint ? "GitLab endpoint" : "GitLab bestand",
    endpointInfo.handler ? "Handler" : null,
    calls.length > 0 ? "Call graph" : null,
    linkedAutomations.some((link) => link.evidence === "Webhook-match") ? "Webhook-match" : null,
    automation.gitlabLastCommit ? "Commit" : null,
  ].filter((badge): badge is string => Boolean(badge)).filter((badge, index, badges) => badges.indexOf(badge) === index);
}

function buildDataflow(
  automation: Automatisering,
  endpointInfo: EndpointInfo,
  linkedAutomations: GitLabLinkedAutomation[],
  destination: string,
): GitLabDataflowNode[] {
  const incoming = linkedAutomations.find((link) => link.direction === "incoming");
  const callerName = incoming?.name ?? "Upstream caller";
  const callerSubtitle = incoming?.subtitle ?? "Webhook of workflow die dit endpoint kan aanroepen";

  return [
    {
      name: callerName,
      subtitle: callerSubtitle,
      role: "source",
      arrowLabel: incoming?.evidence ?? "request",
    },
    {
      name: "GitLab endpoint",
      subtitle: formatEndpoint(endpointInfo),
      role: "endpoint",
      arrowLabel: "handler",
    },
    {
      name: endpointInfo.handler || "Backend handler",
      subtitle: endpointInfo.file || "GitLab bronbestand",
      role: "handler",
      arrowLabel: "verwerking",
    },
    {
      name: destination,
      subtitle: destination === "HubSpot" ? "HubSpot read/write of backend response" : "Extern systeem of backend-uitkomst",
      role: "destination",
    },
  ];
}

function buildExecutionSteps(
  automation: Automatisering,
  trace: ReturnType<typeof getBackendAutomationTrace>,
  funnel: ReturnType<typeof buildAutomationFunnel>,
): GitLabExecutionStep[] {
  if (trace?.plainSteps.length) {
    return trace.plainSteps.slice(0, 8).map((step, index) => ({
      index: index + 1,
      title: step.title,
      description: step.description,
      technicalDetail: step.technical?.[0]?.code ?? step.code,
      kind: classifyStep(step.title, step.description),
    }));
  }

  if (funnel?.steps.length) {
    return funnel.steps.map((step, index) => ({
      index: index + 1,
      title: step.title,
      description: step.summary,
      technicalDetail: step.details[0],
      kind: step.kind === "start" ? "start" : step.kind === "write" ? "write" : step.kind === "read" ? "read" : "compute",
    }));
  }

  const steps = automation.stappen.length > 0 ? automation.stappen : ["Geen uitgewerkte backendstappen beschikbaar."];
  return steps.map((step, index) => ({
    index: index + 1,
    title: index === 0 ? "Backend stap" : `Backend stap ${index + 1}`,
    description: step,
    kind: index === 0 ? "start" : "compute",
  }));
}

function buildLocationMeta(automation: Automatisering, endpointInfo: EndpointInfo): Array<{ label: string; value: string }> {
  return [
    { label: "Bestand", value: endpointInfo.file || "Niet beschikbaar" },
    { label: "Endpoint", value: formatEndpoint(endpointInfo) },
    { label: "Handler", value: endpointInfo.handler || "Niet beschikbaar" },
    { label: "External ID", value: automation.externalId || "Niet beschikbaar" },
    { label: "Laatste commit", value: automation.gitlabLastCommit || "Niet beschikbaar" },
  ];
}

function buildSourceMeta(
  automation: Automatisering,
  linkedAutomations: GitLabLinkedAutomation[],
  options: GitLabDetailOptions,
): Array<{ label: string; value: string }> {
  return [
    { label: "Source", value: automation.source || "gitlab" },
    { label: "Import status", value: valueFromImportProposal(automation, "import_status") ?? "approved" },
    { label: "Raw proposal", value: automation.importProposal ? "Beschikbaar" : "Niet beschikbaar" },
    { label: "Links", value: String(linkedAutomations.length) },
    { label: "Suggesties", value: String((options.flowSuggesties ?? []).filter((suggestie) => suggestie.fromId === automation.id || suggestie.toId === automation.id).length) },
  ];
}

function buildIssues(
  automation: Automatisering,
  endpointInfo: EndpointInfo,
  calls: GitLabCallInfo[],
  linkedAutomations: GitLabLinkedAutomation[],
  isLegacyFileRecord: boolean,
  meaning: GitLabAutomationMeaningPresentation,
): GitLabIssue[] {
  const issues: GitLabIssue[] = [];

  if (isLegacyFileRecord) {
    issues.push({
      severity: "gap",
      title: "Geen specifiek endpoint",
      subtitle: "Dit is een oud GitLab bestandsrecord. Route en handler zijn niet apart bewezen.",
    });
  }

  if (!automation.owner) {
    issues.push({
      severity: "gap",
      title: "Geen owner bekend",
      subtitle: "Het portaal heeft geen eigenaar voor deze backend automation.",
    });
  }

  if (!automation.hubspotLastRunAt) {
    issues.push({
      severity: "info",
      title: "Runtime onbekend",
      subtitle: "Er zijn geen runtime/last-run metrics voor deze GitLab automation opgeslagen.",
    });
  }

  if (calls.length === 0) {
    issues.push({
      severity: "gap",
      title: "Call graph beperkt",
      subtitle: "De GitLab brondata bevat geen uitgewerkte call graph voor deze automation.",
    });
  }

  if (linkedAutomations.length === 0) {
    issues.push({
      severity: "info",
      title: "Geen inkomende koppeling",
      subtitle: "Er is nog geen upstream automation gekoppeld aan dit endpoint.",
    });
  }

  for (const finding of automation.sourceFindings ?? []) {
    issues.push({
      severity: finding.severity === "critical" ? "critical" : "gap",
      title: finding.message,
      subtitle: `Bronmelding: ${finding.type}`,
    });
  }

  for (const gap of meaning.gaps) {
    issues.push({
      severity: "gap",
      title: titleForMeaningGap(gap),
      subtitle: gap,
    });
  }

  if (issues.length === 0) {
    issues.push({
      severity: "ok",
      title: "Geen open gaps gevonden",
      subtitle: "De bekende GitLab brondata bevat geen open waarschuwingen voor deze automation.",
    });
  }

  return issues;
}

function buildLinkedAutomations(automation: Automatisering, options: GitLabDetailOptions): GitLabLinkedAutomation[] {
  const allAutomations = options.allAutomations ?? [];
  const linked: GitLabLinkedAutomation[] = [];

  for (const link of options.confirmedLinks ?? []) {
    if (link.targetId === automation.id) {
      const source = allAutomations.find((item) => item.id === link.sourceId);
      linked.push(toLinkedAutomation(link.sourceId, source, "Bevestigde link", "incoming"));
    }
    if (link.sourceId === automation.id) {
      const target = allAutomations.find((item) => item.id === link.targetId);
      linked.push(toLinkedAutomation(link.targetId, target, "Bevestigde link", "outgoing"));
    }
  }

  for (const suggestie of options.flowSuggesties ?? []) {
    if (suggestie.rejected) continue;
    const evidence = suggestie.zekerheid === "webhook" || /webhook/i.test(suggestie.redenering)
      ? "Webhook-match"
      : "AI-suggestie";
    if (suggestie.toId === automation.id) {
      const source = allAutomations.find((item) => item.id === suggestie.fromId);
      linked.push({
        id: suggestie.fromId,
        name: source?.naam || suggestie.fromNaam || suggestie.fromId,
        subtitle: suggestie.redenering || source?.trigger || "Gekoppelde automation",
        href: `/automations/${suggestie.fromId}`,
        evidence,
        direction: "incoming",
      });
    }
    if (suggestie.fromId === automation.id) {
      const target = allAutomations.find((item) => item.id === suggestie.toId);
      linked.push({
        id: suggestie.toId,
        name: target?.naam || suggestie.toNaam || suggestie.toId,
        subtitle: suggestie.redenering || target?.trigger || "Gekoppelde automation",
        href: `/automations/${suggestie.toId}`,
        evidence,
        direction: "outgoing",
      });
    }
  }

  for (const item of allAutomations) {
    if (item.id === automation.id) continue;
    for (const koppeling of item.koppelingen ?? []) {
      if (koppeling.doelId === automation.id) {
        linked.push(toLinkedAutomation(item.id, item, koppeling.label || "Handmatige koppeling", "incoming"));
      }
    }
  }

  for (const koppeling of automation.koppelingen ?? []) {
    const target = allAutomations.find((item) => item.id === koppeling.doelId);
    linked.push(toLinkedAutomation(koppeling.doelId, target, koppeling.label || "Handmatige koppeling", "outgoing"));
  }

  const seen = new Map<string, number>();
  const unique: GitLabLinkedAutomation[] = [];
  for (const link of linked) {
    const key = `${link.direction}:${link.id}`;
    const existingIndex = seen.get(key);
    if (existingIndex === undefined) {
      seen.set(key, unique.length);
      unique.push(link);
      continue;
    }

    const existing = unique[existingIndex];
    if (link.evidence === "Webhook-match" && existing.evidence !== "Webhook-match") {
      unique[existingIndex] = {
        ...existing,
        evidence: "Webhook-match",
        subtitle: link.subtitle || existing.subtitle,
      };
    }
  }
  return unique;
}

function toLinkedAutomation(
  id: string,
  automation: Automatisering | undefined,
  evidence: string,
  direction: "incoming" | "outgoing",
): GitLabLinkedAutomation {
  return {
    id,
    name: automation?.naam || id,
    subtitle: automation?.trigger || evidence,
    href: `/automations/${id}`,
    evidence,
    direction,
  };
}

function buildRawData(
  automation: Automatisering,
  linkedAutomations: GitLabLinkedAutomation[],
  options: GitLabDetailOptions,
  meaning: GitLabAutomationMeaningPresentation,
): unknown {
  return {
    automation: {
      id: automation.id,
      naam: automation.naam,
      categorie: automation.categorie,
      source: automation.source,
      status: automation.status,
      externalId: automation.externalId,
      endpoints: automation.endpoints ?? [],
      webhookPaths: automation.webhookPaths ?? [],
      gitlabFilePath: automation.gitlabFilePath,
      gitlabLastCommit: automation.gitlabLastCommit,
      lastSyncedAt: automation.lastSyncedAt,
    },
    gitlabEndpoint: automation.gitlabEndpoint ?? null,
    importProposal: automation.importProposal ?? null,
    sourceFindings: automation.sourceFindings ?? [],
    incomingLinks: linkedAutomations.filter((link) => link.direction === "incoming"),
    outgoingLinks: linkedAutomations.filter((link) => link.direction === "outgoing"),
    confirmedLinks: options.confirmedLinks ?? [],
    flowSuggesties: options.flowSuggesties ?? [],
    meaning,
  };
}

function titleForMeaningGap(gap: string): string {
  if (/Inputvelden/i.test(gap)) return "Inputvelden ontbreken";
  if (/read-operaties|Concrete read/i.test(gap)) return "Concrete read ontbreekt";
  if (/write/i.test(gap)) return "Concrete write ontbreekt";
  if (/Response|achtergrondtaak/i.test(gap)) return "Response/achtergrondtaak ontbreekt";
  if (/Analysekwaliteit/i.test(gap)) return "Analysekwaliteit laag";
  return "Bronbetekenis gap";
}

function getGitLabSourceUrl(automation: Automatisering): string | null {
  const proposal = automation.importProposal as Record<string, unknown> | undefined;
  const candidates = [
    proposal?.sourceUrl,
    proposal?.source_url,
    proposal?.webUrl,
    proposal?.web_url,
    (proposal?.gitlab as Record<string, unknown> | undefined)?.sourceUrl,
    (proposal?.gitlab as Record<string, unknown> | undefined)?.webUrl,
  ];
  const url = candidates.find((value): value is string => typeof value === "string" && /^https?:\/\//.test(value));
  return url ?? null;
}

function inferDestinationSystem(automation: Automatisering, calls: GitLabCallInfo[]): string {
  const explicit = automation.systemen.find((system) => !["GitLab", "HubSpot", "Backend", "API"].includes(system));
  if (explicit) return explicit;

  const callText = calls.map((call) => `${call.to} ${call.file ?? ""}`).join(" ").toLowerCase();
  if (callText.includes("clockify")) return "Clockify";
  if (callText.includes("wefact")) return "WeFact";
  if (callText.includes("typeform")) return "Typeform";
  if (callText.includes("hubspot")) return "HubSpot";
  return automation.systemen.find((system) => system !== "GitLab") ?? "Backend response";
}

function classifyStep(title: string, description: string): GitLabExecutionStep["kind"] {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes("gestart") || text.includes("start")) return "start";
  if (text.includes("handler") || text.includes("api")) return "handler";
  if (text.includes("leest") || text.includes("ophaal")) return "read";
  if (text.includes("schrijft") || text.includes("past") || text.includes("update")) return "write";
  if (text.includes("response") || text.includes("afgerond")) return "response";
  return "compute";
}

function formatEndpoint(endpointInfo: EndpointInfo): string {
  return [endpointInfo.method, endpointInfo.endpoint].filter(Boolean).join(" ") || endpointInfo.endpoint || "Endpoint niet beschikbaar";
}

function statusLabel(status: string): string {
  if (status === "Actief") return "Active";
  if (status === "Uitgeschakeld") return "Disabled";
  if (status === "Verouderd") return "Outdated";
  return status;
}

function inferMethodFromTrigger(trigger: string): string | undefined {
  return trigger.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/i)?.[1]?.toUpperCase();
}

function inferHandlerFromName(automation: Automatisering): string | undefined {
  return automation.externalId?.split("::").at(0)?.split("/").at(-1)?.replace(/\.py$/, "");
}

function readableKind(value: string): string {
  return value.replace(/_/g, " ");
}

function shortCommit(value: string): string {
  return value.length > 10 ? value.slice(0, 10) : value;
}

function cleanSentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function formatDateNl(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "onbekend";
  return date.toLocaleDateString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function valueFromImportProposal(automation: Automatisering, key: string): string | undefined {
  const proposal = automation.importProposal as Record<string, unknown> | undefined;
  const value = proposal?.[key];
  return typeof value === "string" ? value : undefined;
}
