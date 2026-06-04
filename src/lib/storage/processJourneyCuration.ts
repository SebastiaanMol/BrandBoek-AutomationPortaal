import { supabase } from "@/integrations/supabase/client";
import type { Systeem } from "@/lib/types";

export type CuratedProcessJourneyKind = "concept" | "flow";

export interface CuratedProcessJourneyTransitionInput {
  fromId: string;
  toId: string;
}

export interface SaveCuratedProcessJourneyInput {
  kind: CuratedProcessJourneyKind;
  flowId?: string;
  title: string;
  description: string;
  automationIds: string[];
  systemen: Systeem[];
  transitions: CuratedProcessJourneyTransitionInput[];
}

export interface SaveCuratedProcessJourneyResult {
  flowId: string;
  mode: "created" | "updated";
}

export async function saveCuratedProcessJourney(
  input: SaveCuratedProcessJourneyInput,
): Promise<SaveCuratedProcessJourneyResult> {
  if (input.kind === "flow") {
    if (!input.flowId) throw new Error("Flow ID ontbreekt voor bijwerken");
    await updateExistingFlow(input);
    return { flowId: input.flowId, mode: "updated" };
  }

  const flowId = await createFlow(input);
  await confirmConceptTransitions(input.transitions);
  await upsertWebhookAutomationLinks(input.transitions);
  await attachConceptTransitionsToFlow(input.transitions, flowId);
  return { flowId, mode: "created" };
}

async function createFlow(input: SaveCuratedProcessJourneyInput): Promise<string> {
  const { data, error } = await supabase
    .from("flows")
    .insert({
      naam: input.title,
      beschrijving: input.description,
      systemen: input.systemen,
      automation_ids: input.automationIds,
    })
    .select()
    .single();

  if (error) throw error;
  return data.id;
}

async function updateExistingFlow(input: SaveCuratedProcessJourneyInput): Promise<void> {
  const { error } = await supabase
    .from("flows")
    .update({
      naam: input.title,
      beschrijving: input.description,
      systemen: input.systemen,
      automation_ids: input.automationIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.flowId);

  if (error) throw error;
}

async function confirmConceptTransitions(transitions: CuratedProcessJourneyTransitionInput[]): Promise<void> {
  for (const transition of transitions) {
    const { error } = await supabase
      .from("automatisering_ai_flows")
      .update({ confirmed: true, rejected: false })
      .eq("from_id", transition.fromId)
      .eq("to_id", transition.toId)
      .gte("confidence", 1)
      .ilike("reasoning", "Webhook-match:%")
      .is("flow_id", null);
    if (error) throw error;
  }
}

async function attachConceptTransitionsToFlow(
  transitions: CuratedProcessJourneyTransitionInput[],
  flowId: string,
): Promise<void> {
  for (const transition of transitions) {
    const { error } = await supabase
      .from("automatisering_ai_flows")
      .update({ flow_id: flowId, confirmed: true, rejected: false })
      .eq("from_id", transition.fromId)
      .eq("to_id", transition.toId)
      .gte("confidence", 1)
      .ilike("reasoning", "Webhook-match:%")
      .is("flow_id", null);
    if (error) throw error;
  }
}

async function upsertWebhookAutomationLinks(
  transitions: CuratedProcessJourneyTransitionInput[],
): Promise<void> {
  if (transitions.length === 0) return;

  const webhookPayload = transitions.map((transition) => ({
    source_id: transition.fromId,
    target_id: transition.toId,
    match_type: "webhook",
    confirmed: true,
  }));
  const result = await supabase
    .from("automation_links")
    .upsert(webhookPayload, { onConflict: "source_id,target_id" });

  if (!isLegacyMatchTypeConstraintError(result.error)) {
    if (result.error) throw result.error;
    return;
  }

  const fallback = await supabase
    .from("automation_links")
    .upsert(
      transitions.map((transition) => ({
        source_id: transition.fromId,
        target_id: transition.toId,
        match_type: "exact",
        confirmed: true,
      })),
      { onConflict: "source_id,target_id" },
    );
  if (fallback.error) throw fallback.error;
}

function isLegacyMatchTypeConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { message?: string; details?: string; code?: string };
  return [maybeError.message, maybeError.details, maybeError.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes("automation_links_match_type_check");
}
