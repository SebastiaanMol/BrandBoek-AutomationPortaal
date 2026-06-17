import type { ProcessArtifact } from "@/data/processData";

const DEFAULT_MANUAL_EXCEPTION_SIZE = { width: 250, height: 112 };

type ProcessArtifactPatch = Partial<
  Pick<ProcessArtifact, "title" | "description" | "position" | "size" | "association" | "stepIds">
>;

export function createManualExceptionBlock(position: { x: number; y: number }): ProcessArtifact {
  const id = globalThis.crypto?.randomUUID?.() ?? Date.now();

  return {
    id: `artifact-${id}`,
    type: "manualExceptionBlock",
    title: "Altijd beschikbare handmatige actie",
    description: "Mogelijk vanuit elke pipeline stage. Geen verplichte processtap.",
    position,
    size: DEFAULT_MANUAL_EXCEPTION_SIZE,
    association: {
      anchor: "process",
      label: "Mogelijk vanuit elke pipeline stage",
    },
  };
}

export function updateProcessArtifact(
  artifacts: ProcessArtifact[] | undefined,
  artifactId: string,
  patch: ProcessArtifactPatch,
): ProcessArtifact[] {
  return (artifacts ?? []).map((artifact) =>
    artifact.id === artifactId ? { ...artifact, ...patch } : artifact,
  );
}

export function deleteProcessArtifact(
  artifacts: ProcessArtifact[] | undefined,
  artifactId: string,
): ProcessArtifact[] {
  return (artifacts ?? []).filter((artifact) => artifact.id !== artifactId);
}

function withoutStepId(stepIds: string[] | undefined, stepId: string): string[] {
  return (stepIds ?? []).filter((id) => id !== stepId);
}

export function moveStepIntoManualArtifact(
  artifacts: ProcessArtifact[] | undefined,
  artifactId: string,
  stepId: string,
): ProcessArtifact[] {
  return (artifacts ?? []).map((artifact) => {
    const currentStepIds = withoutStepId(artifact.stepIds, stepId);
    if (artifact.id !== artifactId) {
      return artifact.stepIds ? { ...artifact, stepIds: currentStepIds } : artifact;
    }
    return {
      ...artifact,
      stepIds: [...currentStepIds, stepId],
    };
  });
}

export function removeStepFromManualArtifact(
  artifacts: ProcessArtifact[] | undefined,
  artifactId: string,
  stepId: string,
): ProcessArtifact[] {
  return (artifacts ?? []).map((artifact) =>
    artifact.id === artifactId
      ? { ...artifact, stepIds: withoutStepId(artifact.stepIds, stepId) }
      : artifact,
  );
}

export function reorderManualArtifactStep(
  artifacts: ProcessArtifact[] | undefined,
  artifactId: string,
  stepId: string,
  targetIndex: number,
): ProcessArtifact[] {
  return (artifacts ?? []).map((artifact) => {
    if (artifact.id !== artifactId) return artifact;
    const remaining = withoutStepId(artifact.stepIds, stepId);
    const index = Math.max(0, Math.min(targetIndex, remaining.length));
    return {
      ...artifact,
      stepIds: [
        ...remaining.slice(0, index),
        stepId,
        ...remaining.slice(index),
      ],
    };
  });
}
