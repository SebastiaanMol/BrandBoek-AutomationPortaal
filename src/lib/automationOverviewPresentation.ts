import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { buildAutomationFunnel } from "./automationFunnel";
import { getHubSpotAutomationDetailPresentation } from "./hubspotAutomationDetailPresentation";
import type { Automatisering } from "./types";

export interface AutomationOverviewEvidenceBadge {
  label: string;
  detail?: string;
  tone?: "neutral" | "good" | "warning";
}

export interface AutomationOverviewPresentation {
  triggerLabel: string;
  actionSummary: string;
  outcomeLabel: string;
  evidenceBadges: AutomationOverviewEvidenceBadge[];
  warning?: string;
}

export function getAutomationOverviewPresentation(automation: Automatisering): AutomationOverviewPresentation {
  const source = automation.source?.toLowerCase();

  if (source === "hubspot") return buildHubSpotOverview(automation);
  if (source === "zapier") return buildZapierOverview(automation);
  if (source === "gitlab") return buildGitLabOverview(automation);
  if (source === "typeform") return buildTypeformOverview(automation);

  return buildFallbackOverview(automation);
}

function buildHubSpotOverview(automation: Automatisering): AutomationOverviewPresentation {
  const workflow = automation.hubspotWorkflow;
  const detailPresentation = getHubSpotAutomationDetailPresentation(automation);
  const dataflow = detailPresentation.dataflow;
  const primaryWebhook = detailPresentation.webhookActions.find((action) => action.url || action.path);
  const triggerCount = workflow?.triggers?.length ?? 0;
  const actionCount = workflow?.actions?.length ?? automation.stappen.length;
  const webhookCount = countUnique([
    ...(automation.webhookPaths ?? []),
    ...((workflow?.actions ?? []).map((action) => action.webhookPath || action.webhookUrl).filter(Boolean) as string[]),
  ]);
  const badges: AutomationOverviewEvidenceBadge[] = [];

  if (triggerCount > 0) badges.push({ label: countLabel(triggerCount, "trigger", "triggers"), tone: "good" });
  if (actionCount > 0) badges.push({ label: countLabel(actionCount, "actie", "acties") });
  if (webhookCount > 0) badges.push({ label: countLabel(webhookCount, "webhook", "webhooks"), detail: formatWebhookBadgeDetail(primaryWebhook?.url), tone: "good" });
  if (typeof automation.hubspotRunCount365d === "number") {
    badges.push({ label: `${new Intl.NumberFormat("nl-NL").format(automation.hubspotRunCount365d)} runs`, detail: "365 dagen" });
  }
  if (automation.hubspotLastRunAt) {
    badges.push({ label: "Laatste run", detail: formatDate(automation.hubspotLastRunAt) });
  }

  const actionSummary = buildHubSpotWebhookActionSummary(workflow?.name ?? automation.naam, primaryWebhook)
    || buildHubSpotDataflowActionSummary(dataflow)
    || (actionCount > 0
      ? `HubSpot voert ${actionCount} ${actionCount === 1 ? "workflowactie" : "workflowacties"} uit${webhookCount > 0 ? ", inclusief een webhook-overdracht" : ""}.`
      : "HubSpot bewaakt de workflowvoorwaarden en voert de ingestelde opvolging uit.");

  return withSparseWarning({
    triggerLabel: firstText(workflow?.triggers?.[0]?.label, automation.trigger, "HubSpot workflow startvoorwaarde niet gespecificeerd"),
    actionSummary,
    outcomeLabel: buildHubSpotDataflowOutcome(dataflow) || "Uitkomst niet bewezen in HubSpot-data",
    evidenceBadges: badges,
  });
}

function buildHubSpotWebhookActionSummary(
  workflowName: string,
  webhook: ReturnType<typeof getHubSpotAutomationDetailPresentation>["webhookActions"][number] | undefined,
): string {
  const target = webhook?.url;
  if (!target) return "";
  return `${workflowName} stuurt ${webhook.method || "POST"} webhook naar ${target}.`;
}

function formatWebhookBadgeDetail(target: string | undefined): string | undefined {
  if (!target) return undefined;
  try {
    return new URL(target).hostname;
  } catch {
    return target;
  }
}

function buildHubSpotDataflowActionSummary(dataflow: ReturnType<typeof getHubSpotAutomationDetailPresentation>["dataflow"]): string {
  const orchestrator = dataflow[1];
  const destination = dataflow[2];
  if (!orchestrator || !destination) return "";
  const arrowLabel = orchestrator.arrowLabel ? ` via ${orchestrator.arrowLabel}` : "";
  return `${orchestrator.name} geeft data door${arrowLabel} naar ${destination.name}.`;
}

function buildHubSpotDataflowOutcome(dataflow: ReturnType<typeof getHubSpotAutomationDetailPresentation>["dataflow"]): string {
  const destination = dataflow[2];
  if (!destination) return "";
  return `${destination.name}: ${destination.subtitle}`;
}

function buildZapierOverview(automation: Automatisering): AutomationOverviewPresentation {
  const process = automation.importProposal?.zap?.process;
  const stepCount = process?.steps?.length ?? automation.stappen.length;
  const webhookCount = countUnique([
    ...((process?.webhookHandoffs ?? []).map((handoff) => handoff.path).filter(Boolean) as string[]),
    ...((process?.steps ?? []).flatMap((step) => step.webhookPaths ?? [])),
    ...(automation.webhookPaths ?? []),
  ]);
  const conditionCount = process?.conditions?.length ?? 0;
  const lookupCount = process?.dataLookups?.length ?? 0;
  const badges: AutomationOverviewEvidenceBadge[] = [];

  if (stepCount > 0) badges.push({ label: countLabel(stepCount, "stap", "stappen") });
  if (webhookCount > 0) badges.push({ label: countLabel(webhookCount, "webhook", "webhooks"), tone: "good" });
  if (conditionCount > 0) badges.push({ label: countLabel(conditionCount, "conditie", "condities") });
  if (lookupCount > 0) badges.push({ label: countLabel(lookupCount, "lookup", "lookups") });
  if ((process?.emails?.length ?? 0) > 0) badges.push({ label: countLabel(process?.emails.length ?? 0, "e-mail", "e-mails") });

  const actionSummary = stepCount > 0
    ? `Zapier doorloopt ${stepCount} ${stepCount === 1 ? "stap" : "stappen"}${webhookCount > 0 ? " en geeft data door via een webhook" : ""}.`
    : "Zapier verwerkt de bekende Zap-stappen uit de brondata.";

  return withSparseWarning({
    triggerLabel: firstText(process?.trigger, automation.trigger, "Zapier trigger niet gespecificeerd"),
    actionSummary,
    outcomeLabel: firstText(process?.outcome, automation.doel, "Zapier outcome niet gespecificeerd"),
    evidenceBadges: badges,
  });
}

function buildGitLabOverview(automation: Automatisering): AutomationOverviewPresentation {
  const funnel = buildAutomationFunnel(automation);
  const endpoint = [automation.gitlabEndpoint?.method ?? funnel?.method, automation.gitlabEndpoint?.endpoint ?? funnel?.endpoint]
    .filter(Boolean)
    .join(" ");
  const handler = automation.gitlabEndpoint?.handler ?? funnel?.handler;
  const readCount = funnel?.hubspotReads.length ?? 0;
  const writeCount = funnel?.hubspotWrites.length ?? 0;
  const badges: AutomationOverviewEvidenceBadge[] = [];

  if (endpoint) badges.push({ label: "Endpoint", detail: endpoint });
  if (handler) badges.push({ label: "Handler", detail: handler });
  if (readCount > 0) badges.push({ label: countLabel(readCount, "read", "reads"), tone: "good" });
  if (writeCount > 0) badges.push({ label: countLabel(writeCount, "write", "writes"), tone: "good" });

  const writeStep = funnel?.steps.find((step) => step.kind === "write");

  return withSparseWarning({
    triggerLabel: firstText(endpoint, automation.trigger, "Backend startpunt niet gespecificeerd"),
    actionSummary: handler
      ? `Backend handler ${handler} verwerkt de request.`
      : "De backend verwerkt de request met de bekende code- en endpointinformatie.",
    outcomeLabel: firstText(writeStep?.summary, automation.doel, "Backend-uitkomst niet gespecificeerd"),
    evidenceBadges: badges,
  });
}

function buildTypeformOverview(automation: Automatisering): AutomationOverviewPresentation {
  const typeform = automation.importProposal?.typeform;
  const process = typeform?.process;
  const fieldCount = typeform?.form?.fields?.length ?? 0;
  const hiddenFieldCount = typeform?.form?.hidden_fields?.length ?? 0;
  const activeWebhookCount = (typeform?.webhooks ?? []).filter((webhook) => webhook.enabled).length
    || (process?.webhookHandoffs?.length ?? 0);
  const badges: AutomationOverviewEvidenceBadge[] = [];

  if (fieldCount > 0) badges.push({ label: countLabel(fieldCount, "vraag", "vragen") });
  if (hiddenFieldCount > 0) badges.push({ label: `${hiddenFieldCount} hidden ${hiddenFieldCount === 1 ? "field" : "fields"}` });
  if (activeWebhookCount > 0) badges.push({ label: `${activeWebhookCount} actieve ${activeWebhookCount === 1 ? "webhook" : "webhooks"}`, tone: "good" });
  if (typeform?.form?.title) badges.push({ label: "Formulier", detail: typeform.form.title });

  const actionSummary = fieldCount > 0
    ? `Typeform verzamelt ${fieldCount} ${fieldCount === 1 ? "vraag" : "vragen"}${activeWebhookCount > 0 ? " en stuurt inzendingen door via een webhook" : ""}.`
    : "Typeform verzamelt formulierinformatie en maakt die zichtbaar in het portaal.";

  return withSparseWarning({
    triggerLabel: firstText(process?.trigger, automation.trigger, "Typeform inzending start het proces"),
    actionSummary,
    outcomeLabel: firstText(process?.outcome, automation.doel, "Typeform outcome niet gespecificeerd"),
    evidenceBadges: badges,
  });
}

function buildFallbackOverview(automation: Automatisering): AutomationOverviewPresentation {
  return withSparseWarning({
    triggerLabel: firstText(automation.trigger, "Startsignaal niet gespecificeerd"),
    actionSummary: automation.stappen.length > 0
      ? `${automation.stappen.length} bekende ${automation.stappen.length === 1 ? "processtap" : "processtappen"} uit de automationgegevens.`
      : "Gebruikt de beschikbare automationgegevens om de processtap uit te voeren.",
    outcomeLabel: firstText(automation.doel, "Uitkomst niet gespecificeerd"),
    evidenceBadges: automation.stappen.length > 0
      ? [{ label: countLabel(automation.stappen.length, "processtap", "processtappen") }]
      : [],
  });
}

function withSparseWarning(presentation: AutomationOverviewPresentation): AutomationOverviewPresentation {
  if (presentation.evidenceBadges.length > 0) return presentation;
  return {
    ...presentation,
    warning: "Er is weinig brondata beschikbaar voor deze automation.",
  };
}

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const text = value?.trim();
    if (text) return text;
  }
  return "";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${new Intl.NumberFormat("nl-NL").format(count)} ${count === 1 ? singular : plural}`;
}

function countUnique(values: string[]): number {
  return new Set(values.map((value) => value.trim()).filter(Boolean)).size;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "onbekend";
  return format(date, "d MMM yyyy", { locale: nl });
}
