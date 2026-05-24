export type TypeformAutomationStatus = "Actief" | "Uitgeschakeld";

export interface TypeformFieldSummary {
  id: string;
  ref?: string;
  title: string;
  type: string;
  choices?: string[];
}

export interface TypeformWebhookSummary {
  tag: string;
  enabled: boolean;
  eventTypes: string[];
  path?: string;
  host?: string;
}

export interface TypeformWebhookHandoff {
  method: "POST";
  path: string;
  host?: string;
}

export interface TypeformProcessStep {
  index: number;
  kind: "form_submission" | "webhook" | "form_structure";
  title: string;
  summary: string;
  details: string[];
  webhookPaths: string[];
}

export interface TypeformProcessSummary {
  trigger: string;
  outcome: string;
  webhookHandoffs: TypeformWebhookHandoff[];
  steps: TypeformProcessStep[];
}

export interface TypeformAutomationPayload {
  naam: string;
  categorie: "Typeform";
  doel: string;
  trigger_beschrijving: string;
  systemen: string[];
  stappen: string[];
  afhankelijkheden: string;
  owner: string;
  status: TypeformAutomationStatus;
  verbeterideeen: string;
  mermaid_diagram: string;
  fasen: string[];
  external_id: string;
  source: "typeform";
  last_synced_at: string;
  webhook_paths: string[];
  import_proposal: {
    source: "typeform";
    read_only: true;
    webhookPaths: string[];
    typeform: {
      form: {
        id: string;
        title: string;
        display_url?: string;
        hidden_fields: string[];
        fields: TypeformFieldSummary[];
      };
      webhooks: TypeformWebhookSummary[];
      process: TypeformProcessSummary;
    };
    summary: string[];
  };
}

export interface TypeformMappingInput {
  form: unknown;
  detail?: unknown;
  webhooks?: unknown[];
}

export function typeformReadOnlyHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export function normalizeTypeformWebhookUrl(value: unknown): { host?: string; path?: string } {
  if (typeof value !== "string" || !value.trim()) return {};
  const raw = value.trim();

  try {
    const parsed = new URL(raw);
    return {
      host: parsed.host,
      path: normalizePath(parsed.pathname),
    };
  } catch {
    const path = normalizePath(raw);
    return path ? { path } : {};
  }
}

export function mapTypeformFormToAutomationPayload(
  input: TypeformMappingInput,
  now: string,
): TypeformAutomationPayload {
  const form = asRecord(input.form) ?? {};
  const detail = asRecord(input.detail) ?? form;
  const externalId = readString(detail, ["id"]) || readString(form, ["id"]) || "unknown-typeform";
  const title = readString(detail, ["title"]) || readString(form, ["title"]) || `Typeform formulier ${externalId}`;
  const fields = readTypeformFields(detail);
  const hiddenFields = readStringArray(readValue(detail, ["hidden", "hidden_fields"]));
  const webhooks = (input.webhooks ?? []).map(summarizeWebhook);
  const activeHandoffs = webhooks
    .filter((webhook) => webhook.enabled && webhook.path)
    .map((webhook) => ({
      method: "POST" as const,
      path: webhook.path!,
      host: webhook.host,
    }));
  const webhookPaths = unique(activeHandoffs.map((handoff) => handoff.path));
  const process = buildTypeformProcessSummary(title, fields, hiddenFields, webhooks, activeHandoffs);
  const systemen = inferTypeformSystems(webhooks);

  return {
    naam: title,
    categorie: "Typeform",
    doel: buildTypeformGoal(title, fields, activeHandoffs),
    trigger_beschrijving: `Typeform formulier "${title}" wordt ingevuld.`,
    systemen,
    stappen: process.steps.map((step) => `${step.index}. ${step.summary}`),
    afhankelijkheden: "Typeform API read-only toegang met forms:read en webhooks:read",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaid_diagram: "",
    fasen: inferTypeformPhases(title, fields),
    external_id: externalId,
    source: "typeform",
    last_synced_at: now,
    webhook_paths: webhookPaths,
    import_proposal: {
      source: "typeform",
      read_only: true,
      webhookPaths,
      typeform: {
        form: {
          id: externalId,
          title,
          display_url: readDisplayUrl(form, detail),
          hidden_fields: hiddenFields,
          fields,
        },
        webhooks,
        process,
      },
      summary: [
        process.trigger,
        process.outcome,
        "Deze Typeform-koppeling wordt alleen uitgelezen; het portaal past niets in Typeform aan.",
      ],
    },
  };
}

function buildTypeformProcessSummary(
  title: string,
  fields: TypeformFieldSummary[],
  hiddenFields: string[],
  webhooks: TypeformWebhookSummary[],
  activeHandoffs: TypeformWebhookHandoff[],
): TypeformProcessSummary {
  const steps: TypeformProcessStep[] = [
    {
      index: 1,
      kind: "form_submission",
      title: "Formulier wordt ingevuld",
      summary: `Een klant vult het Typeform formulier "${title}" in.`,
      details: buildFormDetails(fields, hiddenFields),
      webhookPaths: [],
    },
  ];

  if (activeHandoffs.length > 0) {
    steps.push({
      index: 2,
      kind: "webhook",
      title: "Formulierinzending wordt doorgestuurd",
      summary: "Typeform geeft de formulierinzending door aan de volgende verwerking.",
      details: webhooks
        .filter((webhook) => webhook.enabled)
        .map((webhook) => webhook.tag ? `Webhook actief: ${webhook.tag}` : "Webhook actief"),
      webhookPaths: activeHandoffs.map((handoff) => handoff.path),
    });
  } else {
    steps.push({
      index: 2,
      kind: "form_structure",
      title: "Geen actieve webhook gevonden",
      summary: "Er is geen actieve Typeform-webhook gevonden die dit formulier automatisch doorstuurt.",
      details: ["Dit formulier wordt wel read-only zichtbaar gemaakt in het portaal."],
      webhookPaths: [],
    });
  }

  return {
    trigger: `Een klant vult het Typeform formulier "${title}" in.`,
    outcome: activeHandoffs.length > 0
      ? "Typeform geeft de formulierinzending door aan de volgende verwerking."
      : "Het portaal toont de formulierstructuur, maar er is geen bewezen automatische overdracht gevonden.",
    webhookHandoffs: activeHandoffs,
    steps,
  };
}

function buildTypeformGoal(
  title: string,
  fields: TypeformFieldSummary[],
  handoffs: TypeformWebhookHandoff[],
): string {
  const fieldSummary = fields.length > 0
    ? `Het formulier bevat ${fields.length} bekende ${fields.length === 1 ? "vraag" : "vragen"} waarmee Brand aanvullende klant- of dossierinformatie kan verzamelen.`
    : "De formulierstructuur wordt read-only zichtbaar gemaakt in het portaal.";
  const handoffSummary = handoffs.length > 0
    ? "Na invullen geeft Typeform de inzending door aan de volgende verwerking."
    : "Er is geen actieve automatische overdracht gevonden.";

  return [
    `Typeform formulier "${title}" verzamelt informatie voor een Brand-proces.`,
    fieldSummary,
    handoffSummary,
    "Deze Typeform-koppeling is read-only; het portaal past niets in Typeform aan.",
  ].join(" ");
}

function buildFormDetails(fields: TypeformFieldSummary[], hiddenFields: string[]): string[] {
  const details: string[] = [];
  if (fields.length > 0) {
    details.push(`Belangrijke velden: ${fields.slice(0, 5).map((field) => field.title).join(", ")}.`);
  }
  if (hiddenFields.length > 0) {
    details.push(`Hidden fields: ${hiddenFields.join(", ")}.`);
  }
  return details;
}

function summarizeWebhook(value: unknown): TypeformWebhookSummary {
  const record = asRecord(value) ?? {};
  const normalized = normalizeTypeformWebhookUrl(readString(record, ["url"]));
  return {
    tag: readString(record, ["tag", "id"]) || "Typeform webhook",
    enabled: readValue(record, ["enabled"]) !== false,
    eventTypes: readEventTypes(asRecord(record.event_types) ?? asRecord(record.eventTypes)),
    path: normalized.path,
    host: normalized.host,
  };
}

function readEventTypes(record: Record<string, unknown> | null): string[] {
  if (!record) return [];
  return Object.entries(record)
    .filter(([, enabled]) => enabled === true)
    .map(([eventType]) => eventType);
}

function readTypeformFields(detail: Record<string, unknown>): TypeformFieldSummary[] {
  const rawFields = readValue(detail, ["fields"]);
  if (!Array.isArray(rawFields)) return [];

  return rawFields
    .map((field) => {
      const record = asRecord(field) ?? {};
      const id = readString(record, ["id"]);
      const title = readString(record, ["title"]);
      const type = readString(record, ["type"]);
      if (!id && !title) return null;
      const choices = readFieldChoices(record);
      return {
        id: id || title,
        ref: readString(record, ["ref"]) || undefined,
        title: title || id || "Typeform veld",
        type: type || "field",
        ...(choices.length > 0 ? { choices } : {}),
      };
    })
    .filter((field): field is TypeformFieldSummary => field !== null);
}

function readFieldChoices(record: Record<string, unknown>): string[] {
  const properties = asRecord(record.properties);
  const rawChoices = readValue(properties, ["choices"]) ?? readValue(record, ["choices"]);
  if (!Array.isArray(rawChoices)) return [];

  return rawChoices
    .map((choice) => {
      const choiceRecord = asRecord(choice);
      if (!choiceRecord) return typeof choice === "string" ? choice.trim() : "";
      return readString(choiceRecord, ["label", "title", "value", "ref", "id"]);
    })
    .filter(Boolean);
}

function inferTypeformSystems(webhooks: TypeformWebhookSummary[]): string[] {
  const systems = ["Typeform"];
  if (webhooks.some((webhook) => webhook.enabled && webhook.path)) systems.push("Backend");

  const text = webhooks.map((webhook) => `${webhook.host ?? ""} ${webhook.path ?? ""}`).join(" ").toLowerCase();
  if (text.includes("hubspot")) systems.push("HubSpot");
  if (text.includes("sharepoint")) systems.push("SharePoint");
  if (text.includes("zapier")) systems.push("Zapier");

  return unique(systems);
}

function inferTypeformPhases(title: string, fields: TypeformFieldSummary[]): string[] {
  const text = `${title} ${fields.map((field) => `${field.title} ${field.ref ?? ""}`).join(" ")}`.toLowerCase();
  if (text.includes("onboarding")) return ["Onboarding"];
  if (text.includes("lead") || text.includes("sales")) return ["Sales"];
  if (text.includes("ib") || text.includes("btw") || text.includes("jaarrekening")) return ["Boekhouding"];
  return [];
}

function readDisplayUrl(...records: Array<Record<string, unknown>>): string | undefined {
  for (const record of records) {
    const links = asRecord(record._links);
    const display =
      readString(links, ["display"]) ||
      readString(record, ["display_url", "displayUrl", "url"]);
    if (display) return display;
  }
  return undefined;
}

function normalizePath(value: string): string {
  return value
    .split(/[?#]/)[0]
    .replace(/\/+$/, "")
    .trim();
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function readString(record: Record<string, unknown> | null | undefined, keys: string[]): string {
  const value = readValue(record, keys);
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function readValue(record: Record<string, unknown> | null | undefined, keys: string[]): unknown {
  if (!record) return undefined;
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
