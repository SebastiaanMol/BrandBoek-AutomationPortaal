import type { ProcessArtifact } from "@/data/processData";

const DEFAULT_MANUAL_EXCEPTION_SIZE = { width: 250, height: 112 };

type ProcessArtifactPatch = Partial<
  Pick<ProcessArtifact, "title" | "description" | "position" | "size" | "association">
>;

export function createManualExceptionBlock(position: { x: number; y: number }): ProcessArtifact {
  return {
    id: `artifact-${Date.now()}`,
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
