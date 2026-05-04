import { supabase } from "@/integrations/supabase/client";
import {
  Automatisering,
  Categorie,
  KlantFase,
  Koppeling,
  Status,
  Systeem,
} from "../types";
import { toFriendlyDbError } from "./errors";

interface ImportProposalShape {
  beschrijving_in_simpele_taal?: string[];
}

export async function fetchAutomatiseringen(): Promise<Automatisering[]> {
  const [
    { data: rows, error },
    { data: koppelingen, error: kopError },
  ] = await Promise.all([
    supabase
      .from("automatiseringen")
      .select("*, import_proposal")
      .or("source.is.null,import_status.is.null,import_status.eq.approved")
      .order("created_at", { ascending: true }),
    supabase.from("koppelingen").select("*"),
  ]);

  if (error) throw error;
  if (kopError) throw kopError;

  const kopMap: Record<string, Koppeling[]> = {};
  (koppelingen || []).forEach((k) => {
    if (!kopMap[k.bron_id]) kopMap[k.bron_id] = [];
    kopMap[k.bron_id].push({ doelId: k.doel_id, label: k.label });
  });

  return (rows || []).map((r) => ({
    id: r.id,
    naam: r.naam,
    categorie: r.categorie as Categorie,
    doel: r.doel,
    trigger: r.trigger_beschrijving,
    systemen: (r.systemen || []) as Systeem[],
    stappen: r.stappen || [],
    afhankelijkheden: r.afhankelijkheden,
    owner: r.owner,
    status: r.status as Status,
    verbeterideeen: r.verbeterideeen,
    mermaidDiagram: r.mermaid_diagram,
    koppelingen: kopMap[r.id] || [],
    fasen: (r.fasen || []) as KlantFase[],
    createdAt: r.created_at,
    laatstGeverifieerd: r.laatst_geverifieerd,
    geverifieerdDoor: r.geverifieerd_door,
    externalId: r.external_id ?? undefined,
    source: r.source ?? undefined,
    lastSyncedAt: r.last_synced_at ?? undefined,
    beschrijvingInSimpeleTaal: (r.import_proposal as ImportProposalShape | null)?.beschrijving_in_simpele_taal ?? undefined,
    gitlabFilePath: r.gitlab_file_path ?? undefined,
    gitlabLastCommit: r.gitlab_last_commit ?? undefined,
    aiDescription: r.ai_description ?? undefined,
    aiDescriptionUpdatedAt: r.ai_description_updated_at ?? undefined,
    pipelineId: r.pipeline_id ?? undefined,
    stageId: r.stage_id ?? undefined,
  }));
}

export async function insertAutomatisering(item: Automatisering): Promise<void> {
  const { error } = await supabase.from("automatiseringen").insert({
    id: item.id,
    naam: item.naam,
    categorie: item.categorie,
    doel: item.doel,
    trigger_beschrijving: item.trigger,
    systemen: item.systemen,
    stappen: item.stappen,
    afhankelijkheden: item.afhankelijkheden,
    owner: item.owner,
    status: item.status,
    verbeterideeen: item.verbeterideeen,
    mermaid_diagram: item.mermaidDiagram,
    fasen: item.fasen,
  });
  if (error) throw toFriendlyDbError(error);

  if (item.koppelingen.length > 0) {
    const { error: kopError } = await supabase.from("koppelingen").insert(
      item.koppelingen.map((k) => ({
        bron_id: item.id,
        doel_id: k.doelId,
        label: k.label,
      }))
    );
    if (kopError) throw kopError;
  }
}

export async function updateAutomatisering(item: Automatisering): Promise<void> {
  const [{ error }, { error: delError }] = await Promise.all([
    supabase.from("automatiseringen").update({
      naam: item.naam,
      categorie: item.categorie,
      doel: item.doel,
      trigger_beschrijving: item.trigger,
      systemen: item.systemen,
      stappen: item.stappen,
      afhankelijkheden: item.afhankelijkheden,
      owner: item.owner,
      status: item.status,
      verbeterideeen: item.verbeterideeen,
      mermaid_diagram: item.mermaidDiagram,
      fasen: item.fasen,
    }).eq("id", item.id),
    supabase.from("koppelingen").delete().eq("bron_id", item.id),
  ]);

  if (error) throw toFriendlyDbError(error);
  if (delError) throw delError;

  if (item.koppelingen.length > 0) {
    const { error: kopError } = await supabase.from("koppelingen").insert(
      item.koppelingen.map((k) => ({
        bron_id: item.id,
        doel_id: k.doelId,
        label: k.label,
      }))
    );
    if (kopError) throw kopError;
  }
}

export async function deleteAutomatisering(id: string): Promise<void> {
  const { error: kopError } = await supabase
    .from("koppelingen")
    .delete()
    .or(`bron_id.eq.${id},doel_id.eq.${id}`);
  if (kopError) throw kopError;

  const { error } = await supabase
    .from("automatiseringen")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function verifieerAutomatisering(id: string, door: string, status?: string): Promise<void> {
  const update: { laatst_geverifieerd: string; geverifieerd_door: string; status?: string } = {
    laatst_geverifieerd: new Date().toISOString(),
    geverifieerd_door: door,
  };
  if (status) update.status = status;
  const { error } = await supabase.from("automatiseringen").update(update).eq("id", id);
  if (error) throw error;
}

export async function generateNextId(): Promise<string> {
  const { data, error } = await supabase.rpc("generate_auto_id");
  if (error) {
    const { count } = await supabase
      .from("automatiseringen")
      .select("*", { count: "exact", head: true });
    return `AUTO-${String((count || 0) + 1).padStart(3, "0")}`;
  }
  return data as string;
}

export function exportToCSV(data: Automatisering[]): string {
  const headers = ["ID", "Naam", "Categorie", "Doel", "Trigger", "Systemen", "Owner", "Status", "Fasen"];
  const rows = data.map((a) => [
    a.id, a.naam, a.categorie, a.doel, a.trigger,
    a.systemen.join("; "), a.owner, a.status, (a.fasen || []).join("; "),
  ]);
  return [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
}
