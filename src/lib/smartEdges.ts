import { Automatisering } from "./types";

export type EdgeType = "explicit";

export interface SmartEdge {
  sourceId: string;
  targetId: string;
  type: EdgeType;
  label: string;
}

/**
 * Strict edge computation: only explicit (manual) koppelingen.
 * No inferred edges from shared systems, keywords, or owners.
 */
export function computeSmartEdges(automatiseringen: Automatisering[]): SmartEdge[] {
  const edges: SmartEdge[] = [];
  const seen = new Set<string>();

  for (const a of automatiseringen) {
    for (const k of a.koppelingen || []) {
      const key = `${a.id}-${k.doelId}`;
      const reverseKey = `${k.doelId}-${a.id}`;
      if (!seen.has(key) && !seen.has(reverseKey)) {
        seen.add(key);
        edges.push({
          sourceId: a.id,
          targetId: k.doelId,
          type: "explicit",
          label: k.label || `${a.id} → ${k.doelId}`,
        });
      }
    }
  }

  return edges;
}

export function countConnections(autoId: string, edges: SmartEdge[]): number {
  return edges.filter((e) => e.sourceId === autoId || e.targetId === autoId).length;
}
