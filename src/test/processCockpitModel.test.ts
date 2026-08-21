import { describe, expect, it } from "vitest";
import { buildProcessCockpitModel } from "@/lib/processCockpit";
import type { Automatisering, Pipeline } from "@/lib/types";
import type { SavedProcessStateWithUpdatedAt } from "@/lib/storage/processState";
import type { AutomationSentryIssuesQueryResult } from "@/lib/queryHooks/sentryIssues";

function pipeline(overrides: Partial<Pipeline>): Pipeline {
  return {
    pipelineId: "pipe-sales",
    naam: "Sales Pipeline",
    stages: [
      { stage_id: "s1", label: "Start", display_order: 0, metadata: {} },
      { stage_id: "s2", label: "Klaar", display_order: 1, metadata: {} },
    ],
    syncedAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
    ...overrides,
  };
}

function processState(overrides: Partial<SavedProcessStateWithUpdatedAt>): SavedProcessStateWithUpdatedAt {
  return {
    steps: [
      { id: "stage-s1", label: "Start", type: "task", team: "sales", column: 0 },
      { id: "stage-s2", label: "Klaar", type: "task", team: "sales", column: 1 },
    ],
    connections: [{ id: "c1", fromStepId: "stage-s1", toStepId: "stage-s2" }],
    autoLinks: {},
    parkedSteps: [],
    activeLanes: ["sales"],
    customLanes: [],
    flowLinks: {},
    attachments: [],
    artifacts: [],
    updatedAt: "2026-06-20T12:00:00.000Z",
    ...overrides,
  };
}

function automation(overrides: Partial<Automatisering>): Automatisering {
  return {
    id: "auto-1",
    naam: "Automation 1",
    categorie: "Backend Script",
    doel: "",
    trigger: "",
    systemen: ["Backend"],
    stappen: [],
    afhankelijkheden: "",
    owner: "",
    status: "Actief",
    verbeterideeën: "",
    mermaidDiagram: "",
    koppelingen: [],
    fasen: ["Sales"],
    createdAt: "2026-01-01T00:00:00.000Z",
    laatstGeverifieerd: null,
    geverifieerdDoor: "",
    ...overrides,
  };
}

function sentryOverview(): AutomationSentryIssuesQueryResult {
  return {
    issues: [],
    limited: false,
    fetchedAt: "2026-06-24T10:00:00.000Z",
    matches: {
      byAutomationId: {
        "auto-linked": [
          {
            issueId: "issue-1",
            confidence: "strong",
            reason: "source identifier",
            issue: {
              id: "issue-1",
              shortId: "AUTOMATIONS-1",
              title: "ApiException",
              status: "unresolved",
              count: 7,
              lastSeen: "2026-06-24T09:30:00.000Z",
              permalink: "https://example.sentry.io/issues/1",
            },
          },
        ],
      },
      summariesByAutomationId: {
        "auto-linked": {
          linkedIssueCount: 1,
          possibleIssueCount: 0,
          eventCount: 7,
          latestSeen: "2026-06-24T09:30:00.000Z",
        },
      },
      unmatched: [],
    },
  };
}

describe("buildProcessCockpitModel", () => {
  it("counts saved and missing process views", () => {
    const model = buildProcessCockpitModel({
      pipelines: [pipeline({ pipelineId: "pipe-a" }), pipeline({ pipelineId: "pipe-b" })],
      processStates: { "pipe-a": processState({}) },
      automations: [],
      sentry: undefined,
      now: new Date("2026-06-24T12:00:00.000Z"),
    });

    expect(model.kpis.totalPipelines).toBe(2);
    expect(model.kpis.savedProcessViews).toBe(1);
    expect(model.kpis.missingProcessViews).toBe(1);
    expect(model.rows.find((row) => row.pipelineId === "pipe-a")?.exportReady).toBe(true);
    expect(model.rows.find((row) => row.pipelineId === "pipe-b")?.exportReady).toBe(false);
  });

  it("detects missing HubSpot stages and parked HubSpot stages", () => {
    const model = buildProcessCockpitModel({
      pipelines: [pipeline({ pipelineId: "pipe-a" })],
      processStates: {
        "pipe-a": processState({
          steps: [{ id: "stage-s1", label: "Start", type: "task", team: "sales", column: 0 }],
          parkedSteps: [{ id: "stage-s2", label: "Klaar", type: "task", team: "sales", column: 1 }],
        }),
      },
      automations: [],
      sentry: undefined,
      now: new Date("2026-06-24T12:00:00.000Z"),
    });

    expect(model.rows[0].quality.missingStageCount).toBe(0);
    expect(model.rows[0].quality.parkedHubSpotStageCount).toBe(1);
    expect(model.rows[0].attentionReasons).toContain("Geparkeerde HubSpot stages");
  });

  it("links Sentry errors through automations attached to the process state", () => {
    const model = buildProcessCockpitModel({
      pipelines: [pipeline({ pipelineId: "pipe-a" })],
      processStates: {
        "pipe-a": processState({
          autoLinks: { "auto-linked": { fromStepId: "stage-s1", toStepId: "stage-s2" } },
        }),
      },
      automations: [automation({ id: "auto-linked", naam: "Linked automation" })],
      sentry: sentryOverview(),
      now: new Date("2026-06-24T12:00:00.000Z"),
    });

    expect(model.rows[0].sentry.issueCount).toBe(1);
    expect(model.rows[0].sentry.eventCount).toBe(7);
    expect(model.rows[0].sentry.latestSeen).toBe("2026-06-24T09:30:00.000Z");
    expect(model.kpis.openSentryIssues).toBe(1);
  });

  it("sorts maintenance queue by lowest readiness score first", () => {
    const model = buildProcessCockpitModel({
      pipelines: [
        pipeline({ pipelineId: "healthy", naam: "Healthy" }),
        pipeline({ pipelineId: "missing", naam: "Missing" }),
        pipeline({ pipelineId: "stale", naam: "Stale" }),
      ],
      processStates: {
        healthy: processState({}),
        stale: processState({ updatedAt: "2026-01-01T00:00:00.000Z" }),
      },
      automations: [],
      sentry: undefined,
      now: new Date("2026-06-24T12:00:00.000Z"),
    });

    expect(model.maintenanceQueue.map((row) => row.pipelineId)).toEqual(["missing", "stale"]);
  });

  it("does not treat inactive pipelines without process views as required work", () => {
    const model = buildProcessCockpitModel({
      pipelines: [
        pipeline({ pipelineId: "active-missing", naam: "Active missing", isActive: true }),
        pipeline({ pipelineId: "inactive-missing", naam: "Inactive missing", isActive: false }),
      ],
      processStates: {},
      automations: [],
      sentry: undefined,
      now: new Date("2026-06-24T12:00:00.000Z"),
    });

    const inactive = model.rows.find((row) => row.pipelineId === "inactive-missing");

    expect(model.kpis.missingProcessViews).toBe(1);
    expect(inactive?.needsAttention).toBe(false);
    expect(inactive?.exportReady).toBe(false);
    expect(model.maintenanceQueue.map((row) => row.pipelineId)).toEqual(["active-missing"]);
  });

  it("sorts inactive pipelines below active pipelines and explains why they are blocked", () => {
    const model = buildProcessCockpitModel({
      pipelines: [
        pipeline({ pipelineId: "inactive", naam: "Inactive", isActive: false }),
        pipeline({ pipelineId: "active", naam: "Active", isActive: true }),
      ],
      processStates: {
        active: processState({}),
      },
      automations: [],
      sentry: undefined,
      now: new Date("2026-06-24T12:00:00.000Z"),
    });

    expect(model.rows.map((row) => row.pipelineId)).toEqual(["active", "inactive"]);
    expect(model.rows[1].blockedReason).toBe(
      "Pipeline is inactief; hiervoor hoeft geen procesview gemaakt te worden. Wil je dit wel aanpassen? Zet de pipeline eerst weer actief in de bron of portal.",
    );
  });
});
