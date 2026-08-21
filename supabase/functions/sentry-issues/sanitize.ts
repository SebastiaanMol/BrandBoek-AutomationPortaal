export type SentryIssuesMode = "overview" | "detail";

export interface SentryIssuesRequest {
  mode: SentryIssuesMode;
  automationId?: string;
  limit: number;
}

export interface SanitizedSentryIssue {
  id: string;
  shortId?: string;
  title: string;
  culprit?: string;
  level?: string;
  status: string;
  count: number;
  userCount: number;
  firstSeen?: string;
  lastSeen?: string;
  permalink: string;
  metadataText?: string;
  tags: Record<string, string>;
}

export type RequestValidationResult =
  | { ok: true; value: SentryIssuesRequest }
  | { ok: false; error: string };

const MAX_METADATA_TEXT_LENGTH = 240;
const MAX_TAG_VALUE_LENGTH = 160;
const AUTOMATION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const ALLOWED_TAG_KEYS = new Set([
  "automation_id",
  "automation_source",
  "automation_status",
  "automation_action",
  "environment",
  "runtime",
  "server_name",
  "transaction",
  "logger",
  "level",
  "release",
]);

const SENSITIVE_METADATA_KEYS = new Set([
  "headers",
  "header",
  "cookies",
  "cookie",
  "request",
  "request_body",
  "raw",
  "raw_payload",
  "payload",
  "token",
  "authorization",
  "password",
  "passwd",
  "secret",
  "api_key",
  "apikey",
  "webhook",
]);

export function buildSentryQuery(mode: SentryIssuesMode, automationId?: string): string {
  const normalizedAutomationId = normalizeOptionalString(automationId);
  if (mode !== "detail") {
    return "is:unresolved";
  }

  if (!normalizedAutomationId) {
    throw new Error("Missing automation id");
  }
  if (!isSafeAutomationId(normalizedAutomationId)) {
    throw new Error("Invalid automation id");
  }

  return `is:unresolved tags[automation_id]:${normalizedAutomationId}`;
}

export function validateSentryIssuesRequest(value: unknown): RequestValidationResult {
  if (!isRecord(value)) return { ok: false, error: "Invalid request body" };

  const mode = value.mode === undefined ? "overview" : value.mode;
  if (mode !== "overview" && mode !== "detail") {
    return { ok: false, error: "Unsupported mode" };
  }

  const automationId = normalizeOptionalString(value.automationId);
  if (mode === "detail" && !automationId) {
    return { ok: false, error: "Missing automation id" };
  }
  if (mode === "detail" && !isSafeAutomationId(automationId)) {
    return { ok: false, error: "Invalid automation id" };
  }

  const limitResult = validateLimit(value.limit);
  if ("error" in limitResult) return { ok: false, error: limitResult.error };

  return {
    ok: true,
    value: {
      mode,
      automationId,
      limit: limitResult.value,
    },
  };
}

export function sanitizeSentryIssue(issue: unknown): SanitizedSentryIssue {
  const record = isRecord(issue) ? issue : {};
  const metadata = isRecord(record.metadata) ? record.metadata : {};

  return {
    id: stringValue(record.id),
    shortId: optionalString(record.shortId),
    title: sanitizeTitle(record.title),
    culprit: sanitizeDisplayText(record.culprit),
    level: optionalString(record.level),
    status: optionalString(record.status) ?? "unknown",
    count: numberValue(record.count),
    userCount: numberValue(record.userCount),
    firstSeen: optionalString(record.firstSeen),
    lastSeen: optionalString(record.lastSeen),
    permalink: optionalString(record.permalink) ?? "",
    metadataText: buildMetadataText(metadata),
    tags: sanitizeTags(record.tags),
  };
}

function validateLimit(limit: unknown): { ok: true; value: number } | { ok: false; error: string } {
  if (limit === undefined) return { ok: true, value: 25 };
  if (typeof limit !== "number" || !Number.isFinite(limit) || !Number.isInteger(limit)) {
    return { ok: false, error: "Invalid limit" };
  }
  if (limit < 1 || limit > 100) {
    return { ok: false, error: "Invalid limit" };
  }
  return { ok: true, value: limit };
}

function isSafeAutomationId(value: string | undefined): value is string {
  return Boolean(value && AUTOMATION_ID_PATTERN.test(value));
}

function sanitizeTitle(value: unknown): string {
  return sanitizeDisplayText(value) ?? "Sentry issue";
}

function sanitizeDisplayText(value: unknown): string | undefined {
  const normalized = optionalString(value);
  if (!normalized) return undefined;

  const redacted = capText(redactSensitiveText(normalized), MAX_METADATA_TEXT_LENGTH).trim();
  if (!hasDisplayText(redacted)) return undefined;
  return redacted;
}

function hasDisplayText(value: string): boolean {
  return value.replace(/\[redacted\]/gi, "").replace(/[^\p{L}\p{N}]/gu, "").length > 0;
}

function sanitizeTags(tags: unknown): Record<string, string> {
  if (!Array.isArray(tags)) return {};

  const sanitized: Record<string, string> = {};
  for (const tag of tags) {
    if (!isRecord(tag)) continue;
    const key = sanitizeTagKey(optionalString(tag.key) ?? optionalString(tag.name));
    const value = optionalString(tag.value);
    if (key && value) sanitized[key] = capText(redactSensitiveText(value), MAX_TAG_VALUE_LENGTH);
  }
  return sanitized;
}

function sanitizeTagKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const normalizedKey = key.trim().toLowerCase();
  return ALLOWED_TAG_KEYS.has(normalizedKey) ? normalizedKey : undefined;
}

function buildMetadataText(metadata: Record<string, unknown>): string | undefined {
  const values = [
    safeMetadataValue("type", metadata.type),
    safeMetadataValue("value", metadata.value),
    safeMetadataValue("filename", metadata.filename),
    safeMetadataValue("function", metadata.function),
    safeMetadataValue("display_title", metadata.display_title),
  ].filter((value): value is string => Boolean(value));

  if (values.length === 0) return undefined;
  return capText(redactSensitiveText(values.join(" ")), MAX_METADATA_TEXT_LENGTH);
}

function safeMetadataValue(key: string, value: unknown): string | undefined {
  const normalizedKey = key.trim().toLowerCase();
  if (SENSITIVE_METADATA_KEYS.has(normalizedKey)) return undefined;
  return optionalString(value);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bauthorization\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi, "[redacted]")
    .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted]")
    .replace(/\bcookie(?:s)?\s*[:=]\s*[^,\n]+/gi, "[redacted]")
    .replace(
      /\b(?:password|passwd|secret|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|session)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "[redacted]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted]")
    .replace(/\b(?:sk|ghp|xox[baprs]|pat)_[A-Za-z0-9_=-]{16,}\b/gi, "[redacted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, "[redacted]")
    .replace(/\bwebhook\s+payload\b/gi, "[redacted]");
}

function capText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = optionalString(value);
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function stringValue(value: unknown): string {
  return optionalString(value) ?? "";
}

function numberValue(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
