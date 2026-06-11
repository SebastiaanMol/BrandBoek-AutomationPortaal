export type ProcessFlowLinks = Record<string, { fromStepId: string; toStepId: string }>;

export function filterFlowLinksForSteps(
  flowLinks: ProcessFlowLinks | undefined,
  stepIds: string[],
): ProcessFlowLinks {
  const validStepIds = new Set(stepIds);
  return Object.entries(flowLinks ?? {}).reduce<ProcessFlowLinks>((links, [flowId, link]) => {
    if (validStepIds.has(link.fromStepId) && validStepIds.has(link.toStepId)) {
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
    if (link.fromStepId !== stepId && link.toStepId !== stepId) {
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
    if (link.fromStepId !== connection.fromStepId || link.toStepId !== connection.toStepId) {
      links[flowId] = link;
    }
    return links;
  }, {});
}
