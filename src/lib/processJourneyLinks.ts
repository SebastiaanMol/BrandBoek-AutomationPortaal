import type { Automatisering, Flow } from "./types";
import type { ConfirmedFlowLink } from "./flowEdges";

export interface NextProcessJourneyLink {
  title: string;
  href: string;
  reason: string;
  confidence?: "confirmed" | "inferred";
}

export function findNextProcessJourney(
  currentFlow: Flow,
  allFlows: Flow[],
  confirmedLinks: ConfirmedFlowLink[],
  _autoMap?: Map<string, Automatisering>,
): NextProcessJourneyLink | null {
  const currentIds = new Set(currentFlow.automationIds);
  const outgoingTargets = confirmedLinks
    .filter((link) => currentIds.has(link.sourceId) && !currentIds.has(link.targetId))
    .map((link) => link.targetId);

  for (const targetId of outgoingTargets) {
    const nextFlow = allFlows.find(
      (flow) =>
        flow.id !== currentFlow.id &&
        (flow.automationIds[0] === targetId || flow.automationIds.includes(targetId)),
    );

    if (!nextFlow) continue;

    return {
      title: nextFlow.naam,
      href: `/flows/${nextFlow.id}`,
      reason: nextFlow.automationIds[0] === targetId
        ? "Deze procesreis begint met een automation die door de huidige procesreis wordt geraakt."
        : "Deze procesreis bevat een automation die door de huidige procesreis wordt geraakt.",
      confidence: "confirmed",
    };
  }

  return null;
}
