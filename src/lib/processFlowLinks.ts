import type { CanvasPlacement, ProcessPlacementLink } from "@/data/processData";

export type ProcessFlowLinks = Record<string, ProcessPlacementLink>;

export function normalizePlacementLink(link: ProcessPlacementLink, fallbackOrder = 0): CanvasPlacement {
  if ("kind" in link) {
    return { ...link, order: link.order ?? fallbackOrder };
  }

  return {
    kind: "connection",
    fromStepId: link.fromStepId,
    toStepId: link.toStepId,
    order: link.order ?? fallbackOrder,
    position: link.position,
  };
}

export function placementReferencesStep(link: ProcessPlacementLink, stepId: string): boolean {
  const placement = normalizePlacementLink(link);
  if (placement.kind === "pipeline_wide") return false;
  return placement.kind === "step"
    ? placement.stepId === stepId
    : placement.fromStepId === stepId || placement.toStepId === stepId;
}

function placementTargetsValidSteps(link: ProcessPlacementLink, validStepIds: Set<string>): boolean {
  const placement = normalizePlacementLink(link);
  if (placement.kind === "pipeline_wide") return true;
  return placement.kind === "step"
    ? validStepIds.has(placement.stepId)
    : validStepIds.has(placement.fromStepId) && validStepIds.has(placement.toStepId);
}

export function isConnectionPlacement(
  link: ProcessPlacementLink | undefined,
  fromStepId: string,
  toStepId: string,
): boolean {
  if (!link) return false;
  const placement = normalizePlacementLink(link);
  return placement.kind === "connection"
    && placement.fromStepId === fromStepId
    && placement.toStepId === toStepId;
}

export function filterFlowLinksForSteps(
  flowLinks: ProcessFlowLinks | undefined,
  stepIds: string[],
): ProcessFlowLinks {
  const validStepIds = new Set(stepIds);
  return Object.entries(flowLinks ?? {}).reduce<ProcessFlowLinks>((links, [flowId, link]) => {
    if (placementTargetsValidSteps(link, validStepIds)) {
      links[flowId] = link;
    }
    return links;
  }, {});
}

export function removeFlowLinksForStep(
  flowLinks: ProcessFlowLinks | undefined,
  stepId: string,
): ProcessFlowLinks {
  return Object.entries(flowLinks ?? {}).reduce<ProcessFlowLinks>((links, [flowId, link]) => {
    if (!placementReferencesStep(link, stepId)) {
      links[flowId] = link;
    }
    return links;
  }, {});
}

export function removeFlowLinksForConnection(
  flowLinks: ProcessFlowLinks | undefined,
  connection: { fromStepId?: string; toStepId: string } | undefined,
): ProcessFlowLinks {
  if (!connection?.fromStepId) return flowLinks ?? {};
  return Object.entries(flowLinks ?? {}).reduce<ProcessFlowLinks>((links, [flowId, link]) => {
    if (!isConnectionPlacement(link, connection.fromStepId!, connection.toStepId)) {
      links[flowId] = link;
    }
    return links;
  }, {});
}
