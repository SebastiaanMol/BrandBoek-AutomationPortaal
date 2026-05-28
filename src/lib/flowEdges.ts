import type { Automatisering } from "@/lib/types";
import type { FlowEvidence } from "@/lib/flowEvidence";
import { getExactWebhookProof } from "@/lib/webhookProof";

export interface FlowEdge {
  from: string;
  to: string;
  label: string;
  evidence: FlowEvidence;
}

export interface ConfirmedFlowLink {
  sourceId: string;
  targetId: string;
  matchType?: string | null;
}

/**
 * Derives procesreis transitions from 100% webhook proof only.
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
    if (link.matchType && link.matchType !== "webhook") continue;
    const proof = getExactWebhookProof(autoMap.get(link.sourceId), autoMap.get(link.targetId));
    if (!proof) continue;
    const key = `${link.sourceId}->${link.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({
      from: link.sourceId,
      to: link.targetId,
      label: "",
      evidence: {
        level: "confirmed",
        label: "100% webhook-match",
        score: 100,
        reason: `Exacte webhook-route ${proof.normalizedPath} verbindt deze automations.`,
      },
    });
  }

  return edges;
}
