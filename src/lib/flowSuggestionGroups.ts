import type { FlowSuggestie } from "@/lib/storage/automationLinks";

export interface FlowSuggestionGroup {
  id: string;
  suggestions: FlowSuggestie[];
  nodes: Array<{
    id: string;
    naam: string;
    categorie: string;
  }>;
  webhookCount: number;
  aiCount: number;
  confirmedCount: number;
  totalCount: number;
}

function orderNodes(
  nodeIds: Set<string>,
  suggestions: FlowSuggestie[],
  nodeMap: Map<string, { naam: string; categorie: string }>,
): Array<{ id: string; naam: string; categorie: string }> {
  const ids = [...nodeIds];
  const indegree = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));

  for (const suggestion of suggestions) {
    if (!nodeIds.has(suggestion.fromId) || !nodeIds.has(suggestion.toId)) continue;
    outgoing.get(suggestion.fromId)?.push(suggestion.toId);
    indegree.set(suggestion.toId, (indegree.get(suggestion.toId) ?? 0) + 1);
  }

  for (const targets of outgoing.values()) {
    targets.sort((a, b) => compareNodeIds(a, b, nodeMap));
  }

  const queue = ids
    .filter((id) => (indegree.get(id) ?? 0) === 0)
    .sort((a, b) => compareNodeIds(a, b, nodeMap));
  const ordered: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const target of outgoing.get(id) ?? []) {
      const nextIndegree = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, nextIndegree);
      if (nextIndegree === 0) queue.push(target);
    }
    queue.sort((a, b) => compareNodeIds(a, b, nodeMap));
  }

  const orderedIds = ordered.length === ids.length ? ordered : ids;
  return orderedIds.map((id) => ({
    id,
    naam: nodeMap.get(id)?.naam ?? "",
    categorie: nodeMap.get(id)?.categorie ?? "",
  }));
}

function compareNodeIds(
  a: string,
  b: string,
  nodeMap: Map<string, { naam: string; categorie: string }>,
): number {
  const nameDelta = (nodeMap.get(a)?.naam ?? a).localeCompare(nodeMap.get(b)?.naam ?? b, "nl");
  return nameDelta !== 0 ? nameDelta : a.localeCompare(b, "nl");
}

function compareGroups(a: FlowSuggestionGroup, b: FlowSuggestionGroup): number {
  const aFirst = a.nodes[0];
  const bFirst = b.nodes[0];
  const firstNameDelta = (aFirst?.naam ?? "").localeCompare(bFirst?.naam ?? "", "nl");
  if (firstNameDelta !== 0) return firstNameDelta;
  const firstIdDelta = (aFirst?.id ?? "").localeCompare(bFirst?.id ?? "", "nl");
  if (firstIdDelta !== 0) return firstIdDelta;
  return a.id.localeCompare(b.id, "nl");
}

/**
 * Groups FlowSuggestie items into connected components using union-find.
 * Each group represents a cluster of automations that are all interconnected
 * through flow suggestions.
 */
export function groupFlowSuggesties(suggestions: FlowSuggestie[]): FlowSuggestionGroup[] {
  if (suggestions.length === 0) return [];

  // Collect all unique node IDs
  const nodeSet = new Set<string>();
  for (const s of suggestions) {
    nodeSet.add(s.fromId);
    nodeSet.add(s.toId);
  }

  // Union-find to group connected suggestions
  const parent: Record<string, string> = {};
  for (const id of nodeSet) {
    parent[id] = id;
  }

  function find(x: string): string {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  // Union all nodes connected by suggestions
  for (const s of suggestions) {
    union(s.fromId, s.toId);
  }

  // Group suggestions by their component root
  const componentMap: Record<string, FlowSuggestie[]> = {};
  for (const s of suggestions) {
    const root = find(s.fromId);
    if (!componentMap[root]) componentMap[root] = [];
    componentMap[root].push(s);
  }

  // Build result groups
  const groups: FlowSuggestionGroup[] = [];

  for (const [root, componentSuggestions] of Object.entries(componentMap)) {
    // Collect unique nodes in this component
    const nodesSet = new Set<string>();
    for (const s of componentSuggestions) {
      nodesSet.add(s.fromId);
      nodesSet.add(s.toId);
    }

    // Create node details (map with names/categories)
    const nodeMap = new Map<string, { naam: string; categorie: string }>();
    for (const s of componentSuggestions) {
      if (!nodeMap.has(s.fromId)) {
        nodeMap.set(s.fromId, { naam: s.fromNaam, categorie: s.fromCategorie });
      }
      if (!nodeMap.has(s.toId)) {
        nodeMap.set(s.toId, { naam: s.toNaam, categorie: s.toCategorie });
      }
    }

    const suggestionsInGroup = [...componentSuggestions];
    const nodes = orderNodes(nodesSet, suggestionsInGroup, nodeMap);
    const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
    suggestionsInGroup.sort((a, b) => {
      const fromDelta = (nodeOrder.get(a.fromId) ?? 0) - (nodeOrder.get(b.fromId) ?? 0);
      if (fromDelta !== 0) return fromDelta;
      const toDelta = (nodeOrder.get(a.toId) ?? 0) - (nodeOrder.get(b.toId) ?? 0);
      if (toDelta !== 0) return toDelta;
      return `${a.fromId}->${a.toId}`.localeCompare(`${b.fromId}->${b.toId}`, "nl");
    });

    // Count webhook vs AI suggestions
    let webhookCount = 0;
    let aiCount = 0;
    for (const s of suggestionsInGroup) {
      if (s.zekerheid === "webhook") webhookCount++;
      else aiCount++;
    }

    // Count confirmed suggestions
    const confirmedCount = suggestionsInGroup.filter((s) => s.confirmed).length;

    groups.push({
      id: nodes.map((node) => node.id).join("__"),
      suggestions: suggestionsInGroup,
      nodes,
      webhookCount,
      aiCount,
      confirmedCount,
      totalCount: suggestionsInGroup.length,
    });
  }

  return groups.sort(compareGroups);
}
