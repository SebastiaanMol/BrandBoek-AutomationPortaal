import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  buildSentryIssueSummary,
  matchSentryIssuesToAutomations,
  type PortalSentryIssue,
  type SentryIssueMatch,
  type SentryIssueMatchResult,
} from "@/lib/sentryIssueMatching";
import type { Automatisering } from "@/lib/types";
import { fetchSentryIssues, type FetchSentryIssuesResult } from "../storage/sentryIssues";

export type AutomationSentryIssuesQueryResult = FetchSentryIssuesResult & {
  matches: SentryIssueMatchResult;
};

const emptySentryIssueMatchResult: SentryIssueMatchResult = {
  byAutomationId: {},
  summariesByAutomationId: {},
  unmatched: [],
};

const disabledAutomationSentryIssuesData: AutomationSentryIssuesQueryResult & { summary: undefined } = {
  issues: [],
  matches: emptySentryIssueMatchResult,
  summary: undefined,
  limited: false,
  fetchedAt: "",
};

interface UseAutomationSentryIssueOverviewOptions {
  enabled?: boolean;
}

export function useAutomationSentryIssueOverview(
  automations: Automatisering[],
  options: UseAutomationSentryIssueOverviewOptions = {},
) {
  const isEnabled = options.enabled ?? true;
  const query = useQuery({
    queryKey: ["sentryIssues", "overview"],
    queryFn: async (): Promise<FetchSentryIssuesResult> => fetchSentryIssues({ mode: "overview" }),
    enabled: isEnabled && automations.length > 0,
    staleTime: 60_000,
    retry: 1,
  });

  const data = useMemo<AutomationSentryIssuesQueryResult | undefined>(() => {
    if (!query.data) return undefined;
    return {
      ...query.data,
      matches: matchSentryIssuesToAutomations(query.data.issues, automations),
    };
  }, [automations, query.data]);

  return { ...query, data };
}

export function useAutomationSentryIssues(
  automation: Automatisering | null | undefined,
  automations: Automatisering[],
) {
  const matchingAutomation = automation ? automations.find((item) => item.id === automation.id) ?? null : null;
  const overviewQuery = useAutomationSentryIssueOverview(automations, {
    enabled: Boolean(matchingAutomation),
  });

  const detailQuery = useQuery({
    queryKey: ["sentryIssues", "detail", automation?.id],
    queryFn: async (): Promise<FetchSentryIssuesResult> => {
      if (!matchingAutomation) {
        throw new Error("Automation ontbreekt voor Sentry issues");
      }

      return fetchSentryIssues({ mode: "detail", automationId: matchingAutomation.id });
    },
    enabled: Boolean(matchingAutomation),
    staleTime: 60_000,
    retry: 1,
  });

  const data = useMemo<AutomationSentryIssuesQueryResult | undefined>(() => {
    if (!matchingAutomation) return disabledAutomationSentryIssuesData;
    if (!detailQuery.data) return undefined;

    const detailMatches = matchSentryIssuesToAutomations(
      detailQuery.data.issues,
      [matchingAutomation],
    ).byAutomationId[matchingAutomation.id] ?? [];
    const overviewMatches = overviewQuery.data?.matches.byAutomationId[matchingAutomation.id] ?? [];
    const matchesForAutomation = mergeSentryIssueMatches(detailMatches, overviewMatches);
    const matches: SentryIssueMatchResult = {
      byAutomationId: { [matchingAutomation.id]: matchesForAutomation },
      summariesByAutomationId: {
        [matchingAutomation.id]: buildSentryIssueSummary(matchesForAutomation),
      },
      unmatched: [],
    };

    return {
      issues: mergeSentryIssues(detailQuery.data.issues, overviewQuery.data?.issues ?? []),
      matches,
      limited: detailQuery.data.limited || Boolean(overviewQuery.data?.limited),
      fetchedAt: detailQuery.data.fetchedAt || overviewQuery.data?.fetchedAt || "",
    };
  }, [detailQuery.data, matchingAutomation, overviewQuery.data]);

  return {
    ...detailQuery,
    isLoading: detailQuery.isLoading || overviewQuery.isLoading,
    data,
  };
}

function mergeSentryIssueMatches(
  detailMatches: SentryIssueMatch[],
  overviewMatches: SentryIssueMatch[],
): SentryIssueMatch[] {
  const byIssueId = new Map<string, SentryIssueMatch>();

  for (const match of [...detailMatches, ...overviewMatches]) {
    const existing = byIssueId.get(match.issueId);
    if (!existing || getConfidenceRank(match) > getConfidenceRank(existing)) {
      byIssueId.set(match.issueId, match);
    }
  }

  return Array.from(byIssueId.values());
}

function mergeSentryIssues(detailIssues: PortalSentryIssue[], overviewIssues: PortalSentryIssue[]): PortalSentryIssue[] {
  const byIssueId = new Map<string, PortalSentryIssue>();

  for (const issue of [...detailIssues, ...overviewIssues]) {
    if (!byIssueId.has(issue.id)) {
      byIssueId.set(issue.id, issue);
    }
  }

  return Array.from(byIssueId.values());
}

function getConfidenceRank(match: SentryIssueMatch): number {
  if (match.confidence === "exact") return 3;
  if (match.confidence === "strong") return 2;
  return 1;
}
