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
}

export async function fetchProcessState(pipelineId: string): Promise<SavedProcessState | null> {
  const { data, error } = await supabase
    .from("process_state")
    .select("steps, connections, auto_links, parked_steps, active_lanes, custom_lanes, flow_links")
    .eq("id", pipelineId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    steps: (data.steps ?? []) as unknown[],
    connections: (data.connections ?? []) as unknown[],
    autoLinks: (data.auto_links ?? {}) as Record<string, { fromStepId: string; toStepId: string }>,
    parkedSteps: (data.parked_steps ?? []) as unknown[],
    activeLanes: (data.active_lanes ?? undefined) as string[] | undefined,
    customLanes: (data.custom_lanes ?? undefined) as unknown[] | undefined,
    flowLinks: (data.flow_links ?? {}) as Record<string, { fromStepId: string; toStepId: string }>,
  };
}

export async function saveProcessState(pipelineId: string, state: SavedProcessState): Promise<void> {
  const { error } = await supabase
    .from("process_state")
    .upsert(
      {
        id: pipelineId,
        steps: state.steps as unknown as Json,
        connections: state.connections as unknown as Json,
        auto_links: state.autoLinks as unknown as Json,
        parked_steps: state.parkedSteps as unknown as Json,
        active_lanes: (state.activeLanes ?? null) as unknown as Json,
        custom_lanes: (state.customLanes ?? null) as unknown as Json,
        flow_links: (state.flowLinks ?? {}) as unknown as Json,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) throw error;
}
