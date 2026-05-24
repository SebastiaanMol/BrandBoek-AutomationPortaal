export type ZapierAutomationStatus = "Actief" | "Uitgeschakeld";

export interface ZapierStepSummary {
  index: number;
  appName: string;
  title: string;
  type: string;
  kind: "trigger" | "lookup" | "condition" | "branch" | "email" | "webhook" | "formatter" | "delay" | "action";
  summary: string;
  details: string[];
  webhookPaths: string[];
  email?: {
    subject: string;
    recipients: string[];
  };
  webhookHandoffs?: ZapierWebhookHandoff[];
}

export interface ZapierWebhookHandoff {
  method: string;
  path: string;
  host?: string;
}

export interface ZapierProcessSummary {
  trigger: string;
  outcome: string;
  conditions: string[];
  emails: Array<{ subject: string; recipients: string[] }>;
  webhookHandoffs: ZapierWebhookHandoff[];
  dataLookups: string[];
  steps: ZapierStepSummary[];
}

export interface ZapierAutomationPayload {
  naam: string;
  categorie: "Zapier Zap";
  doel: string;
  trigger_beschrijving: string;
  systemen: string[];
  stappen: string[];
  afhankelijkheden: string;
  owner: string;
  status: ZapierAutomationStatus;
  verbeterideeen: string;
  mermaid_diagram: string;
  fasen: string[];
  external_id: string;
  source: "zapier";
  last_synced_at: string;
  webhook_paths: string[];
  import_proposal: {
    source: "zapier";
    read_only: true;
    zap: {
      id: string;
      title: string;
      status: ZapierAutomationStatus;
      steps: ZapierStepSummary[];
      process: ZapierProcessSummary;
    };
    summary: string[];
    webhookPaths?: string[];
    zapier_export?: {
      read_only: true;
      node_count: number;
      sanitized_nodes: unknown;
    };
  };
}

const ZAPIER_ZAPS_URL = "https://api.zapier.com/v2/zaps";
const REDACTED = "[redacted]";

export function zapierReadOnlyHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function buildZapierZapsUrl(): string {
  const url = new URL(ZAPIER_ZAPS_URL);
  url.searchParams.set("limit", "100");
  url.searchParams.set("expand", "steps");
  url.searchParams.set("include_shared", "true");
  return url.toString();
}

export function normalizeZapierApiResponse(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    const nestedData = body.flatMap((item) => {
      const record = asRecord(item);
      return Array.isArray(record?.data) ? record.data : [];
    });

    return nestedData.length > 0 ? nestedData : body;
  }

  const record = asRecord(body);
  if (!record) return [];

  const candidates = [record.zaps, record.results, record.data, record.items];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  const dataRecord = asRecord(record.data);
  if (dataRecord) {
    const nestedCandidates = [dataRecord.zaps, dataRecord.results, dataRecord.items];
    for (const candidate of nestedCandidates) {
      if (Array.isArray(candidate)) return candidate;
    }
  }

  return [];
}

export function mapZapierExportToAutomationPayloads(exportBody: unknown, now: string): ZapierAutomationPayload[] {
  return normalizeZapierExportZaps(exportBody).map((zap) => mapZapierZapToAutomationPayload(zap, now));
}

export function sanitizeZapierValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (value == null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeZapierValue(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = isSensitiveZapierKey(key)
      ? REDACTED
      : sanitizeZapierValue(item, depth + 1);
  }

  return sanitized;
}

export function getNextZapierPageUrl(body: unknown): string | null {
  const record = asRecord(body);
  if (!record) return null;

  const next =
    readString(asRecord(record.links), ["next"]) ||
    readString(asRecord(record.pagination), ["next"]) ||
    readString(asRecord(record.meta), ["next"]) ||
    readString(record, ["next"]);

  if (!next) return null;
  if (next.startsWith("//")) return null;
  if (next.startsWith("http://") || next.startsWith("https://")) {
    try {
      const parsed = new URL(next);
      return parsed.hostname === "api.zapier.com" ? parsed.toString() : null;
    } catch {
      return null;
    }
  }
  if (next.startsWith("/")) return new URL(next, "https://api.zapier.com").toString();
  return null;
}

export function mapZapierZapToAutomationPayload(zap: unknown, now: string): ZapierAutomationPayload {
  const record = asRecord(zap) || {};
  const externalId = String(readValue(record, ["id", "zap_id", "zapId"]) || "unknown-zap");
  const title = readString(record, ["title", "name", "display_name"]) || `Zapier Zap ${externalId}`;
  const status = readZapStatus(record);
  const steps = readZapSteps(record).map((step, index) => summarizeStep(step, index));
  const process = buildZapierProcessSummary(title, steps);
  const systemen = unique(["Zapier", ...steps.map((step) => step.appName).filter(Boolean)]);
  const webhookPaths = unique(steps.flatMap((step) => step.webhookPaths));
  const trigger = steps[0];

  const summary = [
    process.trigger,
    process.outcome,
    "Deze Zap wordt alleen uitgelezen; het portaal past niets in Zapier aan.",
  ];

  return {
    naam: title,
    categorie: "Zapier Zap",
    doel: buildZapierGoal(title, process),
    trigger_beschrijving: buildZapierTriggerDescription(trigger, process),
    systemen,
    stappen: steps.map((step) => `${step.index}. ${step.summary}`),
    afhankelijkheden: "Zapier API v2 read-only toegang",
    owner: "",
    status,
    verbeterideeen: "",
    mermaid_diagram: "",
    fasen: [],
    external_id: externalId,
    source: "zapier",
    last_synced_at: now,
    webhook_paths: webhookPaths,
    import_proposal: {
      source: "zapier",
      read_only: true,
      zap: {
        id: externalId,
        title,
        status,
        steps,
        process,
      },
      summary,
      webhookPaths,
      zapier_export: {
        read_only: true,
        node_count: steps.length,
        sanitized_nodes: sanitizeZapierValue(readValue(record, ["nodes"]) ?? null),
      },
    },
  };
}

function summarizeStep(step: unknown, index: number): ZapierStepSummary {
  const record = asRecord(step) || {};
  const appName = readAppName(record);
  const rawTitle =
    readString(asRecord(record.meta), ["stepTitle"]) ||
    readString(record, ["title", "name", "label"]) ||
    readString(asRecord(record.action), ["title", "name", "label"]) ||
    appName ||
    "Zapier stap";
  const action = readString(record, ["action", "operation", "event"]);
  const type = readString(record, ["type", "kind", "type_of"]) || (index === 0 ? "trigger" : "action");
  const title = toUserFacingStepTitle(rawTitle, appName, action, type);
  const process = buildStepProcessSummary(record, index, appName || "Zapier", title, action, type);

  return {
    index: index + 1,
    appName: appName || "Zapier",
    title,
    type,
    kind: process.kind,
    summary: process.summary,
    details: process.details,
    webhookPaths: process.webhookHandoffs.map((handoff) => handoff.path),
    email: process.email,
    webhookHandoffs: process.webhookHandoffs,
  };
}

function buildZapierProcessSummary(title: string, steps: ZapierStepSummary[]): ZapierProcessSummary {
  const trigger = steps[0]?.summary ?? `Zapier start "${title}".`;
  const emails = steps
    .filter((step) => step.email?.subject)
    .map((step) => ({
      subject: step.email?.subject ?? "",
      recipients: step.email?.recipients ?? [],
    }));
  const webhookHandoffs = steps.flatMap((step) => step.webhookHandoffs ?? []);
  const conditions = steps.filter((step) => step.kind === "condition").map((step) => step.summary);
  const dataLookups = steps.filter((step) => step.kind === "lookup").map((step) => step.summary);

  return {
    trigger,
    outcome: buildZapierOutcome(emails, webhookHandoffs, steps),
    conditions,
    emails,
    webhookHandoffs,
    dataLookups,
    steps,
  };
}

function buildZapierOutcome(
  emails: Array<{ subject: string; recipients: string[] }>,
  webhookHandoffs: ZapierWebhookHandoff[],
  steps: ZapierStepSummary[],
): string {
  if (webhookHandoffs.length > 0) {
    const first = webhookHandoffs[0];
    return `Zapier geeft gegevens door aan de backend via ${first.path}.`;
  }

  if (emails.length > 0) {
    return emails.length === 1
      ? `Zapier stuurt daarna een Outlook-mail: "${emails[0].subject}".`
      : `Zapier stuurt ${emails.length} Outlook-mails, afhankelijk van de voorwaarden in de Zap.`;
  }

  const last = steps.at(-1);
  return last
    ? `Zapier eindigt met: ${last.summary}`
    : "Zapier heeft geen uitgewerkte stappen meegestuurd in de export.";
}

function buildZapierGoal(title: string, process: ZapierProcessSummary): string {
  if (process.webhookHandoffs.length > 0 && /trustoo/i.test(`${title} ${process.trigger}`)) {
    return [
      `Deze Zap verwerkt een Trustoo-lead en geeft die door aan de Brand backend.`,
      `${process.outcome} De Zap wordt read-only uitgelezen; het portaal past niets in Zapier aan.`,
      "Technisch loopt dit via Webhooks by Zapier.",
    ].join(" ");
  }

  if (process.emails.length > 0) {
    return [
      `${process.trigger} Zapier stuurt daarna een Outlook-mail; bij meerdere voorwaarden kiest Zapier de passende mailvariant.`,
      process.outcome,
      "Zo blijft klantopvolging vanuit HubSpot en Outlook zichtbaar zonder dat het portaal iets in Zapier wijzigt.",
    ].join(" ");
  }

  return [
    process.trigger,
    process.outcome,
    "Deze Zap wordt alleen uitgelezen; het portaal past niets in Zapier aan.",
  ].join(" ");
}

function buildZapierTriggerDescription(
  trigger: ZapierStepSummary | undefined,
  process: ZapierProcessSummary,
): string {
  if (!trigger) return "Zapier trigger niet meegeleverd door de export";
  if (trigger.appName === "Trustoo") return "Zapier trigger: nieuwe lead vanuit Trustoo";
  if (trigger.appName === "HubSpot" && trigger.kind === "trigger") {
    return `Zapier trigger: HubSpot-dealfase activeert deze Zap. ${process.trigger}`;
  }
  return `Zapier trigger: ${trigger.summary}`;
}

function buildStepProcessSummary(
  record: Record<string, unknown>,
  index: number,
  appName: string,
  title: string,
  action: string,
  type: string,
): Pick<ZapierStepSummary, "kind" | "summary" | "details" | "email" | "webhookHandoffs"> {
  const params = asRecord(record.params) || {};
  const normalizedApp = appName.toLowerCase();
  const normalizedAction = action.toLowerCase();
  const normalizedType = type.toLowerCase();

  if (normalizedApp === "trustoo" && normalizedAction === "lead") {
    return {
      kind: "trigger",
      summary: "Ontvangt een nieuwe lead vanuit Trustoo.",
      details: ["Bron: Trustoo leadtrigger in Zapier."],
      webhookHandoffs: [],
    };
  }

  if (normalizedApp === "hubspot" && normalizedAction === "updated_deal_stage") {
    const pipeline = readString(params, ["pipeline"]);
    const dealstage = readString(params, ["dealstage"]);
    const triggerTitle = readString(record, ["title", "name", "label"]) || title;
    return {
      kind: "trigger",
      summary: `Start wanneer een HubSpot-deal deze Zap activeert: ${triggerTitle}.`,
      details: [
        pipeline ? `Pipeline-id: ${pipeline}.` : "",
        dealstage ? `Dealfase-id: ${dealstage}.` : "",
      ].filter(Boolean),
      webhookHandoffs: [],
    };
  }

  if (normalizedApp === "hubspot" && normalizedAction === "find_associations") {
    const fromObject = objectLabel(readString(params, ["fromObjectType"]));
    const toObject = objectLabel(readString(params, ["toObjectType0"]));
    return {
      kind: "lookup",
      summary: `Zoekt het gekoppelde ${toObject || "record"} bij de HubSpot-${fromObject || "record"}.`,
      details: ["Zapier gebruikt deze koppeling om de juiste klant- of contactcontext op te halen."],
      webhookHandoffs: [],
    };
  }

  if (normalizedApp === "hubspot" && normalizedAction === "get_contact_by_id") {
    const properties = readZapierPropertyLabels(record, "properties_to_retrieve");
    return {
      kind: "lookup",
      summary: properties.length
        ? `Haalt contactgegevens op: ${properties.join(", ")}.`
        : "Haalt contactgegevens op uit HubSpot.",
      details: properties,
      webhookHandoffs: [],
    };
  }

  if (normalizedApp === "zapier" && normalizedAction === "branch") {
    return {
      kind: "branch",
      summary: "Splitst de Zap in meerdere paden.",
      details: ["Zapier kiest daarna per pad welke vervolgstap uitgevoerd wordt."],
      webhookHandoffs: [],
    };
  }

  if ((normalizedApp === "zapier" || normalizedType.includes("filter")) && normalizedAction === "filter") {
    const pathName = title || `Pad ${index + 1}`;
    const condition = summarizeFilterCondition(params);
    return {
      kind: "condition",
      summary: `Gaat door via pad "${pathName}" wanneer ${condition}.`,
      details: [condition],
      webhookHandoffs: [],
    };
  }

  if (normalizedApp === "outlook" && normalizedAction === "send_email") {
    const subject = readString(params, ["subject"]) || "zonder onderwerp";
    const recipients = readStringArray(readValue(params, ["recipients"]));
    return {
      kind: "email",
      summary: `Stuurt Outlook-mail "${subject}".`,
      details: [
        recipients.length > 0 ? `Ontvanger(s): ${recipients.join(", ")}.` : "",
        readString(params, ["sender"]) ? `Afzender: ${readString(params, ["sender"])}.` : "",
      ].filter(Boolean),
      email: { subject, recipients },
      webhookHandoffs: [],
    };
  }

  if (normalizedApp === "webhooks by zapier" && (normalizedAction === "post" || readString(params, ["url", "webhook_url", "webhookUrl"]))) {
    const webhookHandoffs = extractWebhookHandoffs(record);
    const first = webhookHandoffs[0];
    return {
      kind: "webhook",
      summary: first
        ? `Geeft gegevens door aan de backend via ${first.path}.`
        : "Geeft gegevens door via een webhook.",
      details: first?.host ? [`Doelsysteem: ${first.host}.`] : [],
      webhookHandoffs,
    };
  }

  if (normalizedApp.includes("formatter")) {
    const transform = readZapierParamMapLabel(record, "transform") || readString(params, ["transform"]);
    return {
      kind: "formatter",
      summary: transform ? `Bewerkt tekst of datum met Formatter: ${transform}.` : "Bewerkt tekst of datum met Formatter.",
      details: transform ? [transform] : [],
      webhookHandoffs: [],
    };
  }

  if (normalizedApp === "zapier" && normalizedAction.includes("delay")) {
    return {
      kind: "delay",
      summary: "Wacht tot het geplande moment voordat de Zap doorgaat.",
      details: [],
      webhookHandoffs: [],
    };
  }

  return {
    kind: "action",
    summary: `Voert "${title}" uit in ${appName}.`,
    details: [],
    webhookHandoffs: [],
  };
}

function normalizeZapierExportZaps(exportBody: unknown): unknown[] {
  const record = asRecord(exportBody);
  return Array.isArray(record?.zaps) ? record.zaps : [];
}

function readZapierPropertyLabels(record: Record<string, unknown>, key: string): string[] {
  const mapped = readZapierParamMapList(record, key);
  if (mapped.length > 0) return mapped;

  const params = asRecord(record.params) || {};
  return readStringArray(readValue(params, [key]));
}

function readZapierParamMapLabel(record: Record<string, unknown>, key: string): string {
  return readZapierParamMapList(record, key)[0] ?? "";
}

function readZapierParamMapList(record: Record<string, unknown>, key: string): string[] {
  const meta = asRecord(record.meta);
  const parammap = asRecord(meta?.parammap);
  return readStringArray(readValue(parammap ?? {}, [key]));
}

function summarizeFilterCondition(params: Record<string, unknown>): string {
  const criteria = readValue(params, ["filter_criteria"]);
  const first = Array.isArray(criteria) ? asRecord(criteria[0]) : null;
  if (!first) return "de ingestelde voorwaarde klopt";

  const key = humanizeZapierField(readString(first, ["key"]));
  const value = readString(first, ["value"]);
  const match = readString(first, ["match"]);
  const operator = match === "iexact" ? "gelijk is aan" : match ? `${match} is` : "is";
  return [key || "de waarde", operator, value || "de ingestelde waarde"].join(" ");
}

function humanizeZapierField(value: string): string {
  const bracketMatch = value.match(/\["([^"]+)"\]\}?$/);
  const field = bracketMatch?.[1] || value.split("__").at(-1) || value;
  return field
    .replace(/^.*\["([^"]+)"\].*$/, "$1")
    .replace(/_/g, " ")
    .trim();
}

function objectLabel(value: string): string {
  const labels: Record<string, string> = {
    deal: "deal",
    contact: "contact",
    company: "bedrijf",
  };
  return labels[value.toLowerCase()] ?? value;
}

function extractWebhookHandoffs(record: Record<string, unknown>): ZapierWebhookHandoff[] {
  const params = asRecord(record.params) || {};
  const rawUrl = readString(params, ["url", "webhook_url", "webhookUrl"]);
  if (!rawUrl) return [];

  try {
    const parsed = new URL(rawUrl.trim());
    return [{
      method: "POST",
      path: normalizePath(parsed.pathname) ?? parsed.pathname,
      host: parsed.host,
    }];
  } catch {
    const path = normalizePath(rawUrl.trim());
    return path ? [{ method: "POST", path }] : [];
  }
}

function readZapSteps(record: Record<string, unknown>): unknown[] {
  const direct = readValue(record, ["steps", "actions"]);
  if (Array.isArray(direct)) return direct;

  const nested = asRecord(record.steps);
  if (nested) {
    const candidates = [nested.results, nested.data, nested.items];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }
  }

  const nodes = asRecord(record.nodes);
  if (nodes) return sortZapierNodes(Object.values(nodes));

  return [];
}

function readZapStatus(record: Record<string, unknown>): ZapierAutomationStatus {
  const enabled = readValue(record, ["is_enabled", "isEnabled", "enabled"]);
  if (enabled === false) return "Uitgeschakeld";
  if (enabled === true) return "Actief";

  const status = (readString(record, ["status", "state"]) || "").toLowerCase();
  if (["disabled", "off", "inactive", "paused", "draft"].includes(status)) return "Uitgeschakeld";
  return "Actief";
}

function readAppName(record: Record<string, unknown>): string {
  const selectedApi = readString(record, ["selected_api", "selectedApi"]);
  const selectedApiName = readAppDisplayName(selectedApi);
  if (selectedApiName) return selectedApiName;

  const app = asRecord(record.app) || asRecord(record.application);
  if (app) {
    const appName = readString(app, ["name", "title", "display_name", "displayName"]);
    if (appName) return appName;
  }

  const directApp = readValue(record, ["app", "application"]);
  if (typeof directApp === "string") return directApp;

  return readString(record, ["app_name", "appName", "service", "provider"]) || "";
}

function readAppDisplayName(value: string): string {
  const appDisplayNames: Array<[RegExp, string]> = [
    [/HubSpotCLIAPI/i, "HubSpot"],
    [/TypeformCLIAPI/i, "Typeform"],
    [/MicrosoftOutlookCLIAPI/i, "Outlook"],
    [/WebHookCLIAPI/i, "Webhooks by Zapier"],
    [/BranchingAPI/i, "Zapier"],
    [/FilterAPI/i, "Zapier"],
    [/DelayCLIAPI/i, "Zapier"],
    [/CodeCLIAPI/i, "Code by Zapier"],
    [/ZapierFormatterCLIAPI/i, "Formatter by Zapier"],
    [/ZapierLoopingCLIAPI/i, "Looping by Zapier"],
    [/AICLIAPI/i, "AI by Zapier"],
    [/FacebookLeadsCLIAPI/i, "Facebook Lead Ads"],
    [/GoogleAdsCLIAPI/i, "Google Ads"],
    [/FirefliesCLIAPI/i, "Fireflies"],
    [/App187957CLIAPI/i, "Trustoo"],
  ];

  for (const [pattern, appName] of appDisplayNames) {
    if (pattern.test(value)) return appName;
  }

  return "";
}

function toUserFacingStepTitle(title: string, appName: string, action: string, type: string): string {
  const normalizedAction = action.toLowerCase();
  const normalizedType = type.toLowerCase();
  const normalizedApp = appName.toLowerCase();

  if (normalizedApp === "webhooks by zapier" && normalizedAction === "post") {
    return "Geeft gegevens door via webhook";
  }

  if (normalizedApp === "hubspot" && normalizedAction === "updated_deal_stage") {
    return "Start bij wijziging van HubSpot-dealfase";
  }

  if (normalizedApp === "outlook" && normalizedAction === "send_email") {
    return "Verstuurt of maakt een e-mail";
  }

  if (normalizedType.includes("branch") || normalizedAction.includes("branch")) {
    return stripTechnicalZapierTerms(title) || "Controleert een voorwaarde";
  }

  if (normalizedType.includes("filter") || normalizedAction.includes("filter")) {
    return stripTechnicalZapierTerms(title) || "Controleert een voorwaarde";
  }

  return stripTechnicalZapierTerms(title) || "Zapier stap";
}

function stripTechnicalZapierTerms(title: string): string {
  return title
    .replace(/\bPOST\b/gi, "Geeft gegevens door")
    .replace(/\bCLIAPI@\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sortZapierNodes(nodes: unknown[]): unknown[] {
  const records = nodes.filter((node): node is Record<string, unknown> => Boolean(asRecord(node)));
  const byId = new Map(records.map((node) => [String(readValue(node, ["id"]) ?? ""), node]));
  const children = new Map<string, Record<string, unknown>[]>();
  const roots: Record<string, unknown>[] = [];

  for (const node of records) {
    const parentId = readValue(node, ["parent_id", "parentId"]);
    const parentKey = parentId == null ? "" : String(parentId);
    if (!parentKey || !byId.has(parentKey)) {
      roots.push(node);
      continue;
    }

    const siblings = children.get(parentKey) || [];
    siblings.push(node);
    children.set(parentKey, siblings);
  }

  const sortedRoots = roots.sort(compareZapierNodes);
  const result: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  const visit = (node: Record<string, unknown>) => {
    const id = String(readValue(node, ["id"]) ?? "");
    if (seen.has(id)) return;
    seen.add(id);
    result.push(node);

    for (const child of (children.get(id) || []).sort(compareZapierNodes)) {
      visit(child);
    }
  };

  for (const root of sortedRoots) visit(root);
  for (const node of records.sort(compareZapierNodes)) visit(node);

  return result;
}

function compareZapierNodes(left: Record<string, unknown>, right: Record<string, unknown>): number {
  const leftRoot = String(readValue(left, ["root_id", "rootId"]) ?? "");
  const rightRoot = String(readValue(right, ["root_id", "rootId"]) ?? "");
  const rootComparison = leftRoot.localeCompare(rightRoot, undefined, { numeric: true });
  if (rootComparison !== 0) return rootComparison;

  return String(readValue(left, ["id"]) ?? "").localeCompare(
    String(readValue(right, ["id"]) ?? ""),
    undefined,
    { numeric: true },
  );
}

function isSensitiveZapierKey(key: string): boolean {
  return /^(x-api-key|authorization|token|secret|password|auth|api_key|apikey|private_key|privatekey|cookie|session|access_token|refresh_token|client_secret)$/i.test(key);
}

function extractWebhookPaths(value: unknown, depth = 0): string[] {
  if (depth > 6 || value == null) return [];

  if (typeof value === "string") {
    const paths: string[] = [];
    const urlMatches = value.match(/https?:\/\/[^\s"'<>]+/g) || [];
    for (const match of urlMatches) {
      try {
        const parsed = new URL(match);
        paths.push(parsed.pathname);
      } catch {
        // Ignore malformed URL fragments from third-party payloads.
      }
    }

    const pathMatches = value.match(/\/[A-Za-z0-9_.~:/?#[\]@!$&'()*+,;=%-]+/g) || [];
    for (const match of pathMatches) {
      const normalized = normalizePath(match);
      if (normalized) paths.push(normalized);
    }

    return unique(paths);
  }

  if (Array.isArray(value)) {
    return unique(value.flatMap((item) => extractWebhookPaths(item, depth + 1)));
  }

  const record = asRecord(value);
  if (!record) return [];

  return unique(Object.values(record).flatMap((item) => extractWebhookPaths(item, depth + 1)));
}

function normalizePath(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  const [withoutQuery] = path.split(/[?#]/);
  if (!withoutQuery || withoutQuery === "/") return null;
  if ((withoutQuery.match(/\//g) || []).length < 2) return null;
  return withoutQuery;
}

function readString(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return "";
  const value = readValue(record, keys);
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function readValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record && record[key] != null) return record[key];
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}
