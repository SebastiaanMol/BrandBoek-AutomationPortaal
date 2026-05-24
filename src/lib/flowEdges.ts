import type { Automatisering } from "@/lib/types";
import { evaluateFlowEvidence, type FlowEvidence } from "@/lib/flowEvidence";

export interface FlowEdge {
  from: string;
  to: string;
  label: string;
  evidence: FlowEvidence;
}

export interface ConfirmedFlowLink {
  sourceId: string;
  targetId: string;
}

/**
 * Derives official procesreis transitions. Accepted suggestions are stored in
 * automation_links, so prefer those. Older/manual procesreizen still fall back
 * to koppelingen, then to a simple sequential chain.
 */
export function buildFlowEdges(
  automationIds: string[],
  autoMap: Map<string, Automatisering>,
  confirmedLinks: ConfirmedFlowLink[] = [],
): FlowEdge[] {
  const flowSet = new Set(automationIds);
  const edges: FlowEdge[] = [];

  const seen = new Set<string>();
  for (const link of confirmedLinks) {
    if (!flowSet.has(link.sourceId) || !flowSet.has(link.targetId)) continue;
    const key = `${link.sourceId}->${link.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      from: link.sourceId,
      to: link.targetId,
      label: "",
      evidence: evaluateFlowEvidence({
        from: autoMap.get(link.sourceId),
        to: autoMap.get(link.targetId),
        source: "confirmed",
      }),
    });
  }

  if (edges.length > 0) return edges;

  for (const id of automationIds) {
    const auto = autoMap.get(id);
    if (!auto) continue;
    for (const k of auto.koppelingen ?? []) {
      if (!flowSet.has(k.doelId)) continue;
      const key = `${id}->${k.doelId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        from: id,
        to: k.doelId,
        label: k.label,
        evidence: evaluateFlowEvidence({
          from: auto,
          to: autoMap.get(k.doelId),
          source: "manual",
          label: k.label,
        }),
      });
    }
  }

  if (edges.length === 0 && automationIds.length > 1) {
    for (let i = 0; i < automationIds.length - 1; i++) {
      edges.push({
        from: automationIds[i],
        to: automationIds[i + 1],
        label: "",
        evidence: evaluateFlowEvidence({
          from: autoMap.get(automationIds[i]),
          to: autoMap.get(automationIds[i + 1]),
          source: "sequential",
        }),
      });
    }
  }

  return edges;
}
