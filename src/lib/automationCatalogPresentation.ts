import { format } from "date-fns";
import { nl } from "date-fns/locale";

import {
  STATUS_LABELS,
  type Automatisering,
  type AutomationSourceFinding,
} from "./types";
import {
  getAutomationOverviewPresentation,
  type AutomationOverviewPresentation,
} from "./automationOverviewPresentation";

export interface AutomationCatalogRowPresentation {
  displayName: string;
  shortDescription: string;
  sourceLabel: string;
  statusLabel: string;
  lastSeenLabel: string;
  lastSeenDetail: string;
  warning?: string;
}

interface LastSeenPresentation {
  label: string;
  detail: string;
}

export function getAutomationCatalogRowPresentation(
  automation: Automatisering,
): AutomationCatalogRowPresentation {
  const warning = getActiveSourceFinding(automation)?.message;
  const lastSeen = buildLastSeen(automation);

  return {
    displayName: automation.naam || "Naamloze automation",
    shortDescription: buildShortDescription(automation),
    sourceLabel: sourceLabel(automation),
    statusLabel: STATUS_LABELS[automation.status] ?? automation.status,
    lastSeenLabel: lastSeen.label,
    lastSeenDetail: lastSeen.detail,
    warning,
  };
}

export function getAutomationCatalogPreviewPresentation(
  automation: Automatisering,
): AutomationOverviewPresentation {
  return getAutomationOverviewPresentation(automation);
}

function buildShortDescription(automation: Automatisering): string {
  const businessDescription = cleanText(automation.doel);
  if (businessDescription && !isGenericDescription(businessDescription)) {
    return businessDescription;
  }

  const simpleDescription = automation.beschrijvingInSimpeleTaal
    ?.map(cleanText)
    .find(Boolean);
  if (simpleDescription) return simpleDescription;

  const label = sourceLabel(automation);
  if (label === "HubSpot") return "HubSpot workflow met brondata voor trigger, actie en outcome.";
  if (label === "Zapier") return "Zapier Zap met brondata voor stappen, voorwaarden en overdracht.";
  if (label === "GitLab") return "Backend automation met brondata voor endpoint, uitvoering en koppelingen.";
  if (label === "Typeform") return "Typeform formulier met brondata voor vragen, contextvelden en webhook.";

  return (
    "Deze automation is beschikbaar in de catalogus."
  );
}

function buildLastSeen(automation: Automatisering): LastSeenPresentation {
  if (automation.lastSyncedAt) {
    return {
      label: "Gesynchroniseerd",
      detail: formatDate(automation.lastSyncedAt),
    };
  }

  return {
    label: "Gesynchroniseerd",
    detail: "Geen synchronisatiedatum",
  };
}

function sourceLabel(automation: Automatisering): string {
  const source = normalizedSource(automation);
  if (source === "hubspot") return "HubSpot";
  if (source === "gitlab") return "GitLab";
  if (source === "zapier") return "Zapier";
  if (source === "typeform") return "Typeform";
  return "Handmatig";
}

function normalizedSource(automation: Automatisering): string {
  const source = automation.source?.toLowerCase();
  if (source) return source;
  if (automation.gitlabFilePath || automation.gitlabEndpoint) return "gitlab";
  return "handmatig";
}

function getActiveSourceFinding(automation: Automatisering): AutomationSourceFinding | undefined {
  return automation.sourceFindings?.find((finding) => !finding.resolvedAt);
}

function isGenericDescription(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized === "verwerkt automation data." ||
    normalized === "verwerkt automation data"
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Onbekend";
  return format(date, "d MMM yyyy", { locale: nl }).replace(/\./g, "");
}

function cleanText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}
