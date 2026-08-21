export const SOURCE_SYNC_RUNS_TABLE = "source_sync_runs";
export const AUTOMATION_SOURCE_FINDINGS_TABLE = "automation_source_findings";
export const AUTOMATION_IMPORT_PROPOSALS_TABLE = "automation_import_proposals";
export const SOURCE_SYNC_CHANGE_ITEMS_TABLE = "source_sync_change_items";

type SupabaseClientLike = {
  from: (table: string) => any;
  rpc?: (fn: string) => Promise<{ data: unknown; error: unknown }>;
};

export type PortalOwnedSyncSource = "hubspot" | "gitlab" | "zapier" | "typeform";
export type SourceSyncRunStatus = "success" | "failed" | "auth_failed" | "rate_limited";

export type PortalOwnedAutomationPayload = {
  external_id: string;
  naam: string;
  source?: string;
  doel?: string;
  trigger_beschrijving?: string;
  systemen?: string[];
  stappen?: string[];
  categorie?: string;
  status?: string;
  endpoints?: string[];
  webhook_paths?: string[];
  import_proposal?: Record<string, unknown>;
  [key: string]: unknown;
};

type ExistingAutomation = {
  id: string;
  external_id: string | null;
  naam: string | null;
  source: string | null;
  doel?: string | null;
  trigger_beschrijving?: string | null;
  systemen?: string[] | null;
  stappen?: string[] | null;
  categorie?: string | null;
  status?: string | null;
  endpoints?: string[] | null;
  webhook_paths?: string[] | null;
  import_proposal?: Record<string, unknown> | null;
  gitlab_file_path?: string | null;
  pipeline_id?: string | null;
  stage_id?: string | null;
  cleanup_delete_candidate?: boolean | null;
  cleanup_delete_candidate_at?: string | null;
};

export type PortalOwnedSyncResult = {
  inserted: number;
  updated: number;
  deactivated: number;
  total: number;
  proposed: number;
  findings: number;
  missing: number;
  changed: number;
  syncRunId: string;
};

export type SourceSyncChangeType =
  | "new_automation"
  | "metadata_changed"
  | "route_changed"
  | "source_data_incomplete"
  | "source_missing"
  | "legacy_gitlab_record";

export type SourceSyncChangeItem = {
  id: string;
  syncRunId: string;
  source: PortalOwnedSyncSource;
  externalId: string | null;
  automationId: string | null;
  changeType: SourceSyncChangeType;
  status: "pending" | "applied" | "skipped" | "failed" | "superseded";
  reviewKey: string | null;
  title: string;
  summary: string;
  impact: string;
  oldValue: unknown;
  newValue: unknown;
  payload: unknown;
  selectedByDefault: boolean;
};

export type PortalOwnedSyncPreviewResult = PortalOwnedSyncResult & {
  mode: "preview";
  changeItems: SourceSyncChangeItem[];
};

export type PortalOwnedSyncApplyResult = PortalOwnedSyncResult & {
  mode: "apply";
  applied: number;
  skipped: number;
  failed: number;
  failedItems: Array<{
    id: string;
    title: string;
    externalId: string | null;
    changeType: SourceSyncChangeType;
    errorMessage: string;
  }>;
};

type SourceSyncChangeDraft = Omit<SourceSyncChangeItem, "id" | "status" | "syncRunId" | "selectedByDefault" | "reviewKey"> & {
  syncRunId: string;
  reviewKey?: string | null;
  selectedByDefault?: boolean;
};

type SourceSyncChangeRow = {
  id: string;
  sync_run_id: string;
  source: PortalOwnedSyncSource;
  external_id: string | null;
  automation_id: string | null;
  change_type: SourceSyncChangeType;
  status: "pending" | "applied" | "skipped" | "failed" | "superseded";
  review_key?: string | null;
  title: string;
  summary: string;
  impact: string;
  old_value_sanitized: unknown;
  new_value_sanitized: unknown;
  payload_sanitized: unknown;
  selected_by_default: boolean;
};

const SENSITIVE_KEY_PATTERN = /(token|secret|authorization|password|cookie|response|responses|answer|answers|submission|payload)/i;
const SOURCE_MANAGED_AUTOMATION_FIELDS = [
  "branches",
  "endpoints",
  "external_id",
  "gitlab_file_path",
  "hubspot_last_run_at",
  "hubspot_run_count_365d",
  "import_proposal",
  "last_synced_at",
  "pipeline_id",
  "stage_id",
  "webhook_paths",
];

export async function startSourceSyncRun(
  db: SupabaseClientLike,
  source: PortalOwnedSyncSource,
  startedAt: string,
): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await db.from(SOURCE_SYNC_RUNS_TABLE).insert({
    id,
    source,
    started_at: startedAt,
    status: "started",
    items_seen: 0,
  });
  throwIfSupabaseError("Sync-run starten", error);
  return id;
}

export async function finishSourceSyncRun(
  db: SupabaseClientLike,
  syncRunId: string,
  input: {
    status: SourceSyncRunStatus;
    finishedAt: string;
    itemsSeen: number;
    errorMessage?: string | null;
  },
): Promise<void> {
  const { error } = await db.from(SOURCE_SYNC_RUNS_TABLE).update({
    finished_at: input.finishedAt,
    status: input.status,
    error_message_sanitized: sanitizeErrorMessage(input.errorMessage),
    items_seen: input.itemsSeen,
  }).eq("id", syncRunId);
  throwIfSupabaseError("Sync-run afronden", error);
}

export async function recordSourceSyncFailure(
  db: SupabaseClientLike,
  source: PortalOwnedSyncSource,
  startedAt: string,
  input: {
    status: Exclude<SourceSyncRunStatus, "success">;
    errorMessage: string;
    itemsSeen?: number;
  },
): Promise<{ syncRunId: string }> {
  const syncRunId = await startSourceSyncRun(db, source, startedAt);
  await finishSourceSyncRun(db, syncRunId, {
    status: input.status,
    finishedAt: new Date().toISOString(),
    itemsSeen: input.itemsSeen ?? 0,
    errorMessage: input.errorMessage,
  });
  return { syncRunId };
}

export async function previewPortalOwnedSync(
  db: SupabaseClientLike,
  input: {
    source: PortalOwnedSyncSource;
    payloads: PortalOwnedAutomationPayload[];
    syncRunId: string;
    now: string;
  },
): Promise<PortalOwnedSyncPreviewResult> {
  const drafts = await buildSyncChangeItems(db, input);
  await supersedeObsoletePendingReviewItems(db, input, drafts);
  const changeItems: SourceSyncChangeItem[] = [];
  for (const draft of drafts) {
    changeItems.push(await insertSyncChangeItem(db, draft));
  }

  await finishSourceSyncRun(db, input.syncRunId, {
    status: "success",
    finishedAt: input.now,
    itemsSeen: input.payloads.length,
  });

  return {
    inserted: 0,
    updated: 0,
    deactivated: 0,
    total: input.payloads.length,
    proposed: changeItems.filter((item) => item.changeType === "new_automation").length,
    findings: changeItems.filter((item) => item.changeType === "source_data_incomplete" || item.changeType === "source_missing").length,
    missing: changeItems.filter((item) => item.changeType === "source_missing").length,
    changed: changeItems.filter((item) => item.changeType === "metadata_changed" || item.changeType === "route_changed").length,
    syncRunId: input.syncRunId,
    mode: "preview",
    changeItems,
  };
}

export async function applyPortalOwnedSyncChanges(
  db: SupabaseClientLike,
  input: {
    source: PortalOwnedSyncSource;
    syncRunId: string;
    selectedChangeItemIds: string[];
    now: string;
  },
): Promise<PortalOwnedSyncApplyResult> {
  const rows = await fetchPendingReviewItems(db, input.source, input.syncRunId);
  const selected = new Set(input.selectedChangeItemIds);
  const skipped = rows.filter((row) => row.status === "pending" && !selected.has(row.id)).length;
  await markUnselectedReviewItemsSkipped(db, rows, selected, input.now);

  let applied = 0;
  let failed = 0;
  let inserted = 0;
  let proposed = 0;
  let updated = 0;
  let findings = 0;
  let missing = 0;
  let changed = 0;
  let deactivated = 0;
  const failedItems: PortalOwnedSyncApplyResult["failedItems"] = [];

  for (const row of rows) {
    if (!selected.has(row.id)) continue;
    try {
      const appliedKind = await applyReviewItem(db, row, input.now);
      await markReviewItemApplied(db, row.id, input.now);
      applied++;
      if (appliedKind === "insert") inserted++;
      if (appliedKind === "proposal") proposed++;
      if (appliedKind === "update") updated++;
      if (appliedKind === "finding") findings++;
      if (appliedKind === "deactivated") deactivated++;
      if (row.change_type === "source_missing") missing++;
      if (row.change_type === "metadata_changed" || row.change_type === "route_changed") changed++;
    } catch (error) {
      const errorMessage = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
      failed++;
      failedItems.push({
        id: row.id,
        title: row.title,
        externalId: row.external_id,
        changeType: row.change_type,
        errorMessage,
      });
      await markReviewItemFailed(db, row.id, errorMessage, input.now);
    }
  }

  return {
    inserted,
    updated,
    deactivated,
    total: rows.length,
    proposed,
    findings,
    missing,
    changed,
    syncRunId: input.syncRunId,
    mode: "apply",
    applied,
    skipped,
    failed,
    failedItems,
  };
}

export async function recordPortalOwnedSync(
  db: SupabaseClientLike,
  input: {
    source: PortalOwnedSyncSource;
    payloads: PortalOwnedAutomationPayload[];
    syncRunId: string;
    now: string;
  },
): Promise<PortalOwnedSyncResult> {
  const { source, payloads, syncRunId, now } = input;

  const { data: existingRows, error: existingError } = await db
    .from("automatiseringen")
    .select("id, external_id, naam, source, doel, trigger_beschrijving, systemen, stappen, categorie, status, endpoints, webhook_paths, import_proposal, gitlab_file_path, pipeline_id, stage_id, cleanup_delete_candidate, cleanup_delete_candidate_at")
    .eq("source", source);
  throwIfSupabaseError("Bestaande automations ophalen", existingError);

  const existing = ((existingRows ?? []) as ExistingAutomation[])
    .filter((row) => typeof row.external_id === "string" && row.external_id.trim());
  const existingByExternalId = new Map(existing.map((row) => [row.external_id!, row]));
  const seenExternalIds = new Set<string>();

  let proposed = 0;
  let findings = 0;
  let missing = 0;
  let changed = 0;
  let updated = 0;

  for (const payload of payloads) {
    const externalId = String(payload.external_id ?? "").trim();
    if (!externalId) continue;
    seenExternalIds.add(externalId);

    const existingAutomation = existingByExternalId.get(externalId);
    if (!existingAutomation) {
      const didWriteProposal = await upsertImportProposal(db, source, payload, now);
      if (didWriteProposal) proposed++;
      continue;
    }

    await resolveFinding(db, {
      dedupeKey: findingKey(existingAutomation, "source_missing"),
      resolvedReason: "Bronrecord is opnieuw gevonden.",
      syncRunId,
      now,
    });
    await updateExistingSourceSnapshot(db, existingAutomation, payload, now);
    updated++;

    const webhookDiffs = diffArrayField(existingAutomation.webhook_paths, payload.webhook_paths);
    const endpointDiffs = diffArrayField(existingAutomation.endpoints, payload.endpoints);
    const metadataDiffs = diffMetadata(existingAutomation, payload);

    if (webhookDiffs.changed || endpointDiffs.changed) {
      await upsertFinding(db, {
        automation: existingAutomation,
        type: "webhook_changed",
        severity: "warning",
        message: `Webhook- of endpointinformatie wijkt af bij ${sourceLabel(source)}.`,
        details: {
          changed_fields: [
            ...(webhookDiffs.changed ? ["webhook_paths"] : []),
            ...(endpointDiffs.changed ? ["endpoints"] : []),
          ],
          portal: {
            webhook_paths: existingAutomation.webhook_paths ?? [],
            endpoints: existingAutomation.endpoints ?? [],
          },
          source: {
            webhook_paths: payload.webhook_paths ?? [],
            endpoints: payload.endpoints ?? [],
          },
        },
        syncRunId,
        now,
      });
      findings++;
      changed++;
    } else {
      await resolveFinding(db, {
        dedupeKey: findingKey(existingAutomation, "webhook_changed"),
        resolvedReason: "Webhook- of endpointinformatie komt weer overeen.",
        syncRunId,
        now,
      });
    }

    if (metadataDiffs.length > 0) {
      await upsertFinding(db, {
        automation: existingAutomation,
        type: "metadata_changed",
        severity: "info",
        message: `Broninformatie wijkt af bij ${sourceLabel(source)}. De automation is niet automatisch aangepast.`,
        details: {
          changed_fields: metadataDiffs.map((diff) => diff.field),
          diffs: metadataDiffs,
        },
        syncRunId,
        now,
      });
      findings++;
      changed++;
    } else {
      await resolveFinding(db, {
        dedupeKey: findingKey(existingAutomation, "metadata_changed"),
        resolvedReason: "Broninformatie komt weer overeen.",
        syncRunId,
        now,
      });
    }

    const sourceQualityMissingEvidence = buildSourceQualityMissingEvidence(
      buildSourceQualitySnapshot(existingAutomation, payload, source),
    );
    for (const missingEvidence of sourceQualityMissingEvidence) {
      await upsertFinding(db, {
        automation: existingAutomation,
        type: "source_data_incomplete",
        severity: "warning",
        message: missingEvidence.message,
        details: {
          source,
          missing_evidence_key: missingEvidence.key,
          label: missingEvidence.label,
          description: missingEvidence.description,
        },
        dedupeKeySuffix: missingEvidence.key,
        syncRunId,
        now,
      });
      findings++;
    }
    await resolveSourceQualityFindings(db, {
      automation: existingAutomation,
      activeMissingEvidenceKeys: sourceQualityMissingEvidence.map((item) => item.key),
      syncRunId,
      now,
    });
  }

  for (const row of existing) {
    if (!row.external_id || seenExternalIds.has(row.external_id)) continue;
    await upsertFinding(db, {
      automation: row,
      type: "source_missing",
      severity: "critical",
      message: `Deze automation kan niet meer worden teruggevonden bij ${sourceLabel(source)}.`,
      details: {
        source,
        external_id: row.external_id,
        portal_name: row.naam ?? "",
      },
      syncRunId,
      now,
    });
    findings++;
    missing++;
  }

  await finishSourceSyncRun(db, syncRunId, {
    status: "success",
    finishedAt: now,
    itemsSeen: seenExternalIds.size,
  });

  return {
    inserted: 0,
    updated,
    deactivated: 0,
    total: payloads.length,
    proposed,
    findings,
    missing,
    changed,
    syncRunId,
  };
}

async function buildSyncChangeItems(
  db: SupabaseClientLike,
  input: {
    source: PortalOwnedSyncSource;
    payloads: PortalOwnedAutomationPayload[];
    syncRunId: string;
    now: string;
  },
): Promise<SourceSyncChangeDraft[]> {
  const { source, payloads, syncRunId } = input;
  const existing = await fetchExistingAutomationsForSource(db, source);
  const existingByExternalId = new Map(existing.map((row) => [row.external_id!, row]));
  const seenExternalIds = new Set<string>();
  const items: SourceSyncChangeDraft[] = [];

  for (const payload of payloads) {
    const externalId = String(payload.external_id ?? "").trim();
    if (!externalId) continue;
    seenExternalIds.add(externalId);

    const existingAutomation = existingByExternalId.get(externalId);
    if (!existingAutomation) {
      items.push({
        syncRunId,
        source,
        externalId,
        automationId: null,
        changeType: "new_automation",
        title: String(payload.naam ?? "").trim() || `${sourceLabel(source)} automation`,
        summary: `Nieuwe automation gevonden bij ${sourceLabel(source)}.`,
        impact: "Komt als importvoorstel in de catalogus.",
        oldValue: null,
        newValue: buildComparableSnapshot(payload),
        payload,
      });
      continue;
    }

    const webhookDiffs = diffArrayField(existingAutomation.webhook_paths, payload.webhook_paths);
    const endpointDiffs = diffArrayField(existingAutomation.endpoints, payload.endpoints);
    const metadataDiffs = diffMetadata(existingAutomation, payload);
    const sourceQualityMissingEvidence = buildSourceQualityMissingEvidence(
      buildSourceQualitySnapshot(existingAutomation, payload, source),
    );

    if (webhookDiffs.changed || endpointDiffs.changed || metadataDiffs.length > 0) {
      const routeChanged = webhookDiffs.changed || endpointDiffs.changed;
      items.push({
        syncRunId,
        source,
        externalId,
        automationId: existingAutomation.id,
        changeType: routeChanged ? "route_changed" : "metadata_changed",
        title: existingAutomation.naam || String(payload.naam ?? "").trim() || `${sourceLabel(source)} automation`,
        summary: routeChanged
          ? "Webhook- of endpointinformatie wijzigt."
          : "Broninformatie wijzigt.",
        impact: routeChanged
          ? "Kan procesreis-bewijs en detailinformatie verbeteren."
          : "Werkt de bron-snapshot van deze automation bij.",
        oldValue: {
          webhook_paths: existingAutomation.webhook_paths ?? [],
          endpoints: existingAutomation.endpoints ?? [],
          metadata: metadataDiffs.map((diff) => ({ field: diff.field, value: diff.portal })),
        },
        newValue: {
          webhook_paths: payload.webhook_paths ?? [],
          endpoints: payload.endpoints ?? [],
          metadata: metadataDiffs.map((diff) => ({ field: diff.field, value: diff.source })),
        },
        payload,
      });
    }

    for (const missingEvidence of sourceQualityMissingEvidence) {
      items.push({
        syncRunId,
        source,
        externalId,
        automationId: existingAutomation.id,
        changeType: "source_data_incomplete",
        title: existingAutomation.naam || String(payload.naam ?? "").trim() || `${sourceLabel(source)} automation`,
        summary: missingEvidence.message,
        impact: "Wordt als bronwaarschuwing geregistreerd als je deze regel toepast.",
        oldValue: null,
        newValue: {
          source,
          missing_evidence_key: missingEvidence.key,
          label: missingEvidence.label,
          description: missingEvidence.description,
        },
        payload: {
          automation: existingAutomation,
          missingEvidence,
        },
      });
    }
  }

  const legacyCleanupItems = source === "gitlab"
    ? buildGitLabLegacyCleanupItems({ existing, payloads, syncRunId, source })
    : [];
  items.push(...legacyCleanupItems);
  const legacyCleanupAutomationIds = new Set(
    legacyCleanupItems.map((item) => item.automationId).filter(Boolean),
  );

  for (const row of existing) {
    if (!row.external_id || seenExternalIds.has(row.external_id)) continue;
    if (legacyCleanupAutomationIds.has(row.id) || isLegacyGitLabRecord(row)) continue;
    items.push({
      syncRunId,
      source,
      externalId: row.external_id,
      automationId: row.id,
      changeType: "source_missing",
      title: row.naam || `${sourceLabel(source)} automation`,
      summary: `Deze automation kan niet meer worden teruggevonden bij ${sourceLabel(source)}.`,
      impact: "Haalt deze automation uit de actieve portalweergave als je deze regel toepast.",
      oldValue: {
        external_id: row.external_id,
        portal_name: row.naam ?? "",
      },
      newValue: null,
      payload: {
        automation: row,
      },
    });
  }

  return items;
}

function buildGitLabLegacyCleanupItems(input: {
  existing: ExistingAutomation[];
  payloads: PortalOwnedAutomationPayload[];
  syncRunId: string;
  source: PortalOwnedSyncSource;
}): SourceSyncChangeDraft[] {
  const payloadsByFile = new Map<string, PortalOwnedAutomationPayload[]>();
  for (const payload of input.payloads) {
    const filePath = normalizeGitLabFilePath(String(payload.gitlab_file_path ?? ""));
    if (!filePath) continue;
    payloadsByFile.set(filePath, [...(payloadsByFile.get(filePath) ?? []), payload]);
  }

  return input.existing.flatMap((automation) => {
    if (!isLegacyGitLabRecord(automation)) return [];
    if (automation.cleanup_delete_candidate) return [];

    const filePath = legacyGitLabFilePath(automation);
    const coveredBy = payloadsByFile.get(normalizeGitLabFilePath(filePath)) ?? [];
    const coveredLabel = coveredBy.length === 1
      ? "1 specifieke endpoint automation"
      : `${coveredBy.length} specifieke endpoint automations`;

    return [{
      syncRunId: input.syncRunId,
      source: input.source,
      externalId: automation.external_id,
      automationId: automation.id,
      changeType: "legacy_gitlab_record",
      title: automation.naam || "Legacy GitLab bestandsrecord",
      summary: coveredBy.length > 0
        ? `Oud GitLab bestandsrecord wordt gedekt door ${coveredLabel} uit hetzelfde bestand.`
        : "Oud GitLab bestandsrecord heeft geen specifieke endpoint-node en telt niet als procesreis-automation.",
      impact: "Markeert dit oude bestandsrecord als opruimkandidaat. Procesreizen blijven de specifieke endpoint automations gebruiken.",
      oldValue: {
        external_id: automation.external_id,
        gitlab_file_path: filePath,
        cleanup_delete_candidate: automation.cleanup_delete_candidate ?? false,
      },
      newValue: {
        cleanup_delete_candidate: true,
        covered_by: coveredBy.map((payload) => ({
          external_id: payload.external_id,
          naam: payload.naam,
          endpoint: normalizeStringArray(payload.endpoints)[0] ?? "",
          method: endpointMethodFromPayload(payload),
        })),
      },
      payload: {
        automation,
        coveredBy,
      },
    }];
  });
}

async function fetchExistingAutomationsForSource(
  db: SupabaseClientLike,
  source: PortalOwnedSyncSource,
): Promise<ExistingAutomation[]> {
  const { data: existingRows, error: existingError } = await db
    .from("automatiseringen")
    .select("id, external_id, naam, source, doel, trigger_beschrijving, systemen, stappen, categorie, status, endpoints, webhook_paths, import_proposal, gitlab_file_path, pipeline_id, stage_id, cleanup_delete_candidate, cleanup_delete_candidate_at")
    .eq("source", source);
  throwIfSupabaseError("Bestaande automations ophalen", existingError);

  return ((existingRows ?? []) as ExistingAutomation[])
    .filter((row) => typeof row.external_id === "string" && row.external_id.trim());
}

async function insertSyncChangeItem(
  db: SupabaseClientLike,
  draft: SourceSyncChangeDraft,
): Promise<SourceSyncChangeItem> {
  const reviewKey = draft.reviewKey ?? reviewKeyForDraft(draft);

  const data = {
    sync_run_id: draft.syncRunId,
    source: draft.source,
    external_id: draft.externalId,
    automation_id: draft.automationId,
    change_type: draft.changeType,
    review_key: reviewKey,
    status: "pending",
    title: draft.title,
    summary: draft.summary,
    impact: draft.impact,
    old_value_sanitized: sanitizeValue(draft.oldValue),
    new_value_sanitized: sanitizeValue(draft.newValue),
    payload_sanitized: sanitizeValue(draft.payload),
    selected_by_default: true,
  };

  const { data: row, error } = await db
    .from(SOURCE_SYNC_CHANGE_ITEMS_TABLE)
    .insert(data)
    .select("*")
    .single();
  throwIfSupabaseError("Sync-reviewregel aanmaken", error);
  return mapSyncChangeRow(row as SourceSyncChangeRow);
}

async function supersedeObsoletePendingReviewItems(
  db: SupabaseClientLike,
  input: {
    source: PortalOwnedSyncSource;
    payloads: PortalOwnedAutomationPayload[];
    now: string;
  },
  drafts: SourceSyncChangeDraft[],
): Promise<void> {
  const externalIds = new Set<string>();
  for (const payload of input.payloads) {
    const externalId = String(payload.external_id ?? "").trim();
    if (externalId) externalIds.add(externalId);
  }
  for (const draft of drafts) {
    const externalId = String(draft.externalId ?? "").trim();
    if (externalId) externalIds.add(externalId);
  }

  const ids = [...externalIds];
  if (ids.length === 0) return;

  const reviewChangeTypes: SourceSyncChangeType[] = [
    "metadata_changed",
    "route_changed",
    "source_missing",
    "source_data_incomplete",
    "new_automation",
    "legacy_gitlab_record",
  ];

  for (const externalIdChunk of chunks(ids, 100)) {
    const { error } = await db
      .from(SOURCE_SYNC_CHANGE_ITEMS_TABLE)
      .update({
        status: "superseded",
        skipped_at: input.now,
        updated_at: input.now,
      })
      .eq("source", input.source)
      .eq("status", "pending")
      .in("external_id", externalIdChunk)
      .in("change_type", reviewChangeTypes);
    throwIfSupabaseError("Verouderde sync-reviewregels superseden", error);
  }
}

async function fetchPendingReviewItems(
  db: SupabaseClientLike,
  source: PortalOwnedSyncSource,
  syncRunId: string,
): Promise<SourceSyncChangeRow[]> {
  const { data, error } = await db
    .from(SOURCE_SYNC_CHANGE_ITEMS_TABLE)
    .select("*")
    .eq("sync_run_id", syncRunId)
    .eq("source", source)
    .in("status", ["pending", "failed"]);
  throwIfSupabaseError("Sync-reviewregels ophalen", error);
  return (data ?? []) as SourceSyncChangeRow[];
}

async function markUnselectedReviewItemsSkipped(
  db: SupabaseClientLike,
  rows: SourceSyncChangeRow[],
  selectedChangeItemIds: Set<string>,
  now: string,
): Promise<void> {
  const unselected = rows.filter((row) => row.status === "pending" && !selectedChangeItemIds.has(row.id));
  for (const row of unselected) {
    const { error } = await db
      .from(SOURCE_SYNC_CHANGE_ITEMS_TABLE)
      .update({
        status: "skipped",
        skipped_at: now,
        updated_at: now,
      })
      .eq("id", row.id);
    throwIfSupabaseError("Sync-reviewregel overslaan", error);
  }
}

async function applyReviewItem(
  db: SupabaseClientLike,
  row: SourceSyncChangeRow,
  now: string,
): Promise<"insert" | "proposal" | "update" | "finding" | "deactivated"> {
  if (row.change_type === "new_automation") {
    return applyNewAutomation(db, row, now);
  }

  if (row.change_type === "metadata_changed" || row.change_type === "route_changed") {
    const payload = row.payload_sanitized as PortalOwnedAutomationPayload;
    const automation = await fetchExistingAutomationForReviewItem(db, row, payload);
    await applyExistingSourcePayload(db, automation, payload, row.source, row.sync_run_id, now);
    return "update";
  }

  if (row.change_type === "source_data_incomplete") {
    await applySourceDataIncompleteFinding(db, row, now);
    return "finding";
  }

  if (row.change_type === "legacy_gitlab_record") {
    await applyLegacyGitLabCleanup(db, row, now);
    return "update";
  }

  if (row.change_type === "source_missing") {
    await applySourceMissingFinding(db, row, now);
    return "deactivated";
  }

  return "finding";
}

async function applyNewAutomation(
  db: SupabaseClientLike,
  row: SourceSyncChangeRow,
  now: string,
): Promise<"insert" | "update"> {
  const payload = row.payload_sanitized as PortalOwnedAutomationPayload;
  const source = row.source;
  const externalId = String(payload.external_id ?? row.external_id ?? "").trim();

  const { data: existing, error: existingError } = await db
    .from("automatiseringen")
    .select("id, external_id, naam, source, doel, trigger_beschrijving, systemen, stappen, categorie, status, endpoints, webhook_paths, import_proposal, gitlab_file_path, pipeline_id, stage_id, cleanup_delete_candidate, cleanup_delete_candidate_at")
    .eq("source", source)
    .eq("external_id", externalId)
    .maybeSingle();
  throwIfSupabaseError("Bestaande automation voor sync-review ophalen", existingError);

  if (existing?.id) {
    await applyExistingSourcePayload(db, existing as ExistingAutomation, payload, source, row.sync_run_id, now);
    return "update";
  }

  const { error } = await db.from("automatiseringen").insert({
    id: await generateAutomationId(db, source, externalId),
    naam: await resolveNewAutomationName(db, {
      source,
      payload,
      externalId,
      fallbackName: row.title || `${sourceLabel(source)} automation`,
    }),
    status: String(payload.status ?? "Actief"),
    doel: String(payload.doel ?? ""),
    trigger_beschrijving: String(payload.trigger_beschrijving ?? ""),
    systemen: arrayOrEmpty(payload.systemen),
    stappen: arrayOrEmpty(payload.stappen),
    branches: Array.isArray(payload.branches) ? payload.branches : null,
    categorie: String(payload.categorie ?? "Anders"),
    afhankelijkheden: String(payload.afhankelijkheden ?? ""),
    owner: String(payload.owner ?? ""),
    verbeterideeen: String(payload.verbeterideeen ?? ""),
    mermaid_diagram: String(payload.mermaid_diagram ?? ""),
    fasen: arrayOrEmpty(payload.fasen),
    webhook_paths: arrayOrEmpty(payload.webhook_paths),
    endpoints: arrayOrEmpty(payload.endpoints),
    external_id: externalId || null,
    source,
    import_source: source,
    import_status: "approved",
    import_proposal: isRecord(payload.import_proposal) ? payload.import_proposal : {},
    gitlab_file_path: typeof payload.gitlab_file_path === "string" ? payload.gitlab_file_path : null,
    gitlab_last_commit: payload.gitlab_last_commit ?? null,
    pipeline_id: payload.pipeline_id ?? null,
    stage_id: payload.stage_id ?? null,
    hubspot_last_run_at: payload.hubspot_last_run_at ?? null,
    hubspot_run_count_365d: payload.hubspot_run_count_365d ?? null,
    last_synced_at: payload.last_synced_at ?? now,
    approved_by: "sync-review",
    approved_at: now,
  });
  throwIfSupabaseError("Nieuwe automation uit sync-review aanmaken", error);

  return "insert";
}

async function generateAutomationId(
  db: SupabaseClientLike,
  source: PortalOwnedSyncSource,
  externalId: string,
): Promise<string> {
  if (source === "hubspot" && externalId) return `AUTO-HS-${externalId}`;

  if (typeof db.rpc === "function") {
    try {
      const { data, error } = await db.rpc("generate_auto_id");
      if (!error && typeof data === "string" && data.trim()) return data;
    } catch {
      // Fall through to UUID fallback.
    }
  }

  return `AUTO-${crypto.randomUUID()}`;
}

async function fetchExistingAutomationForReviewItem(
  db: SupabaseClientLike,
  row: SourceSyncChangeRow,
  payload: PortalOwnedAutomationPayload,
): Promise<ExistingAutomation> {
  let query = db
    .from("automatiseringen")
    .select("id, external_id, naam, source, doel, trigger_beschrijving, systemen, stappen, categorie, status, endpoints, webhook_paths, import_proposal, gitlab_file_path, pipeline_id, stage_id, cleanup_delete_candidate, cleanup_delete_candidate_at");

  if (row.automation_id) {
    query = query.eq("id", row.automation_id);
  } else {
    query = query.eq("source", row.source).eq("external_id", String(payload.external_id ?? row.external_id ?? ""));
  }

  const { data, error } = await query.maybeSingle();
  throwIfSupabaseError("Automation voor sync-review ophalen", error);
  if (!data) throw new Error("Automation voor sync-review niet gevonden.");
  return data as ExistingAutomation;
}

async function applyExistingSourcePayload(
  db: SupabaseClientLike,
  existingAutomation: ExistingAutomation,
  payload: PortalOwnedAutomationPayload,
  source: PortalOwnedSyncSource,
  syncRunId: string,
  now: string,
): Promise<void> {
  await resolveFinding(db, {
    dedupeKey: findingKey(existingAutomation, "source_missing"),
    resolvedReason: "Bronrecord is opnieuw gevonden.",
    syncRunId,
    now,
  });
  await updateExistingSourceSnapshot(db, existingAutomation, payload, now);

  const webhookDiffs = diffArrayField(existingAutomation.webhook_paths, payload.webhook_paths);
  const endpointDiffs = diffArrayField(existingAutomation.endpoints, payload.endpoints);
  const metadataDiffs = diffMetadata(existingAutomation, payload);

  if (webhookDiffs.changed || endpointDiffs.changed) {
    await upsertFinding(db, {
      automation: existingAutomation,
      type: "webhook_changed",
      severity: "warning",
      message: `Webhook- of endpointinformatie wijkt af bij ${sourceLabel(source)}.`,
      details: {
        changed_fields: [
          ...(webhookDiffs.changed ? ["webhook_paths"] : []),
          ...(endpointDiffs.changed ? ["endpoints"] : []),
        ],
        portal: {
          webhook_paths: existingAutomation.webhook_paths ?? [],
          endpoints: existingAutomation.endpoints ?? [],
        },
        source: {
          webhook_paths: payload.webhook_paths ?? [],
          endpoints: payload.endpoints ?? [],
        },
      },
      syncRunId,
      now,
    });
  } else {
    await resolveFinding(db, {
      dedupeKey: findingKey(existingAutomation, "webhook_changed"),
      resolvedReason: "Webhook- of endpointinformatie komt weer overeen.",
      syncRunId,
      now,
    });
  }

  if (metadataDiffs.length > 0) {
    await upsertFinding(db, {
      automation: existingAutomation,
      type: "metadata_changed",
      severity: "info",
      message: `Broninformatie wijkt af bij ${sourceLabel(source)}. De automation is na review bijgewerkt.`,
      details: {
        changed_fields: metadataDiffs.map((diff) => diff.field),
        diffs: metadataDiffs,
      },
      syncRunId,
      now,
    });
  } else {
    await resolveFinding(db, {
      dedupeKey: findingKey(existingAutomation, "metadata_changed"),
      resolvedReason: "Broninformatie komt weer overeen.",
      syncRunId,
      now,
    });
  }

  const sourceQualityMissingEvidence = buildSourceQualityMissingEvidence(
    buildSourceQualitySnapshot(existingAutomation, payload, source),
  );
  for (const missingEvidence of sourceQualityMissingEvidence) {
    await upsertFinding(db, {
      automation: existingAutomation,
      type: "source_data_incomplete",
      severity: "warning",
      message: missingEvidence.message,
      details: {
        source,
        missing_evidence_key: missingEvidence.key,
        label: missingEvidence.label,
        description: missingEvidence.description,
      },
      dedupeKeySuffix: missingEvidence.key,
      syncRunId,
      now,
    });
  }
  await resolveSourceQualityFindings(db, {
    automation: existingAutomation,
    activeMissingEvidenceKeys: sourceQualityMissingEvidence.map((item) => item.key),
    syncRunId,
    now,
  });
}

async function applySourceDataIncompleteFinding(
  db: SupabaseClientLike,
  row: SourceSyncChangeRow,
  now: string,
): Promise<void> {
  const payload = isRecord(row.payload_sanitized) ? row.payload_sanitized : {};
  const automation = isRecord(payload.automation) ? payload.automation as ExistingAutomation : null;
  const missingEvidence = isRecord(payload.missingEvidence) ? payload.missingEvidence : {};
  if (!automation) throw new Error("Bronkwaliteit-reviewregel mist automation.");

  await upsertFinding(db, {
    automation,
    type: "source_data_incomplete",
    severity: "warning",
    message: String(missingEvidence.message ?? row.summary),
    details: {
      source: row.source,
      missing_evidence_key: String(missingEvidence.key ?? ""),
      label: String(missingEvidence.label ?? row.title),
      description: String(missingEvidence.description ?? row.summary),
    },
    dedupeKeySuffix: String(missingEvidence.key ?? row.id),
    syncRunId: row.sync_run_id,
    now,
  });
}

async function applySourceMissingFinding(
  db: SupabaseClientLike,
  row: SourceSyncChangeRow,
  now: string,
): Promise<void> {
  const payload = isRecord(row.payload_sanitized) ? row.payload_sanitized : {};
  const automation = isRecord(payload.automation) ? payload.automation as ExistingAutomation : null;
  if (!automation) throw new Error("Bron-mist-reviewregel mist automation.");

  await upsertFinding(db, {
    automation,
    type: "source_missing",
    severity: "critical",
    message: row.summary,
    details: {
      source: row.source,
      external_id: row.external_id,
      portal_name: row.title,
    },
    syncRunId: row.sync_run_id,
    now,
  });

  await markAutomationDeletedFromSource(db, {
    automationId: row.automation_id ?? automation.id,
    source: row.source,
    now,
  });
}

async function resolveNewAutomationName(
  db: SupabaseClientLike,
  input: {
    source: PortalOwnedSyncSource;
    payload: PortalOwnedAutomationPayload;
    externalId: string;
    fallbackName: string;
  },
): Promise<string> {
  const baseName = String(input.payload.naam ?? "").trim() || input.fallbackName;

  const { data, error } = await db
    .from("automatiseringen")
    .select("naam");
  throwIfSupabaseError("Bestaande automationnamen ophalen", error);

  const existingNames = new Set(
    ((data ?? []) as Array<{ naam?: string | null }>)
      .map((row) => normalizeComparableName(row.naam))
      .filter(Boolean),
  );

  if (!existingNames.has(normalizeComparableName(baseName))) return baseName;

  const routeLabel = input.source === "gitlab"
    ? gitLabRouteLabel(input.payload, input.externalId)
    : nonGitLabIdentityLabel(input.payload, input.externalId);
  const routeCandidate = routeLabel ? `${baseName} - ${routeLabel}` : "";
  if (routeCandidate && !existingNames.has(normalizeComparableName(routeCandidate))) {
    return routeCandidate;
  }

  const suffix = shortStableSuffix(input.externalId || baseName);
  const fallbackCandidate = routeCandidate
    ? `${routeCandidate} - ${suffix}`
    : `${baseName} - ${suffix}`;
  return fallbackCandidate;
}

function nonGitLabIdentityLabel(payload: PortalOwnedAutomationPayload, externalId: string): string {
  const webhookPath = normalizeStringArray(payload.webhook_paths)[0] ?? "";
  if (webhookPath) return webhookPath;

  const endpoint = normalizeStringArray(payload.endpoints)[0] ?? "";
  if (endpoint) return endpoint;

  return externalId.trim();
}

function gitLabRouteLabel(payload: PortalOwnedAutomationPayload, externalId: string): string {
  const proposal = isRecord(payload.import_proposal) ? payload.import_proposal : {};
  const endpointInfo = isRecord(proposal.gitlab_endpoint)
    ? proposal.gitlab_endpoint
    : isRecord(proposal.gitlab) && isRecord(proposal.gitlab.endpoint)
      ? proposal.gitlab.endpoint
      : null;
  const method = String(endpointInfo?.method ?? "").trim().toUpperCase();
  const endpoint = String(endpointInfo?.endpoint ?? endpointInfo?.path ?? "").trim();
  if (method || endpoint) return [method, endpoint].filter(Boolean).join(" ");

  const externalRoute = externalId.includes("::") ? externalId.split("::").at(-1) ?? "" : "";
  if (externalRoute.trim()) return externalRoute.trim();

  const firstEndpoint = normalizeStringArray(payload.endpoints)[0] ?? "";
  return firstEndpoint;
}

function normalizeComparableName(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function shortStableSuffix(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 6).padStart(4, "0");
}

async function markAutomationDeletedFromSource(
  db: SupabaseClientLike,
  input: {
    automationId: string;
    source: PortalOwnedSyncSource;
    now: string;
  },
): Promise<void> {
  const { data: existing, error: fetchError } = await db
    .from("automatiseringen")
    .select("reviewer_overrides")
    .eq("id", input.automationId)
    .maybeSingle();
  throwIfSupabaseError("Automation reviewer-overrides ophalen voor bronverwijdering", fetchError);

  const reviewerOverrides = {
    ...((isRecord(existing?.reviewer_overrides) ? existing.reviewer_overrides : {}) as Record<string, unknown>),
    cleanup_delete_candidate: true,
    cleanup_delete_candidate_at: input.now,
    source_deleted_at: input.now,
    source_deleted_reason: `Niet meer gevonden bij ${sourceLabel(input.source)}`,
  };

  const { error } = await db
    .from("automatiseringen")
    .update({
      cleanup_delete_candidate: true,
      cleanup_delete_candidate_at: input.now,
      reviewer_overrides: reviewerOverrides,
      status: "Uitgeschakeld",
    })
    .eq("id", input.automationId);
  throwIfSupabaseError("Automation uit actieve portalweergave halen", error);
}

async function applyLegacyGitLabCleanup(
  db: SupabaseClientLike,
  row: SourceSyncChangeRow,
  now: string,
): Promise<void> {
  const payload = isRecord(row.payload_sanitized) ? row.payload_sanitized : {};
  const automation = isRecord(payload.automation) ? payload.automation as ExistingAutomation : null;
  const automationId = row.automation_id ?? automation?.id;
  if (!automationId) throw new Error("Legacy GitLab cleanup mist automation-id.");

  const { error } = await db
    .from("automatiseringen")
    .update({
      cleanup_delete_candidate: true,
      cleanup_delete_candidate_at: now,
    })
    .eq("id", automationId);
  throwIfSupabaseError("Legacy GitLab record als opruimkandidaat markeren", error);
}

async function markReviewItemApplied(
  db: SupabaseClientLike,
  id: string,
  now: string,
): Promise<void> {
  const { error } = await db
    .from(SOURCE_SYNC_CHANGE_ITEMS_TABLE)
    .update({
      status: "applied",
      applied_at: now,
      updated_at: now,
    })
    .eq("id", id);
  throwIfSupabaseError("Sync-reviewregel toegepast markeren", error);
}

async function markReviewItemFailed(
  db: SupabaseClientLike,
  id: string,
  error: unknown,
  now: string,
): Promise<void> {
  const errorMessage = typeof error === "string"
    ? error
    : sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
  const { error: updateError } = await db
    .from(SOURCE_SYNC_CHANGE_ITEMS_TABLE)
    .update({
      status: "failed",
      error_message_sanitized: errorMessage,
      updated_at: now,
    })
    .eq("id", id);
  throwIfSupabaseError("Sync-reviewregel foutstatus opslaan", updateError);
}

function mapSyncChangeRow(row: SourceSyncChangeRow): SourceSyncChangeItem {
  return {
    id: row.id,
    syncRunId: row.sync_run_id,
    source: row.source,
    externalId: row.external_id,
    automationId: row.automation_id,
    changeType: row.change_type,
    status: row.status,
    reviewKey: row.review_key ?? null,
    title: row.title,
    summary: row.summary,
    impact: row.impact,
    oldValue: row.old_value_sanitized,
    newValue: row.new_value_sanitized,
    payload: row.payload_sanitized,
    selectedByDefault: row.selected_by_default,
  };
}

function reviewKeyForDraft(draft: SourceSyncChangeDraft): string {
  if (draft.changeType === "source_data_incomplete") {
    const newValue = isRecord(draft.newValue) ? draft.newValue : null;
    const payload = isRecord(draft.payload) ? draft.payload : null;
    const missingEvidence = isRecord(payload?.missingEvidence) ? payload.missingEvidence : null;
    const evidenceKey = stringValue(newValue?.missing_evidence_key) || stringValue(missingEvidence?.key);
    if (evidenceKey) return evidenceKey;
  }

  if (draft.changeType === "legacy_gitlab_record") return "legacy_gitlab_record";
  if (draft.changeType === "source_missing") return "source_missing";
  if (draft.changeType === "route_changed") return "route_changed";
  if (draft.changeType === "metadata_changed") return "metadata_changed";
  if (draft.changeType === "new_automation") return "new_automation";
  return draft.changeType;
}

async function updateExistingSourceSnapshot(
  db: SupabaseClientLike,
  existingAutomation: ExistingAutomation,
  payload: PortalOwnedAutomationPayload,
  now: string,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  for (const field of SOURCE_MANAGED_AUTOMATION_FIELDS) {
    if (field === "last_synced_at") {
      patch[field] = now;
      continue;
    }
    if ((field === "pipeline_id" || field === "stage_id") && !hasTextSourceValue(payload[field])) {
      continue;
    }
    if (field in payload) {
      patch[field] = field === "import_proposal"
        ? preserveHubSpotWorkflowAudit(existingAutomation.import_proposal, payload.import_proposal)
        : payload[field];
    }
  }

  const { error } = await db
    .from("automatiseringen")
    .update(patch)
    .eq("id", existingAutomation.id);
  throwIfSupabaseError("Bron-snapshot bijwerken", error);
}

function preserveHubSpotWorkflowAudit(
  existingProposal: Record<string, unknown> | null | undefined,
  nextProposal: unknown,
): unknown {
  if (!isRecord(nextProposal)) return nextProposal;
  const existingWorkflow = isRecord(existingProposal?.hubspot_workflow) ? existingProposal.hubspot_workflow : null;
  const nextWorkflow = isRecord(nextProposal.hubspot_workflow) ? nextProposal.hubspot_workflow : null;
  if (!existingWorkflow || !nextWorkflow) return nextProposal;

  const mergedWorkflow: Record<string, unknown> = { ...nextWorkflow };
  if (!hasHubSpotUserAudit(mergedWorkflow.createdBy) && hasHubSpotUserAudit(existingWorkflow.createdBy)) {
    mergedWorkflow.createdBy = existingWorkflow.createdBy;
  }
  if (!hasHubSpotUserAudit(mergedWorkflow.updatedBy) && hasHubSpotUserAudit(existingWorkflow.updatedBy)) {
    mergedWorkflow.updatedBy = existingWorkflow.updatedBy;
  }

  return {
    ...nextProposal,
    hubspot_workflow: mergedWorkflow,
  };
}

function hasHubSpotUserAudit(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Boolean(
    String(value.label ?? "").trim()
      || String(value.email ?? "").trim()
      || String(value.id ?? "").trim(),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function upsertImportProposal(
  db: SupabaseClientLike,
  source: PortalOwnedSyncSource,
  payload: PortalOwnedAutomationPayload,
  now: string,
): Promise<boolean> {
  const externalId = String(payload.external_id ?? "").trim();
  const { data: existing, error: findError } = await db
    .from(AUTOMATION_IMPORT_PROPOSALS_TABLE)
    .select("id")
    .eq("source", source)
    .eq("external_id", externalId)
    .eq("status", "pending")
    .maybeSingle();
  throwIfSupabaseError("Importvoorstel ophalen", findError);

  const proposal = {
    source,
    external_id: externalId,
    proposed_name: String(payload.naam ?? "").trim() || `${sourceLabel(source)} automation`,
    proposed_description: String(payload.doel ?? ""),
    proposed_category: String(payload.categorie ?? "Anders"),
    proposed_systems: normalizeStringArray(payload.systemen),
    proposed_endpoints_sanitized: [
      ...normalizeStringArray(payload.endpoints),
      ...normalizeStringArray(payload.webhook_paths),
    ],
    details_sanitized: sanitizeValue({
      payload,
      source_snapshot: buildComparableSnapshot(payload),
    }),
    updated_at: now,
  };

  if (existing?.id) {
    const { error } = await db
      .from(AUTOMATION_IMPORT_PROPOSALS_TABLE)
      .update(proposal)
      .eq("id", existing.id);
    throwIfSupabaseError("Importvoorstel bijwerken", error);
    return false;
  }

  const { error } = await db.from(AUTOMATION_IMPORT_PROPOSALS_TABLE).insert({
    ...proposal,
    status: "pending",
    created_at: now,
  });
  throwIfSupabaseError("Importvoorstel aanmaken", error);
  return true;
}

async function upsertFinding(
  db: SupabaseClientLike,
  input: {
    automation: ExistingAutomation;
    type: "source_missing" | "source_data_incomplete" | "source_changed" | "webhook_changed" | "metadata_changed";
    severity: "info" | "warning" | "critical";
    message: string;
    details: Record<string, unknown>;
    dedupeKeySuffix?: string;
    syncRunId: string;
    now: string;
  },
): Promise<void> {
  const dedupeKey = findingKey(input.automation, input.type, input.dedupeKeySuffix);
  const { data: existing, error: findError } = await db
    .from(AUTOMATION_SOURCE_FINDINGS_TABLE)
    .select("id, first_seen_at")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  throwIfSupabaseError("Bronwaarschuwing ophalen", findError);

  const data = {
    automation_id: input.automation.id,
    source: input.automation.source,
    external_id: input.automation.external_id,
    type: input.type,
    severity: input.severity,
    message: input.message,
    details_sanitized: sanitizeValue(input.details),
    dedupe_key: dedupeKey,
    last_seen_at: input.now,
    resolved_at: null,
    resolved_reason: null,
    sync_run_id: input.syncRunId,
    updated_at: input.now,
  };

  if (existing?.id) {
    const { error } = await db
      .from(AUTOMATION_SOURCE_FINDINGS_TABLE)
      .update(data)
      .eq("id", existing.id);
    throwIfSupabaseError("Bronwaarschuwing bijwerken", error);
    return;
  }

  const { error } = await db.from(AUTOMATION_SOURCE_FINDINGS_TABLE).insert({
    ...data,
    first_seen_at: input.now,
    created_at: input.now,
  });
  throwIfSupabaseError("Bronwaarschuwing aanmaken", error);
}

async function resolveFinding(
  db: SupabaseClientLike,
  input: {
    dedupeKey: string;
    resolvedReason: string;
    syncRunId: string;
    now: string;
  },
): Promise<void> {
  const { error } = await db
    .from(AUTOMATION_SOURCE_FINDINGS_TABLE)
    .update({
      resolved_at: input.now,
      resolved_reason: input.resolvedReason,
      sync_run_id: input.syncRunId,
      updated_at: input.now,
    })
    .eq("dedupe_key", input.dedupeKey)
    .is("resolved_at", null);
  throwIfSupabaseError("Bronwaarschuwing oplossen", error);
}

type SourceQualitySnapshot = ExistingAutomation & {
  gitlab_file_path?: string | null;
};

type SourceQualityMissingEvidence = {
  key: string;
  label: string;
  description: string;
  message: string;
};

function buildSourceQualitySnapshot(
  existingAutomation: ExistingAutomation,
  payload: PortalOwnedAutomationPayload,
  source: PortalOwnedSyncSource,
): SourceQualitySnapshot {
  return {
    ...existingAutomation,
    external_id: existingAutomation.external_id ?? payload.external_id,
    source,
    naam: typeof payload.naam === "string" ? payload.naam : existingAutomation.naam,
    doel: typeof payload.doel === "string" ? payload.doel : existingAutomation.doel,
    trigger_beschrijving: typeof payload.trigger_beschrijving === "string" ? payload.trigger_beschrijving : existingAutomation.trigger_beschrijving,
    systemen: Array.isArray(payload.systemen) ? payload.systemen : existingAutomation.systemen,
    stappen: Array.isArray(payload.stappen) ? payload.stappen : existingAutomation.stappen,
    categorie: typeof payload.categorie === "string" ? payload.categorie : existingAutomation.categorie,
    status: typeof payload.status === "string" ? payload.status : existingAutomation.status,
    endpoints: Array.isArray(payload.endpoints) ? payload.endpoints : existingAutomation.endpoints,
    webhook_paths: Array.isArray(payload.webhook_paths) ? payload.webhook_paths : existingAutomation.webhook_paths,
    import_proposal: isRecord(payload.import_proposal) ? payload.import_proposal : existingAutomation.import_proposal,
    gitlab_file_path: typeof payload.gitlab_file_path === "string" ? payload.gitlab_file_path : null,
  };
}

function buildSourceQualityMissingEvidence(snapshot: SourceQualitySnapshot): SourceQualityMissingEvidence[] {
  return sourceQualityChecks(snapshot)
    .filter((check) => !check.passes)
    .map((check) => ({
      key: check.key,
      label: check.label,
      description: check.missingDetail,
      message: `${check.label} ontbreekt voor procesreisvorming.`,
    }));
}

async function resolveSourceQualityFindings(
  db: SupabaseClientLike,
  input: {
    automation: ExistingAutomation;
    activeMissingEvidenceKeys: string[];
    syncRunId: string;
    now: string;
  },
): Promise<void> {
  const activeKeys = new Set(input.activeMissingEvidenceKeys);
  for (const evidenceKey of sourceQualityEvidenceKeysForSource(input.automation.source)) {
    if (activeKeys.has(evidenceKey)) continue;
    await resolveFinding(db, {
      dedupeKey: findingKey(input.automation, "source_data_incomplete", evidenceKey),
      resolvedReason: "Procesreis-kritieke brondata is opnieuw aanwezig.",
      syncRunId: input.syncRunId,
      now: input.now,
    });
  }
}

function sourceQualityEvidenceKeysForSource(source: string | null | undefined): string[] {
  if (source === "hubspot") return ["hubspot_workflow", "hubspot_triggers", "hubspot_actions", "hubspot_webhook_path"];
  if (source === "zapier") return ["zapier_metadata", "zapier_steps", "zapier_webhook_handoff"];
  if (source === "gitlab") return ["gitlab_endpoint", "gitlab_handler", "gitlab_call_graph"];
  if (source === "typeform") return ["typeform_fields", "typeform_active_webhook"];
  return [];
}

function sourceQualityChecks(snapshot: SourceQualitySnapshot): Array<{
  key: string;
  label: string;
  passes: boolean;
  missingDetail: string;
}> {
  if (snapshot.source === "hubspot") return hubSpotSourceQualityChecks(snapshot);
  if (snapshot.source === "zapier") return zapierSourceQualityChecks(snapshot);
  if (snapshot.source === "gitlab") return gitLabSourceQualityChecks(snapshot);
  if (snapshot.source === "typeform") return typeformSourceQualityChecks(snapshot);
  return [];
}

function hubSpotSourceQualityChecks(snapshot: SourceQualitySnapshot) {
  const workflow = getRecord(snapshot.import_proposal?.hubspot_workflow);
  const triggers = [
    ...arrayValue(workflow?.triggers),
    ...arrayValue(workflow?.criteria),
    ...arrayValue(workflow?.enrollmentCriteria),
  ];
  const actions = arrayValue(workflow?.actions).map(getRecord).filter(Boolean) as Record<string, unknown>[];
  const expectsWebhook = actions.some((action) => isWebhookActionRecord(action)) || normalizeStringArray(snapshot.webhook_paths).length > 0;
  const hasWebhookPath = actions.some((action) => Boolean(stringValue(action.webhookPath) || stringValue(action.webhookUrl) || stringValue(action.url)))
    || normalizeStringArray(snapshot.webhook_paths).length > 0;

  return [
    sourceQualityCheck("hubspot_workflow", "HubSpot workflowdata", Boolean(workflow), "HubSpot workflowdata ontbreekt."),
    sourceQualityCheck("hubspot_triggers", "HubSpot triggercriteria", triggers.length > 0, "Triggercriteria ontbreken in HubSpot brondata."),
    sourceQualityCheck("hubspot_actions", "HubSpot acties", actions.length > 0, "Workflowacties ontbreken in HubSpot brondata."),
    ...(expectsWebhook
      ? [sourceQualityCheck("hubspot_webhook_path", "HubSpot webhookpad", hasWebhookPath, "Webhookpad ontbreekt of is niet matchbaar.")]
      : []),
  ];
}

function zapierSourceQualityChecks(snapshot: SourceQualitySnapshot) {
  const proposal = snapshot.import_proposal ?? {};
  const zap = getRecord(proposal.zap);
  const process = getRecord(zap?.process);
  const zapierExport = getRecord(proposal.zapier_export);
  const sanitizedNodes = getRecord(zapierExport?.sanitized_nodes);
  const steps = [
    ...arrayValue(zap?.steps),
    ...arrayValue(process?.steps),
    ...(sanitizedNodes ? Object.values(sanitizedNodes) : []),
  ];
  const expectsWebhook = normalizeStringArray(snapshot.webhook_paths).length > 0
    || normalizeStringArray(proposal.webhookPaths).length > 0;
  const hasWebhookHandoff = arrayValue(process?.webhookHandoffs).length > 0
    || arrayValue(zap?.webhookHandoffs).length > 0
    || arrayValue(process?.steps).some((step) => arrayValue(getRecord(step)?.webhookPaths).length > 0)
    || arrayValue(zap?.steps).some((step) => arrayValue(getRecord(step)?.webhookPaths).length > 0);

  return [
    sourceQualityCheck("zapier_metadata", "Zapier metadata", Boolean(zap || zapierExport), "Zapier metadata ontbreekt."),
    sourceQualityCheck("zapier_steps", "Zapier step flow", steps.length > 0, "Zapier step flow ontbreekt."),
    ...(expectsWebhook
      ? [sourceQualityCheck("zapier_webhook_handoff", "Zapier webhook-overdracht", hasWebhookHandoff, "Webhook-overdracht ontbreekt in Zapier brondata.")]
      : []),
  ];
}

function gitLabSourceQualityChecks(snapshot: SourceQualitySnapshot) {
  const proposal = snapshot.import_proposal ?? {};
  const gitlab = getRecord(proposal.gitlab);
  const endpoint = getRecord(proposal.gitlab_endpoint) ?? getRecord(gitlab?.endpoint);
  const endpointValue = stringValue(endpoint?.endpoint)
    || stringValue(endpoint?.path)
    || normalizeStringArray(snapshot.endpoints)[0]
    || "";
  const handler = stringValue(endpoint?.handler);
  const calls = [
    ...arrayValue(endpoint?.calls),
    ...arrayValue(gitlab?.calls),
  ];

  return [
    sourceQualityCheck("gitlab_endpoint", "GitLab endpoint", Boolean(endpointValue), "GitLab endpoint ontbreekt of is niet matchbaar."),
    sourceQualityCheck("gitlab_handler", "GitLab handler", Boolean(handler), "GitLab handler ontbreekt."),
    sourceQualityCheck("gitlab_call_graph", "GitLab call graph", calls.length > 0, "Call graph of read/write-bewijs ontbreekt."),
  ];
}

function typeformSourceQualityChecks(snapshot: SourceQualitySnapshot) {
  const proposal = snapshot.import_proposal ?? {};
  const typeform = getRecord(proposal.typeform) ?? getRecord(proposal.typeform_api);
  const form = getRecord(typeform?.form);
  const fields = arrayValue(form?.fields);
  const process = getRecord(typeform?.process);
  const webhooks = arrayValue(typeform?.webhooks);
  const hasActiveWebhook = webhooks.some((webhook) => getRecord(webhook)?.enabled === true)
    || arrayValue(process?.webhookHandoffs).length > 0
    || normalizeStringArray(snapshot.webhook_paths).length > 0;

  return [
    sourceQualityCheck("typeform_fields", "Typeform velden", fields.length > 0, "Typeform formuliervelden ontbreken."),
    sourceQualityCheck("typeform_active_webhook", "Actieve Typeform webhook", hasActiveWebhook, "Actieve Typeform webhook ontbreekt."),
  ];
}

function sourceQualityCheck(key: string, label: string, passes: boolean, missingDetail: string) {
  return { key, label, passes, missingDetail };
}

function isWebhookActionRecord(action: Record<string, unknown>): boolean {
  const type = `${action.type ?? action.actionType ?? action.action_type ?? ""}`.toLowerCase();
  return type.includes("webhook") || Boolean(action.webhookPath || action.webhookUrl || action.url);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function diffMetadata(existing: ExistingAutomation, payload: PortalOwnedAutomationPayload) {
  const checks: Array<{ field: string; portal: unknown; source: unknown }> = [
    ...(hasTextSourceValue(payload.naam)
      ? [{ field: "naam", portal: existing.naam ?? "", source: String(payload.naam).trim() }]
      : []),
    ...(hasTextSourceValue(payload.status)
      ? [{ field: "status", portal: existing.status ?? "", source: String(payload.status).trim() }]
      : []),
  ];

  return checks.filter((check) => stableStringify(check.portal) !== stableStringify(check.source));
}

function hasTextSourceValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function diffArrayField(portalValue: unknown, sourceValue: unknown): { changed: boolean } {
  return {
    changed: stableStringify(normalizeStringArray(portalValue)) !== stableStringify(normalizeStringArray(sourceValue)),
  };
}

function findingKey(
  automation: Pick<ExistingAutomation, "id" | "source" | "external_id">,
  type: string,
  evidenceKey?: string,
): string {
  const parts = [
    automation.id,
    automation.source ?? "unknown",
    automation.external_id ?? "",
    type,
  ];
  if (evidenceKey) parts.push(evidenceKey);
  return parts.join(":");
}

function buildComparableSnapshot(payload: PortalOwnedAutomationPayload): Record<string, unknown> {
  return {
    naam: payload.naam,
    doel: payload.doel,
    trigger_beschrijving: payload.trigger_beschrijving,
    categorie: payload.categorie,
    status: payload.status,
    systemen: normalizeStringArray(payload.systemen),
    stappen: normalizeStringArray(payload.stappen),
    pipeline_id: payload.pipeline_id ?? null,
    stage_id: payload.stage_id ?? null,
    endpoints: normalizeStringArray(payload.endpoints),
    webhook_paths: normalizeStringArray(payload.webhook_paths),
  };
}

function isLegacyGitLabRecord(automation: ExistingAutomation): boolean {
  if (automation.source !== "gitlab") return false;
  if (hasGitLabEndpointSnapshot(automation.import_proposal)) return false;
  const externalId = String(automation.external_id ?? "");
  if (externalId.includes("::")) return false;
  return Boolean(legacyGitLabFilePath(automation));
}

function hasGitLabEndpointSnapshot(importProposal: Record<string, unknown> | null | undefined): boolean {
  if (!isRecord(importProposal)) return false;
  if (isRecord(importProposal.gitlab_endpoint)) return true;
  const gitlab = isRecord(importProposal.gitlab) ? importProposal.gitlab : null;
  return isRecord(gitlab?.endpoint);
}

function legacyGitLabFilePath(automation: ExistingAutomation): string {
  return String(automation.gitlab_file_path ?? automation.external_id ?? "").trim();
}

function normalizeGitLabFilePath(value: string): string {
  return value.trim().replace(/\\/g, "/").toLowerCase();
}

function endpointMethodFromPayload(payload: PortalOwnedAutomationPayload): string {
  const proposal = isRecord(payload.import_proposal) ? payload.import_proposal : null;
  const endpoint = isRecord(proposal?.gitlab_endpoint) ? proposal.gitlab_endpoint : null;
  const gitlab = isRecord(proposal?.gitlab) ? proposal.gitlab : null;
  const legacyEndpoint = isRecord(gitlab?.endpoint) ? gitlab.endpoint : null;
  return String(endpoint?.method ?? legacyEndpoint?.method ?? "").trim().toUpperCase();
}

function sanitizeValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return "[redacted]";
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, key));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      result[childKey] = sanitizeValue(childValue, childKey);
    }
    return result;
  }
  if (typeof value === "string") {
    return value.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
  }
  return value;
}

function sanitizeErrorMessage(message: unknown): string | null {
  if (typeof message !== "string" || !message.trim()) return null;
  const sanitized = sanitizeValue(message);
  return typeof sanitized === "string" ? sanitized.slice(0, 500) : "Gesanitiseerde bronfout";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))].sort();
}

function arrayOrEmpty(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => stableStringify(item)));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return JSON.stringify(Object.keys(record).sort().map((key) => [key, stableStringify(record[key])]));
  }
  return JSON.stringify(value ?? null);
}

function sourceLabel(source: string | null | undefined): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "gitlab") return "GitLab";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  return "de bron";
}

function throwIfSupabaseError(action: string, error: unknown): void {
  if (!error) return;
  if (error instanceof Error) throw new Error(`${action}: ${error.message}`);
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    throw new Error(`${action}: ${typeof message === "string" ? message : "Onbekende Supabase fout"}`);
  }
  throw new Error(`${action}: Onbekende Supabase fout`);
}
