export const SOURCE_SYNC_RUNS_TABLE = "source_sync_runs";
export const AUTOMATION_SOURCE_FINDINGS_TABLE = "automation_source_findings";
export const AUTOMATION_IMPORT_PROPOSALS_TABLE = "automation_import_proposals";

type SupabaseClientLike = {
  from: (table: string) => any;
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

const SENSITIVE_KEY_PATTERN = /(token|secret|authorization|password|cookie|response|responses|answer|answers|submission|payload)/i;

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
    .select("id, external_id, naam, source, doel, trigger_beschrijving, systemen, stappen, categorie, status, endpoints, webhook_paths")
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
    updated: 0,
    deactivated: 0,
    total: payloads.length,
    proposed,
    findings,
    missing,
    changed,
    syncRunId,
  };
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
    type: "source_missing" | "source_changed" | "webhook_changed" | "metadata_changed";
    severity: "info" | "warning" | "critical";
    message: string;
    details: Record<string, unknown>;
    syncRunId: string;
    now: string;
  },
): Promise<void> {
  const dedupeKey = findingKey(input.automation, input.type);
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

function diffMetadata(existing: ExistingAutomation, payload: PortalOwnedAutomationPayload) {
  const checks: Array<{ field: string; portal: unknown; source: unknown }> = [
    { field: "naam", portal: existing.naam ?? "", source: payload.naam ?? "" },
    { field: "doel", portal: existing.doel ?? "", source: payload.doel ?? "" },
    { field: "trigger_beschrijving", portal: existing.trigger_beschrijving ?? "", source: payload.trigger_beschrijving ?? "" },
    { field: "categorie", portal: existing.categorie ?? "", source: payload.categorie ?? "" },
    { field: "status", portal: existing.status ?? "", source: payload.status ?? "" },
    { field: "systemen", portal: normalizeStringArray(existing.systemen), source: normalizeStringArray(payload.systemen) },
    { field: "stappen", portal: normalizeStringArray(existing.stappen), source: normalizeStringArray(payload.stappen) },
  ];

  return checks.filter((check) => stableStringify(check.portal) !== stableStringify(check.source));
}

function diffArrayField(portalValue: unknown, sourceValue: unknown): { changed: boolean } {
  return {
    changed: stableStringify(normalizeStringArray(portalValue)) !== stableStringify(normalizeStringArray(sourceValue)),
  };
}

function findingKey(
  automation: Pick<ExistingAutomation, "id" | "source" | "external_id">,
  type: string,
): string {
  return [
    automation.id,
    automation.source ?? "unknown",
    automation.external_id ?? "",
    type,
  ].join(":");
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
    endpoints: normalizeStringArray(payload.endpoints),
    webhook_paths: normalizeStringArray(payload.webhook_paths),
  };
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
