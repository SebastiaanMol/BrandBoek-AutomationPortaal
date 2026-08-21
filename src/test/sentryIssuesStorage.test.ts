import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import type { Automatisering } from "@/lib/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

function createAutomation(id: string, naam = id): Automatisering {
  return {
    id,
    naam,
    categorie: "API",
    doel: "",
    trigger: "",
    systemen: ["API"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-06-19T08:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createQueryWrapper(queryClient = createQueryClient()) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("sentry issues storage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("fetches overview issues with the default overview body", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        issues: [
          {
            id: "issue-1",
            title: "Unhandled error",
            status: "unresolved",
            count: 3,
            permalink: "https://sentry.example/issues/1",
          },
        ],
        limited: true,
        fetchedAt: "2026-06-19T08:00:00.000Z",
      },
      error: null,
    });
    const { fetchSentryIssues } = await import("@/lib/storage/sentryIssues");

    const result = await fetchSentryIssues({ mode: "overview" });

    expect(invokeMock).toHaveBeenCalledWith("sentry-issues", {
      body: { mode: "overview", limit: 100 },
    });
    expect(result).toEqual({
      issues: [
        {
          id: "issue-1",
          title: "Unhandled error",
          status: "unresolved",
          count: 3,
          permalink: "https://sentry.example/issues/1",
        },
      ],
      limited: true,
      fetchedAt: "2026-06-19T08:00:00.000Z",
    });
  });

  it("fetches detail issues with the default detail body", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        issues: [],
        limited: false,
        fetchedAt: "2026-06-19T08:05:00.000Z",
      },
      error: null,
    });
    const { fetchSentryIssues } = await import("@/lib/storage/sentryIssues");

    await fetchSentryIssues({ mode: "detail", automationId: "AUTO-1" });

    expect(invokeMock).toHaveBeenCalledWith("sentry-issues", {
      body: { mode: "detail", automationId: "AUTO-1", limit: 25 },
    });
  });

  it("throws a readable error when the function fails", async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { error: "Sentry is not configured" },
      },
    });
    const { fetchSentryIssues } = await import("@/lib/storage/sentryIssues");

    await expect(fetchSentryIssues({ mode: "overview" })).rejects.toThrow("Sentry is not configured");
  });

  it("returns safe defaults when the function returns an empty payload", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: null });
    const { fetchSentryIssues } = await import("@/lib/storage/sentryIssues");

    const result = await fetchSentryIssues({ mode: "overview" });

    expect(result).toEqual({
      issues: [],
      limited: false,
      fetchedAt: expect.any(String),
    });
  });

  it("drops malformed issue entries from function responses", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        issues: [
          null,
          { id: 123 },
          {
            id: "issue-1",
            title: "Unhandled error",
            status: "unresolved",
            count: 3,
            permalink: "https://sentry.example/issues/1",
          },
        ],
      },
      error: null,
    });
    const { fetchSentryIssues } = await import("@/lib/storage/sentryIssues");

    const result = await fetchSentryIssues({ mode: "overview" });

    expect(result.issues).toEqual([
      {
        id: "issue-1",
        title: "Unhandled error",
        status: "unresolved",
        count: 3,
        permalink: "https://sentry.example/issues/1",
      },
    ]);
  });

  it("keeps detail issues disabled when the selected automation is absent from the input automations", async () => {
    const { useAutomationSentryIssues } = await import("@/lib/queryHooks/sentryIssues");

    const { result } = renderHook(
      () => useAutomationSentryIssues(createAutomation("AUTO-1"), [createAutomation("AUTO-2")]),
      { wrapper: createQueryWrapper() },
    );

    expect(result.current.fetchStatus).toBe("idle");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("returns safe detail defaults instead of cached issues when the selected automation is absent", async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(["sentryIssues", "detail", "AUTO-1"], {
      issues: [
        {
          id: "issue-1",
          title: "Cached automation failure",
          status: "unresolved",
          count: 2,
          permalink: "https://sentry.example/issues/1",
        },
      ],
      matches: {
        byAutomationId: { "AUTO-1": [{ issueId: "issue-1", matchType: "tag" }] },
        summariesByAutomationId: {
          "AUTO-1": {
            linkedIssueCount: 1,
            possibleIssueCount: 0,
            eventCount: 2,
            latestSeen: "2026-06-19T08:05:00.000Z",
          },
        },
        unmatched: [],
      },
      limited: true,
      summary: {
        linkedIssueCount: 1,
        possibleIssueCount: 0,
        eventCount: 2,
        latestSeen: "2026-06-19T08:05:00.000Z",
      },
      fetchedAt: "2026-06-19T08:05:00.000Z",
    });
    const { useAutomationSentryIssues } = await import("@/lib/queryHooks/sentryIssues");

    const { result } = renderHook(
      () => useAutomationSentryIssues(createAutomation("AUTO-1"), [createAutomation("AUTO-2")]),
      { wrapper: createQueryWrapper(queryClient) },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toEqual({
      issues: [],
      matches: {
        byAutomationId: {},
        summariesByAutomationId: {},
        unmatched: [],
      },
      summary: undefined,
      limited: false,
      fetchedAt: "",
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("scopes detail issue matches to the selected automation", async () => {
    invokeMock.mockImplementation(async (_functionName, options) => {
      const body = options?.body as { mode?: string } | undefined;
      if (body?.mode === "overview") {
        return {
          data: {
            issues: [],
            limited: false,
            fetchedAt: "2026-06-19T08:00:00.000Z",
          },
          error: null,
        };
      }

      return {
        data: {
          issues: [
            {
              id: "issue-2",
              title: "Other automation failed",
              status: "unresolved",
              count: 4,
              permalink: "https://sentry.example/issues/2",
              tags: { automation_id: "AUTO-2" },
            },
          ],
          limited: false,
          fetchedAt: "2026-06-19T08:00:01.000Z",
        },
        error: null,
      };
    });
    const { useAutomationSentryIssues } = await import("@/lib/queryHooks/sentryIssues");

    const selectedAutomation = createAutomation("AUTO-1");
    const { result } = renderHook(
      () => useAutomationSentryIssues(selectedAutomation, [selectedAutomation, createAutomation("AUTO-2")]),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(Object.keys(result.current.data?.matches.byAutomationId ?? {})).toEqual(["AUTO-1"]);
    expect(result.current.data?.matches.byAutomationId["AUTO-1"]).toEqual([]);
    expect(result.current.data?.matches.summariesByAutomationId["AUTO-1"]).toEqual({
      linkedIssueCount: 0,
      possibleIssueCount: 0,
      eventCount: 0,
      latestSeen: null,
    });
    expect(result.current.data?.matches.unmatched).toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith("sentry-issues", {
      body: { mode: "detail", automationId: "AUTO-1", limit: 25 },
    });
    expect(invokeMock).toHaveBeenCalledWith("sentry-issues", {
      body: { mode: "overview", limit: 100 },
    });
  });
});
