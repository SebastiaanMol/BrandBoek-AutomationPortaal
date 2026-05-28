import type { FlowSuggestie } from "./storage/automationLinks";

export interface ConceptJourney {
  id: string;
  title: string;
  description: string;
  startSignal: string;
  hubspotAutomation: string;
  gitlabWorker: string;
  endpoint: string;
  sourceSystem: string;
  confidenceLabel: string;
  confidenceTone: "strong" | "inferred";
  automationIds: string[];
  href: string;
  evidenceLabel: string;
  structureSummary: string;
}

export function buildConceptJourneys(suggesties: FlowSuggestie[]): ConceptJourney[] {
  const outgoingGitLabLinks = new Map<string, FlowSuggestie[]>();
  for (const suggestie of suggesties) {
    if (suggestie.fromSource === "gitlab" && suggestie.toSource === "gitlab") {
      const links = outgoingGitLabLinks.get(suggestie.fromId) ?? [];
      links.push(suggestie);
      outgoingGitLabLinks.set(suggestie.fromId, links);
    }
  }

  for (const links of outgoingGitLabLinks.values()) {
    links.sort(compareSuggestionStrength);
  }

  const journeys: ConceptJourney[] = [];
  const seen = new Set<string>();
  const startSuggestions = collapseSuggestionsByStartAndEndpoint(
    suggesties.filter((suggestie) =>
      suggestie.zekerheid === "webhook" &&
      isSupportedStartSource(suggestie.fromSource) &&
      suggestie.toSource === "gitlab",
    ),
  );

  for (const startSuggestion of startSuggestions) {
    const chain = buildBackendChain(startSuggestion, outgoingGitLabLinks);
    const nodes = buildNodesFromChain(chain);
    const startNode = nodes[0];
    const gitlabNodes = nodes.filter((node) => node.source === "gitlab");
    const last = nodes[nodes.length - 1];
    const key = nodes.map((node) => node.id).join("__");
    if (seen.has(key)) continue;
    seen.add(key);

    const gitlabWorker = buildGitLabWorkerLabel(gitlabNodes, last?.naam);
    const endpoint = buildEndpointSummary(chain);
    const webhookCount = chain.length;
    const endpointText = endpoint ? ` via ${endpoint}` : "";
    const sourceSystem = sourceSystemLabel(startNode?.source ?? null);

    journeys.push({
      id: key,
      title: `${startNode?.naam || "Startsignaal"} -> ${gitlabWorker}`,
      description: [
        `Wanneer "${startNode?.naam || "dit signaal"}" start, roept ${sourceSystem} een backend automation aan${endpointText}.`,
        gitlabNodes.length > 1
          ? `Binnen het GitLab backendblok werken ${gitlabNodes.length} automations samen.`
          : `"${gitlabWorker}" verwerkt daarna deze processtap.`,
        "De uitkomst kan HubSpot-status wijzigen; daarna kan een volgende procesreis starten.",
      ].join(" "),
      startSignal: inferStartSignal(startNode?.naam ?? ""),
      hubspotAutomation: startNode?.naam || `${sourceSystem} automation`,
      gitlabWorker,
      endpoint,
      sourceSystem,
      confidenceLabel: buildConfidenceLabel(webhookCount),
      confidenceTone: "strong",
      automationIds: nodes.map((node) => node.id),
      href: `/flows/suggesties/${encodeURIComponent(key)}`,
      evidenceLabel: "100% webhook-match",
      structureSummary: buildStructureSummary(buildChainStructureSummary(chain), gitlabNodes.length, endpoint),
    });
  }

  return journeys
    .sort((a, b) => {
      const sourceDelta = a.hubspotAutomation.localeCompare(b.hubspotAutomation, "nl");
      if (sourceDelta !== 0) return sourceDelta;
      return a.gitlabWorker.localeCompare(b.gitlabWorker, "nl");
    });
}

function isSupportedStartSource(source: string | null): boolean {
  return source === "hubspot" || source === "zapier" || source === "typeform";
}

function buildBackendChain(
  startSuggestion: FlowSuggestie,
  outgoingGitLabLinks: Map<string, FlowSuggestie[]>,
): FlowSuggestie[] {
  void outgoingGitLabLinks;
  return [startSuggestion];
}

function buildNodesFromChain(chain: FlowSuggestie[]): Array<{ id: string; naam: string; source: string | null }> {
  const nodes: Array<{ id: string; naam: string; source: string | null }> = [];
  for (const suggestion of chain) {
    if (!nodes.some((node) => node.id === suggestion.fromId)) {
      nodes.push({ id: suggestion.fromId, naam: suggestion.fromNaam, source: suggestion.fromSource });
    }
    if (!nodes.some((node) => node.id === suggestion.toId)) {
      nodes.push({ id: suggestion.toId, naam: suggestion.toNaam, source: suggestion.toSource });
    }
  }
  return nodes;
}

function collapseSuggestionsByStartAndEndpoint(suggesties: FlowSuggestie[]): FlowSuggestie[] {
  const byStartAndEndpoint = new Map<string, FlowSuggestie>();

  for (const suggestie of suggesties) {
    const key = `${suggestie.fromId}::${suggestie.redenering || suggestie.toId}`;
    const current = byStartAndEndpoint.get(key);
    if (!current || compareSuggestionStrength(suggestie, current) < 0) {
      byStartAndEndpoint.set(key, suggestie);
    }
  }

  return [...byStartAndEndpoint.values()];
}

function compareSuggestionStrength(a: FlowSuggestie, b: FlowSuggestie): number {
  if (a.zekerheid !== b.zekerheid) return a.zekerheid === "webhook" ? -1 : 1;
  const aSpecific = hasEndpointInName(a) ? 1 : 0;
  const bSpecific = hasEndpointInName(b) ? 1 : 0;
  if (aSpecific !== bSpecific) return bSpecific - aSpecific;
  return b.toNaam.length - a.toNaam.length;
}

function hasEndpointInName(suggestie: FlowSuggestie): boolean {
  const endpoint = extractEndpointFromReason(suggestie.redenering);
  return (
    /\b(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(suggestie.toNaam) ||
    (endpoint.length > 0 && suggestie.toNaam.includes(endpoint))
  );
}

function buildChainStructureSummary(chain: FlowSuggestie[]): string {
  const startSystem = sourceSystemLabel(chain[0]?.fromSource ?? null);
  return chain.length === 1
    ? `Deze kandidaat is een directe ${startSystem} naar GitLab backendstap.`
    : `Deze kandidaat bevat ${chain.length} directe backend-overgangen.`;
}

function buildGitLabWorkerLabel(
  gitlabNodes: Array<{ naam: string }>,
  fallbackName?: string,
): string {
  if (gitlabNodes.length > 1) return `${gitlabNodes.length} GitLab automations in backendblok`;
  if (gitlabNodes.length === 1) return cleanWorkerName(gitlabNodes[0].naam);
  return cleanWorkerName(fallbackName ?? "");
}

function buildEndpointSummary(suggesties: FlowSuggestie[]): string {
  const endpoints = [
    ...new Set(
      suggesties
        .filter((suggestie) => suggestie.zekerheid === "webhook")
        .map((suggestie) => extractEndpointFromReason(suggestie.redenering))
        .filter(Boolean),
    ),
  ];

  if (endpoints.length === 0) return "";
  if (endpoints.length === 1) return endpoints[0];
  return `${endpoints[0]} +${endpoints.length - 1} extra endpoints`;
}

function buildConfidenceLabel(webhookCount: number): string {
  return webhookCount === 1 ? "100% webhook" : `${webhookCount}x 100% webhook`;
}

function buildStructureSummary(baseSummary: string, gitlabCount: number, endpoint: string): string {
  if (gitlabCount > 1) {
    return [
      `Deze conceptprocesreis bevat ${gitlabCount} GitLab automations binnen hetzelfde backendblok.`,
      endpoint ? `Startsignaal en backend zijn gekoppeld via ${endpoint}.` : "",
      baseSummary,
    ].filter(Boolean).join(" ");
  }

  return endpoint
    ? `Startsignaal en endpoint zijn direct gekoppeld via ${endpoint}.`
    : baseSummary;
}

function inferStartSignal(name: string): string {
  const cleaned = name
    .replace(/\s+instellen$/i, "")
    .replace(/\s+workflow$/i, "")
    .replace(/^['"]|['"]$/g, "")
    .trim();

  return cleaned || "HubSpot wijziging";
}

function sourceSystemLabel(source: string | null): string {
  if (source === "zapier") return "Zapier";
  if (source === "hubspot") return "HubSpot";
  if (source === "gitlab") return "GitLab";
  if (source === "typeform") return "Typeform";
  return "De bronautomation";
}

function extractEndpointFromReason(reason: string): string {
  const trimmed = reason.trim();
  const match = trimmed.match(/(?:GET|POST|PUT|PATCH|DELETE)?\s*(\/[^\s.]+)(?=[\s.]|$)/i);
  return match?.[1]?.replace(/[.,;:]$/, "") ?? trimmed;
}

function cleanWorkerName(name: string): string {
  const withoutMethod = name.replace(/\s+\((GET|POST|PUT|PATCH|DELETE)\s+\/.*\)$/i, "");
  return withoutMethod || "Backend worker";
}
