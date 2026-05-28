import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { Automatisering } from "./types";
import { STATUS_LABELS } from "./types";

export type TypeformMetricTone = "neutral" | "good" | "warning" | "danger";
export type TypeformDataflowRole = "visitor" | "form" | "routing" | "webhook" | "destination";
export type TypeformIssueSeverity = "critical" | "warning" | "info";

export interface TypeformDetailMetric {
  label: string;
  value: string;
  detail: string;
  tone: TypeformMetricTone;
}

export interface TypeformQuestionPresentation {
  index: number;
  title: string;
  typeLabel: string;
  subtitle: string;
  required: boolean;
  choices: string[];
  technicalDetail?: string;
}

export interface TypeformDataflowNode {
  name: string;
  subtitle: string;
  role: TypeformDataflowRole;
  arrowLabel?: string;
}

export interface TypeformRoutingPresentation {
  label: string;
  destination: string;
  detail: string;
}

export interface TypeformWebhookPresentation {
  label: string;
  status: "Actief" | "Uitgeschakeld";
  eventLabel: string;
  destination: string;
  detail: string;
}

export interface TypeformIssue {
  title: string;
  description: string;
  severity: TypeformIssueSeverity;
  tag: string;
}

export interface TypeformAutomationDetailPresentation {
  title: string;
  formId: string;
  statusLabel: string;
  statusTone: TypeformMetricTone;
  openInTypeformUrl: string | null;
  headerMeta: string[];
  metrics: TypeformDetailMetric[];
  summary: string;
  evidenceBadges: string[];
  dataflow: TypeformDataflowNode[];
  questions: TypeformQuestionPresentation[];
  hiddenFields: string[];
  routing: TypeformRoutingPresentation[];
  sourceMeta: Array<{ label: string; value: string }>;
  webhooks: TypeformWebhookPresentation[];
  issues: TypeformIssue[];
  rawData: unknown;
}

type TypeformFieldRecord = {
  id?: string;
  ref?: string;
  title?: string;
  type?: string;
  choices?: string[];
  required?: boolean;
  validations?: { required?: boolean };
  properties?: Record<string, unknown>;
};

export function isTypeformAutomation(automation: Automatisering): boolean {
  return automation.source?.toLowerCase() === "typeform" || automation.categorie === "Typeform";
}

export function getTypeformAutomationDetailPresentation(automation: Automatisering): TypeformAutomationDetailPresentation {
  const typeform = automation.importProposal?.typeform;
  const form = asRecord(typeform?.form);
  const rawForm = findRawForm(automation);
  const title = firstText(readString(form, "title"), readString(rawForm, "title"), automation.naam);
  const formId = firstText(readString(form, "id"), readString(rawForm, "id"), automation.externalId, automation.id);
  const displayUrl = firstUrl(
    readString(form, "display_url"),
    readString(form, "displayUrl"),
    readNestedString(rawForm, ["_links", "display"]),
    readString(rawForm, "display_url"),
    readString(rawForm, "displayUrl"),
  );
  const fields = readQuestionFields(form, rawForm);
  const hiddenFields = readHiddenFields(form, rawForm);
  const webhooks = buildWebhookPresentations(automation);
  const activeWebhookCount = webhooks.filter((webhook) => webhook.status === "Actief").length;
  const routing = buildRouting(rawForm);
  const requiredCount = fields.filter((field) => field.required).length;
  const statusLabel = buildStatusLabel(automation, rawForm);
  const statusTone = statusLabel === "Disabled" || statusLabel === "Niet publiek" ? "danger" : "good";
  const language = readNestedString(rawForm, ["settings", "language"]) || readString(form, "language");
  const updatedAt = firstText(
    readString(rawForm, "last_updated_at"),
    readString(rawForm, "updated_at"),
    automation.lastSyncedAt,
  );

  const evidenceBadges = [
    fields.length > 0 ? "Form fields" : null,
    hiddenFields.length > 0 ? "Hidden fields" : null,
    activeWebhookCount > 0 ? "Webhook" : null,
    routing.length > 0 ? "Routing" : null,
  ].filter((badge): badge is string => Boolean(badge));

  return {
    title,
    formId,
    statusLabel,
    statusTone,
    openInTypeformUrl: displayUrl,
    headerMeta: [
      "Typeform form",
      formId ? `Form ID ${formId}` : null,
      language ? `Taal ${language.toUpperCase()}` : null,
      `${fields.length} ${fields.length === 1 ? "veld" : "velden"}`,
      `${hiddenFields.length} hidden ${hiddenFields.length === 1 ? "field" : "fields"}`,
      updatedAt ? `Updated ${formatDate(updatedAt)}` : null,
    ].filter((item): item is string => Boolean(item)),
    metrics: [
      {
        label: "Formulierstatus",
        value: statusLabel,
        detail: displayUrl ? "Openbare Typeform-link beschikbaar" : "Geen Typeform-link opgeslagen",
        tone: statusTone,
      },
      {
        label: "Velden",
        value: String(fields.length),
        detail: requiredCount > 0 ? `${requiredCount} verplicht` : "Verplichte velden niet bekend",
        tone: fields.length > 0 ? "neutral" : "warning",
      },
      {
        label: "Hidden fields",
        value: String(hiddenFields.length),
        detail: hiddenFields.length > 0 ? "contextvelden reizen mee" : "geen hidden fields bekend",
        tone: hiddenFields.length > 0 ? "neutral" : "warning",
      },
      {
        label: "Webhook",
        value: activeWebhookCount > 0 ? "Actief" : "Geen actieve webhook",
        detail: activeWebhookCount > 0 ? `${activeWebhookCount} overdracht bewezen` : "geen automatische overdracht bewezen",
        tone: activeWebhookCount > 0 ? "good" : "warning",
      },
    ],
    summary: buildSummary(title, fields, hiddenFields, activeWebhookCount > 0),
    evidenceBadges,
    dataflow: buildDataflow(title, fields, routing, webhooks),
    questions: fields,
    hiddenFields,
    routing,
    sourceMeta: buildSourceMeta(automation, formId, rawForm, language),
    webhooks,
    issues: buildIssues(automation, fields, webhooks, displayUrl),
    rawData: {
      automationId: automation.id,
      source: automation.source,
      externalId: automation.externalId,
      webhookPaths: automation.webhookPaths ?? [],
      typeform,
      sourceFindings: automation.sourceFindings ?? [],
    },
  };
}

function buildStatusLabel(automation: Automatisering, rawForm: Record<string, unknown> | null): string {
  const isPublic = readNestedValue(rawForm, ["settings", "is_public"]);
  if (isPublic === false) return "Niet publiek";
  if (automation.status === "Uitgeschakeld") return "Disabled";
  return STATUS_LABELS[automation.status] ?? automation.status;
}

function buildSummary(
  title: string,
  fields: TypeformQuestionPresentation[],
  hiddenFields: string[],
  hasActiveWebhook: boolean,
): string {
  const fieldFocus = inferFieldFocus(fields);
  const choiceField = fields.find((field) => field.choices.length > 0);
  const parts = [
    `Dit formulier verzamelt ${fieldFocus} voor "${title}".`,
    choiceField
      ? `Het vraagt ook ${lowercaseFirst(stripTrailingPunctuation(choiceField.title))}, zodat duidelijk wordt welke vervolgstap nodig is.`
      : null,
    hiddenFields.length > 0
      ? `Verborgen contextvelden zoals ${hiddenFields.slice(0, 3).join(", ")} reizen mee zonder dat de bezoeker ze invult.`
      : null,
    hasActiveWebhook
      ? "Na verzenden stuurt Typeform de inzending door naar de gekoppelde verwerking."
      : "Er is geen actieve automatische overdracht vanuit dit formulier bewezen.",
  ].filter(Boolean);

  return parts.join(" ");
}

function inferFieldFocus(fields: TypeformQuestionPresentation[]): string {
  const text = fields.map((field) => `${field.title} ${field.typeLabel}`).join(" ").toLowerCase();
  if (/naam|e-?mail|telefoon|phone|contact/.test(text)) return "contactgegevens";
  if (/onboarding|administratie|boekhoud|jaar|btw|ib/.test(text)) return "formulierinformatie voor het klantproces";
  return "formulierinformatie";
}

function buildDataflow(
  title: string,
  fields: TypeformQuestionPresentation[],
  routing: TypeformRoutingPresentation[],
  webhooks: TypeformWebhookPresentation[],
): TypeformDataflowNode[] {
  const nodes: TypeformDataflowNode[] = [
    {
      name: "Bezoeker",
      subtitle: fields.length > 0 ? "Vult het formulier in" : "Start de formulierinzending",
      role: "visitor",
      arrowLabel: "vult in",
    },
    {
      name: title,
      subtitle: fields.length > 0 ? `${fields.length} ${fields.length === 1 ? "vraag" : "vragen"} uit Typeform` : "Formulierstructuur niet uitgelezen",
      role: "form",
      arrowLabel: routing.length > 0 ? "bepaalt route" : webhooks.some((webhook) => webhook.status === "Actief") ? "na verzenden" : undefined,
    },
  ];

  if (routing.length > 0) {
    nodes.push({
      name: "Keuze / routing",
      subtitle: `${routing.length} bekende ${routing.length === 1 ? "route" : "routes"} na verzenden`,
      role: "routing",
      arrowLabel: webhooks.some((webhook) => webhook.status === "Actief") ? "stuurt door" : undefined,
    });
  }

  if (webhooks.some((webhook) => webhook.status === "Actief")) {
    nodes.push({
      name: "Webhook",
      subtitle: "Formulierinzending wordt doorgestuurd",
      role: "webhook",
      arrowLabel: "naar",
    });
    nodes.push({
      name: inferDestinationName(webhooks),
      subtitle: webhooks[0]?.destination ?? "Gekoppelde verwerking",
      role: "destination",
    });
  }

  return nodes;
}

function inferDestinationName(webhooks: TypeformWebhookPresentation[]): string {
  const text = webhooks.map((webhook) => webhook.destination).join(" ").toLowerCase();
  if (text.includes("hubspot")) return "HubSpot verwerking";
  if (text.includes("zapier")) return "Zapier";
  return "Backend";
}

function buildWebhookPresentations(automation: Automatisering): TypeformWebhookPresentation[] {
  const webhooks = automation.importProposal?.typeform?.webhooks ?? [];
  return webhooks.map((webhook) => {
    const destination = [webhook.host, webhook.path].filter(Boolean).join("") || webhook.path || webhook.host || "Bestemming onbekend";
    const eventLabel = webhook.eventTypes?.length ? webhook.eventTypes.join(", ") : "form_response";
    return {
      label: webhook.tag || "Typeform webhook",
      status: webhook.enabled ? "Actief" : "Uitgeschakeld",
      eventLabel,
      destination,
      detail: webhook.enabled
        ? "Typeform stuurt nieuwe inzendingen naar deze bestemming."
        : "Deze webhook staat uit in de opgeslagen Typeform-data.",
    };
  });
}

function buildRouting(rawForm: Record<string, unknown> | null): TypeformRoutingPresentation[] {
  const screens = readArray(rawForm, "thankyou_screens");
  return screens
    .map((screen) => asRecord(screen))
    .filter((screen): screen is Record<string, unknown> => Boolean(screen))
    .map((screen) => {
      const title = readString(screen, "title") || "Thank-you scherm";
      const type = readString(screen, "type");
      const redirectUrl = readNestedString(screen, ["properties", "redirect_url"]);
      return {
        label: title,
        destination: redirectUrl ? "Redirect" : "Bedankt-scherm",
        detail: redirectUrl || (type === "url_redirect" ? "Redirect-url niet opgeslagen" : "Toont een bedanktscherm na verzenden"),
      };
    })
    .slice(0, 6);
}

function buildSourceMeta(
  automation: Automatisering,
  formId: string,
  rawForm: Record<string, unknown> | null,
  language: string,
): Array<{ label: string; value: string }> {
  return [
    { label: "Form ID", value: formId || "Onbekend" },
    { label: "Taal", value: language ? language.toUpperCase() : "Niet opgeslagen" },
    { label: "Type", value: readString(rawForm, "type") || "Niet opgeslagen" },
    { label: "Created", value: formatDateOrFallback(readString(rawForm, "created_at")) },
    { label: "Published", value: formatDateOrFallback(readString(rawForm, "published_at")) },
    { label: "Updated", value: formatDateOrFallback(readString(rawForm, "last_updated_at") || automation.lastSyncedAt) },
    { label: "Analytics", value: firstText(readNestedString(rawForm, ["settings", "google_analytics"]), "Niet opgeslagen") },
    { label: "Tag manager", value: firstText(readNestedString(rawForm, ["settings", "google_tag_manager"]), "Niet opgeslagen") },
  ];
}

function buildIssues(
  automation: Automatisering,
  fields: TypeformQuestionPresentation[],
  webhooks: TypeformWebhookPresentation[],
  displayUrl: string | null,
): TypeformIssue[] {
  const issues: TypeformIssue[] = [];

  if (fields.length === 0) {
    issues.push({
      title: "Geen formulieropbouw",
      description: "De opgeslagen Typeform-data bevat geen zichtbare velden.",
      severity: "warning",
      tag: "field gap",
    });
  }

  if (!webhooks.some((webhook) => webhook.status === "Actief")) {
    issues.push({
      title: "Geen actieve webhook",
      description: "Er is geen bewezen automatische overdracht na het invullen van dit formulier.",
      severity: "warning",
      tag: "handoff gap",
    });
  }

  if (!displayUrl) {
    issues.push({
      title: "Bronlink ontbreekt",
      description: "Er is geen betrouwbare Typeform display-link opgeslagen voor dit formulier.",
      severity: "info",
      tag: "source link",
    });
  }

  for (const finding of automation.sourceFindings ?? []) {
    if (finding.resolvedAt) continue;
    issues.push({
      title: finding.type === "source_missing" ? "Bron niet gevonden" : "Bronmelding",
      description: finding.message,
      severity: finding.severity === "critical" ? "critical" : finding.severity === "warning" ? "warning" : "info",
      tag: finding.type,
    });
  }

  if (issues.length === 0) {
    issues.push({
      title: "Geen gaps gevonden",
      description: "De opgeslagen Typeform-data bevat formulieropbouw en een actieve overdracht.",
      severity: "info",
      tag: "ok",
    });
  }

  return issues;
}

function readQuestionFields(
  form: Record<string, unknown> | null,
  rawForm: Record<string, unknown> | null,
): TypeformQuestionPresentation[] {
  const fields = readArray(form, "fields").length > 0 ? readArray(form, "fields") : readArray(rawForm, "fields");
  return fields
    .map((field, index) => toQuestion(field, index + 1))
    .filter((field): field is TypeformQuestionPresentation => Boolean(field));
}

function toQuestion(value: unknown, index: number): TypeformQuestionPresentation | null {
  const record = asRecord(value) as TypeformFieldRecord | null;
  if (!record) return null;
  const title = firstText(record.title, record.id, `Typeform veld ${index}`);
  const type = firstText(record.type, "field");
  const choices = readChoices(record);
  const required = record.required === true || record.validations?.required === true;
  const ref = firstText(record.ref, record.id);

  return {
    index,
    title,
    typeLabel: friendlyFieldType(type),
    subtitle: required ? "Verplicht veld" : "Optioneel of niet gespecificeerd",
    required,
    choices,
    technicalDetail: ref ? `ref: ${ref}` : undefined,
  };
}

function readChoices(record: TypeformFieldRecord): string[] {
  if (Array.isArray(record.choices)) return record.choices.map(String).filter(Boolean);
  const rawChoices = readArray(asRecord(record.properties), "choices");
  return rawChoices
    .map((choice) => {
      if (typeof choice === "string") return choice;
      const choiceRecord = asRecord(choice);
      return readString(choiceRecord, "label") || readString(choiceRecord, "title") || readString(choiceRecord, "value");
    })
    .filter(Boolean);
}

function readHiddenFields(form: Record<string, unknown> | null, rawForm: Record<string, unknown> | null): string[] {
  return unique([
    ...readStringArray(readValue(form, "hidden_fields")),
    ...readStringArray(readValue(form, "hidden")),
    ...readStringArray(readValue(rawForm, "hidden")),
    ...readStringArray(readValue(rawForm, "hidden_fields")),
  ]);
}

function findRawForm(automation: Automatisering): Record<string, unknown> | null {
  const proposal = automation.importProposal as Record<string, unknown> | undefined;
  const typeform = asRecord(proposal?.typeform);
  return asRecord(proposal?.typeform_api)?.form as Record<string, unknown> | null
    || asRecord(proposal?.typeformApi)?.form as Record<string, unknown> | null
    || asRecord(proposal?.typeform_raw)?.form as Record<string, unknown> | null
    || asRecord(typeform?.raw_form)
    || asRecord(typeform?.rawForm)
    || asRecord(typeform?.form);
}

function friendlyFieldType(type: string): string {
  const normalized = type.toLowerCase();
  if (normalized === "short_text") return "Korte tekst";
  if (normalized === "long_text") return "Lang antwoord";
  if (normalized === "email") return "E-mailadres";
  if (normalized === "phone_number") return "Telefoonnummer";
  if (normalized === "multiple_choice") return "Meerkeuze";
  if (normalized === "picture_choice") return "Beeldkeuze";
  if (normalized === "contact_info") return "Contactgegevens";
  if (normalized === "legal") return "Akkoord";
  if (normalized === "number") return "Nummer";
  return type.replace(/_/g, " ");
}

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = value?.trim();
    if (text) return text;
  }
  return "";
}

function firstUrl(...values: Array<string | null | undefined>): string | null {
  const value = firstText(...values);
  return /^https?:\/\//i.test(value) ? value : null;
}

function readNestedString(record: Record<string, unknown> | null, path: string[]): string {
  const value = readNestedValue(record, path);
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function readNestedValue(record: Record<string, unknown> | null, path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    const currentRecord = asRecord(current);
    if (!currentRecord) return undefined;
    current = currentRecord[key];
  }
  return current;
}

function readString(record: Record<string, unknown> | null | undefined, key: string): string {
  const value = readValue(record, key);
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function readValue(record: Record<string, unknown> | null | undefined, key: string): unknown {
  return record?.[key];
}

function readArray(record: Record<string, unknown> | null | undefined, key: string): unknown[] {
  const value = readValue(record, key);
  return Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "onbekend";
  return format(date, "d MMM yyyy", { locale: nl });
}

function formatDateOrFallback(value: string | null | undefined): string {
  return value ? formatDate(value) : "Niet opgeslagen";
}

function lowercaseFirst(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[?.!]\s*$/g, "");
}
