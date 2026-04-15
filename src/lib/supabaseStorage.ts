import { supabase } from "@/integrations/supabase/client";
import { Automatisering, Integration, Koppeling, KlantFase, Systeem, Categorie, Status } from "./types";

function toFriendlyDbError(error: any): Error {
  const message = String(error?.message || "").toLowerCase();
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

// --- Fetch all automatiseringen with their koppelingen ---
export async function fetchAutomatiseringen(): Promise<Automatisering[]> {
  const { data: rows, error } = await supabase
    .from("automatiseringen")
    .select("*, import_proposal")
    .or("source.is.null,import_status.is.null,import_status.eq.approved")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const { data: koppelingen, error: kopError } = await supabase
    .from("koppelingen")
    .select("*");

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
    beschrijvingInSimpeleTaal: (r.import_proposal as any)?.beschrijving_in_simpele_taal ?? undefined,
    gitlabFilePath: r.gitlab_file_path ?? undefined,
    gitlabLastCommit: r.gitlab_last_commit ?? undefined,
    aiDescription: r.ai_description ?? undefined,
    aiDescriptionUpdatedAt: r.ai_description_updated_at ?? undefined,
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
  const { error } = await supabase.from("automatiseringen").update({
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
  }).eq("id", item.id);
  if (error) throw toFriendlyDbError(error);

  // Delete existing koppelingen and re-insert
  const { error: delError } = await supabase.from("koppelingen").delete().eq("bron_id", item.id);
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
  const update: Record<string, any> = {
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
async function invokeEdgeFunction(
  name: string
): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> {
  const { data, error } = await supabase.functions.invoke(name);

  if (error) {
    const context = (error as any)?.context;
    // supabase-js v2.x passes the parsed JSON body as context directly
    if (context && typeof context.error === "string") {
      throw new Error(context.error);
    }
    // Older versions passed the Response object — keep as fallback
    if (context && typeof context.json === "function") {
      try {
        const body = await context.json();
        if (body?.error) throw new Error(body.error);
      } catch (e: any) {
        if (e.message && e.message !== error.message) throw e;
      }
    }
    throw new Error(error.message);
  }

  return data as { inserted: number; updated: number; deactivated: number; total: number };
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
  steps:       unknown[];   // ProcessStep[]
  connections: unknown[];   // Connection[]
  autoLinks:   Record<string, { fromStepId: string; toStepId: string }>;
}

const PROCESS_STATE_ID = "main";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function fetchProcessState(): Promise<SavedProcessState | null> {
  const { data, error } = await db
    .from("process_state")
    .select("steps, connections, auto_links")
    .eq("id", PROCESS_STATE_ID)
    .maybeSingle();

  if (error) throw error;
  if (!data)  return null;

  return {
    steps:       (data.steps       ?? []) as unknown[],
    connections: (data.connections ?? []) as unknown[],
    autoLinks:   (data.auto_links  ?? {}) as Record<string, { fromStepId: string; toStepId: string }>,
  };
}

export async function saveProcessState(state: SavedProcessState): Promise<void> {
  const { error } = await db
    .from("process_state")
    .upsert(
      {
        id:          PROCESS_STATE_ID,
        steps:       state.steps,
        connections: state.connections,
        auto_links:  state.autoLinks,
        updated_at:  new Date().toISOString(),
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
