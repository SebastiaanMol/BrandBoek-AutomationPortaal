export type HubSpotWebhookInfo = {
  url: string | null;
  path: string | null;
  method: string | null;
};

const URL_KEYS = new Set([
  "url",
  "webhookUrl",
  "webhookURL",
  "webhook_url",
  "actionUrl",
  "actionURL",
  "action_url",
  "targetUrl",
  "target_url",
  "callbackUrl",
  "callback_url",
  "requestUrl",
  "request_url",
]);

const WEBHOOK_SIGNAL_KEYS = new Set([
  "webhookUrl",
  "webhookURL",
  "webhook_url",
  "actionUrl",
  "actionURL",
  "action_url",
  "targetUrl",
  "target_url",
  "callbackUrl",
  "callback_url",
  "requestUrl",
  "request_url",
]);

const METHOD_KEYS = new Set([
  "method",
  "webhookMethod",
  "webhook_method",
  "httpMethod",
  "http_method",
  "requestMethod",
  "request_method",
]);

const SEARCH_KEYS = [
  "fields",
  "body",
  "params",
  "parameters",
  "settings",
  "config",
  "configuration",
  "webhook",
  "webhookSettings",
  "request",
  "requestConfig",
  "inputFields",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeType(action: Record<string, unknown>): string {
  return String(action.type ?? action.actionType ?? "").toUpperCase();
}

function findByKeys(
  value: unknown,
  keys: Set<string>,
  maxDepth = 6,
  visited = new Set<unknown>(),
): string | null {
  if (maxDepth < 0 || value == null || visited.has(value)) return null;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findByKeys(item, keys, maxDepth - 1, visited);
      if (found) return found;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  const fieldName = cleanString(value.name ?? value.key ?? value.fieldName ?? value.field);
  if (fieldName && keys.has(fieldName)) {
    const namedCandidate = cleanString(
      value.value ?? value.fieldValue ?? value.defaultValue ?? value.inputValue,
    );
    if (namedCandidate) return namedCandidate;
  }

  for (const [key, raw] of Object.entries(value)) {
    if (keys.has(key)) {
      const candidate = cleanString(raw);
      if (candidate) return candidate;
    }
  }

  for (const key of SEARCH_KEYS) {
    if (!(key in value)) continue;
    const found = findByKeys(value[key], keys, maxDepth - 1, visited);
    if (found) return found;
  }

  return null;
}

function hasWebhookSpecificUrl(action: Record<string, unknown>): boolean {
  return findByKeys(action, WEBHOOK_SIGNAL_KEYS) != null;
}

function isWebhookAction(action: Record<string, unknown>): boolean {
  const type = normalizeType(action);
  return type.includes("WEBHOOK") || hasWebhookSpecificUrl(action);
}

function stripQueryAndHash(path: string): string {
  return path.split(/[?#]/, 1)[0] || path;
}

export function extractHubSpotWebhookPathFromUrl(rawUrl: string | null | undefined): string | null {
  const cleaned = cleanString(rawUrl);
  if (!cleaned) return null;

  if (cleaned.startsWith("/")) {
    const path = stripQueryAndHash(cleaned);
    return path && path !== "/" ? path : null;
  }

  try {
    const path = new URL(cleaned).pathname;
    return path && path !== "/" ? path : null;
  } catch {
    return null;
  }
}

export function extractHubSpotWebhookUrl(action: unknown): string | null {
  if (!isRecord(action) || !isWebhookAction(action)) return null;
  return normalizeType(action).includes("WEBHOOK")
    ? findByKeys(action, URL_KEYS)
    : findByKeys(action, WEBHOOK_SIGNAL_KEYS);
}

export function extractHubSpotWebhookMethod(action: unknown): string | null {
  if (!isRecord(action)) return null;
  const url = extractHubSpotWebhookUrl(action);
  if (!url) return null;
  return (findByKeys(action, METHOD_KEYS) ?? "POST").toUpperCase();
}

export function extractHubSpotWebhookPath(action: unknown): string | null {
  return extractHubSpotWebhookPathFromUrl(extractHubSpotWebhookUrl(action));
}

export function extractHubSpotWebhookInfo(action: unknown): HubSpotWebhookInfo {
  const url = extractHubSpotWebhookUrl(action);
  return {
    url,
    path: extractHubSpotWebhookPathFromUrl(url),
    method: url ? extractHubSpotWebhookMethod(action) : null,
  };
}

export function extractHubSpotWebhookPaths(actions: unknown[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const action of actions) {
    const path = extractHubSpotWebhookPath(action);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }

  return paths;
}
