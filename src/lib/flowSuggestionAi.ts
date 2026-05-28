export type FlowSuggestionAiSeverity = "info" | "warning" | "critical";

export interface FlowSuggestionAiSuggestion {
  label: string;
  description: string;
  severity: FlowSuggestionAiSeverity;
  tag: "AI-voorstel" | "Niet bewezen" | "Review nodig";
}

export interface FlowSuggestionAiResult {
  title: string;
  summary: string;
  businessObject: string;
  processSteps: string[];
  changeSummary: string[];
  reviewNotes: string[];
  aiSuggestions: FlowSuggestionAiSuggestion[];
  openQuestions: string[];
  ignoredFields: string[];
}

export type FlowSuggestionAiParseResult =
  | { ok: true; value: FlowSuggestionAiResult }
  | { ok: false; error: string };

const PROOF_SENSITIVE_FIELDS = [
  "confirmedTransitions",
  "approvalStatus",
  "webhookEvidence",
  "sourceAutomationId",
  "targetAutomationId",
] as const;

const SECRET_KEY_PATTERN = /(token|secret|password|authorization|api[_-]?key|private[_-]?app)/i;

export function parseFlowSuggestionAiResult(raw: string): FlowSuggestionAiParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Plak eerst de JSON-output van de AI." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Plak geldige JSON uit de AI-output." };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "De AI-output moet een JSON-object zijn." };
  }

  const ignoredFields = PROOF_SENSITIVE_FIELDS.filter((field) => field in parsed);

  return {
    ok: true,
    value: {
      title: stringValue(parsed.title),
      summary: stringValue(parsed.summary),
      businessObject: stringValue(parsed.businessObject),
      processSteps: stringArray(parsed.processSteps),
      changeSummary: stringArray(parsed.changeSummary),
      reviewNotes: stringArray(parsed.reviewNotes),
      aiSuggestions: suggestionArray(parsed.aiSuggestions),
      openQuestions: stringArray(parsed.openQuestions),
      ignoredFields,
    },
  };
}

export function buildAcceptedFlowDescriptionFromAiResult(
  result: FlowSuggestionAiResult,
): string {
  return [
    result.summary,
    result.businessObject ? `Businessobject: ${result.businessObject}` : "",
    formatSection("Processtappen", result.processSteps),
    formatSection("Wat verandert er", result.changeSummary),
    formatSection("Reviewnotities", result.reviewNotes),
    formatSection(
      "AI-voorstellen, niet bewezen",
      result.aiSuggestions.map(
        (suggestion) => `${suggestion.label}: ${suggestion.description}`,
      ),
    ),
    formatSection("Open vragen", result.openQuestions),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function sanitizeForPrompt(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForPrompt(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeForPrompt(entry),
    ]),
  );
}

function formatSection(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function suggestionArray(value: unknown): FlowSuggestionAiSuggestion[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isRecord(item)) return null;

      return {
        label: stringValue(item.label),
        description: stringValue(item.description),
        severity: severityValue(item.severity),
        tag: tagValue(item.tag),
      };
    })
    .filter((item): item is FlowSuggestionAiSuggestion =>
      Boolean(item?.label || item?.description),
    );
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(stringValue).filter(Boolean);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function severityValue(value: unknown): FlowSuggestionAiSeverity {
  if (value === "critical" || value === "warning" || value === "info") {
    return value;
  }

  return "warning";
}

function tagValue(value: unknown): FlowSuggestionAiSuggestion["tag"] {
  if (value === "Niet bewezen" || value === "Review nodig" || value === "AI-voorstel") {
    return value;
  }

  return "AI-voorstel";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
