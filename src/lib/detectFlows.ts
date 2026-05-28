export interface FlowCandidate {
  automationIds: string[];
}

interface AutomationInput {
  id: string;
  koppelingen?: unknown[];
}

interface ConfirmedLink {
  sourceId: string;
  targetId: string;
  matchType?: string | null;
}

export function detectFlows(
  automations: AutomationInput[],
  confirmedLinks: ConfirmedLink[],
): FlowCandidate[] {
  const ids = new Set(automations.map((a) => a.id));
  const webhookLinks = confirmedLinks.filter((link) => !link.matchType || link.matchType === "webhook");

  // ── Union-Find ────────────────────────────────────────────────────────────
  const parent: Record<string, string> = {};
  for (const id of ids) parent[id] = id;

  function find(x: string): string {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  // Edges from webhook-proof automation_links only.
  for (const link of webhookLinks) {
    if (ids.has(link.sourceId) && ids.has(link.targetId)) {
      union(link.sourceId, link.targetId);
    }
  }

  // ── Group by component root ───────────────────────────────────────────────
  const components: Record<string, string[]> = {};
  for (const id of ids) {
    const root = find(id);
    if (!components[root]) components[root] = [];
    components[root].push(id);
  }

  const multiNode = Object.values(components).filter((c) => c.length >= 2);

  // ── Topological sort (Kahn's algorithm) within each component ─────────────
  // Pre-bucket confirmed links by component root to avoid O(components × links) inner loop
  const linksByRoot = new Map<string, ConfirmedLink[]>();
  for (const link of webhookLinks) {
    if (ids.has(link.sourceId) && ids.has(link.targetId)) {
      const root = find(link.sourceId);
      if (!linksByRoot.has(root)) linksByRoot.set(root, []);
      linksByRoot.get(root)!.push(link);
    }
  }

  return multiNode.map((componentIds) => {
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};

    for (const id of componentIds) {
      adj[id] = [];
      inDegree[id] = 0;
    }

    const seenEdges = new Set<string>();

    function addEdge(from: string, to: string): void {
      const key = `${from}→${to}`;
      if (seenEdges.has(key)) return;
      seenEdges.add(key);
      adj[from].push(to);
      inDegree[to]++;
    }

    for (const link of linksByRoot.get(find(componentIds[0])) ?? []) {
      addEdge(link.sourceId, link.targetId);
    }

    const queue = componentIds.filter((id) => inDegree[id] === 0);
    const sorted: string[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);
      for (const neighbor of adj[node]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) queue.push(neighbor);
      }
    }

    // Cycle detected: fall back to the order automations were provided in the input array.
    return { automationIds: sorted.length === componentIds.length ? sorted : componentIds };
  });
}
