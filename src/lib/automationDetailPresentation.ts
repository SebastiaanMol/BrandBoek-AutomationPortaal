import type { Automatisering } from "./types";
import type { BackendAutomationTrace } from "./backendAutomationTrace";

export interface AutomationDetailPresentation {
  summaryLines: string[];
  showGenericSummary: boolean;
  triggerText?: string;
  processSteps: string[];
  steps: string[];
  showSteps: boolean;
  metadata: Array<{ label: string; value: string }>;
  sourceDetailPlacement: "bottom";
}

const TECHNICAL_TEXT_PATTERN = /\b(GET|POST|PUT|PATCH|DELETE)\b|https?:\/\/|webhook\s*->|endpoint|handler|payload|(?:^|\s)\/[a-z0-9][^\s.,)]*/i;

export function getAutomationDetailPresentation(
  automation: Automatisering,
  backendTrace: BackendAutomationTrace | null,
): AutomationDetailPresentation {
  const source = automation.source?.toLowerCase();
  const isGitLabEndpoint = source === "gitlab" && Boolean(automation.gitlabEndpoint || automation.externalId?.includes("::"));

  if (source === "zapier") {
    return buildPresentation({
      summaryLines: buildZapierSummary(automation),
      triggerText: buildZapierTrigger(automation),
      processSteps: buildZapierProcessSteps(automation),
    });
  }

  if (source === "typeform") {
    return buildPresentation({
      summaryLines: buildTypeformSummary(automation),
      triggerText: buildTypeformTrigger(automation),
      processSteps: buildTypeformProcessSteps(automation),
    });
  }

  if (isGitLabEndpoint) {
    return buildPresentation({
      summaryLines: [
        buildGitLabSummary(automation, backendTrace),
      ],
      triggerText: sanitizePlainText(automation.importProposal?.standard?.trigger),
      processSteps: buildGitLabProcessSteps(automation, backendTrace),
    });
  }

  const summaryLines = selectSummaryLines(automation);
  return buildPresentation({
    summaryLines,
    triggerText: sanitizePlainText(automation.trigger),
    processSteps: buildDefaultProcessSteps(automation),
  });
}

export function containsTechnicalDetail(value: string | undefined | null): boolean {
  return TECHNICAL_TEXT_PATTERN.test(value ?? "");
}

export function getAutomationDetailDisplayName(automation: Automatisering): string {
  const source = automation.source?.toLowerCase();
  if (source !== "gitlab") return automation.naam;

  const cleaned = automation.naam
    .replace(/\s*\((GET|POST|PUT|PATCH|DELETE)\s+\/[^)]*\)\s*$/i, "")
    .replace(/\b(GET|POST|PUT|PATCH|DELETE)\s+\/\S+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+[-:]\s*$/g, "")
    .trim();

  return cleaned || automation.naam;
}

function selectSummaryLines(automation: Automatisering): string[] {
  const lines = automation.beschrijvingInSimpeleTaal?.length
    ? automation.beschrijvingInSimpeleTaal
    : automation.doel
      ? [automation.doel]
      : [];

  return lines
    .map((line) => sanitizePlainText(line))
    .filter(Boolean);
}

function buildPresentation({
  summaryLines,
  triggerText,
  processSteps,
}: {
  summaryLines: string[];
  triggerText?: string;
  processSteps: string[];
}): AutomationDetailPresentation {
  const safeSummaryLines = uniqueNonEmpty(summaryLines);
  const safeProcessSteps = uniqueNonEmpty(processSteps);
  const finalProcessSteps = safeProcessSteps.length > 0
    ? safeProcessSteps
    : ["De automation gebruikt de bekende context en verwerkt de stap volgens de beschikbare broninformatie."];
  return {
    summaryLines: safeSummaryLines.length > 0
      ? safeSummaryLines
      : ["Deze automation voert een afgebakende processtap uit en maakt die stap zichtbaar in het portaal."],
    showGenericSummary: true,
    triggerText,
    processSteps: finalProcessSteps,
    steps: finalProcessSteps,
    showSteps: true,
    metadata: [],
    sourceDetailPlacement: "bottom",
  };
}

function buildDefaultProcessSteps(automation: Automatisering): string[] {
  const source = automation.source?.toLowerCase();
  if (source === "hubspot") return buildHubSpotProcessSteps(automation);

  const explicitSteps = (automation.importProposal?.standard?.steps ?? [])
    .map((step) => sanitizePlainText(step.summary || step.title))
    .filter(Boolean);
  if (explicitSteps.length > 0) return explicitSteps;

  const steps = (automation.stappen ?? [])
    .map((step) => sanitizePlainText(step))
    .filter(Boolean);
  if (steps.length > 0) return steps;

  const trigger = sanitizePlainText(automation.trigger);
  return trigger
    ? [`De automation start wanneer ${lowercaseFirst(trigger)}.`]
    : [];
}

function buildHubSpotProcessSteps(automation: Automatisering): string[] {
  const steps: string[] = [];
  const trigger = sanitizePlainText(automation.trigger);
  if (automation.hubspotWorkflow?.triggers?.length || trigger) {
    steps.push(trigger || "HubSpot controleert de ingestelde startvoorwaarde.");
  }

  if (automation.hubspotWorkflow?.shouldReEnroll) {
    steps.push("Records kunnen opnieuw instromen wanneer de ingestelde HubSpot-voorwaarden opnieuw kloppen.");
  }

  const actions = automation.hubspotWorkflow?.actions ?? [];
  const hasWebhookAction = actions.some((action) => Boolean(action.webhookPath || action.webhookUrl || /webhook/i.test(action.type)));
  const hasOtherActions = actions.some((action) => !(action.webhookPath || action.webhookUrl || /webhook/i.test(action.type)));

  if (hasOtherActions) {
    steps.push("HubSpot voert de ingestelde workflowactie uit, zoals een eigenschap bijwerken of een record verderzetten.");
  }
  if (hasWebhookAction || automation.webhookPaths?.length) {
    steps.push("HubSpot stuurt het werk door naar een gekoppelde verwerking. De details van die overdracht staan bij Brondetails.");
  }

  if (steps.length > 0) return steps;
  return buildDefaultPlainSteps(automation);
}

function buildZapierSummary(automation: Automatisering): string[] {
  const process = automation.importProposal?.zap?.process;
  return [
    process?.outcome,
    automation.doel,
    process?.trigger,
  ]
    .map((line) => sanitizePlainText(line))
    .filter(Boolean)
    .slice(0, 2);
}

function buildZapierTrigger(automation: Automatisering): string | undefined {
  return sanitizePlainText(automation.importProposal?.zap?.process?.trigger)
    || sanitizePlainText(automation.trigger);
}

function buildZapierProcessSteps(automation: Automatisering): string[] {
  const process = automation.importProposal?.zap?.process;
  const steps = (process?.steps ?? [])
    .map((step) => sanitizePlainText(step.summary || step.title))
    .filter(Boolean);
  if (steps.length > 0) return steps;

  return buildDefaultPlainSteps(automation);
}

function buildTypeformSummary(automation: Automatisering): string[] {
  const typeform = automation.importProposal?.typeform;
  const formTitle = typeform?.form?.title ?? automation.naam;
  return [
    typeform?.process?.outcome,
    automation.doel,
    `Dit Typeform-formulier verzamelt formulierinformatie voor "${formTitle}" en wordt read-only in het portaal getoond.`,
  ]
    .map((line) => sanitizePlainText(line))
    .filter(Boolean)
    .slice(0, 2);
}

function buildTypeformTrigger(automation: Automatisering): string | undefined {
  return sanitizePlainText(automation.importProposal?.typeform?.process?.trigger)
    || sanitizePlainText(automation.trigger)
    || "Een Typeform-formulier wordt ingevuld.";
}

function buildTypeformProcessSteps(automation: Automatisering): string[] {
  const typeform = automation.importProposal?.typeform;
  const processSteps = (typeform?.process?.steps ?? [])
    .map((step) => sanitizePlainText(step.summary || step.title))
    .filter(Boolean);

  const form = typeform?.form;
  const fieldCount = form?.fields?.length ?? 0;
  const hiddenFieldCount = form?.hidden_fields?.length ?? 0;
  const hasActiveWebhook = (typeform?.webhooks ?? []).some((webhook) => webhook.enabled)
    || Boolean(typeform?.process?.webhookHandoffs?.length);

  const fallback = [
    "Een gebruiker vult het Typeform-formulier in.",
    fieldCount > 0
      ? `Het portaal toont de formulierstructuur met ${fieldCount} bekende ${fieldCount === 1 ? "vraag" : "vragen"}.`
      : "Het portaal toont de formulierstructuur zodra die uit Typeform beschikbaar is.",
    hiddenFieldCount > 0
      ? "Hidden fields worden als contextvelden getoond, zonder klantantwoorden te importeren."
      : null,
    hasActiveWebhook
      ? "Typeform stuurt de inzending door naar een gekoppelde verwerking. De details van die overdracht staan bij Brondetails."
      : "Er is geen bewezen automatische overdracht vanuit dit formulier gevonden.",
  ].filter((step): step is string => Boolean(step));

  return processSteps.length > 0 ? processSteps : fallback;
}

function buildGitLabProcessSteps(
  automation: Automatisering,
  backendTrace: BackendAutomationTrace | null,
): string[] {
  const standardSteps = (automation.importProposal?.standard?.steps ?? [])
    .map((step) => sanitizePlainText(step.summary || step.title))
    .filter(Boolean);
  if (standardSteps.length > 0) return standardSteps;

  const traceSteps = (backendTrace?.plainSteps ?? [])
    .filter((step) => !/backend automation wordt gestart|api-handler ontvangt|endpoint-call wordt afgerond/i.test(step.title))
    .map((step) => sanitizePlainText(step.description || step.title))
    .filter(Boolean)
    .slice(0, 5);

  if (traceSteps.length > 0) return traceSteps;

  return [
    "De backend ontvangt de processtap vanuit een gekoppeld systeem.",
    "De backend verwerkt de bekende context en voert de bijbehorende proceslogica uit.",
    "De brongegevens en het codebewijs staan bij Brondetails.",
  ];
}

function buildDefaultPlainSteps(automation: Automatisering): string[] {
  const explicitSteps = (automation.stappen ?? [])
    .map((step) => sanitizePlainText(step))
    .filter(Boolean);
  if (explicitSteps.length > 0) return explicitSteps;

  const trigger = sanitizePlainText(automation.trigger);
  const outcome = sanitizePlainText(automation.doel);
  return [trigger, outcome].filter(Boolean);
}

function sanitizePlainText(value: string | undefined | null): string {
  const text = (value ?? "").trim();
  if (!text) return "";

  if (/De automatisering start zodra .* een van deze waarden is ['"]?\d+['"]?/i.test(text)) {
    return "De automatisering start zodra de ingestelde HubSpot-voorwaarde geldt.";
  }

  const normalized = text
    .replace(/^Stap\s+\d+\s*:\s*/i, "")
    .replace(/^\d+\.\s*/, "")
    .trim();

  if (/webhook\s*->|https?:\/\/|\b(GET|POST|PUT|PATCH|DELETE)\b|(?:^|\s)\/[a-z0-9][^\s.,)]*/i.test(normalized)) {
    if (/webhook|https?:\/\/|\b(GET|POST|PUT|PATCH|DELETE)\b|(?:^|\s)\/[a-z0-9][^\s.,)]*/i.test(normalized)) {
      return "Het systeem stuurt het werk door naar een gekoppelde verwerking. De details van die overdracht staan bij Brondetails.";
    }
  }

  if (containsTechnicalDetail(normalized)) return "";
  return normalized;
}

function buildGitLabSummary(
  automation: Automatisering,
  backendTrace: BackendAutomationTrace | null,
): string {
  const standardOutcome = sanitizePlainText(automation.importProposal?.standard?.outcome);
  if (standardOutcome) return standardOutcome;

  const firstUsefulStep = backendTrace?.plainSteps.find((step) => (
    !containsTechnicalDetail(step.description) &&
    !/backend automation wordt gestart|api-handler ontvangt|endpoint-call wordt afgerond/i.test(step.title)
  ));
  if (firstUsefulStep) return firstUsefulStep.description;

  return "De backend verwerkt deze stap en gebruikt de bekende context uit de gekoppelde systemen. Brongegevens en codebewijs staan bij Brondetails.";
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value) return false;
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function lowercaseFirst(value: string): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}
