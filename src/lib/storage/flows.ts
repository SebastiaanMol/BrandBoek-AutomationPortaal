import { supabase } from "@/integrations/supabase/client";
import { Automatisering, Flow, Systeem } from "../types";
import { invokeEdgeFunction } from "./edgeFunctions";

export async function fetchFlows(): Promise<Flow[]> {
  const { data, error } = await supabase
    .from("flows")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    naam: r.naam,
    beschrijving: r.beschrijving ?? "",
    systemen: (r.systemen ?? []) as Systeem[],
    automationIds: r.automation_ids ?? [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function insertFlow(
  flow: Omit<Flow, "id" | "createdAt" | "updatedAt">,
): Promise<Flow> {
  const { data, error } = await supabase
    .from("flows")
    .insert({
      naam: flow.naam,
      beschrijving: flow.beschrijving,
      systemen: flow.systemen,
      automation_ids: flow.automationIds,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    naam: data.naam,
    beschrijving: data.beschrijving ?? "",
    systemen: (data.systemen ?? []) as Systeem[],
    automationIds: data.automation_ids ?? [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function updateFlow(
  id: string,
  updates: Partial<Pick<Flow, "naam" | "beschrijving" | "systemen" | "automationIds">>,
): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.naam !== undefined) payload.naam = updates.naam;
  if (updates.beschrijving !== undefined) payload.beschrijving = updates.beschrijving;
  if (updates.systemen !== undefined) payload.systemen = updates.systemen;
  if (updates.automationIds !== undefined) payload.automation_ids = updates.automationIds;
  const { error } = await supabase.from("flows").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteFlow(id: string): Promise<void> {
  const { error } = await supabase.from("flows").delete().eq("id", id);
  if (error) throw error;
}

export interface FlowNameResult {
  naam: string;
  beschrijving: string;
}

export async function nameFlow(
  automations: Pick<Automatisering, "naam" | "doel" | "trigger" | "categorie" | "systemen">[],
): Promise<FlowNameResult> {
  return invokeEdgeFunction<FlowNameResult>("name-flow", {
    automations: automations.map((a) => ({
      naam: a.naam,
      doel: a.doel,
      trigger: a.trigger,
      categorie: a.categorie,
      systemen: a.systemen,
    })),
  });
}
