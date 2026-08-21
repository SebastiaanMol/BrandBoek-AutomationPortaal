import { describe, expect, it } from "vitest";

import {
  buildDashboardControlCenterModel,
  type DashboardControlCenterInput,
} from "@/lib/dashboardControlCenter";
import type { PortalSentryIssue } from "@/lib/sentryIssueMatching";
import type { FlowSuggestie } from "@/lib/storage/automationLinks";
import type { Automatisering, Pipeline } from "@/lib/types";

function automation(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "auto-1",
    naam: "BTW aangifte",
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
    createdAt: "2026-01-01T00:00:00.000Z",
    laatstGeverifieerd: "2026-06-01T00:00:00.000Z",
    geverifieerdDoor: "Tester",
    ...overrides,
  } as Automatisering;
}

function sentryIssue(overrides: Partial<PortalSentryIssue> = {}): PortalSentryIssue {
  return {
    id: "issue-1",
    shortId: "AUTO-1",
    title: "Automation failed",
    level: "error",
    status: "unresolved",
    count: 1,
    lastSeen: "2026-06-18T10:00:00.000Z",
    firstSeen: "2026-06-18T09:00:00.000Z",
    permalink: "https://brand-boekhouders.sentry.io/issues/1/",
    tags: {},
    ...overrides,
  };
}

function suggestion(overrides: Partial<FlowSuggestie> = {}): FlowSuggestie {
  return {
    fromId: "auto-1",
    toId: "auto-2",
    fromNaam: "A",
    toNaam: "B",
    fromCategorie: "Backend Script",
    toCategorie: "Zapier Zap",
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
    naam: "Sales",
    stages: [],
    syncedAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "custom",
    ...overrides,
  };
}

function build(input: Partial<DashboardControlCenterInput> = {}) {
  return buildDashboardControlCenterModel({
    automations: [],
    flows: [],
    pipelines: [],
    suggestions: [],
    confirmedLinks: [],
    sentry: undefined,
    periodeDagen: 90,
    now: new Date("2026-06-22T00:00:00.000Z"),
    ...input,
  });
}

describe("buildDashboardControlCenterModel", () => {
  it("counts linked and unmatched Sentry issues and sums events from linked matches only", () => {
    const linkedIssue = sentryIssue({
      id: "linked",
      count: 7,
      tags: { automation_id: "auto-1" },
      lastSeen: "2026-06-20T10:00:00.000Z",
    });
    const unmatchedIssue = sentryIssue({
      id: "unmatched",
      title: "Unknown job failed",
      count: 99,
      lastSeen: "2026-06-21T10:00:00.000Z",
      tags: {},
    });

    const model = build({
      automations: [automation({ id: "auto-1" })],
      sentry: {
        issues: [linkedIssue, unmatchedIssue],
        limited: false,
        fetchedAt: "2026-06-21T11:00:00.000Z",
        matches: {
          byAutomationId: {
            "auto-1": [{ issueId: "linked", issue: linkedIssue, confidence: "exact", reason: "automation_id tag" }],
          },
          summariesByAutomationId: {
            "auto-1": { linkedIssueCount: 1, possibleIssueCount: 0, eventCount: 7, latestSeen: linkedIssue.lastSeen },
          },
          unmatched: [unmatchedIssue],
        },
      },
    });

    expect(model.sentry.totalIssues).toBe(2);
    expect(model.sentry.linkedIssues).toBe(1);
    expect(model.sentry.unmatchedIssues).toHaveLength(1);
    expect(model.sentry.affectedAutomations).toHaveLength(1);
    expect(model.sentry.totalEvents).toBe(7);
    expect(model.sentry.latestSeen).toBe("2026-06-21T10:00:00.000Z");
  });

  it("sorts affected Sentry automations by linked issue count, event count, and latest seen", () => {
    const model = build({
      automations: [
        automation({ id: "low", naam: "Low" }),
        automation({ id: "many", naam: "Many" }),
        automation({ id: "busy", naam: "Busy" }),
      ],
      sentry: {
        issues: [],
        limited: false,
        fetchedAt: "",
        matches: {
          byAutomationId: { low: [], many: [], busy: [] },
          summariesByAutomationId: {
            low: { linkedIssueCount: 1, possibleIssueCount: 0, eventCount: 20, latestSeen: "2026-06-22T09:00:00.000Z" },
            many: { linkedIssueCount: 2, possibleIssueCount: 0, eventCount: 1, latestSeen: "2026-06-18T09:00:00.000Z" },
            busy: { linkedIssueCount: 1, possibleIssueCount: 0, eventCount: 30, latestSeen: "2026-06-17T09:00:00.000Z" },
          },
          unmatched: [],
        },
      },
    });

    expect(model.sentry.affectedAutomations.map((row) => row.automation.id)).toEqual(["many", "busy", "low"]);
  });

  it("orders unmatched Sentry issues by severity, event count, and latest seen", () => {
    const warning = sentryIssue({ id: "warning", title: "Warning", level: "warning", count: 100 });
    const recentError = sentryIssue({
      id: "recent-error",
      title: "Recent error",
      level: "error",
      count: 2,
      lastSeen: "2026-06-22T11:00:00.000Z",
    });
    const busyError = sentryIssue({
      id: "busy-error",
      title: "Busy error",
      level: "error",
      count: 20,
      lastSeen: "2026-06-21T11:00:00.000Z",
    });

    const model = build({
      sentry: {
        issues: [warning, recentError, busyError],
        limited: false,
        fetchedAt: "",
        matches: {
          byAutomationId: {},
          summariesByAutomationId: {},
          unmatched: [warning, recentError, busyError],
        },
      },
    });

    expect(model.sentry.unmatchedIssues.map((issue) => issue.id)).toEqual(["busy-error", "recent-error", "warning"]);
  });

  it("builds Sentry incident insights with exact issue dates, severity, users, and fetch time", () => {
    const newestIssue = sentryIssue({
      id: "newest",
      title: "Newest failure",
      level: "error",
      count: 4,
      userCount: 3,
      firstSeen: "2026-06-18T09:01:02.000Z",
      lastSeen: "2026-06-18T10:15:30.000Z",
    });
    const oldestIssue = sentryIssue({
      id: "oldest",
      title: "Oldest open failure",
      level: "warning",
      count: 9,
      userCount: 5,
      firstSeen: "2026-06-10T07:00:00.000Z",
      lastSeen: "2026-06-11T08:00:00.000Z",
    });
    const fatalIssue = sentryIssue({
      id: "fatal",
      title: "Fatal failure",
      level: "fatal",
      count: 1,
      userCount: 2,
      firstSeen: "2026-06-17T08:00:00.000Z",
      lastSeen: "2026-06-17T09:00:00.000Z",
    });

    const model = build({
      sentry: {
        issues: [newestIssue, oldestIssue, fatalIssue],
        limited: false,
        fetchedAt: "2026-06-18T10:30:45.000Z",
        matches: {
          byAutomationId: {},
          summariesByAutomationId: {},
          unmatched: [newestIssue, oldestIssue, fatalIssue],
        },
      },
    });

    expect(model.sentry.insights.newestIssue?.id).toBe("newest");
    expect(model.sentry.insights.oldestOpenIssue?.id).toBe("oldest");
    expect(model.sentry.insights.highestLevel).toBe("fatal");
    expect(model.sentry.insights.totalUsers).toBe(10);
    expect(model.sentry.insights.fetchedAt).toBe("2026-06-18T10:30:45.000Z");
  });

  it("orders source warnings by severity and recency and verification work by never verified first", () => {
    const model = build({
      automations: [
        automation({
          id: "verified",
          naam: "Verified",
          laatstGeverifieerd: "2026-06-20T00:00:00.000Z",
          sourceFindings: [
            {
              id: "warning-old",
              automationId: "verified",
              source: "gitlab",
              type: "source_changed",
              severity: "warning",
              message: "Old warning",
              firstSeenAt: "2026-06-10T00:00:00.000Z",
              lastSeenAt: "2026-06-10T00:00:00.000Z",
            },
          ],
        }),
        automation({
          id: "never",
          naam: "Never",
          laatstGeverifieerd: null,
          sourceFindings: [
            {
              id: "critical-new",
              automationId: "never",
              source: "gitlab",
              type: "webhook_changed",
              severity: "critical",
              message: "Critical new",
              firstSeenAt: "2026-06-20T00:00:00.000Z",
              lastSeenAt: "2026-06-20T00:00:00.000Z",
            },
          ],
        }),
        automation({
          id: "old",
          naam: "Old",
          laatstGeverifieerd: "2026-01-01T00:00:00.000Z",
        }),
      ],
    });

    expect(model.workQueue.sourceWarnings.map((item) => item.finding.id)).toEqual(["critical-new", "warning-old"]);
    expect(model.workQueue.verificationItems.map((item) => item.automation.id)).toEqual(["never", "old"]);
  });

  it("builds health totals and handles empty data without throwing", () => {
    const empty = build();
    expect(empty.sentry.totalIssues).toBe(0);
    expect(empty.workQueue.sourceWarnings).toEqual([]);
    expect(empty.health.statusCounts).toEqual([]);

    const model = build({
      automations: [
        automation({ id: "auto-1", status: "Actief", systemen: ["HubSpot", "Backend"] }),
        automation({ id: "auto-2", status: "In review", systemen: ["HubSpot"] }),
      ],
      flows: [{ id: "flow-1", naam: "Flow", beschrijving: "", systemen: ["HubSpot"], automationIds: [], createdAt: "", updatedAt: "" }],
      pipelines: [pipeline({ pipelineId: "p1", isActive: true }), pipeline({ pipelineId: "p2", isActive: false, source: "hubspot" })],
      suggestions: [suggestion()],
      confirmedLinks: [{ sourceId: "auto-1", targetId: "auto-2", matchType: "webhook" }],
    });

    expect(model.health.pipelines.active).toBe(1);
    expect(model.health.pipelines.total).toBe(2);
    expect(model.health.flows.total).toBe(1);
    expect(model.health.flows.confirmedLinks).toBe(1);
    expect(model.health.systems[0]).toEqual({ system: "HubSpot", count: 2 });
    expect(model.health.statusCounts).toContainEqual({ status: "Actief", count: 1 });
  });
});
