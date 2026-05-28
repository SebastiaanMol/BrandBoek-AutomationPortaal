import type {
  Automatisering,
  AutomationSourceFinding,
  AutomationSourceFindingType,
} from "./types";

export type AutomationSourceQualityStatus = "ready" | "incomplete" | "unknown";
export type AutomationSourceQualityCheckStatus = "pass" | "missing";

export interface AutomationSourceQualityMissingEvidence {
  key: string;
  label: string;
  description: string;
  severity: "warning";
  type: Extract<AutomationSourceFindingType, "source_data_incomplete">;
}

export interface AutomationSourceSpecificCheck {
  key: string;
  label: string;
  status: AutomationSourceQualityCheckStatus;
  detail: string;
}

export interface AutomationSourceQualityPresentation {
  qualityStatus: AutomationSourceQualityStatus;
  isProcessJourneyReady: boolean;
  blockingFindings: AutomationSourceFinding[];
  missingEvidence: AutomationSourceQualityMissingEvidence[];
  sourceSpecificChecks: AutomationSourceSpecificCheck[];
  summary: string;
}

interface SourceQualityCheckDefinition {
  key: string;
  label: string;
  description: string;
  passes: boolean;
  passDetail: string;
  missingDetail: string;
}

export function getAutomationSourceQualityPresentation(
  automation: Automatisering,
): AutomationSourceQualityPresentation {
  const source = getAutomationSource(automation);
  const sourceSpecificChecks = buildSourceSpecificChecks(automation);
  const missingEvidence = getAutomationSourceQualityFindings(automation);
  const blockingFindings = (automation.sourceFindings ?? []).filter((finding) =>
    !finding.resolvedAt && (finding.type === "source_missing" || finding.type === "source_data_incomplete")
  );

  if (!source) {
    return {
      qualityStatus: "unknown",
      isProcessJourneyReady: false,
      blockingFindings,
      missingEvidence,
      sourceSpecificChecks,
      summary: "Deze automation heeft geen bron waarmee procesreis-bewijs betrouwbaar kan worden opgebouwd.",
    };
  }

  const hasBlockingEvidence = missingEvidence.length > 0 || blockingFindings.length > 0;
  const qualityStatus: AutomationSourceQualityStatus = hasBlockingEvidence ? "incomplete" : "ready";

  return {
    qualityStatus,
    isProcessJourneyReady: qualityStatus === "ready",
    blockingFindings,
    missingEvidence,
    sourceSpecificChecks,
    summary: hasBlockingEvidence
      ? `Deze ${sourceLabel(source)} automation mist nog procesreis-kritieke brondata. Los dit op bij de bronsync of bronanalyse voordat hij als bewijs in een procesreis wordt gebruikt.`
      : `Deze ${sourceLabel(source)} automation heeft de minimale brondata die nodig is voor webhook-bewezen procesreisvorming.`,
  };
}

export function getAutomationSourceQualityFindings(
  automation: Automatisering,
): AutomationSourceQualityMissingEvidence[] {
  return buildSourceSpecificChecks(automation)
    .filter((check) => check.status === "missing")
    .map((check) => ({
      key: check.key,
      label: check.label,
      description: check.detail,
      severity: "warning" as const,
      type: "source_data_incomplete" as const,
    }));
}

function buildSourceSpecificChecks(automation: Automatisering): AutomationSourceSpecificCheck[] {
  const definitions = getSourceQualityCheckDefinitions(automation);
  return definitions.map((definition) => ({
    key: definition.key,
    label: definition.label,
    status: definition.passes ? "pass" : "missing",
    detail: definition.passes ? definition.passDetail : definition.missingDetail,
  }));
}

function getSourceQualityCheckDefinitions(automation: Automatisering): SourceQualityCheckDefinition[] {
  const source = getAutomationSource(automation);
  if (source === "hubspot") return getHubSpotChecks(automation);
  if (source === "zapier") return getZapierChecks(automation);
  if (source === "gitlab") return getGitLabChecks(automation);
  if (source === "typeform") return getTypeformChecks(automation);
  return [];
}

function getHubSpotChecks(automation: Automatisering): SourceQualityCheckDefinition[] {
  const workflow = getHubSpotWorkflowRecord(automation);
  const hasWorkflow = Boolean(workflow);
  const triggers = getHubSpotTriggers(automation, workflow);
  const actions = getHubSpotActions(automation, workflow);
  const expectsWebhook = actions.some((action) => isWebhookAction(action)) || hasStringArrayItems(automation.webhookPaths);
  const hasWebhookPath = getHubSpotWebhookPaths(actions).length > 0 || hasStringArrayItems(automation.webhookPaths);

  return [
    check("hubspot_workflow", "HubSpot workflowdata", hasWorkflow, "Workflowdata is aanwezig.", "HubSpot workflowdata ontbreekt."),
    check("hubspot_triggers", "HubSpot triggercriteria", triggers.length > 0, "Triggercriteria zijn bekend.", "Triggercriteria ontbreken in de HubSpot brondata."),
    check("hubspot_actions", "HubSpot acties", actions.length > 0, "Workflowacties zijn bekend.", "Workflowacties ontbreken in de HubSpot brondata."),
    ...(expectsWebhook
      ? [check("hubspot_webhook_path", "HubSpot webhookpad", hasWebhookPath, "Webhookpad is matchbaar.", "De workflow lijkt data over te dragen, maar het webhookpad is niet matchbaar.")]
      : []),
  ];
}

function getZapierChecks(automation: Automatisering): SourceQualityCheckDefinition[] {
  const zap = getRecord(automation.importProposal?.zap);
  const zapierExport = getRecord(automation.importProposal?.zapier_export);
  const process = getRecord(zap?.process);
  const steps = getZapierSteps(automation, zap, process, zapierExport);
  const expectsWebhook = hasStringArrayItems(automation.webhookPaths) || hasStringArrayItems(automation.importProposal?.webhookPaths);
  const hasExplicitWebhookHandoff = getZapierExplicitWebhookHandoffs(zap, process).length > 0;

  return [
    check("zapier_metadata", "Zapier metadata", Boolean(zap || zapierExport), "Zapier metadata is aanwezig.", "Zapier metadata ontbreekt."),
    check("zapier_steps", "Zapier step flow", steps.length > 0, "Zapier stappen zijn bekend.", "Zapier step flow ontbreekt."),
    ...(expectsWebhook
      ? [check("zapier_webhook_handoff", "Zapier webhook-overdracht", hasExplicitWebhookHandoff, "Webhook-overdracht is expliciet bekend.", "De Zap lijkt data over te dragen, maar de webhook-overdracht ontbreekt in de Zapier brondata.")]
      : []),
  ];
}

function getGitLabChecks(automation: Automatisering): SourceQualityCheckDefinition[] {
  const endpoint = getGitLabEndpointRecord(automation);
  const endpointValue = stringValue(endpoint?.endpoint) || stringValue(endpoint?.path) || firstString(automation.endpoints);
  const handler = stringValue(endpoint?.handler);
  const calls = [
    ...arrayValue(endpoint?.calls),
    ...arrayValue(automation.importProposal?.gitlab?.calls),
    ...arrayValue(automation.importProposal?.gitlab_endpoint?.calls),
  ];

  return [
    check("gitlab_endpoint", "GitLab endpoint", Boolean(endpointValue), "Receiver endpoint is bekend.", "GitLab endpoint ontbreekt of is niet matchbaar."),
    check("gitlab_handler", "GitLab handler", Boolean(handler), "Handler is bekend.", "GitLab handler ontbreekt."),
    check("gitlab_call_graph", "GitLab call graph", calls.length > 0, "Call graph is aanwezig.", "Call graph of read/write-bewijs ontbreekt."),
  ];
}

function getTypeformChecks(automation: Automatisering): SourceQualityCheckDefinition[] {
  const typeform = getTypeformRecord(automation);
  const form = getRecord(typeform?.form);
  const fields = arrayValue(form?.fields);
  const webhooks = arrayValue(typeform?.webhooks);
  const process = getRecord(typeform?.process);
  const hasActiveWebhook = webhooks.some((webhook) => getRecord(webhook)?.enabled === true)
    || arrayValue(process?.webhookHandoffs).length > 0
    || hasStringArrayItems(automation.webhookPaths);

  return [
    check("typeform_fields", "Typeform velden", fields.length > 0, "Formuliervelden zijn bekend.", "Typeform formuliervelden ontbreken."),
    check("typeform_active_webhook", "Actieve Typeform webhook", hasActiveWebhook, "Actieve webhook is bekend.", "Actieve Typeform webhook ontbreekt."),
  ];
}

function check(
  key: string,
  label: string,
  passes: boolean,
  passDetail: string,
  missingDetail: string,
): SourceQualityCheckDefinition {
  return {
    key,
    label,
    description: missingDetail,
    passes,
    passDetail,
    missingDetail,
  };
}

function getAutomationSource(automation: Automatisering): "hubspot" | "zapier" | "gitlab" | "typeform" | "" {
  const source = automation.source?.toLowerCase();
  if (source === "hubspot" || automation.categorie === "HubSpot Workflow") return "hubspot";
  if (source === "zapier" || automation.categorie === "Zapier Zap") return "zapier";
  if (source === "gitlab" || automation.gitlabEndpoint || automation.gitlabFilePath) return "gitlab";
  if (source === "typeform" || automation.categorie === "Typeform") return "typeform";
  return "";
}

function sourceLabel(source: string): string {
  if (source === "hubspot") return "HubSpot";
  if (source === "zapier") return "Zapier";
  if (source === "gitlab") return "GitLab";
  if (source === "typeform") return "Typeform";
  return "bron";
}

function getHubSpotWorkflowRecord(automation: Automatisering): Record<string, unknown> | null {
  if (automation.hubspotWorkflow) return automation.hubspotWorkflow as unknown as Record<string, unknown>;
  return getRecord(automation.importProposal?.hubspot_workflow);
}

function getHubSpotTriggers(automation: Automatisering, workflow: Record<string, unknown> | null): unknown[] {
  const directTriggers = arrayValue(automation.hubspotWorkflow?.triggers);
  if (directTriggers.length > 0) return directTriggers;
  return [
    ...arrayValue(workflow?.triggers),
    ...arrayValue(workflow?.criteria),
    ...arrayValue(workflow?.enrollmentCriteria),
  ];
}

function getHubSpotActions(automation: Automatisering, workflow: Record<string, unknown> | null): Array<Record<string, unknown>> {
  const directActions = arrayValue(automation.hubspotWorkflow?.actions);
  const rawActions = [
    ...directActions,
    ...arrayValue(workflow?.actions),
  ];
  return rawActions.map(getRecord).filter((item): item is Record<string, unknown> => Boolean(item));
}

function isWebhookAction(action: Record<string, unknown>): boolean {
  const type = `${action.type ?? action.actionType ?? action.action_type ?? ""}`.toLowerCase();
  return type.includes("webhook") || Boolean(action.webhookPath || action.webhookUrl || action.url);
}

function getHubSpotWebhookPaths(actions: Array<Record<string, unknown>>): string[] {
  return actions
    .flatMap((action) => [
      stringValue(action.webhookPath),
      stringValue(action.webhookUrl),
      stringValue(action.url),
    ])
    .filter(Boolean);
}

function getZapierSteps(
  automation: Automatisering,
  zap: Record<string, unknown> | null,
  process: Record<string, unknown> | null,
  zapierExport: Record<string, unknown> | null,
): unknown[] {
  const sanitizedNodes = getRecord(zapierExport?.sanitized_nodes);
  return [
    ...arrayValue(zap?.steps),
    ...arrayValue(process?.steps),
    ...(sanitizedNodes ? Object.values(sanitizedNodes) : []),
    ...arrayValue(automation.importProposal?.zap?.steps),
  ];
}

function getZapierExplicitWebhookHandoffs(
  zap: Record<string, unknown> | null,
  process: Record<string, unknown> | null,
): unknown[] {
  return [
    ...arrayValue(process?.webhookHandoffs),
    ...arrayValue(zap?.webhookHandoffs),
    ...arrayValue(process?.steps).flatMap((step) => arrayValue(getRecord(step)?.webhookPaths)),
    ...arrayValue(zap?.steps).flatMap((step) => arrayValue(getRecord(step)?.webhookPaths)),
  ];
}

function getGitLabEndpointRecord(automation: Automatisering): Record<string, unknown> | null {
  if (automation.gitlabEndpoint) return automation.gitlabEndpoint as unknown as Record<string, unknown>;
  return getRecord(automation.importProposal?.gitlab_endpoint)
    ?? getRecord(automation.importProposal?.gitlab?.endpoint);
}

function getTypeformRecord(automation: Automatisering): Record<string, unknown> | null {
  return getRecord(automation.importProposal?.typeform)
    ?? getRecord(automation.importProposal?.typeform_api);
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstString(value: unknown): string {
  return arrayValue(value).map(stringValue).find(Boolean) ?? "";
}

function hasStringArrayItems(value: unknown): boolean {
  return arrayValue(value).some((item) => Boolean(stringValue(item)));
}
