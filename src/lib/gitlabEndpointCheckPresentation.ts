import {
  getAnalyticsHealthPresentation,
  type GitLabEndpointGapClassification,
  type GitLabEndpointGapRow,
} from "./analyticsHealthPresentation";
import { isGitLabSourceRecord, isSpecificGitLabEndpointAutomation } from "./gitlabAutomationIdentity";
import type { Automatisering } from "./types";

export type GitLabEndpointLinkStatus = "linked" | "shared" | "not_linkable" | "no_endpoint";

export interface GitLabEndpointCheckMetrics {
  totalGitLabAutomations: number;
  automationsWithoutEndpoint: number;
  endpointRows: number;
  linkedEndpointRows: number;
  sharedEndpointRows: number;
  notLinkableEndpointRows: number;
}

export interface GitLabEndpointCheckRow {
  id: string;
  automationId: string;
  automationName: string;
  status: string;
  category: string;
  hasEndpoint: boolean;
  method: string;
  path: string;
  normalizedPath: string;
  sourceField: string;
  detail: string;
  classification: GitLabEndpointGapClassification | "no_endpoint";
  classificationLabel: string;
  linkStatus: GitLabEndpointLinkStatus;
  linkStatusLabel: string;
  matchedSenders: string[];
  conflictingSenders: string[];
  supportingEvidenceCount: number;
  nextAction: string;
  issue: string;
  handler: string;
  apiFile: string;
  gitlabFilePath: string;
  href: string;
}

export interface GitLabEndpointCheckPresentation {
  metrics: GitLabEndpointCheckMetrics;
  rows: GitLabEndpointCheckRow[];
}

export function getGitLabEndpointCheckPresentation(automations: Automatisering[]): GitLabEndpointCheckPresentation {
  const gitlabSourceRecords = automations.filter(isGitLabSourceRecord);
  const specificEndpointAutomations = gitlabSourceRecords.filter(isSpecificGitLabEndpointAutomation);
  const analytics = getAnalyticsHealthPresentation({ automations });
  const endpointRows = analytics.gitlabEndpointGaps.map(toEndpointCheckRow);
  const missingEndpointRows = gitlabSourceRecords
    .filter((automation) => !isSpecificGitLabEndpointAutomation(automation))
    .map(toMissingEndpointRow);
  const rows = [...missingEndpointRows, ...endpointRows].sort(compareRows);

  return {
    metrics: {
      totalGitLabAutomations: specificEndpointAutomations.length,
      automationsWithoutEndpoint: missingEndpointRows.length,
      endpointRows: endpointRows.length,
      linkedEndpointRows: endpointRows.filter((row) => row.linkStatus === "linked").length,
      sharedEndpointRows: endpointRows.filter((row) => row.linkStatus === "shared").length,
      notLinkableEndpointRows: endpointRows.filter((row) => row.linkStatus === "not_linkable").length,
    },
    rows,
  };
}

function toEndpointCheckRow(row: GitLabEndpointGapRow): GitLabEndpointCheckRow {
  const linkStatus = linkStatusForClassification(row.classification);

  return {
    id: row.id,
    automationId: row.automationId,
    automationName: row.automationName,
    status: row.status,
    category: "Backend Script",
    hasEndpoint: true,
    method: row.method,
    path: row.path,
    normalizedPath: row.normalizedPath,
    sourceField: row.sourceField,
    detail: row.detail,
    classification: row.classification,
    classificationLabel: row.classificationLabel,
    linkStatus,
    linkStatusLabel: linkStatusLabel(linkStatus),
    matchedSenders: row.matchedSenders.map((sender) => sender.automationName),
    conflictingSenders: row.conflictingSenders.map((sender) => sender.automationName),
    supportingEvidenceCount: row.supportingEvidence.length,
    nextAction: row.nextAction,
    issue: issueForClassification(row.classification),
    handler: row.detail.split("|")[0]?.trim() ?? "",
    apiFile: row.detail.split("|")[1]?.trim() ?? "",
    gitlabFilePath: "",
    href: row.href,
  };
}

function toMissingEndpointRow(automation: Automatisering): GitLabEndpointCheckRow {
  return {
    id: `${automation.id}:no-endpoint`,
    automationId: automation.id,
    automationName: automation.naam,
    status: automation.status,
    category: "Legacy/bestandsrecord",
    hasEndpoint: false,
    method: "",
    path: "",
    normalizedPath: "",
    sourceField: "",
    detail: "",
    classification: "no_endpoint",
    classificationLabel: "Geen route-data",
    linkStatus: "no_endpoint",
    linkStatusLabel: "Geen endpoint",
    matchedSenders: [],
    conflictingSenders: [],
    supportingEvidenceCount: 0,
    nextAction: "Koppel dit niet aan een procesreis. Maak of sync een specifieke endpoint automation als deze code echt via een route wordt aangeroepen.",
    issue: "Dit is een legacy/bestandsrecord zonder specifieke endpoint-node; daarom telt het niet als GitLab automation voor procesreizen.",
    handler: automation.gitlabEndpoint?.handler ?? "",
    apiFile: automation.gitlabEndpoint?.api_file ?? "",
    gitlabFilePath: automation.gitlabFilePath ?? "",
    href: `/automations/${encodeURIComponent(automation.id)}`,
  };
}

function linkStatusForClassification(classification: GitLabEndpointGapClassification): GitLabEndpointLinkStatus {
  if (classification === "in_process_journey") return "linked";
  if (classification === "shared_endpoint") return "shared";
  return "not_linkable";
}

function linkStatusLabel(status: GitLabEndpointLinkStatus): string {
  if (status === "linked") return "Gekoppeld";
  if (status === "shared") return "Gedeeld endpoint";
  if (status === "no_endpoint") return "Geen endpoint";
  return "Niet linkbaar";
}

function issueForClassification(classification: GitLabEndpointGapClassification): string {
  if (classification === "in_process_journey") return "Exacte webhook/endpoint-match gevonden.";
  if (classification === "shared_endpoint") return "Meerdere starters komen hard bewezen samen op dit endpoint.";
  if (classification === "alternative_hard_match") return "Hard matchend, maar niet gekozen als hoofdnode door status/type/specifiekere receiver.";
  if (classification === "method_mismatch") return "Path matcht, maar bekende HTTP-methodes botsen.";
  if (classification === "source_incomplete") return "Brondata is incompleet voor procesreisdiagnose.";
  return "Geen exacte inkomende webhook gevonden voor dit endpoint.";
}

function compareRows(left: GitLabEndpointCheckRow, right: GitLabEndpointCheckRow): number {
  const rankDelta = linkStatusRank(left.linkStatus) - linkStatusRank(right.linkStatus);
  if (rankDelta !== 0) return rankDelta;
  const statusDelta = left.status.localeCompare(right.status);
  if (statusDelta !== 0) return statusDelta;
  return left.automationName.localeCompare(right.automationName);
}

function linkStatusRank(status: GitLabEndpointLinkStatus): number {
  if (status === "no_endpoint") return 0;
  if (status === "not_linkable") return 1;
  if (status === "shared") return 2;
  return 3;
}
