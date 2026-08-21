import { createElement } from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Dashboard from "@/pages/Dashboard";
import type { PortalSentryIssue } from "@/lib/sentryIssueMatching";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type { Automatisering, Pipeline } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  useAutomatiseringen: vi.fn(),
  usePortalSettings: vi.fn(),
  useFlows: vi.fn(),
  usePipelines: vi.fn(),
  useFlowSuggesties: vi.fn(),
  useAllConfirmedAutomationLinks: vi.fn(),
  useAutomationSentryIssueOverview: vi.fn(),
}));

vi.mock("@/lib/queryHooks/automations", () => ({
  useAutomatiseringen: () => mocks.useAutomatiseringen(),
}));

vi.mock("@/lib/queryHooks/portalSettings", () => ({
  usePortalSettings: () => mocks.usePortalSettings(),
}));

vi.mock("@/lib/queryHooks/flows", () => ({
  useFlows: () => mocks.useFlows(),
}));

vi.mock("@/lib/queryHooks/pipelines", () => ({
  usePipelines: () => mocks.usePipelines(),
}));

vi.mock("@/lib/queryHooks/automationLinks", () => ({
  useFlowSuggesties: () => mocks.useFlowSuggesties(),
  useAllConfirmedAutomationLinks: () => mocks.useAllConfirmedAutomationLinks(),
}));

vi.mock("@/lib/queryHooks/sentryIssues", () => ({
  useAutomationSentryIssueOverview: (...args: unknown[]) => mocks.useAutomationSentryIssueOverview(...args),
}));

function automation(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "AUTO-1",
    naam: "BTW pipeline",
    categorie: "Backend Script",
    doel: "Doel",
    trigger: "Trigger",
    systemen: ["Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "Team",
    status: "Actief",
    verbeterideeen: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    laatstGeverifieerd: "2026-06-01T00:00:00.000Z",
    geverifieerdDoor: "Tester",
    ...overrides,
  } as Automatisering;
}

function sentryIssue(overrides: Partial<PortalSentryIssue> = {}): PortalSentryIssue {
  return {
    id: "issue-1",
    shortId: "AUTOMATIONS-1",
    title: "BTW pipeline crashed",
    level: "error",
    status: "unresolved",
    count: 4,
    firstSeen: "2026-06-18T09:00:00.000Z",
    lastSeen: "2026-06-18T10:00:00.000Z",
    permalink: "https://brand-boekhouders.sentry.io/issues/1/",
    tags: {},
    ...overrides,
  };
}

function suggestion(overrides: Partial<FlowSuggestie> = {}): FlowSuggestie {
  return {
    fromId: "AUTO-1",
    toId: "AUTO-2",
    fromNaam: "BTW pipeline",
    toNaam: "Aangifte mail",
    fromCategorie: "Backend Script",
    toCategorie: "E-mail",
    fromSource: null,
    toSource: null,
    zekerheid: "webhook",
    redenering: "Webhook-match",
    confirmed: false,
    rejected: false,
    ...overrides,
  };
}

function pipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    pipelineId: "pipeline-1",
    naam: "BTW",
    stages: [],
    syncedAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "custom",
    ...overrides,
  };
}

function renderDashboard() {
  return render(createElement(MemoryRouter, null, createElement(Dashboard)));
}

describe("Dashboard Control Center", () => {
  beforeEach(() => {
    mocks.useAutomatiseringen.mockReturnValue({ data: [], isLoading: false });
    mocks.usePortalSettings.mockReturnValue({ data: { verificatiePeriodeDagen: 90 } });
    mocks.useFlows.mockReturnValue({ data: [] });
    mocks.usePipelines.mockReturnValue({ data: [] });
    mocks.useFlowSuggesties.mockReturnValue({ data: [] });
    mocks.useAllConfirmedAutomationLinks.mockReturnValue({ data: [] });
    mocks.useAutomationSentryIssueOverview.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
  });

  it("renders the control-center KPI cards", () => {
    renderDashboard();

    expect(screen.getByText("Control Center")).toBeInTheDocument();
    expect(screen.getByText("Open Sentry issues")).toBeInTheDocument();
    expect(screen.getByText("Affected automations")).toBeInTheDocument();
    expect(screen.getByText("Unmatched Sentry")).toBeInTheDocument();
    expect(screen.getAllByText("Source warnings").length).toBeGreaterThan(0);
    expect(screen.getByText("Overdue verificatie")).toBeInTheDocument();
    expect(screen.getAllByText("Flow-suggesties").length).toBeGreaterThan(0);
  });

  it("shows linked Sentry automation rows and unmatched issue rows with safe links", () => {
    const automationWithIssue = automation({ id: "AUTO-1", naam: "BTW pipeline" });
    const linkedIssue = sentryIssue({
      id: "linked",
      title: "BTW pipeline crashed",
      count: 12,
      tags: { automation_id: "AUTO-1" },
      permalink: "https://brand-boekhouders.sentry.io/issues/linked/",
    });
    const unmatchedIssue = sentryIssue({
      id: "unmatched",
      title: "Unknown cron failed",
      count: 3,
      permalink: "https://brand-boekhouders.sentry.io/issues/unmatched/",
    });

    mocks.useAutomatiseringen.mockReturnValue({ data: [automationWithIssue], isLoading: false });
    mocks.useAutomationSentryIssueOverview.mockReturnValue({
      data: {
        issues: [linkedIssue, unmatchedIssue],
        limited: false,
        fetchedAt: "2026-06-18T10:00:00.000Z",
        matches: {
          byAutomationId: {
            "AUTO-1": [{ issueId: "linked", issue: linkedIssue, confidence: "exact", reason: "automation_id tag" }],
          },
          summariesByAutomationId: {
            "AUTO-1": { linkedIssueCount: 1, possibleIssueCount: 0, eventCount: 12, latestSeen: linkedIssue.lastSeen },
          },
          unmatched: [unmatchedIssue],
        },
      },
      isLoading: false,
      error: null,
    });

    renderDashboard();

    const automationLink = screen
      .getAllByRole("link", { name: /BTW pipeline/i })
      .find((link) => link.getAttribute("href") === "/automations/AUTO-1");
    expect(automationLink).toBeDefined();
    expect(automationLink).toHaveAttribute("href", "/automations/AUTO-1");
    expect(screen.getByText("12 events")).toBeInTheDocument();

    const sentryLink = screen.getByRole("link", { name: /Unknown cron failed/i });
    expect(sentryLink).toHaveAttribute("href", "https://brand-boekhouders.sentry.io/issues/unmatched/");
    expect(sentryLink).toHaveAttribute("target", "_blank");
    expect(sentryLink).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("shows richer Sentry incident timing and user insights on the dashboard", () => {
    const automationWithIssue = automation({ id: "AUTO-1", naam: "BTW pipeline" });
    const linkedIssue = sentryIssue({
      id: "linked",
      shortId: "AUTOMATIONS-123",
      title: "BTW pipeline crashed",
      level: "fatal",
      status: "unresolved",
      count: 12,
      userCount: 5,
      firstSeen: "2026-06-18T09:01:02.000Z",
      lastSeen: "2026-06-18T10:15:30.000Z",
      tags: { automation_id: "AUTO-1" },
      metadataText: "SENTRY_AUTH_TOKEN=secret should stay hidden",
    });
    const unmatchedIssue = sentryIssue({
      id: "unmatched",
      shortId: "AUTOMATIONS-999",
      title: "Unknown cron failed",
      level: "warning",
      count: 3,
      userCount: 2,
      firstSeen: "2026-06-10T07:00:00.000Z",
      lastSeen: "2026-06-11T08:00:00.000Z",
    });

    mocks.useAutomatiseringen.mockReturnValue({ data: [automationWithIssue], isLoading: false });
    mocks.useAutomationSentryIssueOverview.mockReturnValue({
      data: {
        issues: [linkedIssue, unmatchedIssue],
        limited: false,
        fetchedAt: "2026-06-18T10:30:45.000Z",
        matches: {
          byAutomationId: {
            "AUTO-1": [{ issueId: "linked", issue: linkedIssue, confidence: "exact", reason: "automation_id tag" }],
          },
          summariesByAutomationId: {
            "AUTO-1": { linkedIssueCount: 1, possibleIssueCount: 0, eventCount: 12, latestSeen: linkedIssue.lastSeen },
          },
          unmatched: [unmatchedIssue],
        },
      },
      isLoading: false,
      error: null,
    });

    renderDashboard();

    expect(screen.getByText("Sentry incidenten")).toBeInTheDocument();
    expect(screen.getByText("Nieuwste fout")).toBeInTheDocument();
    expect(screen.getByText(/BTW pipeline crashed/)).toBeInTheDocument();
    expect(screen.getAllByText(/18 jun 2026.*12:15:30/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/18 jun 2026.*11:01:02/).length).toBeGreaterThan(0);
    expect(screen.getByText("Hoogste severity")).toBeInTheDocument();
    expect(screen.getAllByText("fatal").length).toBeGreaterThan(0);
    expect(screen.getByText("7 users")).toBeInTheDocument();
    expect(screen.getByText(/Opgehaald.*12:30:45/)).toBeInTheDocument();
    expect(screen.getByText(/Match: exact/)).toBeInTheDocument();
    expect(screen.getAllByText(/Users: 5/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Users: 2/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/SENTRY_AUTH_TOKEN|secret/i);
  });

  it("limits dashboard Sentry cards to four visible rows and shows a remaining count", () => {
    const automations = Array.from({ length: 5 }, (_, index) =>
      automation({ id: `AUTO-${index + 1}`, naam: `Automation ${index + 1}` }),
    );
    const linkedIssues = automations.map((item, index) =>
      sentryIssue({
        id: `linked-${index + 1}`,
        shortId: `AUTOMATIONS-${index + 1}`,
        title: `Linked issue ${index + 1}`,
        count: 100 - index,
        lastSeen: `2026-06-${18 - index}T10:00:00.000Z`,
        tags: { automation_id: item.id },
      }),
    );
    const unmatchedIssues = Array.from({ length: 5 }, (_, index) =>
      sentryIssue({
        id: `unmatched-${index + 1}`,
        shortId: `UNMATCHED-${index + 1}`,
        title: `Unmatched issue ${index + 1}`,
        count: 50 - index,
        lastSeen: `2026-06-${18 - index}T09:00:00.000Z`,
      }),
    );

    mocks.useAutomatiseringen.mockReturnValue({ data: automations, isLoading: false });
    mocks.useAllConfirmedAutomationLinks.mockReturnValue({
      data: automations.map((item) => ({ sourceId: item.id, targetId: "CONFIRMED-TARGET", matchType: "test" })),
    });
    mocks.useAutomationSentryIssueOverview.mockReturnValue({
      data: {
        issues: [...linkedIssues, ...unmatchedIssues],
        limited: false,
        fetchedAt: "2026-06-18T10:30:45.000Z",
        matches: {
          byAutomationId: Object.fromEntries(
            automations.map((item, index) => [
              item.id,
              [{ issueId: linkedIssues[index].id, issue: linkedIssues[index], confidence: "exact", reason: "automation_id tag" }],
            ]),
          ),
          summariesByAutomationId: Object.fromEntries(
            automations.map((item, index) => [
              item.id,
              { linkedIssueCount: 1, possibleIssueCount: 0, eventCount: linkedIssues[index].count, latestSeen: linkedIssues[index].lastSeen },
            ]),
          ),
          unmatched: unmatchedIssues,
        },
      },
      isLoading: false,
      error: null,
    });

    renderDashboard();

    expect(screen.getByText("Automation 1")).toBeInTheDocument();
    expect(screen.getByText("Automation 4")).toBeInTheDocument();
    expect(screen.queryByText("Automation 5")).not.toBeInTheDocument();
    expect(screen.getByText("+ 1 automation met Sentry errors niet getoond")).toBeInTheDocument();

    expect(screen.getByText("Unmatched issue 1")).toBeInTheDocument();
    expect(screen.getByText("Unmatched issue 4")).toBeInTheDocument();
    expect(screen.queryByText("Unmatched issue 5")).not.toBeInTheDocument();
    expect(screen.getByText("+ 1 ongekoppelde Sentry issue niet getoond")).toBeInTheDocument();
  });

  it("links work queues to automations, flows, pipelines, and the automation overview", () => {
    mocks.useAutomatiseringen.mockReturnValue({
      data: [
        automation({
          id: "AUTO-WARN",
          naam: "Warning automation",
          laatstGeverifieerd: null,
          sourceFindings: [
            {
              id: "finding-1",
              automationId: "AUTO-WARN",
              source: "gitlab",
              type: "source_changed",
              severity: "critical",
              message: "Webhook changed",
              firstSeenAt: "2026-06-21T00:00:00.000Z",
              lastSeenAt: "2026-06-21T00:00:00.000Z",
            },
          ],
        }),
      ],
      isLoading: false,
    });
    mocks.useFlowSuggesties.mockReturnValue({ data: [suggestion()] });
    mocks.usePipelines.mockReturnValue({ data: [pipeline()] });

    renderDashboard();

    expect(screen.getByRole("link", { name: /Webhook changed/i })).toHaveAttribute("href", "/automations/AUTO-WARN");
    expect(screen.getAllByRole("link", { name: /Alles controleren/i })[0]).toHaveAttribute("href", "/alle");
    expect(screen.getByRole("link", { name: /BTW pipeline naar Aangifte mail/i })).toHaveAttribute("href", "/flows");
    expect(screen.getByRole("link", { name: /Pipelines bekijken/i })).toHaveAttribute("href", "/pipelines");
    expect(screen.getByRole("link", { name: /Zonder koppeling/i })).toHaveAttribute("href", "/procesviewer");
  });

  it("shows loading state while automations or Sentry overview are loading", () => {
    mocks.useAutomatiseringen.mockReturnValue({ data: undefined, isLoading: true });
    const loadingRender = renderDashboard();
    expect(loadingRender.container.querySelector(".animate-spin")).toBeInTheDocument();

    loadingRender.unmount();
    mocks.useAutomatiseringen.mockReturnValue({ data: [automation()], isLoading: false });
    mocks.useAutomationSentryIssueOverview.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderDashboard();
    expect(screen.getByText("Sentry issues worden gelezen")).toBeInTheDocument();
  });

  it("shows non-sensitive unavailable and empty states", () => {
    mocks.useAutomationSentryIssueOverview.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("SENTRY_AUTH_TOKEN=secret upstream body"),
    });

    renderDashboard();

    expect(screen.getByText("Sentry issues niet beschikbaar")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/secret|SENTRY_AUTH_TOKEN|upstream body/i);
    expect(screen.getAllByText("Geen open Sentry issues gevonden").length).toBeGreaterThan(0);
    expect(screen.getByText("Geen source warnings")).toBeInTheDocument();
    expect(screen.getByText("Alles recent geverifieerd")).toBeInTheDocument();
    expect(screen.getByText("Geen flow-suggesties open")).toBeInTheDocument();

    const health = screen.getByRole("region", { name: "System process health" });
    expect(within(health).getAllByText("0").length).toBeGreaterThan(0);
  });
});
