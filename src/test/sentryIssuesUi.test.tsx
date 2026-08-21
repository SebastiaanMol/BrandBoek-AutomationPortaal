import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SentryIssuesCard } from "@/components/SentryIssuesCard";
import AutomationDetailPage from "@/pages/AutomationDetailPage";
import AutomationsPage from "@/pages/AutomationsPage";
import { SentryIssueBadge } from "@/pages/AlleAutomatiseringen";
import type { SentryIssueMatch } from "@/lib/sentryIssueMatching";
import type { Automatisering } from "@/lib/types";

const useAutomationSentryIssuesMock = vi.fn();
const useAutomationSentryIssueOverviewMock = vi.fn();
const useAutomatiseringenMock = vi.fn();
const useAutomationsMock = vi.fn();

vi.mock("@/lib/hooks", () => ({
  useAllConfirmedAutomationLinks: () => ({ data: [] }),
  useAutomationSentryIssueOverview: (...args: unknown[]) => useAutomationSentryIssueOverviewMock(...args),
  useAutomationSentryIssues: (...args: unknown[]) => useAutomationSentryIssuesMock(...args),
  useAutomatiseringen: () => useAutomatiseringenMock(),
  useAutomatiseringenIncludingLegacyGitlab: () => useAutomationsMock(),
  useFlows: () => ({ data: [] }),
  useFlowSuggesties: () => ({ data: [] }),
  usePipelines: () => ({ data: [] }),
  usePortalSettings: () => ({ data: null }),
  useSetCleanupDeleteCandidate: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function makeMatch(overrides: Partial<SentryIssueMatch> = {}): SentryIssueMatch {
  return {
    issueId: "123",
    confidence: "strong",
    reason: "source identifier",
    issue: {
      id: "123",
      shortId: "AUTOMATIONS-1",
      title: "BTW pipeline failed",
      culprit: "btw_pipeline.py",
      level: "error",
      status: "unresolved",
      count: 4,
      userCount: 2,
      firstSeen: "2026-06-17T10:00:00.000Z",
      lastSeen: "2026-06-18T10:00:00.000Z",
      permalink: "https://brand-boekhouders.sentry.io/issues/123/",
      metadataText: "raw stack trace SECRET_TOKEN request payload",
      tags: { request_body: "dsn=https://example.invalid/1" },
    },
    ...overrides,
  };
}

function makeAutomation(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "AUTO-1",
    naam: "BTW automation",
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

describe("SentryIssuesCard", () => {
  it("shows a loading read attempt state", () => {
    render(<SentryIssuesCard isLoading error={null} matches={[]} limited={false} />);

    expect(screen.getByText("Sentry issues worden opgehaald")).toBeInTheDocument();
  });

  it("shows empty read-only state", () => {
    render(<SentryIssuesCard isLoading={false} error={null} matches={[]} limited={false} />);

    expect(screen.getByText("Geen gekoppelde Sentry issues")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resolve|archive|delete/i })).not.toBeInTheDocument();
  });

  it("shows a non-sensitive error state", () => {
    render(<SentryIssuesCard isLoading={false} error={new Error("SENTRY_AUTH_TOKEN=secret")} matches={[]} limited={false} />);

    expect(screen.getByText("Sentry issues niet beschikbaar")).toBeInTheDocument();
    expect(screen.queryByText(/secret|SENTRY_AUTH_TOKEN/i)).not.toBeInTheDocument();
  });

  it("orders matched issues by severity, count, and recentness", () => {
    render(
      <SentryIssuesCard
        isLoading={false}
        error={null}
        limited={false}
        matches={[
          makeMatch({
            issueId: "old-warning",
            issue: { ...makeMatch().issue, id: "old-warning", title: "Old warning", level: "warning", count: 99, lastSeen: "2026-06-19T10:00:00.000Z" },
          }),
          makeMatch({
            issueId: "recent-error",
            issue: { ...makeMatch().issue, id: "recent-error", title: "Recent error", level: "error", count: 2, lastSeen: "2026-06-19T11:00:00.000Z" },
          }),
          makeMatch({
            issueId: "busy-error",
            issue: { ...makeMatch().issue, id: "busy-error", title: "Busy error", level: "error", count: 20, lastSeen: "2026-06-18T11:00:00.000Z" },
          }),
        ]}
      />,
    );

    const rows = screen.getAllByRole("article");
    expect(within(rows[0]).getByText("Busy error")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Recent error")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Old warning")).toBeInTheDocument();
  });

  it("shows linked issue fields and an external Sentry link without raw metadata", () => {
    render(<SentryIssuesCard isLoading={false} error={null} matches={[makeMatch()]} limited={false} />);

    expect(screen.getByText("BTW pipeline failed")).toBeInTheDocument();
    expect(screen.getByText("error")).toBeInTheDocument();
    expect(screen.getByText("unresolved")).toBeInTheDocument();
    expect(screen.getByText("4 events")).toBeInTheDocument();
    expect(screen.getByText("2 users")).toBeInTheDocument();
    expect(screen.getByText(/Laatst gezien 18 jun 2026/)).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /open in sentry/i });
    expect(link).toHaveAttribute("href", "https://brand-boekhouders.sentry.io/issues/123/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));

    expect(document.body.textContent).not.toMatch(/raw stack trace|request payload|SECRET_TOKEN|dsn=/i);
  });

  it.each([
    ["malformed", "not a url"],
    ["javascript", "javascript:alert(1)"],
    ["non-Sentry", "https://example.com/issues/123/"],
    ["http", "http://brand-boekhouders.sentry.io/issues/123/"],
  ])("does not render an external link for %s issue permalinks", (_caseName, permalink) => {
    render(
      <SentryIssuesCard
        isLoading={false}
        error={null}
        matches={[makeMatch({ issue: { ...makeMatch().issue, permalink } })]}
        limited={false}
      />,
    );

    expect(screen.getByText("BTW pipeline failed")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open in sentry/i })).not.toBeInTheDocument();
  });

  it("shows possible matches separately", () => {
    render(
      <SentryIssuesCard
        isLoading={false}
        error={null}
        matches={[makeMatch({ confidence: "possible", reason: "automation name" })]}
        limited={false}
      />,
    );

    expect(screen.getByText("Mogelijke matches")).toBeInTheDocument();
    expect(screen.getByText(/automation name/)).toBeInTheDocument();
  });

  it("shows match confidence and reason for every issue", () => {
    render(
      <SentryIssuesCard
        isLoading={false}
        error={null}
        limited={false}
        matches={[
          makeMatch({ issueId: "exact", confidence: "exact", reason: "automation_id tag", issue: { ...makeMatch().issue, id: "exact", title: "Exact issue" } }),
          makeMatch({ issueId: "strong", confidence: "strong", reason: "source identifier", issue: { ...makeMatch().issue, id: "strong", title: "Strong issue" } }),
          makeMatch({ issueId: "possible", confidence: "possible", reason: "automation name", issue: { ...makeMatch().issue, id: "possible", title: "Possible issue" } }),
        ]}
      />,
    );

    expect(screen.getByText(/Match: exact - automation_id tag/)).toBeInTheDocument();
    expect(screen.getByText(/Match: strong - source identifier/)).toBeInTheDocument();
    expect(screen.getByText(/Match: possible - automation name/)).toBeInTheDocument();
  });

  it("collapses and expands the complete Sentry issue overview", () => {
    render(
      <SentryIssuesCard
        isLoading={false}
        error={null}
        limited={false}
        matches={[
          makeMatch({ issueId: "one", issue: { ...makeMatch().issue, id: "one", title: "First linked issue" } }),
          makeMatch({ issueId: "two", issue: { ...makeMatch().issue, id: "two", title: "Second linked issue" } }),
        ]}
      />,
    );

    expect(screen.getByText("First linked issue")).toBeInTheDocument();
    expect(screen.getByText("Second linked issue")).toBeInTheDocument();
    expect(screen.getByText("2 issues")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sentry issues inklappen/i }));

    expect(screen.queryByText("First linked issue")).not.toBeInTheDocument();
    expect(screen.queryByText("Second linked issue")).not.toBeInTheDocument();
    expect(screen.getByText("2 issues")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sentry issues" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /sentry issues uitklappen/i }));

    expect(screen.getByText("First linked issue")).toBeInTheDocument();
    expect(screen.getByText("Second linked issue")).toBeInTheDocument();
  });
});

describe("AutomationDetailPage Sentry card", () => {
  beforeEach(() => {
    useAutomationSentryIssuesMock.mockReset();
    useAutomatiseringenMock.mockReset();
    useAutomationsMock.mockReset();
  });

  it("reads Sentry issues for the current automation and renders the detail card", () => {
    const automation = makeAutomation({ id: "AUTO-CURRENT" });
    const otherAutomation = makeAutomation({ id: "AUTO-OTHER", naam: "Other" });
    useAutomationsMock.mockReturnValue({ data: [automation, otherAutomation], isLoading: false });
    useAutomatiseringenMock.mockReturnValue({ data: [automation], isLoading: false });
    useAutomationSentryIssuesMock.mockReturnValue({
      isLoading: false,
      error: null,
      data: {
        limited: false,
        matches: {
          byAutomationId: {
            "AUTO-CURRENT": [
              makeMatch({ issueId: "exact", confidence: "exact", reason: "automation_id tag", issue: { ...makeMatch().issue, id: "exact", title: "Exact detail issue" } }),
              makeMatch({ issueId: "strong", confidence: "strong", reason: "source identifier", issue: { ...makeMatch().issue, id: "strong", title: "Strong overview issue" } }),
              makeMatch({ issueId: "possible", confidence: "possible", reason: "automation name", issue: { ...makeMatch().issue, id: "possible", title: "Possible overview issue" } }),
            ],
          },
          summariesByAutomationId: {},
          unmatched: [],
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/automations/AUTO-CURRENT"]}>
        <Routes>
          <Route path="/automations/:id" element={<AutomationDetailPage />} />
          <Route path="/alle" element={<div>Automations</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(useAutomationSentryIssuesMock).toHaveBeenCalledWith(automation, [automation]);
    expect(screen.getByRole("region", { name: "Sentry issues" })).toBeInTheDocument();
    expect(screen.getByText("Exact detail issue")).toBeInTheDocument();
    expect(screen.getByText("Strong overview issue")).toBeInTheDocument();
    expect(screen.getByText("Possible overview issue")).toBeInTheDocument();
  });
});

describe("SentryIssueBadge", () => {
  it("shows linked issue count", () => {
    render(<SentryIssueBadge linkedIssueCount={2} possibleIssueCount={0} />);

    expect(screen.getByText("2 Sentry")).toBeInTheDocument();
  });

  it("shows a possible match when no linked issues exist", () => {
    render(<SentryIssueBadge linkedIssueCount={0} possibleIssueCount={1} />);

    expect(screen.getByText("Mogelijke Sentry match")).toBeInTheDocument();
  });

  it("renders nothing when no issue signal exists", () => {
    const { container } = render(<SentryIssueBadge linkedIssueCount={0} possibleIssueCount={0} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("AutomationsPage Sentry overview", () => {
  beforeEach(() => {
    useAutomatiseringenMock.mockReset();
    useAutomationSentryIssueOverviewMock.mockReset();
  });

  it("shows the aggregate linked Sentry issue count", () => {
    const automations = [
      makeAutomation({ id: "AUTO-1", status: "Actief" }),
      makeAutomation({ id: "AUTO-2", status: "Actief" }),
    ];
    useAutomatiseringenMock.mockReturnValue({ data: automations });
    useAutomationSentryIssueOverviewMock.mockReturnValue({
      data: {
        matches: {
          summariesByAutomationId: {
            "AUTO-1": { linkedIssueCount: 2, possibleIssueCount: 0, eventCount: 7, latestSeen: null },
            "AUTO-2": { linkedIssueCount: 1, possibleIssueCount: 1, eventCount: 3, latestSeen: null },
          },
        },
      },
    });

    render(
      <MemoryRouter>
        <AutomationsPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("3 Sentry issues")).toBeInTheDocument();
    expect(useAutomationSentryIssueOverviewMock).toHaveBeenCalledWith(automations);
  });
});
