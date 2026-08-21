export type JsonRecord = Record<string, unknown>;

const SECRET_KEY_PATTERN = /token|authorization|api[\s_-]?key|password|secret/i;
const BEARER_PATTERN = /Bearer\s+\S+/gi;
const MAX_POSTGRES_INTEGER = 2_147_483_647;

export function parseBearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer +([A-Za-z0-9._~+/=-]+)$/i);
  return match?.[1]?.trim() || null;
}

export function redactSecrets<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redactSecrets) as T;

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord).map(([key, nested]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redactSecrets(nested),
      ]),
    ) as T;
  }

  if (typeof value === "string") {
    return value.replace(BEARER_PATTERN, "Bearer [redacted]") as T;
  }

  return value;
}

export function buildJsonResponse(body: JsonRecord, status = 200): Response {
  const emptyBodyStatus = status === 204 || status === 205 || status === 304;

  return new Response(emptyBodyStatus ? null : JSON.stringify(redactSecrets(body)), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, if-match, x-actor",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Content-Type": "application/json",
    },
  });
}

export function errorResponse(error: string, code: string, status: number): Response {
  return buildJsonResponse({ error, code }, status);
}

export function assertAllowedFields(body: JsonRecord, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);

  for (const key of Object.keys(body)) {
    if (!allowedSet.has(key)) throw new Error(`Unknown field: ${key}`);
  }
}

export function requireVersion(value: string | null): number {
  if (!value) throw new Error("Missing If-Match header");
  if (!/^[1-9]\d*$/.test(value)) throw new Error("Invalid If-Match header");

  const version = Number(value);
  if (!Number.isSafeInteger(version) || version > MAX_POSTGRES_INTEGER) {
    throw new Error("Invalid If-Match header");
  }

  return version;
}

export function mergeById<T extends { id: string }>(current: T[], patch: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  const currentIds = new Set(current.map((item) => item.id));
  const patchIds = new Set<string>();

  for (const item of patch) {
    byId.set(item.id, { ...(byId.get(item.id) ?? {}), ...item } as T);
    patchIds.add(item.id);
  }

  return current
    .map((item) => byId.get(item.id) ?? item)
    .concat([...patchIds].filter((id) => !currentIds.has(id)).map((id) => byId.get(id) as T));
}

export function mergeByField<T extends JsonRecord>(current: T[], patch: T[], field: string): T[] {
  const byKey = new Map(current.map((item) => [item[field], item]));
  const currentKeys = new Set(current.map((item) => item[field]));
  const patchKeys = new Set<unknown>();

  for (const item of patch) {
    byKey.set(item[field], { ...(byKey.get(item[field]) ?? {}), ...item } as T);
    patchKeys.add(item[field]);
  }

  return current
    .map((item) => byKey.get(item[field]) ?? item)
    .concat([...patchKeys].filter((key) => !currentKeys.has(key)).map((key) => byKey.get(key) as T));
}

export type SyncReviewApiStatus = "skipped" | "selected" | "unselected";

export function mapSyncReviewStatusToDbPatch(apiStatus: SyncReviewApiStatus, now: string): JsonRecord {
  if (apiStatus === "skipped") return { status: "skipped", skipped_at: now };
  return { selected_by_default: apiStatus === "selected" };
}

export function buildDryRunPayload(before: JsonRecord | null, after: JsonRecord | null): JsonRecord {
  return { dryRun: true, wouldChange: computeDiff(before, after) };
}

export function computeDiff(before: JsonRecord | null, after: JsonRecord | null): JsonRecord {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const diff: JsonRecord = {};

  for (const key of keys) {
    const oldValue = before?.[key];
    const newValue = after?.[key];

    if (stableStringify(oldValue) !== stableStringify(newValue)) {
      diff[key] = { before: oldValue ?? null, after: newValue ?? null };
    }
  }

  return diff;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }

  return value;
}
