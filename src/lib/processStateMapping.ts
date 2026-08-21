import type {
  Automation,
  CanvasPlacement,
  Connection,
  CustomLane,
  ProcessAction,
  ProcessActionType,
  ProcessPlacementLink,
  ProcessArtifact,
  ProcessAttachment,
  ProcessState,
  ProcessStep,
} from "@/data/processData";
import { filterFlowLinksForSteps } from "@/lib/processFlowLinks";
import type { SavedProcessState } from "@/lib/storage/processState";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAttachment(value: unknown): ProcessAttachment | null {
  if (!isRecord(value)) return null;

  const { id, type, label, description, attachedTo, offset } = value;
  if (typeof id !== "string") return null;
  if (type !== "annotation" && type !== "dataObject" && type !== "dataStore") return null;
  if (typeof label !== "string") return null;
  if (description !== undefined && typeof description !== "string") return null;
  if (!isRecord(attachedTo)) return null;
  if (attachedTo.kind !== "step" && attachedTo.kind !== "connection") return null;
  if (typeof attachedTo.id !== "string") return null;
  const parsedDescription = typeof description === "string" ? description : undefined;

  const attachment: ProcessAttachment = {
    id,
    type,
    label,
    attachedTo: {
      kind: attachedTo.kind,
      id: attachedTo.id,
    },
  };

  if (parsedDescription !== undefined) {
    attachment.description = parsedDescription;
  }

  if (offset !== undefined) {
    if (!isRecord(offset) || typeof offset.x !== "number" || typeof offset.y !== "number") {
      return null;
    }
    attachment.offset = { x: offset.x, y: offset.y };
  }

  return attachment;
}

function parseArtifact(value: unknown): ProcessArtifact | null {
  if (!isRecord(value)) return null;

  const { id, type, title, description, position, size, association, stepIds, automationIds } = value;
  if (typeof id !== "string") return null;
  if (type !== "manualExceptionBlock" && type !== "automaticSyncBlock") return null;
  if (typeof title !== "string") return null;
  if (description !== undefined && typeof description !== "string") return null;
  if (!isRecord(position) || typeof position.x !== "number" || typeof position.y !== "number") {
    return null;
  }
  const parsedDescription = typeof description === "string" ? description : undefined;

  const artifact: ProcessArtifact = {
    id,
    type,
    title,
    position: { x: position.x, y: position.y },
  };

  if (parsedDescription !== undefined) {
    artifact.description = parsedDescription;
  }

  if (size !== undefined) {
    if (!isRecord(size) || typeof size.width !== "number" || typeof size.height !== "number") {
      return null;
    }
    artifact.size = { width: size.width, height: size.height };
  }

  if (association !== undefined) {
    if (!isRecord(association) || association.anchor !== "process") return null;
    artifact.association = { anchor: "process" };
    if (typeof association.label === "string") {
      artifact.association.label = association.label;
    }
  }

  if (Array.isArray(stepIds)) {
    artifact.stepIds = stepIds.filter((stepId): stepId is string => typeof stepId === "string");
  }

  if (Array.isArray(automationIds)) {
    artifact.automationIds = automationIds.filter((automationId): automationId is string => typeof automationId === "string");
  }

  return artifact;
}

function parseProcessActionType(value: unknown): ProcessActionType | null {
  if (value === "wait" || value === "email" || value === "task" || value === "message" || value === "webhook") {
    return value;
  }
  return null;
}

function parsePlacement(value: unknown, fallbackOrder = 0): CanvasPlacement | null {
  if (!isRecord(value)) return null;

  if (value.kind === "pipeline_wide") {
    const placement: CanvasPlacement = {
      kind: "pipeline_wide",
      order: typeof value.order === "number" ? value.order : fallbackOrder,
    };

    if (typeof value.syncTiming === "string") placement.syncTiming = value.syncTiming;
    if (typeof value.checksSummary === "string") placement.checksSummary = value.checksSummary;
    if (typeof value.actionSummary === "string") placement.actionSummary = value.actionSummary;
    if (Array.isArray(value.affectedStageIds)) {
      placement.affectedStageIds = value.affectedStageIds.filter((id): id is string => typeof id === "string");
    }

    return placement;
  }

  if (value.kind === "step") {
    if (typeof value.stepId !== "string") return null;
    return {
      kind: "step",
      stepId: value.stepId,
      order: typeof value.order === "number" ? value.order : fallbackOrder,
    };
  }

  if (value.kind === "connection" || value.kind === undefined) {
    if (typeof value.fromStepId !== "string" || typeof value.toStepId !== "string") return null;
    return {
      kind: "connection",
      fromStepId: value.fromStepId,
      toStepId: value.toStepId,
      order: typeof value.order === "number" ? value.order : fallbackOrder,
      position: typeof value.position === "number" ? value.position : undefined,
    };
  }

  return null;
}

function parseProcessAction(value: unknown, fallbackOrder = 0): ProcessAction | null {
  if (!isRecord(value)) return null;
  if (value.type !== "processAction") return null;

  const { id, actionType, label, detail, placement } = value;
  if (typeof id !== "string") return null;
  if (typeof label !== "string") return null;
  if (detail !== undefined && typeof detail !== "string") return null;
  const parsedType = parseProcessActionType(actionType);
  if (!parsedType) return null;
  const parsedPlacement = parsePlacement(placement, fallbackOrder);

  const action: ProcessAction = {
    id,
    type: parsedType,
    label,
    placement: parsedPlacement ?? undefined,
  };

  if (typeof detail === "string") {
    action.detail = detail;
  }

  return action;
}

function connectionFieldsFromPlacement(placement: CanvasPlacement | null): Pick<Automation, "fromStepId" | "toStepId"> {
  return placement?.kind === "connection"
    ? { fromStepId: placement.fromStepId, toStepId: placement.toStepId }
    : { fromStepId: undefined, toStepId: undefined };
}

function parseFlowLinks(value: unknown): Record<string, ProcessPlacementLink> {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<string, ProcessPlacementLink>>(
    (flowLinks, [id, link], index) => {
      const placement = parsePlacement(link, index);
      if (!placement) return flowLinks;
      flowLinks[id] = placement;
      return flowLinks;
    },
    {},
  );
}

function validArtifacts(artifacts: unknown, validStepIds: Set<string>): ProcessArtifact[] {
  const values = Array.isArray(artifacts) ? artifacts : [];
  const usedStepIds = new Set<string>();

  return values.flatMap((value) => {
    const artifact = parseArtifact(value);
    if (!artifact) return [];
    const stepIds = artifact.type === "manualExceptionBlock" ? (artifact.stepIds ?? []).filter((stepId) => {
      if (!validStepIds.has(stepId) || usedStepIds.has(stepId)) return false;
      usedStepIds.add(stepId);
      return true;
    }) : [];
    const sanitizedArtifact = { ...artifact };
    delete sanitizedArtifact.stepIds;
    return [{ ...sanitizedArtifact, ...(stepIds.length ? { stepIds } : {}) }];
  });
}

function placementTargetExists(placement: CanvasPlacement | undefined, validStepIds: Set<string>): boolean {
  if (!placement) return true;
  if (placement.kind === "pipeline_wide") return true;
  if (placement.kind === "step") return validStepIds.has(placement.stepId);
  return validStepIds.has(placement.fromStepId) && validStepIds.has(placement.toStepId);
}

function validProcessActions(actions: unknown, validStepIds: Set<string>): ProcessAction[] {
  const values = Array.isArray(actions) ? actions : [];
  return values.flatMap((value, index) => {
    const action = parseProcessAction(value, index);
    if (!action || !placementTargetExists(action.placement, validStepIds)) return [];
    return [action];
  });
}

function serializeProcessActions(actions: ProcessAction[] | undefined, validStepIds: Set<string>): unknown[] {
  return (actions ?? [])
    .filter(action => placementTargetExists(action.placement, validStepIds))
    .map((action, index) => ({
      id: action.id,
      type: "processAction",
      actionType: action.type,
      label: action.label,
      ...(action.detail ? { detail: action.detail } : {}),
      ...(action.placement ? { placement: { ...action.placement, order: action.placement.order ?? index } } : {}),
    }));
}

function validAttachments(state: {
  steps: ProcessStep[];
  connections: Connection[];
  attachments?: unknown;
}): ProcessAttachment[] {
  const stepIds = new Set(state.steps.map((step) => step.id));
  const connectionIds = new Set(state.connections.map((connection) => connection.id));
  const attachments = Array.isArray(state.attachments) ? state.attachments : [];

  return attachments.flatMap((value) => {
    const attachment = parseAttachment(value);
    if (!attachment) return [];
    const targetExists = attachment.attachedTo.kind === "step"
      ? stepIds.has(attachment.attachedTo.id)
      : connectionIds.has(attachment.attachedTo.id);
    return targetExists ? [attachment] : [];
  });
}

export function buildSavedProcessState(
  state: ProcessState,
  parkedSteps: ProcessStep[],
  activeLanes: string[],
  customLanes: CustomLane[],
): SavedProcessState {
  const targetSteps = [...state.steps, ...parkedSteps];
  const validStepIds = new Set(targetSteps.map((step) => step.id));
  const autoLinks: SavedProcessState["autoLinks"] = {};
  state.automations.forEach((automation, index) => {
    if (automation.placement) {
      autoLinks[automation.id] = {
        ...automation.placement,
        order: automation.placement.order ?? index,
      };
    } else if (automation.fromStepId && automation.toStepId) {
      autoLinks[automation.id] = {
        kind: "connection",
        fromStepId: automation.fromStepId,
        toStepId: automation.toStepId,
        order: index,
      };
    }
  });

  return {
    steps: state.steps,
    connections: state.connections,
    autoLinks,
    parkedSteps,
    activeLanes,
    customLanes,
    flowLinks: filterFlowLinksForSteps(state.flowLinks, state.steps.map((step) => step.id)),
    attachments: validAttachments({ ...state, steps: targetSteps }),
    artifacts: [
      ...validArtifacts(state.artifacts, validStepIds),
      ...serializeProcessActions(state.processActions, validStepIds),
    ],
  };
}

export function restoreSavedProcessState(
  current: ProcessState,
  saved: ProcessState,
  parkedSteps: ProcessStep[] = [],
): ProcessState {
  const targetSteps = [...saved.steps, ...parkedSteps];
  const validStepIds = new Set(targetSteps.map((step) => step.id));
  return {
    ...saved,
    automations: current.automations.map((automation) => {
      const savedAutomation = saved.automations.find((item) => item.id === automation.id);
      const placement = parsePlacement(savedAutomation?.placement ?? savedAutomation, 0);
      return savedAutomation
        ? {
          ...automation,
          placement,
          ...connectionFieldsFromPlacement(placement),
        }
        : {
          ...automation,
          fromStepId: undefined,
          toStepId: undefined,
          placement: undefined,
        };
    }),
    attachments: validAttachments({ ...saved, steps: targetSteps }),
    artifacts: validArtifacts(saved.artifacts, validStepIds),
    processActions: validProcessActions(saved.artifacts, validStepIds),
  };
}

export function buildProcessStateFromSaved(
  saved: SavedProcessState,
  automations: Automation[],
): ProcessState {
  const steps = saved.steps as ProcessStep[];
  const parkedSteps = saved.parkedSteps as ProcessStep[];
  const connections = saved.connections as Connection[];
  const validStepIds = new Set([...steps, ...parkedSteps].map((step) => step.id));

  return {
    steps,
    connections,
    automations: automations.map((automation, index) => {
      const placement = parsePlacement(saved.autoLinks[automation.id], index);
      return {
        ...automation,
        placement: placement ?? undefined,
        ...connectionFieldsFromPlacement(placement),
      };
    }),
    activeLanes: saved.activeLanes,
    customLanes: saved.customLanes as CustomLane[] | undefined,
    flowLinks: filterFlowLinksForSteps(parseFlowLinks(saved.flowLinks), steps.map((step) => step.id)),
    attachments: validAttachments({ steps: [...steps, ...parkedSteps], connections, attachments: saved.attachments }),
    artifacts: validArtifacts(saved.artifacts, validStepIds),
    processActions: validProcessActions(saved.artifacts, validStepIds),
  };
}
