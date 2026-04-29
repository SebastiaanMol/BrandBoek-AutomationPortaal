import { supabase } from "@/integrations/supabase/client";
import { Automatisering, Flow, Integration, Koppeling, KlantFase, Systeem, Categorie, Status, PortalSettings, getPortalSettings, Pipeline, PipelineStage } from "./types";

function toFriendlyDbError(error: unknown): Error {
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  const isDuplicateName =
    error?.code === "23505" &&
    (message.includes("automatiseringen_naam") ||
      message.includes("naam_normalized") ||
      message.includes("duplicate key"));

  if (isDuplicateName) {
    return new Error("Er bestaat al een automatisering met (bijna) dezelfde naam.");
  }

  return error instanceof Error ? error : new Error("Databasefout");
}

interface ImportProposalShape {
  beschrijving_in_simpele_taal?: string[];
}

// --- Fetch all automatiseringen with their koppelingen ---
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

  // Group koppelingen by bron_id
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
    verbeterideeën: r.verbeterideeen,
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
    pipelineId:            r.pipeline_id ?? undefined,
    stageId:               r.stage_id ?? undefined,
  }));
}

// --- Save new automatisering + koppelingen ---
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
    verbeterideeen: item.verbeterideeën,
    mermaid_diagram: item.mermaidDiagram,
    fasen: item.fasen,
  });
  if (error) throw toFriendlyDbError(error);

  // Insert koppelingen
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

// --- Update existing automatisering + koppelingen ---
export async function updateAutomatisering(item: Automatisering): Promise<void> {
  // Update and delete are independent — run in parallel
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
      verbeterideeen: item.verbeterideeën,
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

// --- Delete automatisering + koppelingen ---
export async function deleteAutomatisering(id: string): Promise<void> {
  // Delete koppelingen first (both as bron and doel)
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

// --- Verify automatisering ---
export async function verifieerAutomatisering(id: string, door: string, status?: string): Promise<void> {
  const update: { laatst_geverifieerd: string; geverifieerd_door: string; status?: string } = {
    laatst_geverifieerd: new Date().toISOString(),
    geverifieerd_door: door,
  };
  if (status) update.status = status;
  const { error } = await supabase.from("automatiseringen").update(update).eq("id", id);
  if (error) throw error;
}

// --- Generate next ID ---
export async function generateNextId(): Promise<string> {
  const { data, error } = await supabase.rpc("generate_auto_id");
  if (error) {
    // Fallback
    const { count } = await supabase
      .from("automatiseringen")
      .select("*", { count: "exact", head: true });
    return `AUTO-${String((count || 0) + 1).padStart(3, "0")}`;
  }
  return data as string;
}

// --- Integration CRUD ---

export async function fetchIntegration(type: string): Promise<Integration | null> {
  const { data, error } = await supabase
    .from("integrations")
    .select("*")
    .eq("type", type)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    userId: data.user_id,
    type: data.type,
    token: data.token,
    lastSyncedAt: data.last_synced_at,
    status: data.status as Integration["status"],
    errorMessage: data.error_message,
    createdAt: data.created_at,
  };
}

export async function saveIntegration(type: string, token: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Niet ingelogd");
  const { error } = await supabase.from("integrations").upsert(
    { user_id: user.id, type, token, status: "connected", error_message: null },
    { onConflict: "user_id,type" }
  );
  if (error) throw error;
}

export async function deleteIntegration(type: string): Promise<void> {
  const { error } = await supabase.from("integrations").delete().eq("type", type);
  if (error) throw error;
}

// ─── Helper: call an Edge Function and throw on error ────────────────────────
async function invokeEdgeFunction<T = { inserted: number; updated: number; deactivated: number; total: number }>(
  name: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, body ? { body } : undefined);

  if (error) {
    const context = (error as Record<string, unknown>)?.context;
    // supabase-js v2.x passes the parsed JSON body as context directly
    if (context && typeof (context as Record<string, unknown>).error === "string") {
      throw new Error((context as Record<string, unknown>).error as string);
    }
    // Older versions passed the Response object — keep as fallback
    if (context && typeof (context as Record<string, unknown>).json === "function") {
      try {
        const errBody = await (context as { json: () => Promise<Record<string, unknown>> }).json();
        if (errBody?.error) throw new Error(errBody.error as string);
      } catch (e: unknown) {
        const eMsg = e instanceof Error ? e.message : undefined;
        if (eMsg && eMsg !== error.message) throw e;
      }
    }
    throw new Error(error.message);
  }

  return data as T;
}

export async function triggerHubSpotSync(): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> {
  return invokeEdgeFunction("hubspot-sync");
}

export async function triggerZapierSync(): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> {
  return invokeEdgeFunction("zapier-sync");
}

export async function triggerTypeformSync(): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> {
  return invokeEdgeFunction("typeform-sync");
}

export async function triggerGitlabSync(): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> {
  return invokeEdgeFunction("gitlab-sync");
}

// ─── Process state (canvas) ───────────────────────────────────────────────────

export interface SavedProcessState {
  steps:       unknown[];
  connections: unknown[];
  autoLinks:   Record<string, { fromStepId: string; toStepId: string }>;
  parkedSteps: unknown[];   // ProcessStep[] — persisted across sessions
}

// Tables not yet in the generated Supabase types (process_state, portal_settings,
// pipelines, automation_links) require a cast until `supabase gen types` is re-run.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function fetchProcessState(pipelineId: string): Promise<SavedProcessState | null> {
  const { data, error } = await db
    .from("process_state")
    .select("steps, connections, auto_links, parked_steps")
    .eq("id", pipelineId)
    .maybeSingle();

  if (error) throw error;
  if (!data)  return null;

  return {
    steps:       (data.steps        ?? []) as unknown[],
    connections: (data.connections  ?? []) as unknown[],
    autoLinks:   (data.auto_links   ?? {}) as Record<string, { fromStepId: string; toStepId: string }>,
    parkedSteps: (data.parked_steps ?? []) as unknown[],
  };
}

export async function saveProcessState(pipelineId: string, state: SavedProcessState): Promise<void> {
  const { error } = await db
    .from("process_state")
    .upsert(
      {
        id:           pipelineId,
        steps:        state.steps,
        connections:  state.connections,
        auto_links:   state.autoLinks,
        parked_steps: state.parkedSteps,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) throw error;
}

// --- Export CSV ---
export function exportToCSV(data: Automatisering[]): string {
  const headers = ["ID", "Naam", "Categorie", "Doel", "Trigger", "Systemen", "Owner", "Status", "Fasen"];
  const rows = data.map((a) => [
    a.id, a.naam, a.categorie, a.doel, a.trigger,
    a.systemen.join("; "), a.owner, a.status, (a.fasen || []).join("; "),
  ]);
  return [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
}

// ─── Portal Settings ─────────────────────────────────────────────────────────

export async function fetchPortalSettings(): Promise<PortalSettings> {
  const { data, error } = await db
    .from("portal_settings")
    .select("settings")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw error;
  return getPortalSettings((data?.settings ?? {}) as Partial<PortalSettings>);
}

export async function savePortalSettings(settings: PortalSettings): Promise<void> {
  const { error } = await db
    .from("portal_settings")
    .upsert(
      { id: "main", settings, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw error;
}

// ─── Automation Links ─────────────────────────────────────────────────────────

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
    db
      .from("automation_links")
      .select("id, source_id, target_id, match_type, confirmed, target:automatiseringen!target_id(id, naam, gitlab_file_path)")
      .eq("source_id", id),
    db
      .from("automation_links")
      .select("id, source_id, target_id, match_type, confirmed, source:automatiseringen!source_id(id, naam)")
      .eq("target_id", id),
  ]);
  return { asSource: asSource ?? [], asTarget: asTarget ?? [] };
}

export async function confirmAutomationLink(linkId: string): Promise<void> {
  const { error } = await db
    .from("automation_links")
    .update({ confirmed: true })
    .eq("id", linkId);
  if (error) throw error;
}

// ─── Pipelines ────────────────────────────────────────────────────────────────

interface PipelineRow {
  pipeline_id:  string;
  naam:         string;
  stages:       PipelineStage[] | null;
  synced_at:    string;
  beschrijving: string | null;
}

export async function fetchPipelines(): Promise<Pipeline[]> {
  const { data, error } = await db
    .from("pipelines")
    .select("*")
    .order("naam", { ascending: true });
  if (error) throw error;
  return (data as PipelineRow[] ?? []).map((r) => ({
    pipelineId:   r.pipeline_id,
    naam:         r.naam,
    stages:       r.stages ?? [],
    syncedAt:     r.synced_at,
    beschrijving: r.beschrijving ?? null,
  }));
}

export async function triggerHubSpotPipelinesSync(): Promise<{ upserted: number }> {
  return invokeEdgeFunction<{ upserted: number }>("hubspot-pipelines");
}

export async function triggerDescribePipeline(pipelineId: string): Promise<{ beschrijving: string }> {
  return invokeEdgeFunction<{ beschrijving: string }>("describe-pipeline", { pipeline_id: pipelineId });
}

// ─── Flows ────────────────────────────────────────────────────────────────────

export async function fetchFlows(): Promise<Flow[]> {
  const { data, error } = await db
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
  const { data, error } = await db
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
  const { error } = await db.from("flows").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteFlow(id: string): Promise<void> {
  const { error } = await db.from("flows").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchAllConfirmedAutomationLinks(): Promise<
  Array<{ sourceId: string; targetId: string }>
> {
  const { data, error } = await db
    .from("automation_links")
    .select("source_id, target_id")
    .eq("confirmed", true);
  if (error) throw error;
  return (data ?? []).map((r) => ({ sourceId: r.source_id, targetId: r.target_id }));
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
