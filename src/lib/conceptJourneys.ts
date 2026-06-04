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
  nodes: Array<{ id: string; naam: string; source: string | null }>;
  href: string;
  evidenceLabel: string;
  structureSummary: string;
  automationCount: number;
  transitionCount: number;
  parallelStartNodeIds?: string[];
  transitions: Array<{ fromId: string; toId: string }>;
}

export function buildConceptJourneys(suggesties: FlowSuggestie[]): ConceptJourney[] {
  const webhookSuggestions = preferSpecificEndpointSuggestions(
    suggesties.filter((suggestie) => suggestie.zekerheid === "webhook" && !suggestie.rejected),
  );
  const components = buildWebhookComponents(webhookSuggestions);
  const journeys: ConceptJourney[] = [];
  const seen = new Set<string>();

  for (const component of components) {
    const startGroups = buildStartGroups(component);
    for (const startGroup of startGroups) {
      const traversal = buildGraphComponent(component.suggestions, component.firstSeen, startGroup);
      const journey = buildConceptJourneyFromGraph(traversal);
      if (!journey || seen.has(journey.id)) continue;
      seen.add(journey.id);
      journeys.push(journey);
    }
  }

  return journeys.sort((a, b) => {
      const sourceDelta = a.hubspotAutomation.localeCompare(b.hubspotAutomation, "nl");
      if (sourceDelta !== 0) return sourceDelta;
      return a.gitlabWorker.localeCompare(b.gitlabWorker, "nl");
    });
}

function preferSpecificEndpointSuggestions(suggestions: FlowSuggestie[]): FlowSuggestie[] {
  const grouped = new Map<string, FlowSuggestie[]>();

  for (const suggestion of suggestions) {
    const endpoint = extractEndpointFromReason(suggestion.redenering);
    const key = endpoint ? `${suggestion.fromId}:${endpoint}` : `${suggestion.fromId}:${suggestion.toId}`;
    const items = grouped.get(key) ?? [];
    items.push(suggestion);
    grouped.set(key, items);
  }

  return [...grouped.values()].flatMap((items) => {
    if (items.length <= 1) return items;
    const maxScore = Math.max(...items.map(scoreSuggestionTarget));
    return items.filter((item) => scoreSuggestionTarget(item) === maxScore);
  });
}

function buildStartGroups(component: ConceptGraphComponent): string[][] {
  const roots = component.roots.length > 0 ? component.roots : component.nodes.slice(0, 1);
  const rootIds = new Set(roots.map((root) => root.id));
  const fanInByTargetAndEndpoint = new Map<string, Set<string>>();
  const firstSeen = component.firstSeen;

  for (const suggestion of component.suggestions) {
    if (!rootIds.has(suggestion.fromId)) continue;
    const endpoint = extractEndpointFromReason(suggestion.redenering);
    if (!endpoint) continue;
    const key = `${suggestion.toId}:${endpoint}`;
    const sourceIds = fanInByTargetAndEndpoint.get(key) ?? new Set<string>();
    sourceIds.add(suggestion.fromId);
    fanInByTargetAndEndpoint.set(key, sourceIds);
  }

  const groups: string[][] = [];
  const groupedRoots = new Set<string>();

  for (const sourceIds of fanInByTargetAndEndpoint.values()) {
    if (sourceIds.size < 2) continue;
    const group = [...sourceIds].sort((a, b) => (firstSeen.get(a) ?? 0) - (firstSeen.get(b) ?? 0));
    groups.push(group);
    group.forEach((id) => groupedRoots.add(id));
  }

  for (const root of roots) {
    if (!groupedRoots.has(root.id)) groups.push([root.id]);
  }

  return groups.length > 0 ? groups : roots.map((root) => [root.id]);
}

function scoreSuggestionTarget(suggestion: FlowSuggestie): number {
  return activeRank(suggestion.toStatus) * 1000
    + (hasEndpointInName(suggestion) ? 100 : 0)
    + (suggestion.toId.startsWith("AUTO-GL-") ? 50 : 0)
    + (suggestion.toSource === "gitlab" ? 10 : 0);
}

function activeRank(status: string | null | undefined): number {
  if (status === "Actief" || status?.toLowerCase() === "active") return 2;
  if (status === "Uitgeschakeld" || status?.toLowerCase() === "disabled") return 0;
  return 1;
}

interface ConceptGraphComponent {
  suggestions: FlowSuggestie[];
  nodes: Array<{ id: string; naam: string; source: string | null }>;
  transitions: FlowSuggestie[];
  roots: Array<{ id: string; naam: string; source: string | null }>;
  terminals: Array<{ id: string; naam: string; source: string | null }>;
  hasCycle: boolean;
  firstSeen: Map<string, number>;
}

function buildWebhookComponents(suggestions: FlowSuggestie[]): ConceptGraphComponent[] {
  if (suggestions.length === 0) return [];

  const parent = new Map<string, string>();
  const firstSeen = new Map<string, number>();

  function ensure(id: string, index: number): void {
    if (!parent.has(id)) parent.set(id, id);
    if (!firstSeen.has(id)) firstSeen.set(id, index);
  }

  function find(id: string): string {
    const current = parent.get(id) ?? id;
    if (current === id) return current;
    const root = find(current);
    parent.set(id, root);
    return root;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  }

  suggestions.forEach((suggestion, index) => {
    ensure(suggestion.fromId, index);
    ensure(suggestion.toId, index);
    union(suggestion.fromId, suggestion.toId);
  });

  const byRoot = new Map<string, FlowSuggestie[]>();
  for (const suggestion of suggestions) {
    const root = find(suggestion.fromId);
    const group = byRoot.get(root) ?? [];
    group.push(suggestion);
    byRoot.set(root, group);
  }

  return [...byRoot.values()].map((componentSuggestions) =>
    buildGraphComponent(componentSuggestions, firstSeen),
  );
}

function buildGraphComponent(
  suggestions: FlowSuggestie[],
  firstSeen: Map<string, number>,
  forcedRootIds?: string[],
): ConceptGraphComponent {
  const nodeMap = new Map<string, { id: string; naam: string; source: string | null }>();
  const outgoing = new Map<string, FlowSuggestie[]>();
  const indegree = new Map<string, number>();
  const outdegree = new Map<string, number>();
  const edgeOrder = new Map<FlowSuggestie, number>();

  suggestions.forEach((suggestion, index) => {
    edgeOrder.set(suggestion, index);
    if (!nodeMap.has(suggestion.fromId)) {
      nodeMap.set(suggestion.fromId, { id: suggestion.fromId, naam: suggestion.fromNaam, source: suggestion.fromSource });
    }
    if (!nodeMap.has(suggestion.toId)) {
      nodeMap.set(suggestion.toId, { id: suggestion.toId, naam: suggestion.toNaam, source: suggestion.toSource });
    }
    if (!outgoing.has(suggestion.fromId)) outgoing.set(suggestion.fromId, []);
    outgoing.get(suggestion.fromId)!.push(suggestion);
    indegree.set(suggestion.toId, (indegree.get(suggestion.toId) ?? 0) + 1);
    outdegree.set(suggestion.fromId, (outdegree.get(suggestion.fromId) ?? 0) + 1);
    indegree.set(suggestion.fromId, indegree.get(suggestion.fromId) ?? 0);
    outdegree.set(suggestion.toId, outdegree.get(suggestion.toId) ?? 0);
  });

  for (const edges of outgoing.values()) {
    edges.sort((a, b) => compareGraphEdges(a, b, edgeOrder));
  }

  const roots = [...nodeMap.values()]
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort((a, b) => (firstSeen.get(a.id) ?? 0) - (firstSeen.get(b.id) ?? 0));
  const forcedRoots = (forcedRootIds ?? [])
    .map((id) => nodeMap.get(id))
    .filter((node): node is { id: string; naam: string; source: string | null } => Boolean(node));
  const startNodes = forcedRoots.length > 0
    ? forcedRoots
    : roots.length > 0
      ? roots
      : [...nodeMap.values()].sort((a, b) => (firstSeen.get(a.id) ?? 0) - (firstSeen.get(b.id) ?? 0)).slice(0, 1);

  const visitedNodes = new Set<string>();
  const stack = new Set<string>();
  const orderedNodes: Array<{ id: string; naam: string; source: string | null }> = [];
  const orderedTransitions: FlowSuggestie[] = [];
  const seenEdges = new Set<string>();
  let hasCycle = false;

  function visit(id: string): void {
    if (!visitedNodes.has(id)) {
      visitedNodes.add(id);
      const node = nodeMap.get(id);
      if (node) orderedNodes.push(node);
    }

    stack.add(id);
    for (const edge of outgoing.get(id) ?? []) {
      const key = `${edge.fromId}->${edge.toId}:${edge.redenering}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        orderedTransitions.push(edge);
      }
      if (stack.has(edge.toId)) {
        hasCycle = true;
        continue;
      }
      if (!visitedNodes.has(edge.toId)) visit(edge.toId);
    }
    stack.delete(id);
  }

  if (forcedRoots.length > 1) {
    for (const root of forcedRoots) {
      if (visitedNodes.has(root.id)) continue;
      visitedNodes.add(root.id);
      orderedNodes.push(root);
    }
  }

  for (const root of startNodes) visit(root.id);
  if (!forcedRootIds?.length) {
    for (const node of [...nodeMap.values()].sort((a, b) => (firstSeen.get(a.id) ?? 0) - (firstSeen.get(b.id) ?? 0))) {
      if (!visitedNodes.has(node.id)) visit(node.id);
    }
  }

  const orderedNodeIdSet = new Set(orderedNodes.map((node) => node.id));
  const terminals = orderedNodes
    .filter((node) => (outgoing.get(node.id) ?? []).every((edge) => !orderedNodeIdSet.has(edge.toId)))
    .sort((a, b) => (firstSeen.get(a.id) ?? 0) - (firstSeen.get(b.id) ?? 0));

  return {
    suggestions,
    nodes: orderedNodes,
    transitions: orderedTransitions,
    roots: startNodes,
    terminals,
    hasCycle,
    firstSeen,
  };
}

function compareGraphEdges(
  a: FlowSuggestie,
  b: FlowSuggestie,
  edgeOrder: Map<FlowSuggestie, number>,
): number {
  const aSpecific = hasEndpointInName(a) ? 1 : 0;
  const bSpecific = hasEndpointInName(b) ? 1 : 0;
  if (aSpecific !== bSpecific) return bSpecific - aSpecific;
  return (edgeOrder.get(a) ?? 0) - (edgeOrder.get(b) ?? 0);
}

function hasEndpointInName(suggestie: FlowSuggestie): boolean {
  const endpoint = extractEndpointFromReason(suggestie.redenering);
  return (
    /\b(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(suggestie.toNaam) ||
    (endpoint.length > 0 && suggestie.toNaam.includes(endpoint))
  );
}

function buildConceptJourneyFromGraph(component: ConceptGraphComponent): ConceptJourney | null {
  if (component.nodes.length < 2 || component.transitions.length === 0) return null;

  const key = component.nodes.map((node) => node.id).join("__");
  const startNode = component.roots[0] ?? component.nodes[0];
  const parallelStart = getParallelStartSummary(component);
  const terminalNodes = component.terminals.length > 0 ? component.terminals : [component.nodes[component.nodes.length - 1]];
  const lastNode = terminalNodes[terminalNodes.length - 1] ?? component.nodes[component.nodes.length - 1];
  const endpoint = buildEndpointSummary(component.transitions);
  const sourceSystem = parallelStart
    ? sourceSystemLabelForNodes(parallelStart.sources)
    : sourceSystemLabel(startNode?.source ?? null);
  const endLabel = terminalNodes.length > 1
    ? `${terminalNodes.length} bewezen vervolgen`
    : cleanWorkerName(lastNode?.naam ?? "Vervolgautomation");

  return {
    id: key,
    title: parallelStart
      ? `${parallelStart.sources.length} parallelle starters -> ${cleanWorkerName(parallelStart.target.naam)}`
      : `${startNode?.naam || "Startsignaal"} -> ${endLabel}`,
    description: buildGraphDescription(component, startNode, terminalNodes, endpoint, parallelStart),
    startSignal: parallelStart
      ? `${parallelStart.sources.length} parallelle startsignalen`
      : inferStartSignal(startNode?.naam ?? ""),
    hubspotAutomation: parallelStart
      ? `${parallelStart.sources.length} parallelle starters`
      : startNode?.naam || `${sourceSystem} automation`,
    gitlabWorker: endLabel,
    endpoint,
    sourceSystem,
    confidenceLabel: buildConfidenceLabel(component.transitions.length),
    confidenceTone: "strong",
    automationIds: component.nodes.map((node) => node.id),
    nodes: component.nodes,
    href: `/flows/suggesties/${encodeURIComponent(key)}`,
    evidenceLabel: "100% webhook-match",
    structureSummary: buildGraphStructureSummary(component),
    automationCount: component.nodes.length,
    transitionCount: component.transitions.length,
    parallelStartNodeIds: parallelStart?.sources.map((node) => node.id),
    transitions: component.transitions.map((suggestion) => ({
      fromId: suggestion.fromId,
      toId: suggestion.toId,
    })),
  };
}

function buildGraphDescription(
  component: ConceptGraphComponent,
  startNode: { naam: string; source: string | null } | undefined,
  terminalNodes: Array<{ naam: string; source: string | null }>,
  endpoint: string,
  parallelStart?: ParallelStartSummary | null,
): string {
  const sourceLabels = [
    ...new Set(component.nodes.map((node) => sourceSystemLabel(node.source)).filter(Boolean)),
  ];
  const endpointText = endpoint ? ` De eerste technische route is ${endpoint}.` : "";
  const endText = terminalNodes.length > 1
    ? `De keten vertakt naar ${terminalNodes.length} bewezen vervolgen.`
    : `De keten eindigt voorlopig bij "${cleanWorkerName(terminalNodes[0]?.naam ?? "de laatste automation")}".`;
  const startText = parallelStart
    ? `Wanneer een van de ${parallelStart.sources.length} parallelle starters begint, komen ze samen bij "${cleanWorkerName(parallelStart.target.naam)}" via dezelfde exacte webhook-route.`
    : `Wanneer "${startNode?.naam || "dit startsignaal"}" start, volgt het portaal ${component.nodes.length} automations via ${component.transitions.length} exacte webhook-overdracht${component.transitions.length === 1 ? "" : "en"}.`;

  return [
    startText,
    `De betrokken bronnen zijn ${sourceLabels.join(", ")}.${endpointText}`,
    endText,
    component.hasCycle ? "Er is een cycle gevonden; de traversal stopt zodra een automation opnieuw geraakt wordt." : "",
  ].filter(Boolean).join(" ");
}

interface ParallelStartSummary {
  sources: Array<{ id: string; naam: string; source: string | null }>;
  target: { id: string; naam: string; source: string | null };
  endpoint: string;
}

function getParallelStartSummary(component: ConceptGraphComponent): ParallelStartSummary | null {
  if (component.roots.length < 2) return null;

  const rootIds = new Set(component.roots.map((root) => root.id));
  const byTargetAndEndpoint = new Map<string, FlowSuggestie[]>();

  for (const transition of component.transitions) {
    if (!rootIds.has(transition.fromId)) continue;
    const endpoint = extractEndpointFromReason(transition.redenering);
    if (!endpoint) continue;
    const key = `${transition.toId}:${endpoint}`;
    const group = byTargetAndEndpoint.get(key) ?? [];
    group.push(transition);
    byTargetAndEndpoint.set(key, group);
  }

  const fanIn = [...byTargetAndEndpoint.entries()].find(([, transitions]) => transitions.length > 1);
  if (!fanIn) return null;

  const [key, transitions] = fanIn;
  const [targetId, endpoint] = key.split(":");
  const sourceIds = new Set(transitions.map((transition) => transition.fromId));
  const target = component.nodes.find((node) => node.id === targetId);
  const sources = component.roots.filter((root) => sourceIds.has(root.id));

  if (!target || sources.length < 2) return null;

  return {
    sources,
    target,
    endpoint,
  };
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

function buildGraphStructureSummary(component: ConceptGraphComponent): string {
  const outdegree = new Map<string, number>();
  const indegree = new Map<string, number>();

  for (const transition of component.transitions) {
    outdegree.set(transition.fromId, (outdegree.get(transition.fromId) ?? 0) + 1);
    indegree.set(transition.toId, (indegree.get(transition.toId) ?? 0) + 1);
  }

  const branch = component.nodes.find((node) => (outdegree.get(node.id) ?? 0) > 1);
  if (branch) {
    return `${branch.naam || "Een automation"} stuurt naar ${outdegree.get(branch.id)} automations via exacte webhook-routes.`;
  }

  const merge = component.nodes.find((node) => (indegree.get(node.id) ?? 0) > 1);
  if (merge) {
    return `${indegree.get(merge.id)} automations komen parallel samen bij ${cleanWorkerName(merge.naam || "dezelfde automation")}.`;
  }

  if (component.hasCycle) {
    return "Deze kandidaat bevat een cycle; elke automation wordt maar een keer als node opgenomen.";
  }

  return component.transitions.length === 1
    ? "Deze kandidaat is een directe webhook-overdracht tussen twee automations."
    : `Deze kandidaat bevat ${component.transitions.length} opeenvolgende webhook-overdrachten.`;
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

function sourceSystemLabelForNodes(nodes: Array<{ source: string | null }>): string {
  const sources = [...new Set(nodes.map((node) => node.source).filter(Boolean))];
  return sources.length === 1 ? sourceSystemLabel(sources[0] ?? null) : "Meerdere bronnen";
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
