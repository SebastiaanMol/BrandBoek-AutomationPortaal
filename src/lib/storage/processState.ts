import { supabase } from "@/integrations/supabase/client";
import type { ProcessPlacementLink } from "@/data/processData";
import type { Json } from "@/integrations/supabase/types";

export const PROCESS_MANUAL_STATUSES = [
  "niet_ingericht",
  "procesflow_gereed",
  "in_review",
  "in_orde",
] as const;

export type ProcessManualStatus = typeof PROCESS_MANUAL_STATUSES[number];

export const DEFAULT_PROCESS_MANUAL_STATUS: ProcessManualStatus = "niet_ingericht";

export interface SavedProcessState {
  steps: unknown[];
  connections: unknown[];
  autoLinks: Record<string, ProcessPlacementLink>;
  parkedSteps: unknown[];
  manualStatus?: ProcessManualStatus;
  activeLanes?: string[];
  customLanes?: unknown[];
  flowLinks?: Record<string, ProcessPlacementLink>;
  attachments?: unknown[];
  artifacts?: unknown[];
}

export interface SavedProcessStateWithUpdatedAt extends SavedProcessState {
  updatedAt: string | null;
}

const PROCESS_STATE_COLUMNS = [
  "steps",
  "connections",
  "auto_links",
  "parked_steps",
  "manual_status",
  "active_lanes",
  "custom_lanes",
  "flow_links",
  "attachments",
  "artifacts",
] as const;

function isMissingOptionalColumnError(error: unknown, column: "attachments" | "flow_links" | "artifacts"): boolean {
  if (typeof error !== "object" || error === null) return false;
  const maybeError = error as { code?: unknown; message?: unknown; details?: unknown };
  const text = `${String(maybeError.message ?? "")} ${String(maybeError.details ?? "")}`.toLowerCase();
  return text.includes(column.toLowerCase()) && (
    maybeError.code === "PGRST204" ||
    maybeError.code === "42703" ||
    text.includes("could not find") ||
    text.includes("does not exist")
  );
}

function parseManualStatus(value: unknown): ProcessManualStatus {
  return PROCESS_MANUAL_STATUSES.includes(value as ProcessManualStatus)
    ? value as ProcessManualStatus
    : DEFAULT_PROCESS_MANUAL_STATUS;
}

function processStateColumns(options: { attachments?: boolean; flowLinks?: boolean; artifacts?: boolean } = {}): string {
  const includeAttachments = options.attachments ?? true;
  const includeFlowLinks = options.flowLinks ?? true;
  const includeArtifacts = options.artifacts ?? true;
  return PROCESS_STATE_COLUMNS
    .filter((column) => includeAttachments || column !== "attachments")
    .filter((column) => includeFlowLinks || column !== "flow_links")
    .filter((column) => includeArtifacts || column !== "artifacts")
    .join(", ");
}

async function fetchProcessStateWithColumns(
  pipelineId: string,
  options: { attachments?: boolean; flowLinks?: boolean; artifacts?: boolean } = {},
) {
  return supabase
    .from("process_state")
    .select(processStateColumns(options))
    .eq("id", pipelineId)
    .maybeSingle();
}

export async function fetchProcessState(pipelineId: string): Promise<SavedProcessState | null> {
  let includeAttachments = true;
  let includeFlowLinks = true;
  let includeArtifacts = true;
  let { data, error } = await fetchProcessStateWithColumns(pipelineId, {
    attachments: includeAttachments,
    flowLinks: includeFlowLinks,
    artifacts: includeArtifacts,
  });

  if (error && isMissingOptionalColumnError(error, "attachments")) {
    includeAttachments = false;
    ({ data, error } = await fetchProcessStateWithColumns(pipelineId, {
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
      artifacts: includeArtifacts,
    }));
  }

  if (error && isMissingOptionalColumnError(error, "flow_links")) {
    includeFlowLinks = false;
    ({ data, error } = await fetchProcessStateWithColumns(pipelineId, {
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
      artifacts: includeArtifacts,
    }));
  }

  if (error && isMissingOptionalColumnError(error, "artifacts")) {
    includeArtifacts = false;
    ({ data, error } = await fetchProcessStateWithColumns(pipelineId, {
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
      artifacts: includeArtifacts,
    }));
  }

  if (error) throw error;
  if (!data) return null;

  return {
    steps: (data.steps ?? []) as unknown[],
    connections: (data.connections ?? []) as unknown[],
    autoLinks: (data.auto_links ?? {}) as Record<string, ProcessPlacementLink>,
    parkedSteps: (data.parked_steps ?? []) as unknown[],
    manualStatus: parseManualStatus(data.manual_status),
    activeLanes: (data.active_lanes ?? undefined) as string[] | undefined,
    customLanes: (data.custom_lanes ?? undefined) as unknown[] | undefined,
    flowLinks: includeFlowLinks
      ? (data.flow_links ?? {}) as Record<string, ProcessPlacementLink>
      : {},
    attachments: includeAttachments ? (data.attachments ?? []) as unknown[] : [],
    artifacts: includeArtifacts ? (data.artifacts ?? []) as unknown[] : [],
  };
}

function mapProcessStateRow(
  data: Record<string, unknown>,
  options: { attachments?: boolean; flowLinks?: boolean; artifacts?: boolean } = {},
): SavedProcessStateWithUpdatedAt {
  const includeAttachments = options.attachments ?? true;
  const includeFlowLinks = options.flowLinks ?? true;
  const includeArtifacts = options.artifacts ?? true;

  return {
    steps: (data.steps ?? []) as unknown[],
    connections: (data.connections ?? []) as unknown[],
    autoLinks: (data.auto_links ?? {}) as Record<string, { fromStepId: string; toStepId: string }>,
    parkedSteps: (data.parked_steps ?? []) as unknown[],
    manualStatus: parseManualStatus(data.manual_status),
    activeLanes: (data.active_lanes ?? undefined) as string[] | undefined,
    customLanes: (data.custom_lanes ?? undefined) as unknown[] | undefined,
    flowLinks: includeFlowLinks
      ? (data.flow_links ?? {}) as Record<string, { fromStepId: string; toStepId: string }>
      : {},
    attachments: includeAttachments ? (data.attachments ?? []) as unknown[] : [],
    artifacts: includeArtifacts ? (data.artifacts ?? []) as unknown[] : [],
    updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
  };
}

async function fetchAllProcessStatesWithColumns(
  options: { attachments?: boolean; flowLinks?: boolean; artifacts?: boolean } = {},
) {
  return supabase
    .from("process_state")
    .select(`id, ${processStateColumns(options)}, updated_at`);
}

export async function fetchAllProcessStates(): Promise<Record<string, SavedProcessStateWithUpdatedAt>> {
  let includeAttachments = true;
  let includeFlowLinks = true;
  let includeArtifacts = true;
  let { data, error } = await fetchAllProcessStatesWithColumns({
    attachments: includeAttachments,
    flowLinks: includeFlowLinks,
    artifacts: includeArtifacts,
  });

  if (error && isMissingOptionalColumnError(error, "attachments")) {
    includeAttachments = false;
    ({ data, error } = await fetchAllProcessStatesWithColumns({
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
      artifacts: includeArtifacts,
    }));
  }

  if (error && isMissingOptionalColumnError(error, "flow_links")) {
    includeFlowLinks = false;
    ({ data, error } = await fetchAllProcessStatesWithColumns({
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
      artifacts: includeArtifacts,
    }));
  }

  if (error && isMissingOptionalColumnError(error, "artifacts")) {
    includeArtifacts = false;
    ({ data, error } = await fetchAllProcessStatesWithColumns({
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
      artifacts: includeArtifacts,
    }));
  }

  if (error) throw error;

  return Object.fromEntries(
    ((data ?? []) as Array<Record<string, unknown>>)
      .filter((row) => typeof row.id === "string")
      .map((row) => [
        row.id as string,
        mapProcessStateRow(row, {
          attachments: includeAttachments,
          flowLinks: includeFlowLinks,
          artifacts: includeArtifacts,
        }),
      ]),
  );
}

function buildProcessStateUpsertPayload(
  pipelineId: string,
  state: SavedProcessState,
  options: { attachments?: boolean; flowLinks?: boolean; artifacts?: boolean } = {},
) {
  const includeAttachments = options.attachments ?? true;
  const includeFlowLinks = options.flowLinks ?? true;
  const includeArtifacts = options.artifacts ?? true;
  return {
    id: pipelineId,
    steps: state.steps as unknown as Json,
    connections: state.connections as unknown as Json,
    auto_links: state.autoLinks as unknown as Json,
    parked_steps: state.parkedSteps as unknown as Json,
    ...(state.manualStatus ? { manual_status: state.manualStatus } : {}),
    active_lanes: (state.activeLanes ?? null) as unknown as Json,
    custom_lanes: (state.customLanes ?? null) as unknown as Json,
    ...(includeFlowLinks ? { flow_links: (state.flowLinks ?? {}) as unknown as Json } : {}),
    ...(includeAttachments ? { attachments: (state.attachments ?? []) as unknown as Json } : {}),
    ...(includeArtifacts ? { artifacts: (state.artifacts ?? []) as unknown as Json } : {}),
    updated_at: new Date().toISOString(),
  };
}

async function upsertProcessState(
  pipelineId: string,
  state: SavedProcessState,
  options: { attachments?: boolean; flowLinks?: boolean; artifacts?: boolean } = {},
) {
  return supabase
    .from("process_state")
    .upsert(
      buildProcessStateUpsertPayload(pipelineId, state, options),
      { onConflict: "id" },
    );
}

export async function saveProcessState(pipelineId: string, state: SavedProcessState): Promise<void> {
  let includeAttachments = true;
  let includeFlowLinks = true;
  let includeArtifacts = true;
  let { error } = await upsertProcessState(pipelineId, state, {
    attachments: includeAttachments,
    flowLinks: includeFlowLinks,
    artifacts: includeArtifacts,
  });

  if (error && isMissingOptionalColumnError(error, "attachments")) {
    includeAttachments = false;
    ({ error } = await upsertProcessState(pipelineId, state, {
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
      artifacts: includeArtifacts,
    }));
  }

  if (error && isMissingOptionalColumnError(error, "flow_links")) {
    includeFlowLinks = false;
    ({ error } = await upsertProcessState(pipelineId, state, {
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
      artifacts: includeArtifacts,
    }));
  }

  if (error && isMissingOptionalColumnError(error, "artifacts")) {
    throw error;
  }

  if (error) throw error;
}

export async function updateProcessManualStatus(
  pipelineId: string,
  manualStatus: ProcessManualStatus,
): Promise<void> {
  const { error } = await supabase
    .from("process_state")
    .upsert(
      {
        id: pipelineId,
        manual_status: manualStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) throw error;
}
