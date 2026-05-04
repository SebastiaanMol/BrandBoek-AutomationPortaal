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

export interface FlowSuggestie {
  fromId: string;
  toId: string;
  fromNaam: string;
  toNaam: string;
  fromCategorie: string;
  toCategorie: string;
  zekerheid: "webhook" | "ai";
  redenering: string;
}

export function toZekerheid(confidence: number): "webhook" | "ai" {
  return confidence >= 1.0 ? "webhook" : "ai";
}

export async function fetchFlowSuggesties(): Promise<FlowSuggestie[]> {
  const { data, error } = await supabase
    .from("automatisering_ai_flows")
    .select(
      "from_id, to_id, confidence, reasoning, from_auto:automatiseringen!from_id(naam, categorie), to_auto:automatiseringen!to_id(naam, categorie)",
    )
    .eq("confirmed", false)
    .eq("rejected", false);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    fromId: r.from_id,
    toId: r.to_id,
    fromNaam: (r.from_auto as { naam: string } | null)?.naam ?? "",
    toNaam: (r.to_auto as { naam: string } | null)?.naam ?? "",
    fromCategorie: (r.from_auto as { categorie: string } | null)?.categorie ?? "",
    toCategorie: (r.to_auto as { categorie: string } | null)?.categorie ?? "",
    zekerheid: toZekerheid(r.confidence),
    redenering: r.reasoning ?? "",
  }));
}

export async function bevestigFlowSuggestie(fromId: string, toId: string): Promise<void> {
  const { error: e1 } = await supabase
    .from("automatisering_ai_flows")
    .delete()
    .eq("from_id", fromId)
    .eq("to_id", toId);
  if (e1) throw e1;

  const { error: e2 } = await supabase.from("automation_links").insert({
    source_id: fromId,
    target_id: toId,
    match_type: "ai_flow",
    confirmed: true,
  });
  if (e2) throw e2;
}

export async function verwerpFlowSuggestie(fromId: string, toId: string): Promise<void> {
  const { error } = await supabase
    .from("automatisering_ai_flows")
    .delete()
    .eq("from_id", fromId)
    .eq("to_id", toId);
  if (error) throw error;
}
