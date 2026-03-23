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
    .select("*")
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

export async function triggerHubSpotSync(): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> {
  const integration = await fetchIntegration("hubspot");
  if (!integration) throw new Error("Geen HubSpot-integratie gevonden");

  const hubspotRes = await fetch("/hubspot-api/automation/v3/workflows", {
    headers: { Authorization: `Bearer ${integration.token}` },
  });

  if (!hubspotRes.ok) {
    const errorMessage = hubspotRes.status === 401
      ? "Ongeldige HubSpot token. Controleer je Private App token."
      : `HubSpot API fout (${hubspotRes.status})`;
    await supabase.from("integrations").update({ status: "error", error_message: errorMessage }).eq("id", integration.id);
    throw new Error(errorMessage);
  }

  const body = await hubspotRes.json();
  const workflows: any[] = body.workflows ?? body.results ?? [];

  const { data: existing } = await supabase
    .from("automatiseringen")
    .select("id, external_id, status")
    .eq("source", "hubspot");

  const existingByExternalId: Record<string, { id: string; status: string }> = {};
  for (const row of existing || []) {
    if (row.external_id) existingByExternalId[row.external_id] = { id: row.id, status: row.status };
  }

  const syncedExternalIds = new Set<string>();
  let inserted = 0;
  let updated = 0;

  for (const wf of workflows) {
    const externalId = String(wf.id);
    syncedExternalIds.add(externalId);
    const status = wf.enabled ? "Actief" : "Uitgeschakeld";
    const now = new Date().toISOString();

    if (existingByExternalId[externalId]) {
      await supabase.from("automatiseringen").update({ naam: wf.name, status, last_synced_at: now }).eq("id", existingByExternalId[externalId].id);
      updated++;
    } else {
      const { data: newId } = await supabase.rpc("generate_auto_id");
      await supabase.from("automatiseringen").insert({
        id: newId || `AUTO-HS-${externalId}`,
        naam: wf.name,
        categorie: "HubSpot Workflow",
        doel: "",
        trigger_beschrijving: wf.enrollmentCriteria?.type || "",
        systemen: ["HubSpot"],
        stappen: Array.isArray(wf.actions) ? wf.actions.map((a: any) => a.type || "Stap") : [],
        afhankelijkheden: "",
        owner: "",
        status,
        verbeterideeen: "",
        mermaid_diagram: "",
        fasen: [],
        external_id: externalId,
        source: "hubspot",
        last_synced_at: now,
      });
      inserted++;
    }
  }

  let deactivated = 0;
  for (const [extId, row] of Object.entries(existingByExternalId)) {
    if (!syncedExternalIds.has(extId) && row.status !== "Uitgeschakeld") {
      await supabase.from("automatiseringen").update({ status: "Uitgeschakeld" }).eq("id", row.id);
      deactivated++;
    }
  }

  await supabase.from("integrations").update({
    last_synced_at: new Date().toISOString(),
    status: "connected",
    error_message: null,
  }).eq("id", integration.id);

  return { inserted, updated, deactivated, total: workflows.length };
}

export async function triggerZapierSync(): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> {
  const integration = await fetchIntegration("zapier");
  if (!integration) throw new Error("Geen Zapier-integratie gevonden");

  const res = await fetch("/zapier-api/v1/zaps", {
    headers: { "X-API-Key": integration.token },
  });

  if (!res.ok) {
    const errorMessage = res.status === 401
      ? "Ongeldige Zapier API key."
      : `Zapier API fout (${res.status})`;
    await supabase.from("integrations").update({ status: "error", error_message: errorMessage }).eq("id", integration.id);
    throw new Error(errorMessage);
  }

  const body = await res.json();
  const zaps: any[] = body.zaps ?? body.results ?? [];

  const { data: existing } = await supabase
    .from("automatiseringen").select("id, external_id, status").eq("source", "zapier");

  const existingByExternalId: Record<string, { id: string; status: string }> = {};
  for (const row of existing || []) {
    if (row.external_id) existingByExternalId[row.external_id] = { id: row.id, status: row.status };
  }

  const syncedIds = new Set<string>();
  let inserted = 0; let updated = 0;

  for (const zap of zaps) {
    const externalId = String(zap.id);
    syncedIds.add(externalId);
    const status = zap.is_enabled ? "Actief" : "Uitgeschakeld";
    const now = new Date().toISOString();
    const systemen = [...new Set((zap.steps || []).map((s: any) => s.app?.name).filter(Boolean))] as string[];

    if (existingByExternalId[externalId]) {
      await supabase.from("automatiseringen").update({ naam: zap.title, status, last_synced_at: now }).eq("id", existingByExternalId[externalId].id);
      updated++;
    } else {
      const { data: newId } = await supabase.rpc("generate_auto_id");
      await supabase.from("automatiseringen").insert({
        id: newId || `AUTO-ZP-${externalId}`,
        naam: zap.title,
        categorie: "Zapier Zap",
        doel: "",
        trigger_beschrijving: zap.steps?.[0]?.app?.name || "",
        systemen: systemen.length ? systemen : ["Zapier"],
        stappen: (zap.steps || []).map((s: any) => s.app?.name || "Stap"),
        afhankelijkheden: "", owner: "", status, verbeterideeen: "", mermaid_diagram: "", fasen: [],
        external_id: externalId, source: "zapier", last_synced_at: now,
      });
      inserted++;
    }
  }

  let deactivated = 0;
  for (const [extId, row] of Object.entries(existingByExternalId)) {
    if (!syncedIds.has(extId) && row.status !== "Uitgeschakeld") {
      await supabase.from("automatiseringen").update({ status: "Uitgeschakeld" }).eq("id", row.id);
      deactivated++;
    }
  }

  await supabase.from("integrations").update({ last_synced_at: new Date().toISOString(), status: "connected", error_message: null }).eq("id", integration.id);
  return { inserted, updated, deactivated, total: zaps.length };
}

export async function triggerTypeformSync(): Promise<{ inserted: number; updated: number; deactivated: number; total: number }> {
  const integration = await fetchIntegration("typeform");
  if (!integration) throw new Error("Geen Typeform-integratie gevonden");

  const res = await fetch("/typeform-api/forms?page_size=200", {
    headers: { Authorization: `Bearer ${integration.token}` },
  });

  if (!res.ok) {
    const errorMessage = res.status === 401
      ? "Ongeldige Typeform token."
      : `Typeform API fout (${res.status})`;
    await supabase.from("integrations").update({ status: "error", error_message: errorMessage }).eq("id", integration.id);
    throw new Error(errorMessage);
  }

  const body = await res.json();
  const forms: any[] = body.items ?? [];

  const { data: existing } = await supabase
    .from("automatiseringen").select("id, external_id, status").eq("source", "typeform");

  const existingByExternalId: Record<string, { id: string; status: string }> = {};
  for (const row of existing || []) {
    if (row.external_id) existingByExternalId[row.external_id] = { id: row.id, status: row.status };
  }

  const syncedIds = new Set<string>();
  let inserted = 0; let updated = 0;

  for (const form of forms) {
    const externalId = String(form.id);
    syncedIds.add(externalId);
    const now = new Date().toISOString();

    if (existingByExternalId[externalId]) {
      await supabase.from("automatiseringen").update({ naam: form.title, last_synced_at: now }).eq("id", existingByExternalId[externalId].id);
      updated++;
    } else {
      const { data: newId } = await supabase.rpc("generate_auto_id");
      await supabase.from("automatiseringen").insert({
        id: newId || `AUTO-TF-${externalId}`,
        naam: form.title,
        categorie: "Typeform",
        doel: "",
        trigger_beschrijving: "Typeform submission",
        systemen: ["Typeform"],
        stappen: ["Formulier ingevuld", "Data verwerkt"],
        afhankelijkheden: "", owner: "", status: "Actief", verbeterideeen: "", mermaid_diagram: "", fasen: [],
        external_id: externalId, source: "typeform", last_synced_at: now,
      });
      inserted++;
    }
  }

  let deactivated = 0;
  for (const [extId, row] of Object.entries(existingByExternalId)) {
    if (!syncedIds.has(extId) && row.status !== "Uitgeschakeld") {
      await supabase.from("automatiseringen").update({ status: "Uitgeschakeld" }).eq("id", row.id);
      deactivated++;
    }
  }

  await supabase.from("integrations").update({ last_synced_at: new Date().toISOString(), status: "connected", error_message: null }).eq("id", integration.id);
  return { inserted, updated, deactivated, total: forms.length };
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
