import { supabase } from "@/integrations/supabase/client";

export type AutomationLinkWithTarget = {
  id: string;
  source_id: string;
  target_id: string;
  match_type: string;
  confirmed: boolean;
  target: { id: string; naam: string; gitlab_file_path: string | null } | null;
};

export type AutomationLinkWithSource = {
  id: string;
  source_id: string;
  target_id: string;
  match_type: string;
  confirmed: boolean;
  source: { id: string; naam: string } | null;
};

export async function fetchAutomationLinks(id: string): Promise<{
  asSource: AutomationLinkWithTarget[];
  asTarget: AutomationLinkWithSource[];
}> {
  const [{ data: asSource }, { data: asTarget }] = await Promise.all([
    supabase
      .from("automation_links")
      .select("id, source_id, target_id, match_type, confirmed, target:automatiseringen!target_id(id, naam, gitlab_file_path)")
      .eq("source_id", id),
    supabase
      .from("automation_links")
      .select("id, source_id, target_id, match_type, confirmed, source:automatiseringen!source_id(id, naam)")
      .eq("target_id", id),
  ]);
  return { asSource: asSource ?? [], asTarget: asTarget ?? [] };
}

export async function confirmAutomationLink(linkId: string): Promise<void> {
  const { error } = await supabase
    .from("automation_links")
    .update({ confirmed: true })
    .eq("id", linkId);
  if (error) throw error;
}

export async function fetchAllConfirmedAutomationLinks(): Promise<
  Array<{ sourceId: string; targetId: string }>
> {
  const { data, error } = await supabase
    .from("automation_links")
    .select("source_id, target_id")
    .eq("confirmed", true);
  if (error) throw error;
  return (data ?? []).map((r) => ({ sourceId: r.source_id, targetId: r.target_id }));
}

export type FlowSuggestie = {
  fromId: string;
  toId: string;
  fromNaam: string;
  toNaam: string;
  fromCategorie: string;
  toCategorie: string;
  fromSource: string | null;
  toSource: string | null;
  zekerheid: "webhook" | "ai";
  redenering: string;
  confirmed: boolean;
  rejected: boolean;
}

export function toZekerheid(confidence: number): "webhook" | "ai" {
  return confidence >= 1.0 ? "webhook" : "ai";
}

type AutoRef = { naam: string; categorie: string; source: string | null } | null;

export async function fetchFlowSuggesties(): Promise<FlowSuggestie[]> {
  const { data, error } = await supabase
    .from("automatisering_ai_flows")
    .select(
      "from_id, to_id, confidence, reasoning, confirmed, rejected, from_auto:automatiseringen!from_id(naam, categorie, source), to_auto:automatiseringen!to_id(naam, categorie, source)",
    )
    .is("flow_id", null);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fromId: r.from_id,
    toId: r.to_id,
    fromNaam: (r.from_auto as AutoRef)?.naam ?? "",
    toNaam: (r.to_auto as AutoRef)?.naam ?? "",
    fromCategorie: (r.from_auto as AutoRef)?.categorie ?? "",
    toCategorie: (r.to_auto as AutoRef)?.categorie ?? "",
    fromSource: (r.from_auto as AutoRef)?.source ?? null,
    toSource: (r.to_auto as AutoRef)?.source ?? null,
    zekerheid: toZekerheid(r.confidence),
    redenering: r.reasoning ?? "",
    confirmed: r.confirmed,
    rejected: r.rejected,
  }));
}

export async function bevestigFlowSuggestie(fromId: string, toId: string): Promise<void> {
  const { error: updateError } = await supabase
    .from("automatisering_ai_flows")
    .update({ confirmed: true, rejected: false })
    .eq("from_id", fromId)
    .eq("to_id", toId);
  if (updateError) throw updateError;
}

export async function verwerpFlowSuggestie(fromId: string, toId: string): Promise<void> {
  const { error } = await supabase
    .from("automatisering_ai_flows")
    .update({ rejected: true, confirmed: false })
    .eq("from_id", fromId)
    .eq("to_id", toId);
  if (error) throw error;
}

export async function ongedaanBevestigFlowSuggestie(fromId: string, toId: string): Promise<void> {
  const { error: updateError } = await supabase
    .from("automatisering_ai_flows")
    .update({ confirmed: false })
    .eq("from_id", fromId)
    .eq("to_id", toId);
  if (updateError) throw updateError;
}

export async function ongedaanVerwerpFlowSuggestie(fromId: string, toId: string): Promise<void> {
  const { error } = await supabase
    .from("automatisering_ai_flows")
    .update({ rejected: false })
    .eq("from_id", fromId)
    .eq("to_id", toId);
  if (error) throw error;
}

export async function accepteerFlowKandidaat(nodeIds: string[], flowId: string): Promise<void> {
  const { data: confirmedSuggestions, error: fetchError } = await supabase
    .from("automatisering_ai_flows")
    .select("from_id, to_id")
    .in("from_id", nodeIds)
    .in("to_id", nodeIds)
    .is("flow_id", null)
    .eq("confirmed", true)
    .eq("rejected", false);
  if (fetchError) throw fetchError;

  if (confirmedSuggestions?.length) {
    const { error: insertError } = await supabase
      .from("automation_links")
      .upsert(
        confirmedSuggestions.map((suggestion) => ({
          source_id: suggestion.from_id,
          target_id: suggestion.to_id,
          match_type: "manual",
          confirmed: true,
        })),
        { onConflict: "source_id,target_id" },
      );
    if (insertError) throw insertError;
  }

  const { error } = await supabase
    .from("automatisering_ai_flows")
    .update({ flow_id: flowId })
    .in("from_id", nodeIds)
    .in("to_id", nodeIds)
    .is("flow_id", null);
  if (error) throw error;
}

export async function fetchOpenSuggestiesVoorFlow(flowId: string): Promise<FlowSuggestie[]> {
  const { data, error } = await supabase
    .from("automatisering_ai_flows")
    .select(
      "from_id, to_id, confidence, reasoning, confirmed, rejected, from_auto:automatiseringen!from_id(naam, categorie, source), to_auto:automatiseringen!to_id(naam, categorie, source)",
    )
    .eq("flow_id", flowId)
    .eq("confirmed", false);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fromId: r.from_id,
    toId: r.to_id,
    fromNaam: (r.from_auto as AutoRef)?.naam ?? "",
    toNaam: (r.to_auto as AutoRef)?.naam ?? "",
    fromCategorie: (r.from_auto as AutoRef)?.categorie ?? "",
    toCategorie: (r.to_auto as AutoRef)?.categorie ?? "",
    fromSource: (r.from_auto as AutoRef)?.source ?? null,
    toSource: (r.to_auto as AutoRef)?.source ?? null,
    zekerheid: toZekerheid(r.confidence),
    redenering: r.reasoning ?? "",
    confirmed: false,
    rejected: r.rejected,
  }));
}
