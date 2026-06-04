import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Pipeline, PipelineStage } from "../types";
import { invokeEdgeFunction } from "./edgeFunctions";
import { toFriendlyDbError } from "./errors";

interface PipelineRow {
  pipeline_id: string;
  naam: string;
  stages: Json | null;
  synced_at: string;
  updated_at: string | null;
  beschrijving: string | null;
  is_active: boolean;
  source: "hubspot" | "custom" | null;
}

export interface CustomPipelineInput {
  naam: string;
  stages: string[];
  beschrijving?: string | null;
  isActive?: boolean;
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function mapPipelineRow(row: PipelineRow): Pipeline {
  return {
    pipelineId: row.pipeline_id,
    naam: row.naam,
    stages: readPipelineStages(row.stages),
    syncedAt: row.synced_at,
    updatedAt: row.updated_at ?? row.synced_at,
    beschrijving: row.beschrijving ?? null,
    isActive: row.is_active,
    source: row.source ?? "hubspot",
  };
}

function readPipelineStages(value: Json | null): PipelineStage[] {
  return Array.isArray(value) ? (value as unknown as PipelineStage[]) : [];
}

function writePipelineStages(stages: PipelineStage[]): Json {
  return stages as unknown as Json;
}

export function buildCustomPipelineStages(stageLabels: string[]): PipelineStage[] {
  return stageLabels
    .map((label) => label.trim())
    .filter(Boolean)
    .map((label, index) => ({
      stage_id: newId("custom-stage"),
      label,
      display_order: index,
      metadata: {},
    }));
}

export function canDeletePipeline(pipeline: Pick<Pipeline, "source">): boolean {
  return pipeline.source === "custom";
}

export async function fetchPipelines(): Promise<Pipeline[]> {
  const { data, error } = await supabase
    .from("pipelines")
    .select("*")
    .order("naam", { ascending: true });
  if (error) throw error;
  return ((data as unknown as PipelineRow[]) ?? []).map(mapPipelineRow);
}

export async function setPipelineActive(pipelineId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("pipelines")
    .update({ is_active: isActive })
    .eq("pipeline_id", pipelineId);
  if (error) throw error;
}

export async function triggerHubSpotPipelinesSync(): Promise<{ upserted: number }> {
  return invokeEdgeFunction<{ upserted: number }>("hubspot-pipelines");
}

export async function triggerDescribePipeline(pipelineId: string): Promise<{ beschrijving: string }> {
  return invokeEdgeFunction<{ beschrijving: string }>("describe-pipeline", { pipeline_id: pipelineId });
}

export async function createCustomPipeline(input: CustomPipelineInput): Promise<Pipeline> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("pipelines")
    .insert({
      pipeline_id: newId("custom"),
      naam: input.naam.trim(),
      stages: writePipelineStages(buildCustomPipelineStages(input.stages)),
      synced_at: now,
      updated_at: now,
      beschrijving: input.beschrijving?.trim() || null,
      is_active: input.isActive ?? true,
      source: "custom",
    })
    .select("*")
    .single();
  if (error) throw toFriendlyDbError(error);
  return mapPipelineRow(data as unknown as PipelineRow);
}

export async function updateCustomPipeline(
  input: { pipelineId: string } & CustomPipelineInput,
): Promise<void> {
  const { error } = await supabase
    .from("pipelines")
    .update({
      naam: input.naam.trim(),
      stages: writePipelineStages(buildCustomPipelineStages(input.stages)),
      beschrijving: input.beschrijving?.trim() || null,
      is_active: input.isActive ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq("pipeline_id", input.pipelineId)
    .eq("source", "custom");
  if (error) throw toFriendlyDbError(error);
}

export async function deleteCustomPipeline(pipelineId: string): Promise<void> {
  const { data: pipeline, error: fetchError } = await supabase
    .from("pipelines")
    .select("source")
    .eq("pipeline_id", pipelineId)
    .maybeSingle();
  if (fetchError) throw toFriendlyDbError(fetchError);
  if (!pipeline || pipeline.source !== "custom") {
    throw new Error("Alleen custom pipelines kunnen verwijderd worden.");
  }

  const { error: stateError } = await supabase
    .from("process_state")
    .delete()
    .eq("id", pipelineId);
  if (stateError) throw stateError;

  const { error } = await supabase
    .from("pipelines")
    .delete()
    .eq("pipeline_id", pipelineId)
    .eq("source", "custom");
  if (error) throw toFriendlyDbError(error);
}
