import { buildProcessJourneyTraces } from "./processJourneyTrace";
import type { Automatisering } from "./types";

export interface FlowCandidate {
  automationIds: string[];
}

interface AutomationInput extends Partial<Automatisering> {
  id: string;
}

interface ConfirmedLink {
  sourceId: string;
  targetId: string;
  matchType?: string | null;
}

export function detectFlows(
  automations: AutomationInput[],
  _confirmedLinks: ConfirmedLink[],
): FlowCandidate[] {
  const traces = buildProcessJourneyTraces(automations as Automatisering[]);
  return traces
    .filter((trace) => trace.orderedNodeIds.length >= 2)
    .map((trace) => ({ automationIds: trace.orderedNodeIds }));
}
