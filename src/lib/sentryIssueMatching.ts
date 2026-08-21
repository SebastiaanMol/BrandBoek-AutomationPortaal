import { displayAutomationName } from "@/lib/automationDisplay";
import { parseGitLabExternalEndpoint } from "@/lib/automationFunnel";
import type { Automatisering } from "@/lib/types";

export type SentryIssueMatchConfidence = "exact" | "strong" | "possible";
export type SentryIssueMatchReason = "automation_id tag" | "source identifier" | "automation name";

export interface PortalSentryIssue {
  id: string;
  shortId?: string;
  title: string;
  culprit?: string;
  level?: string;
  status: string;
  count: number;
  userCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  permalink: string;
  metadataText?: string;
  tags?: Record<string, string>;
}

export interface SentryIssueMatch {
  issueId: string;
  issue: PortalSentryIssue;
  confidence: SentryIssueMatchConfidence;
  reason: SentryIssueMatchReason;
}

export interface AutomationSentryIssueSummary {
  linkedIssueCount: number;
  possibleIssueCount: number;
  eventCount: number;
  latestSeen: string | null;
}

export interface SentryIssueMatchResult {
  byAutomationId: Record<string, SentryIssueMatch[]>;
  summariesByAutomationId: Record<string, AutomationSentryIssueSummary>;
  unmatched: PortalSentryIssue[];
}

interface BestAutomationMatch {
  automationId: string;
  confidence: SentryIssueMatchConfidence;
  reason: SentryIssueMatchReason;
  identifierRank: number;
  identifierLength: number;
}

type AutomationMatchCandidate = BestAutomationMatch;

interface SourceIdentifier {
  value: string;
  rank: number;
}

const CONFIDENCE_RANK: Record<SentryIssueMatchConfidence, number> = {
  exact: 3,
  strong: 2,
  possible: 1,
};

const EXACT_IDENTIFIER_RANK = 3;
const SOURCE_ID_IDENTIFIER_RANK = 2;
const SOURCE_METADATA_IDENTIFIER_RANK = 1;
const DISPLAY_NAME_IDENTIFIER_RANK = 0;

export function matchSentryIssuesToAutomations(
  issues: PortalSentryIssue[],
  automations: Automatisering[],
): SentryIssueMatchResult {
  const byAutomationId = Object.fromEntries(
    automations.map((automation) => [automation.id, [] as SentryIssueMatch[]]),
  );
  const unmatched: PortalSentryIssue[] = [];

  for (const issue of issues) {
    const match = findBestAutomationMatch(issue, automations);

    if (!match) {
      unmatched.push(issue);
      continue;
    }

    byAutomationId[match.automationId].push({
      issueId: issue.id,
      issue,
      confidence: match.confidence,
      reason: match.reason,
    });
  }

  return {
    byAutomationId,
    summariesByAutomationId: Object.fromEntries(
      automations.map((automation) => [
        automation.id,
        buildSentryIssueSummary(byAutomationId[automation.id] ?? []),
      ]),
    ),
    unmatched,
  };
}

export function buildSentryIssueSummary(matches: SentryIssueMatch[]): AutomationSentryIssueSummary {
  const linked = matches.filter(isLinkedMatch);
  const possible = matches.filter((match) => match.confidence === "possible");
  const latestSeen = matches.reduce<string | null>((latest, match) => {
    const lastSeen = match.issue.lastSeen;
    if (!lastSeen) {
      return latest;
    }

    const timestamp = Date.parse(lastSeen);
    if (!Number.isFinite(timestamp)) {
      return latest;
    }

    if (!latest || timestamp > Date.parse(latest)) {
      return lastSeen;
    }

    return latest;
  }, null);

  return {
    linkedIssueCount: linked.length,
    possibleIssueCount: possible.length,
    eventCount: linked.reduce((total, match) => total + Math.max(0, match.issue.count), 0),
    latestSeen,
  };
}

function findBestAutomationMatch(
  issue: PortalSentryIssue,
  automations: Automatisering[],
): BestAutomationMatch | null {
  const candidates: AutomationMatchCandidate[] = [];
  const exactTagAutomationId = normalizeExactToken(issue.tags?.automation_id);
  if (exactTagAutomationId) {
    for (const automation of automations) {
      if (normalizeExactToken(automation.id) !== exactTagAutomationId) {
        continue;
      }

      candidates.push({
        automationId: automation.id,
        confidence: "exact",
        reason: "automation_id tag",
        identifierRank: EXACT_IDENTIFIER_RANK,
        identifierLength: automation.id.length,
      });
    }
  }

  const issueSearchableText = buildIssueSearchableText(issue);

  for (const automation of automations) {
    const identifiers = getAutomationSourceIdentifiers(automation);
    const bestIdentifier = identifiers
      .filter((identifier) => containsIdentifierToken(issueSearchableText, identifier.value))
      .sort(compareSourceIdentifiers)
      .at(0);

    if (bestIdentifier) {
      candidates.push({
        automationId: automation.id,
        confidence: "strong",
        reason: "source identifier",
        identifierRank: bestIdentifier.rank,
        identifierLength: bestIdentifier.value.length,
      });
    }
  }

  for (const automation of automations) {
    const displayName = normalizeSearchText(displayAutomationName(automation));
    if (displayName.length >= 4 && issueSearchableText.includes(displayName)) {
      candidates.push({
        automationId: automation.id,
        confidence: "possible",
        reason: "automation name",
        identifierRank: DISPLAY_NAME_IDENTIFIER_RANK,
        identifierLength: displayName.length,
      });
    }
  }

  return candidates.sort(compareAutomationMatchCandidates).at(0) ?? null;
}

function buildIssueSearchableText(issue: PortalSentryIssue): string {
  return normalizeSearchText([
    issue.title,
    issue.culprit,
    issue.shortId,
    issue.metadataText,
    Object.entries(issue.tags ?? {}).flatMap(([key, value]) => [key, value]).join(" "),
  ].filter(Boolean).join(" "));
}

function getAutomationSourceIdentifiers(automation: Automatisering): SourceIdentifier[] {
  const proposal = automation.importProposal;
  const zap = proposal?.zap;
  const typeform = proposal?.typeform;
  const gitlabEndpoint = automation.gitlabEndpoint ?? proposal?.gitlab_endpoint ?? proposal?.gitlab?.endpoint;
  const parsedGitlabExternalEndpoint = parseGitLabExternalEndpoint(automation.externalId);

  return uniqueSourceIdentifiers([
    { value: automation.id, rank: EXACT_IDENTIFIER_RANK },
    { value: automation.externalId, rank: SOURCE_ID_IDENTIFIER_RANK },
    { value: automation.hubspotWorkflow?.workflowId, rank: SOURCE_ID_IDENTIFIER_RANK },
    { value: zap?.id, rank: SOURCE_ID_IDENTIFIER_RANK },
    { value: typeform?.form?.id, rank: SOURCE_ID_IDENTIFIER_RANK },
    { value: automation.gitlabFilePath, rank: SOURCE_METADATA_IDENTIFIER_RANK },
    { value: gitlabEndpoint?.endpoint, rank: SOURCE_METADATA_IDENTIFIER_RANK },
    { value: gitlabEndpoint?.path, rank: SOURCE_METADATA_IDENTIFIER_RANK },
    { value: gitlabEndpoint?.handler, rank: SOURCE_METADATA_IDENTIFIER_RANK },
    { value: parsedGitlabExternalEndpoint.endpoint, rank: SOURCE_METADATA_IDENTIFIER_RANK },
    ...(automation.endpoints ?? []).map((value) => ({ value, rank: SOURCE_METADATA_IDENTIFIER_RANK })),
    ...(automation.webhookPaths ?? []).map((value) => ({ value, rank: SOURCE_METADATA_IDENTIFIER_RANK })),
    ...(proposal?.webhookPaths ?? []).map((value) => ({ value, rank: SOURCE_METADATA_IDENTIFIER_RANK })),
    ...(zap?.process?.webhookHandoffs ?? []).map((handoff) => ({
      value: handoff.path,
      rank: SOURCE_METADATA_IDENTIFIER_RANK,
    })),
    ...(zap?.process?.steps ?? []).flatMap((step) =>
      step.webhookPaths.map((value) => ({ value, rank: SOURCE_METADATA_IDENTIFIER_RANK })),
    ),
    ...(zap?.steps ?? []).flatMap((step) =>
      step.webhookPaths.map((value) => ({ value, rank: SOURCE_METADATA_IDENTIFIER_RANK })),
    ),
    ...(typeform?.webhooks ?? []).map((webhook) => ({ value: webhook.path, rank: SOURCE_METADATA_IDENTIFIER_RANK })),
    ...(typeform?.process?.webhookHandoffs ?? []).map((handoff) => ({
      value: handoff.path,
      rank: SOURCE_METADATA_IDENTIFIER_RANK,
    })),
    ...(typeform?.process?.steps ?? []).flatMap((step) =>
      step.webhookPaths.map((value) => ({ value, rank: SOURCE_METADATA_IDENTIFIER_RANK })),
    ),
  ]);
}

function compareAutomationMatchCandidates(a: AutomationMatchCandidate, b: AutomationMatchCandidate): number {
  return (
    CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] ||
    b.identifierRank - a.identifierRank ||
    b.identifierLength - a.identifierLength ||
    a.automationId.localeCompare(b.automationId)
  );
}

function compareSourceIdentifiers(a: SourceIdentifier, b: SourceIdentifier): number {
  return b.rank - a.rank || b.value.length - a.value.length || a.value.localeCompare(b.value);
}

function containsIdentifierToken(searchableText: string, identifier: string): boolean {
  const first = identifier.at(0);
  const last = identifier.at(-1);
  const prefix = first && isAlphaNumeric(first) ? "(?<![a-z0-9])" : "";
  const suffix = last && isAlphaNumeric(last) ? "(?![a-z0-9])" : "";
  return new RegExp(`${prefix}${escapeRegExp(identifier)}${suffix}`).test(searchableText);
}

function isLinkedMatch(match: SentryIssueMatch): boolean {
  return match.confidence === "exact" || match.confidence === "strong";
}

function normalizeExactToken(value: string | undefined | null): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSearchText(value: string | undefined | null): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSourceIdentifiers(values: Array<{ value: string | undefined | null; rank: number }>): SourceIdentifier[] {
  const identifiers = new Map<string, SourceIdentifier>();

  for (const { value, rank } of values) {
    const normalized = normalizeSearchText(value);
    if (normalized.length < 4) {
      continue;
    }

    const existing = identifiers.get(normalized);
    if (!existing || rank > existing.rank) {
      identifiers.set(normalized, { value: normalized, rank });
    }
  }

  return Array.from(identifiers.values());
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAlphaNumeric(value: string): boolean {
  return /^[a-z0-9]$/.test(value);
}
