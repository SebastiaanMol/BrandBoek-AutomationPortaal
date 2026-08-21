import { supabase } from "@/integrations/supabase/client";
import {
  Automatisering,
  AutomationImportProposal,
  AutomationSourceFinding,
  Categorie,
  GitLabEndpointInfo,
  HubSpotWorkflowInfo,
  KlantFase,
  Koppeling,
  Status,
  Systeem,
} from "../types";
import { normalizeAutomationSteps } from "../automationSteps";
import { toFriendlyDbError } from "./errors";

interface ImportProposalShape {
  beschrijving_in_simpele_taal?: string[];
  webhookPaths?: string[];
  gitlab_endpoint?: GitLabEndpointInfo;
  gitlab?: {
    endpoint?: {
      method?: string;
      path?: string;
      api_file?: string;
      handler?: string;
    };
    calls?: GitLabEndpointInfo["calls"];
  };
  hubspot_workflow?: HubSpotWorkflowInfo;
}

interface ReviewerOverridesShape {
  cleanup_delete_candidate?: boolean;
  cleanup_delete_candidate_at?: string | null;
  source_deleted_at?: string | null;
}

type AutomationWithLegacyImprovementField = Automatisering & {
  verbeterideeen?: string;
};

function readVerbeterideeen(item: AutomationWithLegacyImprovementField): string {
  return item.verbeterideeën ?? item.verbeterideeen ?? "";
}

function readJsonArray<T>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? (value as T[]) : undefined;
}

export async function fetchAutomatiseringen(): Promise<Automatisering[]> {
  return fetchAutomatiseringenBase(false);
}

export async function fetchAutomatiseringenIncludingLegacyGitlab(): Promise<Automatisering[]> {
  return fetchAutomatiseringenBase(true);
}

async function fetchAutomatiseringenBase(includeLegacyGitlabFiles: boolean): Promise<Automatisering[]> {
  const [
    { data: rows, error },
    { data: koppelingen, error: kopError },
    { data: sourceFindings, error: findingsError },
  ] = await Promise.all([
    supabase
      .from("automatiseringen")
      .select("*, import_proposal")
      .or("source.is.null,import_status.is.null,import_status.eq.approved")
      .order("created_at", { ascending: true }),
    supabase.from("koppelingen").select("*"),
    (supabase as any)
      .from("automation_source_findings")
      .select("*")
      .is("resolved_at", null),
  ]);

  if (error) throw error;
  if (kopError) throw kopError;
  if (findingsError) throw findingsError;

  const kopMap: Record<string, Koppeling[]> = {};
  (koppelingen || []).forEach((k) => {
    if (!kopMap[k.bron_id]) kopMap[k.bron_id] = [];
    kopMap[k.bron_id].push({ doelId: k.doel_id, label: k.label });
  });

  const findingsMap: Record<string, AutomationSourceFinding[]> = {};
  ((sourceFindings ?? []) as any[]).forEach((finding) => {
    const automationId = String(finding.automation_id ?? "");
    if (!automationId) return;
    if (!findingsMap[automationId]) findingsMap[automationId] = [];
    findingsMap[automationId].push({
      id: finding.id,
      automationId,
      source: finding.source,
      externalId: finding.external_id,
      type: finding.type,
      severity: finding.severity,
      message: finding.message,
      details: finding.details_sanitized ?? undefined,
      dedupeKey: finding.dedupe_key,
      firstSeenAt: finding.first_seen_at,
      lastSeenAt: finding.last_seen_at,
      resolvedAt: finding.resolved_at,
      resolvedReason: finding.resolved_reason,
      syncRunId: finding.sync_run_id,
    });
  });

  return (rows || [])
    .filter((r) => includeLegacyGitlabFiles || !isLegacyGitlabFileRecord(r.source, r.external_id))
    .filter((r) => !isSourceDeletedAutomation(r))
    .map((r) => {
    const reviewerOverrides = (r.reviewer_overrides ?? {}) as ReviewerOverridesShape;

    return ({
    id: r.id,
    naam: r.naam,
    categorie: r.categorie as Categorie,
    doel: r.doel,
    trigger: r.trigger_beschrijving,
    systemen: (r.systemen || []) as Systeem[],
    stappen: normalizeAutomationSteps(r.stappen, r.source),
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
    endpoints: r.endpoints ?? undefined,
    source: r.source ?? undefined,
    lastSyncedAt: r.last_synced_at ?? undefined,
    hubspotLastRunAt: r.hubspot_last_run_at ?? undefined,
    hubspotRunCount365d: r.hubspot_run_count_365d ?? undefined,
    hubspotWorkflow: (r.import_proposal as ImportProposalShape | null)?.hubspot_workflow ?? undefined,
    webhookPaths: (r.import_proposal as ImportProposalShape | null)?.webhookPaths ?? undefined,
    branches: readJsonArray(r.branches),
    beschrijvingInSimpeleTaal: (r.import_proposal as ImportProposalShape | null)?.beschrijving_in_simpele_taal ?? undefined,
    gitlabFilePath: r.gitlab_file_path ?? undefined,
    gitlabEndpoint: readGitLabEndpoint(r.import_proposal as ImportProposalShape | null),
    importProposal: (r.import_proposal as AutomationImportProposal | null) ?? undefined,
    gitlabLastCommit: r.gitlab_last_commit ?? undefined,
    aiDescription: r.ai_description ?? undefined,
    aiDescriptionUpdatedAt: r.ai_description_updated_at ?? undefined,
    cleanupDeleteCandidate: reviewerOverrides.cleanup_delete_candidate ?? r.cleanup_delete_candidate ?? false,
    cleanupDeleteCandidateAt: reviewerOverrides.cleanup_delete_candidate_at ?? r.cleanup_delete_candidate_at ?? undefined,
    sourceFindings: findingsMap[r.id] ?? [],
    pipelineId: r.pipeline_id ?? undefined,
    stageId: r.stage_id ?? undefined,
    });
  });
}

function isLegacyGitlabFileRecord(source: string | null, externalId: string | null): boolean {
  return source === "gitlab" && (!externalId || !externalId.includes("::"));
}

function isSourceDeletedAutomation(row: {
  cleanup_delete_candidate?: boolean | null;
  reviewer_overrides?: unknown;
}): boolean {
  const reviewerOverrides = (row.reviewer_overrides ?? {}) as ReviewerOverridesShape;
  return row.cleanup_delete_candidate === true
    || reviewerOverrides.cleanup_delete_candidate === true
    || Boolean(reviewerOverrides.source_deleted_at);
}

function readGitLabEndpoint(importProposal: ImportProposalShape | null): GitLabEndpointInfo | undefined {
  if (!importProposal) return undefined;
  if (importProposal.gitlab_endpoint) return importProposal.gitlab_endpoint;
  const endpoint = importProposal.gitlab?.endpoint;
  if (!endpoint) return undefined;
  return {
    method: endpoint.method,
    endpoint: endpoint.path,
    api_file: endpoint.api_file,
    handler: endpoint.handler,
    calls: importProposal.gitlab?.calls,
  };
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
    verbeterideeen: readVerbeterideeen(item),
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
  const { data: beforeRow, error: beforeError } = await supabase
    .from("automatiseringen")
    .select("naam,categorie,doel,trigger_beschrijving,systemen,stappen,afhankelijkheden,owner,status,verbeterideeen,mermaid_diagram,fasen")
    .eq("id", item.id)
    .maybeSingle();
  if (beforeError) throw beforeError;

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
      verbeterideeen: readVerbeterideeen(item),
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

  await logAutomationAuditEvents(item.id, beforeRow, {
    naam: item.naam,
    categorie: item.categorie,
    doel: item.doel,
    trigger_beschrijving: item.trigger,
    systemen: item.systemen,
    stappen: item.stappen,
    afhankelijkheden: item.afhankelijkheden,
    owner: item.owner,
    status: item.status,
    verbeterideeen: readVerbeterideeen(item),
    mermaid_diagram: item.mermaidDiagram,
    fasen: item.fasen,
  });
}

export async function setCleanupDeleteCandidate(id: string, marked: boolean): Promise<void> {
  const { data: row, error: fetchError } = await supabase
    .from("automatiseringen")
    .select("reviewer_overrides")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;

  const reviewerOverrides = {
    ...((row?.reviewer_overrides as Record<string, unknown> | null) ?? {}),
    cleanup_delete_candidate: marked,
    cleanup_delete_candidate_at: marked ? new Date().toISOString() : null,
  };

  const { error } = await supabase
    .from("automatiseringen")
    .update({ reviewer_overrides: reviewerOverrides })
    .eq("id", id);

  if (error) throw error;
}

export async function deleteAutomatisering(id: string): Promise<void> {
  const { data: row, error: fetchError } = await supabase
    .from("automatiseringen")
    .select("reviewer_overrides")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;

  const now = new Date().toISOString();
  const reviewerOverrides = {
    ...((row?.reviewer_overrides as Record<string, unknown> | null) ?? {}),
    archived_at: now,
    archived_reason: "Handmatig gearchiveerd via portaal",
  };

  const { error } = await supabase
    .from("automatiseringen")
    .update({ reviewer_overrides: reviewerOverrides, status: "Uitgeschakeld" })
    .eq("id", id);
  if (error) throw error;

  await insertAuditEvent({
    action: "archive",
    objectType: "automation",
    objectId: id,
    fieldName: "reviewer_overrides.archived_at",
    oldValue: null,
    newValue: now,
  });
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
    a.systemen.join(", "), a.owner, a.status, (a.fasen || []).join(", "),
  ]);
  const escapeCell = (cell: unknown) => `"${String(cell ?? "").replace(/"/g, '""')}"`;
  return [
    "sep=;",
    headers.join(";"),
    ...rows.map((r) => r.map(escapeCell).join(";")),
  ].join("\n");
}

async function logAutomationAuditEvents(
  automationId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Promise<void> {
  if (!before) return;
  const events = Object.entries(after)
    .filter(([fieldName, newValue]) => JSON.stringify((before as Record<string, unknown>)[fieldName] ?? null) !== JSON.stringify(newValue ?? null))
    .map(([fieldName, newValue]) => ({
      action: "manual_update",
      objectType: "automation",
      objectId: automationId,
      fieldName,
      oldValue: (before as Record<string, unknown>)[fieldName] ?? null,
      newValue: newValue ?? null,
    }));

  for (const event of events) {
    await insertAuditEvent(event);
  }
}

async function insertAuditEvent(input: {
  action: string;
  objectType: string;
  objectId: string;
  fieldName?: string;
  oldValue: unknown;
  newValue: unknown;
}): Promise<void> {
  const { data: authData } = await supabase.auth.getUser();
  const { error } = await (supabase as any).from("audit_events").insert({
    actor: authData.user?.id ?? null,
    action: input.action,
    object_type: input.objectType,
    object_id: input.objectId,
    field_name: input.fieldName ?? null,
    old_value_sanitized: sanitizeAuditValue(input.oldValue),
    new_value_sanitized: sanitizeAuditValue(input.newValue),
  });
  if (error) throw error;
}

function sanitizeAuditValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  }
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      result[key] = /(token|secret|authorization|password|cookie|response|answers?)/i.test(key)
        ? "[redacted]"
        : sanitizeAuditValue(child);
    }
    return result;
  }
  return value;
}
