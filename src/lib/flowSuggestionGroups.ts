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

    const nodes = Array.from(nodesSet).map((id) => ({
      id,
      naam: nodeMap.get(id)?.naam ?? "",
      categorie: nodeMap.get(id)?.categorie ?? "",
    }));

    // Count webhook vs AI suggestions
    let webhookCount = 0;
    let aiCount = 0;
    for (const s of componentSuggestions) {
      if (s.zekerheid === "webhook") webhookCount++;
      else aiCount++;
    }

    // Count confirmed suggestions
    const confirmedCount = componentSuggestions.filter((s) => s.confirmed).length;

    groups.push({
      id: nodes.map((node) => node.id).join("__"),
      suggestions: componentSuggestions,
      nodes,
      webhookCount,
      aiCount,
      confirmedCount,
      totalCount: componentSuggestions.length,
    });
  }

  return groups;
}
