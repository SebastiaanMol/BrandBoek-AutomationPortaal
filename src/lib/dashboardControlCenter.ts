import type { AutomationSentryIssuesQueryResult } from "@/lib/queryHooks/sentryIssues";
import type {
  AutomationSentryIssueSummary,
  PortalSentryIssue,
  SentryIssueMatch,
} from "@/lib/sentryIssueMatching";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type {
  AutomationSourceFinding,
  Automatisering,
  Flow,
  Pipeline,
  Status,
  Systeem,
  VerificatieStatus,
} from "@/lib/types";

export interface DashboardAutomationLink {
  sourceId: string;
  targetId: string;
  matchType: string | null;
}

export interface DashboardControlCenterInput {
  automations: Automatisering[];
  flows: Flow[];
  pipelines: Pipeline[];
  suggestions: FlowSuggestie[];
  confirmedLinks: DashboardAutomationLink[];
  sentry?: AutomationSentryIssuesQueryResult;
  periodeDagen: number;
  now?: Date;
}

export interface DashboardSentryAutomationRow {
  automation: Automatisering;
  summary: AutomationSentryIssueSummary;
  matches: SentryIssueMatch[];
}

export interface DashboardSourceWarning {
  automation: Automatisering;
  finding: AutomationSourceFinding;
}

export interface DashboardVerificationItem {
  automation: Automatisering;
  status: VerificatieStatus;
}

export interface DashboardSentryInsights {
  newestIssue: PortalSentryIssue | null;
  oldestOpenIssue: PortalSentryIssue | null;
  highestLevel: string | null;
  totalUsers: number;
  fetchedAt: string | null;
}

export interface DashboardControlCenterModel {
  sentry: {
    totalIssues: number;
    linkedIssues: number;
    unmatchedIssues: PortalSentryIssue[];
    affectedAutomations: DashboardSentryAutomationRow[];
    totalEvents: number;
    latestSeen: string | null;
    insights: DashboardSentryInsights;
  };
  workQueue: {
    sourceWarnings: DashboardSourceWarning[];
    verificationItems: DashboardVerificationItem[];
    unlinkedAutomations: Automatisering[];
    flowSuggestions: FlowSuggestie[];
  };
  health: {
    statusCounts: Array<{ status: Status; count: number }>;
    systems: Array<{ system: Systeem; count: number }>;
    pipelines: {
      total: number;
      active: number;
      custom: number;
    };
    flows: {
      total: number;
      confirmedLinks: number;
    };
  };
}

const STATUS_ORDER: Status[] = ["Actief", "In review", "Verouderd", "Uitgeschakeld"];

const SENTRY_LEVEL_RANK: Record<string, number> = {
  fatal: 5,
  error: 4,
  warning: 3,
  info: 2,
  debug: 1,
};

const SOURCE_SEVERITY_RANK: Record<AutomationSourceFinding["severity"], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

export function buildDashboardControlCenterModel({
  automations,
  flows,
  pipelines,
  suggestions,
  confirmedLinks,
  sentry,
  periodeDagen,
  now = new Date(),
}: DashboardControlCenterInput): DashboardControlCenterModel {
  const affectedAutomations = automations
    .map((automation) => {
      const summary = sentry?.matches.summariesByAutomationId[automation.id];
      const matches = sentry?.matches.byAutomationId[automation.id] ?? [];
      if (!summary || (summary.linkedIssueCount === 0 && summary.possibleIssueCount === 0)) {
        return null;
      }

      return { automation, summary, matches };
    })
    .filter((row): row is DashboardSentryAutomationRow => Boolean(row))
    .sort(compareAffectedAutomations);

  const unmatchedIssues = [...(sentry?.matches.unmatched ?? [])].sort(compareSentryIssues);
  const linkedIssues = affectedAutomations.reduce((total, row) => total + row.summary.linkedIssueCount, 0);
  const totalEvents = affectedAutomations.reduce((total, row) => total + row.summary.eventCount, 0);
  const latestSeen = maxIsoDate([
    ...affectedAutomations.map((row) => row.summary.latestSeen),
    ...unmatchedIssues.map((issue) => issue.lastSeen ?? null),
  ]);

  const linkedAutomationIds = new Set<string>();
  for (const link of confirmedLinks) {
    linkedAutomationIds.add(link.sourceId);
    linkedAutomationIds.add(link.targetId);
  }

  return {
    sentry: {
      totalIssues: sentry?.issues.length ?? 0,
      linkedIssues,
      unmatchedIssues,
      affectedAutomations,
      totalEvents,
      latestSeen,
      insights: buildSentryInsights(sentry?.issues ?? [], sentry?.fetchedAt ?? null),
    },
    workQueue: {
      sourceWarnings: buildSourceWarnings(automations),
      verificationItems: automations
        .map((automation) => ({
          automation,
          status: getVerificationStatusAt(automation, periodeDagen, now),
        }))
        .filter((item) => item.status !== "geverifieerd")
        .sort(compareVerificationItems),
      unlinkedAutomations: automations
        .filter((automation) => !linkedAutomationIds.has(automation.id))
        .sort((a, b) => a.naam.localeCompare(b.naam)),
      flowSuggestions: suggestions.filter((suggestion) => !suggestion.confirmed && !suggestion.rejected),
    },
    health: {
      statusCounts: buildStatusCounts(automations),
      systems: buildSystemStats(automations),
      pipelines: {
        total: pipelines.length,
        active: pipelines.filter((pipeline) => pipeline.isActive).length,
        custom: pipelines.filter((pipeline) => pipeline.source === "custom").length,
      },
      flows: {
        total: flows.length,
        confirmedLinks: confirmedLinks.length,
      },
    },
  };
}

function buildSentryInsights(issues: PortalSentryIssue[], fetchedAt: string | null): DashboardSentryInsights {
  return {
    newestIssue: getNewestIssue(issues),
    oldestOpenIssue: getOldestOpenIssue(issues),
    highestLevel: getHighestIssueLevel(issues),
    totalUsers: issues.reduce((total, issue) => total + Math.max(0, issue.userCount ?? 0), 0),
    fetchedAt: fetchedAt || null,
  };
}

function buildSourceWarnings(automations: Automatisering[]): DashboardSourceWarning[] {
  return automations
    .flatMap((automation) =>
      (automation.sourceFindings ?? [])
        .filter((finding) => !finding.resolvedAt)
        .map((finding) => ({ automation, finding })),
    )
    .sort(compareSourceWarnings);
}

function buildStatusCounts(automations: Automatisering[]): Array<{ status: Status; count: number }> {
  return STATUS_ORDER
    .map((status) => ({
      status,
      count: automations.filter((automation) => automation.status === status).length,
    }))
    .filter((item) => item.count > 0);
}

function buildSystemStats(automations: Automatisering[]): Array<{ system: Systeem; count: number }> {
  const counts = new Map<Systeem, number>();
  for (const automation of automations) {
    for (const system of automation.systemen) {
      counts.set(system, (counts.get(system) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([system, count]) => ({ system, count }))
    .sort((a, b) => b.count - a.count || a.system.localeCompare(b.system));
}

function compareAffectedAutomations(a: DashboardSentryAutomationRow, b: DashboardSentryAutomationRow): number {
  return (
    b.summary.linkedIssueCount - a.summary.linkedIssueCount ||
    b.summary.eventCount - a.summary.eventCount ||
    compareIsoDesc(a.summary.latestSeen, b.summary.latestSeen) ||
    a.automation.naam.localeCompare(b.automation.naam)
  );
}

export function compareSentryIssues(a: PortalSentryIssue, b: PortalSentryIssue): number {
  return (
    getSentryLevelRank(b.level) - getSentryLevelRank(a.level) ||
    Math.max(0, b.count) - Math.max(0, a.count) ||
    compareIsoDesc(a.lastSeen ?? null, b.lastSeen ?? null) ||
    a.title.localeCompare(b.title)
  );
}

function compareSourceWarnings(a: DashboardSourceWarning, b: DashboardSourceWarning): number {
  return (
    SOURCE_SEVERITY_RANK[b.finding.severity] - SOURCE_SEVERITY_RANK[a.finding.severity] ||
    compareIsoDesc(a.finding.lastSeenAt, b.finding.lastSeenAt) ||
    a.automation.naam.localeCompare(b.automation.naam)
  );
}

function compareVerificationItems(a: DashboardVerificationItem, b: DashboardVerificationItem): number {
  if (a.status !== b.status) {
    if (a.status === "nooit") return -1;
    if (b.status === "nooit") return 1;
  }

  return getVerificationTime(a.automation) - getVerificationTime(b.automation) ||
    a.automation.naam.localeCompare(b.automation.naam);
}

function getVerificationTime(automation: Automatisering): number {
  if (!automation.laatstGeverifieerd) return 0;
  const timestamp = Date.parse(automation.laatstGeverifieerd);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getVerificationStatusAt(
  automation: Automatisering,
  periodeDagen: number,
  now: Date,
): VerificatieStatus {
  if (!automation.laatstGeverifieerd) return "nooit";
  const timestamp = Date.parse(automation.laatstGeverifieerd);
  if (!Number.isFinite(timestamp)) return "nooit";
  const threshold = periodeDagen * 24 * 60 * 60 * 1000;
  return now.getTime() - timestamp <= threshold ? "geverifieerd" : "verouderd";
}

function getSentryLevelRank(level: string | undefined): number {
  return SENTRY_LEVEL_RANK[String(level ?? "").toLowerCase()] ?? 0;
}

function getNewestIssue(issues: PortalSentryIssue[]): PortalSentryIssue | null {
  return issues.reduce<PortalSentryIssue | null>((newest, issue) => {
    if (!newest) return issue;
    return getIssueLastSeenTime(issue) > getIssueLastSeenTime(newest) ? issue : newest;
  }, null);
}

function getOldestOpenIssue(issues: PortalSentryIssue[]): PortalSentryIssue | null {
  return issues.reduce<PortalSentryIssue | null>((oldest, issue) => {
    if (!oldest) return issue;
    return getIssueFirstSeenTime(issue) < getIssueFirstSeenTime(oldest) ? issue : oldest;
  }, null);
}

function getHighestIssueLevel(issues: PortalSentryIssue[]): string | null {
  const highest = issues.reduce<PortalSentryIssue | null>((current, issue) => {
    if (!current) return issue;
    const rank = getSentryLevelRank(issue.level);
    const currentRank = getSentryLevelRank(current.level);
    if (rank !== currentRank) return rank > currentRank ? issue : current;
    return getIssueLastSeenTime(issue) > getIssueLastSeenTime(current) ? issue : current;
  }, null);

  return highest?.level ?? null;
}

function getIssueLastSeenTime(issue: PortalSentryIssue): number {
  return parseIso(issue.lastSeen ?? issue.firstSeen ?? null);
}

function getIssueFirstSeenTime(issue: PortalSentryIssue): number {
  return parseIso(issue.firstSeen ?? issue.lastSeen ?? null);
}

function compareIsoDesc(a: string | null, b: string | null): number {
  return parseIso(b) - parseIso(a);
}

function maxIsoDate(values: Array<string | null | undefined>): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!value || !Number.isFinite(Date.parse(value))) return latest;
    if (!latest || Date.parse(value) > Date.parse(latest)) return value;
    return latest;
  }, null);
}

function parseIso(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
