import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export interface SavedProcessState {
  steps: unknown[];
  connections: unknown[];
  autoLinks: Record<string, { fromStepId: string; toStepId: string }>;
  parkedSteps: unknown[];
  activeLanes?: string[];
  customLanes?: unknown[];
  flowLinks?: Record<string, { fromStepId: string; toStepId: string }>;
  attachments?: unknown[];
}

const PROCESS_STATE_COLUMNS = [
  "steps",
  "connections",
  "auto_links",
  "parked_steps",
  "active_lanes",
  "custom_lanes",
  "flow_links",
  "attachments",
] as const;

function isMissingOptionalColumnError(error: unknown, column: "attachments" | "flow_links"): boolean {
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

function processStateColumns(options: { attachments?: boolean; flowLinks?: boolean } = {}): string {
  const includeAttachments = options.attachments ?? true;
  const includeFlowLinks = options.flowLinks ?? true;
  return PROCESS_STATE_COLUMNS
    .filter((column) => includeAttachments || column !== "attachments")
    .filter((column) => includeFlowLinks || column !== "flow_links")
    .join(", ");
}

async function fetchProcessStateWithColumns(
  pipelineId: string,
  options: { attachments?: boolean; flowLinks?: boolean } = {},
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
  let { data, error } = await fetchProcessStateWithColumns(pipelineId, {
    attachments: includeAttachments,
    flowLinks: includeFlowLinks,
  });

  if (error && isMissingOptionalColumnError(error, "attachments")) {
    includeAttachments = false;
    ({ data, error } = await fetchProcessStateWithColumns(pipelineId, {
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
    }));
  }

  if (error && isMissingOptionalColumnError(error, "flow_links")) {
    includeFlowLinks = false;
    ({ data, error } = await fetchProcessStateWithColumns(pipelineId, {
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
    }));
  }

  if (error) throw error;
  if (!data) return null;

  return {
    steps: (data.steps ?? []) as unknown[],
    connections: (data.connections ?? []) as unknown[],
    autoLinks: (data.auto_links ?? {}) as Record<string, { fromStepId: string; toStepId: string }>,
    parkedSteps: (data.parked_steps ?? []) as unknown[],
    activeLanes: (data.active_lanes ?? undefined) as string[] | undefined,
    customLanes: (data.custom_lanes ?? undefined) as unknown[] | undefined,
    flowLinks: includeFlowLinks
      ? (data.flow_links ?? {}) as Record<string, { fromStepId: string; toStepId: string }>
      : {},
    attachments: includeAttachments ? (data.attachments ?? []) as unknown[] : [],
  };
}

function buildProcessStateUpsertPayload(
  pipelineId: string,
  state: SavedProcessState,
  options: { attachments?: boolean; flowLinks?: boolean } = {},
) {
  const includeAttachments = options.attachments ?? true;
  const includeFlowLinks = options.flowLinks ?? true;
  return {
    id: pipelineId,
    steps: state.steps as unknown as Json,
    connections: state.connections as unknown as Json,
    auto_links: state.autoLinks as unknown as Json,
    parked_steps: state.parkedSteps as unknown as Json,
    active_lanes: (state.activeLanes ?? null) as unknown as Json,
    custom_lanes: (state.customLanes ?? null) as unknown as Json,
    ...(includeFlowLinks ? { flow_links: (state.flowLinks ?? {}) as unknown as Json } : {}),
    ...(includeAttachments ? { attachments: (state.attachments ?? []) as unknown as Json } : {}),
    updated_at: new Date().toISOString(),
  };
}

async function upsertProcessState(
  pipelineId: string,
  state: SavedProcessState,
  options: { attachments?: boolean; flowLinks?: boolean } = {},
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
  let { error } = await upsertProcessState(pipelineId, state, {
    attachments: includeAttachments,
    flowLinks: includeFlowLinks,
  });

  if (error && isMissingOptionalColumnError(error, "attachments")) {
    includeAttachments = false;
    ({ error } = await upsertProcessState(pipelineId, state, {
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
    }));
  }

  if (error && isMissingOptionalColumnError(error, "flow_links")) {
    includeFlowLinks = false;
    ({ error } = await upsertProcessState(pipelineId, state, {
      attachments: includeAttachments,
      flowLinks: includeFlowLinks,
    }));
  }

  if (error) throw error;
}
