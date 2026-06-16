import type {
  Automation,
  Connection,
  CustomLane,
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

  const { id, type, title, description, position, size, association } = value;
  if (typeof id !== "string") return null;
  if (type !== "manualExceptionBlock") return null;
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

  return artifact;
}

function parseFlowLinks(value: unknown): Record<string, { fromStepId: string; toStepId: string }> {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<string, { fromStepId: string; toStepId: string }>>(
    (flowLinks, [id, link]) => {
      if (!isRecord(link)) return flowLinks;
      if (typeof link.fromStepId !== "string" || typeof link.toStepId !== "string") {
        return flowLinks;
      }

      flowLinks[id] = {
        fromStepId: link.fromStepId,
        toStepId: link.toStepId,
      };
      return flowLinks;
    },
    {},
  );
}

function validArtifacts(artifacts?: unknown): ProcessArtifact[] {
  const values = Array.isArray(artifacts) ? artifacts : [];
  return values.flatMap((value) => {
    const artifact = parseArtifact(value);
    return artifact ? [artifact] : [];
  });
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
  const autoLinks: SavedProcessState["autoLinks"] = {};
  state.automations.forEach((automation) => {
    if (automation.fromStepId && automation.toStepId) {
      autoLinks[automation.id] = {
        fromStepId: automation.fromStepId,
        toStepId: automation.toStepId,
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
    artifacts: validArtifacts(state.artifacts),
  };
}

export function restoreSavedProcessState(
  current: ProcessState,
  saved: ProcessState,
  parkedSteps: ProcessStep[] = [],
): ProcessState {
  const targetSteps = [...saved.steps, ...parkedSteps];
  return {
    ...saved,
    automations: current.automations.map((automation) => {
      const savedAutomation = saved.automations.find((item) => item.id === automation.id);
      return savedAutomation
        ? {
          ...automation,
          fromStepId: savedAutomation.fromStepId,
          toStepId: savedAutomation.toStepId,
        }
        : {
          ...automation,
          fromStepId: undefined,
          toStepId: undefined,
        };
    }),
    attachments: validAttachments({ ...saved, steps: targetSteps }),
    artifacts: validArtifacts(saved.artifacts),
  };
}

export function buildProcessStateFromSaved(
  saved: SavedProcessState,
  automations: Automation[],
): ProcessState {
  const steps = saved.steps as ProcessStep[];
  const parkedSteps = saved.parkedSteps as ProcessStep[];
  const connections = saved.connections as Connection[];

  return {
    steps,
    connections,
    automations,
    activeLanes: saved.activeLanes,
    customLanes: saved.customLanes as CustomLane[] | undefined,
    flowLinks: filterFlowLinksForSteps(parseFlowLinks(saved.flowLinks), steps.map((step) => step.id)),
    attachments: validAttachments({ steps: [...steps, ...parkedSteps], connections, attachments: saved.attachments }),
    artifacts: validArtifacts(saved.artifacts),
  };
}
