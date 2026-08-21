import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAutomationSentryIssues } from "@/lib/queryHooks/sentryIssues";
import { fetchSentryIssues } from "@/lib/storage/sentryIssues";
import type { PortalSentryIssue } from "@/lib/sentryIssueMatching";
import type { Automatisering } from "@/lib/types";

vi.mock("@/lib/storage/sentryIssues", () => ({
  fetchSentryIssues: vi.fn(),
}));

const fetchSentryIssuesMock = vi.mocked(fetchSentryIssues);

function makeAutomation(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "AUTO-1",
    naam: "BTW automation",
    externalId: "WF-42",
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-05-22T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  } as Automatisering;
}

function makeIssue(overrides: Partial<PortalSentryIssue> = {}): PortalSentryIssue {
  return {
    id: "issue-1",
    shortId: "AUTOMATIONS-1",
    title: "Issue",
    level: "error",
    status: "unresolved",
    count: 1,
    firstSeen: "2026-06-17T10:00:00.000Z",
    lastSeen: "2026-06-18T10:00:00.000Z",
    permalink: "https://brand-boekhouders.sentry.io/issues/1/",
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAutomationSentryIssues", () => {
  beforeEach(() => {
    fetchSentryIssuesMock.mockReset();
  });

  it("combines strict detail reads with overview matches for exact, strong, and possible detail issues", async () => {
    const automation = makeAutomation();
    const exactIssue = makeIssue({
      id: "exact",
      title: "Exact detail issue",
      tags: { automation_id: "AUTO-1" },
    });
    const strongIssue = makeIssue({
      id: "strong",
      title: "Workflow WF-42 failed",
    });
    const possibleIssue = makeIssue({
      id: "possible",
      title: "BTW automation failed overnight",
    });

    fetchSentryIssuesMock.mockImplementation(async (input) => {
      if (input.mode === "detail") {
        return {
          issues: [exactIssue],
          limited: false,
          fetchedAt: "2026-06-19T08:00:00.000Z",
        };
      }

      return {
        issues: [exactIssue, strongIssue, possibleIssue],
        limited: false,
        fetchedAt: "2026-06-19T08:00:01.000Z",
      };
    });

    const { result } = renderHook(
      () => useAutomationSentryIssues(automation, [automation]),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data?.matches.byAutomationId["AUTO-1"]?.map((match) => match.confidence)).toEqual([
        "exact",
        "strong",
        "possible",
      ]);
    });

    expect(fetchSentryIssuesMock).toHaveBeenCalledWith({ mode: "detail", automationId: "AUTO-1" });
    expect(fetchSentryIssuesMock).toHaveBeenCalledWith({ mode: "overview" });
    expect(result.current.data?.matches.byAutomationId["AUTO-1"]?.map((match) => match.issueId)).toEqual([
      "exact",
      "strong",
      "possible",
    ]);
  });

  it("shows overview matches on the detail page when the strict detail tag query returns no issues", async () => {
    const automation = makeAutomation();
    const overviewIssue = makeIssue({
      id: "overview-only",
      title: "Workflow WF-42 failed",
    });

    fetchSentryIssuesMock.mockImplementation(async (input) => {
      if (input.mode === "detail") {
        return {
          issues: [],
          limited: false,
          fetchedAt: "2026-06-19T08:00:00.000Z",
        };
      }

      return {
        issues: [overviewIssue],
        limited: false,
        fetchedAt: "2026-06-19T08:00:01.000Z",
      };
    });

    const { result } = renderHook(
      () => useAutomationSentryIssues(automation, [automation]),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data?.matches.byAutomationId["AUTO-1"]?.map((match) => match.issueId)).toEqual([
        "overview-only",
      ]);
    });
  });
});
