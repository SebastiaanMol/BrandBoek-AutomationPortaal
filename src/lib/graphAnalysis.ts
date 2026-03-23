import { Automatisering } from "./types"

export interface GraphEdge {
  source: string
  target: string
  label?: string
}

/** Build adjacency list from koppelingen */
export function buildAdjacency(automations: Automatisering[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  for (const a of automations) {
    if (!adj.has(a.id)) adj.set(a.id, new Set())
    for (const k of (a.koppelingen ?? [])) {
      adj.get(a.id)!.add(k.doelId)
      if (!adj.has(k.doelId)) adj.set(k.doelId, new Set())
      adj.get(k.doelId)!.add(a.id) // undirected for analysis
    }
  }
  return adj
}

/** Degree centrality: connections / (n-1), normalised 0-1 */
export function degreeCentrality(automations: Automatisering[]): Map<string, number> {
  const adj = buildAdjacency(automations)
  const n = automations.length
  const result = new Map<string, number>()
  for (const a of automations) {
    const deg = adj.get(a.id)?.size ?? 0
    result.set(a.id, n > 1 ? deg / (n - 1) : 0)
  }
  return result
}

/**
 * BFS from a source node — returns all reachable IDs within `maxHops` steps.
 * Directed: follows koppelingen both ways if undirected=true.
 */
export function bfsNeighborhood(
  sourceId: string,
  automations: Automatisering[],
  maxHops = 1,
  undirected = true
): Set<string> {
  const adj = buildAdjacency(automations)
  // For directed cascade (downstream only), rebuild directed adj
  const dirAdj = new Map<string, Set<string>>()
  for (const a of automations) {
    if (!dirAdj.has(a.id)) dirAdj.set(a.id, new Set())
    for (const k of (a.koppelingen ?? [])) {
      dirAdj.get(a.id)!.add(k.doelId)
    }
  }

  const map = undirected ? adj : dirAdj
  const visited = new Set<string>([sourceId])
  let frontier = [sourceId]

  for (let hop = 0; hop < maxHops; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const nb of (map.get(id) ?? [])) {
        if (!visited.has(nb)) {
          visited.add(nb)
          next.push(nb)
        }
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }

  return visited
}

/**
 * Cascade impact: which nodes are DOWNSTREAM (reachable via directed edges)?
 */
export function cascadeImpact(sourceId: string, automations: Automatisering[]): Set<string> {
  return bfsNeighborhood(sourceId, automations, 99, false)
}

/**
 * Shortest path between two nodes using BFS.
 * Returns array of IDs from source to target, or [] if no path.
 */
export function shortestPath(
  sourceId: string,
  targetId: string,
  automations: Automatisering[]
): string[] {
  if (sourceId === targetId) return [sourceId]
  const adj = buildAdjacency(automations)
  const prev = new Map<string, string>()
  const visited = new Set<string>([sourceId])
  const queue = [sourceId]

  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const nb of (adj.get(cur) ?? [])) {
      if (!visited.has(nb)) {
        visited.add(nb)
        prev.set(nb, cur)
        if (nb === targetId) {
          // Reconstruct path
          const path: string[] = []
          let at: string | undefined = targetId
          while (at) {
            path.unshift(at)
            at = prev.get(at)
          }
          return path
        }
        queue.push(nb)
      }
    }
  }
  return []
}

/** Find orphan nodes (no connections at all) */
export function findOrphans(automations: Automatisering[]): Set<string> {
  const connected = new Set<string>()
  for (const a of automations) {
    if ((a.koppelingen ?? []).length > 0) {
      connected.add(a.id)
      for (const k of a.koppelingen) connected.add(k.doelId)
    }
  }
  const orphans = new Set<string>()
  for (const a of automations) {
    if (!connected.has(a.id)) orphans.add(a.id)
  }
  return orphans
}

/** All explicit edges from koppelingen */
export function buildEdgeList(automations: Automatisering[]): GraphEdge[] {
  const seen = new Set<string>()
  const edges: GraphEdge[] = []
  for (const a of automations) {
    for (const k of (a.koppelingen ?? [])) {
      const key = `${a.id}::${k.doelId}`
      if (!seen.has(key)) {
        seen.add(key)
        edges.push({ source: a.id, target: k.doelId, label: k.label })
      }
    }
  }
  return edges
}
