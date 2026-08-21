import { describe, expect, it } from "vitest";

import {
  buildNotificationCenterModel,
  type NotificationCenterInput,
  type NotificationState,
} from "@/lib/notificationCenter";
import type { PortalSentryIssue } from "@/lib/sentryIssueMatching";
import type { AutomationSentryIssuesQueryResult } from "@/lib/queryHooks/sentryIssues";
import type { SavedProcessStateWithUpdatedAt } from "@/lib/storage/processState";
import type { Automatisering, Pipeline } from "@/lib/types";

function automation(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "auto-1",
    naam: "BTW verwerken",
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

function pipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    pipelineId: "pipeline-1",
    naam: "BTW - Q",
    stages: [
      { stage_id: "open", label: "Open", display_order: 0, metadata: {} },
      { stage_id: "ready", label: "Klaar", display_order: 1, metadata: {} },
    ],
    syncedAt: "2026-06-18T10:00:00.000Z",
    updatedAt: "2026-06-18T10:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
    ...overrides,
  };
}

function processState(overrides: Partial<SavedProcessStateWithUpdatedAt> = {}): SavedProcessStateWithUpdatedAt {
  return {
    steps: [{ id: "stage-open", label: "Open", type: "task", team: "sales", column: 0 }],
    connections: [],
    autoLinks: {},
    parkedSteps: [],
    attachments: [],
    artifacts: [],
    updatedAt: "2026-06-18T10:00:00.000Z",
    ...overrides,
  };
}

function sentryIssue(overrides: Partial<PortalSentryIssue> = {}): PortalSentryIssue {
  return {
    id: "issue-1",
    shortId: "AUTOMATIONS-1",
    title: "Automation failed",
    level: "error",
    status: "unresolved",
    count: 12,
    firstSeen: "2026-06-18T09:00:00.000Z",
    lastSeen: "2026-06-18T10:00:00.000Z",
    permalink: "https://brand-boekhouders.sentry.io/issues/1/",
    tags: { automation_id: "auto-1" },
    ...overrides,
  };
}

function sentryOverview(issue: PortalSentryIssue): AutomationSentryIssuesQueryResult {
  return {
    issues: [issue],
    limited: false,
    fetchedAt: "2026-06-18T10:30:00.000Z",
    matches: {
      byAutomationId: {
        "auto-1": [{ issueId: issue.id, issue, confidence: "exact", reason: "automation_id tag" }],
      },
      summariesByAutomationId: {
        "auto-1": { linkedIssueCount: 1, possibleIssueCount: 0, eventCount: issue.count, latestSeen: issue.lastSeen ?? null },
      },
      unmatched: [],
    },
  };
}

function build(input: Partial<NotificationCenterInput> = {}) {
  return buildNotificationCenterModel({
    automations: [],
    pipelines: [],
    processStates: {},
    sentry: undefined,
    states: [],
    now: new Date("2026-06-22T10:00:00.000Z"),
    ...input,
  });
}

describe("buildNotificationCenterModel", () => {
  it("creates actionable notifications for linked Sentry issues, source findings, inactive pipelines, and process drift", () => {
    const issue = sentryIssue();

    const model = build({
      automations: [
        automation({
          id: "auto-1",
          sourceFindings: [
            {
              id: "finding-1",
              automationId: "auto-1",
              source: "hubspot",
              type: "source_missing",
              severity: "critical",
              message: "Workflow ontbreekt in HubSpot",
              firstSeenAt: "2026-06-19T08:00:00.000Z",
              lastSeenAt: "2026-06-19T09:00:00.000Z",
            },
          ],
        }),
      ],
      pipelines: [
        pipeline(),
        pipeline({ pipelineId: "inactive", naam: "Oude pipeline", isActive: false }),
      ],
      processStates: { "pipeline-1": processState() },
      sentry: sentryOverview(issue),
    });

    expect(model.items.map((item) => item.type)).toEqual([
      "sentry_linked_error",
      "automation_source_missing",
      "pipeline_source_inactive",
      "pipeline_new_stage",
      "process_view_drift",
    ]);
    expect(model.unseenCount).toBe(5);
    expect(model.openItems).toHaveLength(5);
    expect(model.items[0].href).toBe("/automations/auto-1");
  });

  it("does not notify for unmatched or possible Sentry matches", () => {
    const issue = sentryIssue({ id: "possible", tags: {}, title: "BTW verwerken" });

    const model = build({
      automations: [automation({ id: "auto-1" })],
      sentry: {
        issues: [issue],
        limited: false,
        fetchedAt: "",
        matches: {
          byAutomationId: {
            "auto-1": [{ issueId: issue.id, issue, confidence: "possible", reason: "automation name" }],
          },
          summariesByAutomationId: {
            "auto-1": { linkedIssueCount: 0, possibleIssueCount: 1, eventCount: 0, latestSeen: issue.lastSeen ?? null },
          },
          unmatched: [issue],
        },
      },
    });

    expect(model.items).toEqual([]);
    expect(model.unseenCount).toBe(0);
  });

  it("applies seen and archived state per stable notification key", () => {
    const issue = sentryIssue();
    const archivedKey = "sentry_linked_error:auto-1:issue-1";
    const seenKey = "pipeline_new_stage:pipeline-1:ready";
    const states: NotificationState[] = [
      { notificationKey: archivedKey, seenAt: "2026-06-20T10:00:00.000Z", archivedAt: "2026-06-21T10:00:00.000Z" },
      { notificationKey: seenKey, seenAt: "2026-06-20T10:00:00.000Z", archivedAt: null },
    ];

    const model = build({
      automations: [automation({ id: "auto-1" })],
      pipelines: [pipeline()],
      processStates: { "pipeline-1": processState() },
      sentry: sentryOverview(issue),
      states,
    });

    expect(model.archivedItems.map((item) => item.notificationKey)).toEqual([archivedKey]);
    expect(model.seenItems.map((item) => item.notificationKey)).toContain(seenKey);
    expect(model.openItems.map((item) => item.notificationKey)).not.toContain(seenKey);
    expect(model.unseenCount).toBe(1);
  });

  it("returns an empty model for empty data", () => {
    const model = build();

    expect(model.items).toEqual([]);
    expect(model.openItems).toEqual([]);
    expect(model.seenItems).toEqual([]);
    expect(model.archivedItems).toEqual([]);
    expect(model.unseenCount).toBe(0);
  });
});
