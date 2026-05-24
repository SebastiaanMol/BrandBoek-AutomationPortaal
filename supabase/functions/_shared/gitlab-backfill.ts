import type { GitLabAutomationPayload } from "./gitlab-readonly.ts";

type SupabaseClientLike = {
  from: (table: string) => any;
};

type ExistingGitLabAutomation = {
  id: string;
  external_id: string | null;
  [key: string]: unknown;
};

export interface GitLabBackfillChange {
  automationId: string;
  externalId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface GitLabBackfillReport {
  dryRun: boolean;
  scanned: number;
  matched: number;
  changedAutomations: number;
  changedFields: number;
  newEndpoints: number;
  missingExisting: number;
  changes: GitLabBackfillChange[];
  newExternalIds: string[];
  missingExternalIds: string[];
}

const BACKFILL_FIELDS = [
  "naam",
  "doel",
  "trigger_beschrijving",
  "stappen",
  "systemen",
  "fasen",
  "endpoints",
  "webhook_paths",
  "categorie",
  "status",
  "afhankelijkheden",
  "owner",
  "verbeterideeen",
  "mermaid_diagram",
  "external_id",
  "source",
  "import_source",
  "import_status",
  "import_proposal",
  "gitlab_file_path",
  "gitlab_last_commit",
  "last_synced_at",
] as const;

const SENSITIVE_KEY_PATTERN = /(token|secret|authorization|password|cookie|response|responses|answer|answers|submission|payload)/i;

export async function runGitLabAutomationBackfill(
  db: SupabaseClientLike,
  input: {
    payloads: GitLabAutomationPayload[];
    now: string;
    dryRun: boolean;
  },
): Promise<GitLabBackfillReport> {
  const { data, error } = await db
    .from("automatiseringen")
    .select("*")
    .eq("source", "gitlab");
  throwIfSupabaseError("Bestaande GitLab automations ophalen", error);

  const existingRows = ((data ?? []) as ExistingGitLabAutomation[])
    .filter((row) => typeof row.external_id === "string" && row.external_id.trim());
  const existingByExternalId = new Map(existingRows.map((row) => [row.external_id as string, row]));
  const payloadByExternalId = new Map(input.payloads.map((payload) => [payload.external_id, payload]));

  const changes: GitLabBackfillChange[] = [];
  const changedAutomationIds = new Set<string>();

  for (const payload of input.payloads) {
    const existing = existingByExternalId.get(payload.external_id);
    if (!existing) continue;

    const updatePayload = buildUpdatePayload(payload);
    const rowChanges = diffUpdatePayload(existing, updatePayload);
    if (rowChanges.length === 0) continue;

    changedAutomationIds.add(existing.id);
    changes.push(...rowChanges.map((change) => ({
      automationId: existing.id,
      externalId: payload.external_id,
      ...change,
    })));

    if (!input.dryRun) {
      const { error: updateError } = await db
        .from("automatiseringen")
        .update(updatePayload)
        .eq("id", existing.id);
      throwIfSupabaseError("GitLab automation backfill bijwerken", updateError);

      await insertAuditEvents(db, existing.id, rowChanges, input.now);
    }
  }

  const seenExternalIds = new Set(input.payloads.map((payload) => payload.external_id));
  const newExternalIds = input.payloads
    .filter((payload) => !existingByExternalId.has(payload.external_id))
    .map((payload) => payload.external_id);
  const missingExternalIds = existingRows
    .filter((row) => row.external_id && !seenExternalIds.has(row.external_id))
    .map((row) => row.external_id as string);

  return {
    dryRun: input.dryRun,
    scanned: input.payloads.length,
    matched: input.payloads.length - newExternalIds.length,
    changedAutomations: changedAutomationIds.size,
    changedFields: changes.length,
    newEndpoints: newExternalIds.length,
    missingExisting: missingExternalIds.length,
    changes,
    newExternalIds,
    missingExternalIds,
  };
}

function buildUpdatePayload(payload: GitLabAutomationPayload): Record<string, unknown> {
  return BACKFILL_FIELDS.reduce((record, field) => {
    record[field] = payload[field];
    return record;
  }, {} as Record<string, unknown>);
}

function diffUpdatePayload(
  existing: ExistingGitLabAutomation,
  updatePayload: Record<string, unknown>,
): Array<{ field: string; oldValue: unknown; newValue: unknown }> {
  return Object.entries(updatePayload)
    .filter(([field, newValue]) => stableStringify(existing[field]) !== stableStringify(newValue))
    .map(([field, newValue]) => ({
      field,
      oldValue: existing[field] ?? null,
      newValue,
    }));
}

async function insertAuditEvents(
  db: SupabaseClientLike,
  automationId: string,
  changes: Array<{ field: string; oldValue: unknown; newValue: unknown }>,
  now: string,
): Promise<void> {
  if (changes.length === 0) return;

  const { error } = await db.from("audit_events").insert(
    changes.map((change) => ({
      actor: null,
      action: "gitlab_backfill_update",
      object_type: "automatisering",
      object_id: automationId,
      field_name: change.field,
      old_value_sanitized: sanitizeValue(change.oldValue),
      new_value_sanitized: sanitizeValue(change.newValue),
      created_at: now,
    })),
  );
  throwIfSupabaseError("GitLab backfill audit loggen", error);
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => stableStringify(item)));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return JSON.stringify(Object.keys(record).sort().map((key) => [key, stableStringify(record[key])]));
  }
  return JSON.stringify(value ?? null);
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
