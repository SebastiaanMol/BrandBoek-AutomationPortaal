import type { Automatisering } from "./types";
import {
  buildAutomationWebhookGraph,
  collectIncomingRoutes,
  normalizeWebhookRoute,
  selectPreferredIncomingRoutes,
  type AutomationRoute,
  type AutomationWebhookProof,
} from "./automationRouteGraph";

export interface ProcessJourneyTraceEdge {
  fromId: string;
  toId: string;
  sourcePath: string;
  targetPath: string;
  normalizedPath: string;
  isCycle: boolean;
}

export interface ProcessJourneyTrace {
  orderedNodeIds: string[];
  edges: ProcessJourneyTraceEdge[];
  branchNodeIds: string[];
  stopNodeIds: string[];
  cycleEdges: ProcessJourneyTraceEdge[];
}

interface ProcessJourneyTraceInput {
  automations: Automatisering[];
  seedIds?: string[];
  maxNodes?: number;
}

interface ProofEdgeDraft {
  fromId: string;
  toId: string;
  proof: AutomationWebhookProof;
}

export function buildProcessJourneyTrace({
  automations,
  seedIds = [],
  maxNodes,
}: ProcessJourneyTraceInput): ProcessJourneyTrace {
  const graph = buildWebhookProofGraph(automations);
  const automationIds = automations.map((automation) => automation.id);
  const traversalLimit = maxNodes ?? automationIds.length;
  const idSet = new Set(automationIds);
  const normalizedSeedIds = resolveLegacyGitLabSeedIds(seedIds, automations)
    .filter((id) => idSet.has(id));
  const startIds = determineStartIds(normalizedSeedIds, automationIds, graph);

  if (startIds.length === 0) {
    return emptyTrace(normalizedSeedIds);
  }

  return traverseGraph(startIds, graph, automationIds, traversalLimit);
}

export function buildProcessJourneyTraces(
  automations: Automatisering[],
  maxNodes = automations.length,
): ProcessJourneyTrace[] {
  const graph = buildWebhookProofGraph(automations);
  const automationIds = automations.map((automation) => automation.id);
  const idsWithEdges = new Set<string>();

  for (const edge of graph) {
    idsWithEdges.add(edge.fromId);
    idsWithEdges.add(edge.toId);
  }

  const roots = automationIds.filter(
    (id) => idsWithEdges.has(id) && !graph.some((edge) => edge.toId === id),
  );
  const fallbackCycleStarts = automationIds.filter(
    (id) => idsWithEdges.has(id) && !roots.includes(id),
  );
  const starts = [...roots, ...fallbackCycleStarts];
  const consumed = new Set<string>();
  const traces: ProcessJourneyTrace[] = [];

  for (const startId of starts) {
    if (consumed.has(startId)) continue;
    const trace = traverseGraph([startId], graph, automationIds, maxNodes);
    if (trace.edges.length === 0) continue;
    trace.orderedNodeIds.forEach((id) => consumed.add(id));
    traces.push(trace);
  }

  return traces;
}

function buildWebhookProofGraph(automations: Automatisering[]): ProofEdgeDraft[] {
  return buildAutomationWebhookGraph(automations);
}

function resolveLegacyGitLabSeedIds(seedIds: string[], automations: Automatisering[]): string[] {
  if (seedIds.length === 0) return [];

  const autoMap = new Map(automations.map((automation) => [automation.id, automation]));
  const preferredIncomingByPath = groupIncomingRoutesByPath(
    selectPreferredIncomingRoutes(automations.flatMap(collectIncomingRoutes)),
  );
  const resolved: string[] = [];

  for (const id of seedIds) {
    const automation = autoMap.get(id);
    if (!automation || !isLegacyGitLabFileAutomation(automation)) {
      resolved.push(id);
      continue;
    }

    const replacementIds = collectLegacyGitLabReferencePaths(automation).flatMap((normalizedPath) =>
      (preferredIncomingByPath.get(normalizedPath) ?? [])
        .filter((candidate) => candidate.automationId !== id)
        .map((candidate) => candidate.automationId),
    );

    resolved.push(...(replacementIds.length > 0 ? replacementIds : [id]));
  }

  return [...new Set(resolved)];
}

function groupIncomingRoutesByPath(routes: AutomationRoute[]): Map<string, AutomationRoute[]> {
  const grouped = new Map<string, AutomationRoute[]>();
  for (const route of routes) {
    const items = grouped.get(route.normalizedPath) ?? [];
    items.push(route);
    grouped.set(route.normalizedPath, items);
  }
  return grouped;
}

function collectLegacyGitLabReferencePaths(automation: Automatisering): string[] {
  const paths = [
    ...(automation.endpoints ?? []),
    extractEndpointPathFromExternalId(automation.externalId),
  ];

  return [...new Set(paths.map(normalizeWebhookRoute).filter(Boolean))];
}

function extractEndpointPathFromExternalId(externalId: string | undefined): string {
  if (!externalId?.includes("::")) return "";
  const possiblePath = externalId.split("::").at(-1)?.trim() ?? "";
  return possiblePath.startsWith("/") ? possiblePath : "";
}

function isLegacyGitLabFileAutomation(automation: Automatisering): boolean {
  return automation.source === "gitlab" && Boolean(automation.gitlabFilePath || automation.externalId) && !automation.gitlabEndpoint;
}

function determineStartIds(
  seedIds: string[],
  automationIds: string[],
  graph: ProofEdgeDraft[],
): string[] {
  if (seedIds.length === 0) return [];

  const componentIds = expandSeedComponent(seedIds, graph);
  const incoming = new Set(
    graph
      .filter((edge) => componentIds.has(edge.fromId) && componentIds.has(edge.toId))
      .map((edge) => edge.toId),
  );
  const roots = automationIds.filter((id) => componentIds.has(id) && !incoming.has(id));

  return roots.length > 0 ? roots : seedIds;
}

function expandSeedComponent(seedIds: string[], graph: ProofEdgeDraft[]): Set<string> {
  const included = new Set(seedIds);
  let changed = true;

  while (changed) {
    changed = false;
    for (const edge of graph) {
      const touches = included.has(edge.fromId) || included.has(edge.toId);
      if (!touches) continue;
      if (!included.has(edge.fromId)) {
        included.add(edge.fromId);
        changed = true;
      }
      if (!included.has(edge.toId)) {
        included.add(edge.toId);
        changed = true;
      }
    }
  }

  return included;
}

function traverseGraph(
  startIds: string[],
  graph: ProofEdgeDraft[],
  automationIds: string[],
  maxNodes: number,
): ProcessJourneyTrace {
  const visited = new Set<string>();
  const orderedNodeIds: string[] = [];
  const edges: ProcessJourneyTraceEdge[] = [];
  const cycleEdges: ProcessJourneyTraceEdge[] = [];
  const edgeKeys = new Set<string>();
  const outgoingById = groupOutgoingEdges(graph, automationIds);
  const stack: string[] = [];

  function visit(id: string): void {
    if (!visited.has(id)) {
      if (orderedNodeIds.length >= maxNodes) return;
      visited.add(id);
      orderedNodeIds.push(id);
    }

    stack.push(id);
    for (const draft of outgoingById.get(id) ?? []) {
      const isCycle = stack.includes(draft.toId);
      const edge = toTraceEdge(draft, isCycle);
      const key = `${edge.fromId}->${edge.toId}:${edge.normalizedPath}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push(edge);
        if (isCycle) cycleEdges.push(edge);
      }
      if (!isCycle && !visited.has(draft.toId)) {
        visit(draft.toId);
      }
    }
    stack.pop();
  }

  for (const startId of startIds) {
    visit(startId);
  }

  const branchNodeIds = orderedNodeIds.filter((id) => (outgoingById.get(id)?.length ?? 0) > 1);
  const stopNodeIds = orderedNodeIds.filter((id) => (outgoingById.get(id)?.length ?? 0) === 0);

  return {
    orderedNodeIds,
    edges,
    branchNodeIds,
    stopNodeIds,
    cycleEdges,
  };
}

function groupOutgoingEdges(
  graph: ProofEdgeDraft[],
  automationIds: string[],
): Map<string, ProofEdgeDraft[]> {
  const order = new Map(automationIds.map((id, index) => [id, index]));
  const grouped = new Map<string, ProofEdgeDraft[]>();

  for (const edge of graph) {
    if (!grouped.has(edge.fromId)) grouped.set(edge.fromId, []);
    grouped.get(edge.fromId)!.push(edge);
  }

  for (const edges of grouped.values()) {
    edges.sort((left, right) => (order.get(left.toId) ?? 0) - (order.get(right.toId) ?? 0));
  }

  return grouped;
}

function toTraceEdge(edge: ProofEdgeDraft, isCycle: boolean): ProcessJourneyTraceEdge {
  return {
    fromId: edge.fromId,
    toId: edge.toId,
    sourcePath: edge.proof.sourcePath,
    targetPath: edge.proof.targetPath,
    normalizedPath: edge.proof.normalizedPath,
    isCycle,
  };
}

function emptyTrace(seedIds: string[]): ProcessJourneyTrace {
  return {
    orderedNodeIds: seedIds,
    edges: [],
    branchNodeIds: [],
    stopNodeIds: seedIds,
    cycleEdges: [],
  };
}
