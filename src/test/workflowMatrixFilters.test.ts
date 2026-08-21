import { describe, expect, it } from "vitest";
import { buildWorkflowMatrixAnalysis, type WorkflowMatrixAutomation } from "@/lib/workflowMatrixAnalysis";
import {
  buildWorkflowMatrixFilteredView,
  isNoiseWorkflow,
  type WorkflowMatrixViewFilters,
} from "@/lib/workflowMatrixFilters";
import type { Pipeline } from "@/lib/types";

const pipelines: Pipeline[] = [
  {
    pipelineId: "pipeline-sales",
    naam: "Sales Pipeline",
    source: "hubspot",
    isActive: true,
    syncedAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    beschrijving: null,
    stages: [
      { stage_id: "stage-active", label: "Actieve stage", display_order: 0, metadata: {} },
      { stage_id: "stage-inactive", label: "Inactieve workflow stage", display_order: 1, metadata: {} },
      { stage_id: "stage-empty", label: "Leeg procesgat", display_order: 2, metadata: {} },
    ],
  },
];

const automations: WorkflowMatrixAutomation[] = [
  {
    id: "active-recent",
    naam: "Recent actieve workflow",
    status: "Actief",
    systemen: ["HubSpot"],
    trigger: "Stage active",
    pipeline_id: "pipeline-sales",
    stage_id: "stage-active",
    hubspotLastRunAt: "2026-06-20T00:00:00.000Z",
    hubspotRunCount365d: 5,
  } as WorkflowMatrixAutomation,
  {
    id: "inactive-old",
    naam: "Oude inactieve workflow",
    status: "Uitgeschakeld",
    systemen: ["HubSpot"],
    trigger: "Stage inactive",
    pipeline_id: "pipeline-sales",
    stage_id: "stage-inactive",
    hubspotLastRunAt: "2025-01-01T00:00:00.000Z",
    hubspotRunCount365d: 0,
  } as WorkflowMatrixAutomation,
  {
    id: "active-stale",
    naam: "Actieve maar stale workflow",
    status: "Actief",
    systemen: ["HubSpot"],
    trigger: "Stage active",
    pipeline_id: "pipeline-sales",
    stage_id: "stage-active",
    hubspotLastRunAt: "2025-06-01T00:00:00.000Z",
    hubspotRunCount365d: 1,
  } as WorkflowMatrixAutomation,
];

function filteredIds(filters: WorkflowMatrixViewFilters): string[] {
  const analysis = buildWorkflowMatrixAnalysis({ pipelines, automations });
  return buildWorkflowMatrixFilteredView({
    pipelines,
    analysis,
    filters,
    now: new Date("2026-07-01T00:00:00.000Z"),
  }).pipelines.flatMap((pipeline) => pipeline.stages.flatMap((stage) => stage.workflows.map((workflow) => workflow.id)));
}

describe("workflow matrix filters", () => {
  it("filters workflow cards by active or inactive status", () => {
    expect(filteredIds({ status: "active", focus: "all" })).toEqual(["active-stale", "active-recent"]);
    expect(filteredIds({ status: "inactive", focus: "all" })).toEqual(["inactive-old"]);
  });

  it("shows only active stages without active workflows in process gaps mode", () => {
    const analysis = buildWorkflowMatrixAnalysis({ pipelines, automations });
    const view = buildWorkflowMatrixFilteredView({
      pipelines,
      analysis,
      filters: { status: "all", focus: "process_gaps" },
      now: new Date("2026-07-01T00:00:00.000Z"),
    });

    expect(view.pipelines).toHaveLength(1);
    expect(view.pipelines[0].stages.map((stage) => stage.stage.stage_id)).toEqual(["stage-inactive", "stage-empty"]);
    expect(view.pipelines[0].stages.flatMap((stage) => stage.workflows)).toEqual([]);
  });

  it("isolates inactive or stale workflows in noise mode", () => {
    expect(filteredIds({ status: "all", focus: "noise" })).toEqual(["active-stale", "inactive-old"]);
    expect(isNoiseWorkflow(automations[0], new Date("2026-07-01T00:00:00.000Z"))).toBe(false);
  });
});
