import type { CustomLane, ProcessStep, Connection, ProcessAttachment } from "@/data/processData";
import { buildProcessStateFromSaved, buildSavedProcessState } from "@/lib/processStateMapping";
import type { SavedProcessState } from "@/lib/storage/processState";

export interface ProcessBackup {
  version: 1;
  pipelineName: string;
  exportedAt: string;
  state: {
    steps: unknown[];
    connections: unknown[];
    autoLinks: Record<string, { fromStepId: string; toStepId: string }>;
    parkedSteps: unknown[];
    activeLanes?: string[];
    customLanes?: unknown[];
    flowLinks?: Record<string, { fromStepId: string; toStepId: string }>;
    attachments?: unknown[];
  };
}

export function exportProcessBackup(
  pipelineName: string,
  state: {
    steps: ProcessStep[];
    connections: Connection[];
    autoLinks: Record<string, { fromStepId: string; toStepId: string }>;
    parkedSteps: ProcessStep[];
    activeLanes: string[];
    customLanes: CustomLane[];
    flowLinks?: Record<string, { fromStepId: string; toStepId: string }>;
    attachments?: ProcessAttachment[];
  },
): void {
  const backup: ProcessBackup = {
    version: 1,
    pipelineName,
    exportedAt: new Date().toISOString(),
    state: {
      steps:       state.steps,
      connections: state.connections,
      autoLinks:   state.autoLinks,
      parkedSteps: state.parkedSteps,
      activeLanes: state.activeLanes,
      customLanes: state.customLanes,
      flowLinks:   state.flowLinks,
      attachments: state.attachments ?? [],
    },
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  const safe = pipelineName.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  a.href     = url;
  a.download = `proces-backup-${safe}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export async function importProcessBackup(file: File): Promise<SavedProcessState> {
  if (!file.name.toLowerCase().endsWith(".json")) {
    throw new Error("Alleen .json bestanden zijn geldig.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Bestand is te groot (max 5 MB).");
  }

  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Ongeldig JSON bestand.");
  }

  if (typeof parsed !== "object" || parsed === null) throw new Error("Onverwacht formaat.");
  const b = parsed as Record<string, unknown>;

  if (b.version !== 1) throw new Error(`Onbekende versie "${b.version}". Alleen versie 1 wordt ondersteund.`);
  if (typeof b.pipelineName !== "string") throw new Error("Veld 'pipelineName' ontbreekt of is geen tekst.");
  if (typeof b.exportedAt   !== "string") throw new Error("Veld 'exportedAt' ontbreekt of is geen tekst.");

  const s = b.state as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") throw new Error("Veld 'state' ontbreekt.");
  if (!Array.isArray(s.steps))       throw new Error("'state.steps' moet een array zijn.");
  if (!Array.isArray(s.connections)) throw new Error("'state.connections' moet een array zijn.");
  if (!Array.isArray(s.parkedSteps)) throw new Error("'state.parkedSteps' moet een array zijn.");
  if (typeof s.autoLinks !== "object" || s.autoLinks === null || Array.isArray(s.autoLinks)) {
    throw new Error("'state.autoLinks' moet een object zijn.");
  }
  for (const [key, val] of Object.entries(s.autoLinks as object)) {
    const entry = val as Record<string, unknown>;
    if (typeof entry.fromStepId !== "string" || typeof entry.toStepId !== "string") {
      throw new Error(`'state.autoLinks.${key}' mist fromStepId of toStepId.`);
    }
  }

  const imported: SavedProcessState = {
    steps:       s.steps,
    connections: s.connections,
    autoLinks:   s.autoLinks as Record<string, { fromStepId: string; toStepId: string }>,
    parkedSteps: s.parkedSteps,
    activeLanes: Array.isArray(s.activeLanes) ? (s.activeLanes as string[]) : undefined,
    customLanes: Array.isArray(s.customLanes) ? s.customLanes : undefined,
    flowLinks: typeof s.flowLinks === "object" && s.flowLinks !== null && !Array.isArray(s.flowLinks)
      ? (s.flowLinks as Record<string, { fromStepId: string; toStepId: string }>)
      : {},
    attachments: Array.isArray(s.attachments) ? s.attachments : [],
  };

  const normalizedState = buildProcessStateFromSaved(imported, []);
  return buildSavedProcessState(
    normalizedState,
    imported.parkedSteps as ProcessStep[],
    imported.activeLanes ?? [],
    (imported.customLanes ?? []) as CustomLane[],
  );
}
