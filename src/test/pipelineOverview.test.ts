import { describe, expect, it } from "vitest";
import type { Pipeline, PipelineStage } from "@/lib/types";
import {
  filterPipelinesForOverview,
  getPipelineDateLabel,
  getPipelineDateValue,
  getPipelineSourceLabel,
  getPreviewStages,
  sortPipelineStages,
} from "@/lib/pipelineOverview";

function makeStage(overrides: Partial<PipelineStage> = {}): PipelineStage {
  return {
    stage_id: "stage-1",
    label: "Stage",
    display_order: 0,
    metadata: {},
    ...overrides,
  };
}

function makePipeline(overrides: Partial<Pipeline> = {}): Pipeline {
  return {
    pipelineId: "pipeline-1",
    naam: "Sales pipeline",
    stages: [],
    syncedAt: "2026-05-01T08:00:00.000Z",
    updatedAt: "2026-05-02T09:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
    ...overrides,
  };
}

describe("pipeline overview helpers", () => {
  const pipelines: Pipeline[] = [
    makePipeline({ pipelineId: "hubspot-active", naam: "Sales Pipeline", source: "hubspot", isActive: true }),
    makePipeline({ pipelineId: "custom-active", naam: "Intern Onboarding", source: "custom", isActive: true }),
    makePipeline({ pipelineId: "hubspot-inactive", naam: "Dormant Deals", source: "hubspot", isActive: false }),
  ];

  it("filters pipelines by source and inactive status", () => {
    expect(filterPipelinesForOverview(pipelines, "hubspot", "").map((pipeline) => pipeline.pipelineId)).toEqual([
      "hubspot-active",
      "hubspot-inactive",
    ]);
    expect(filterPipelinesForOverview(pipelines, "custom", "").map((pipeline) => pipeline.pipelineId)).toEqual([
      "custom-active",
    ]);
    expect(filterPipelinesForOverview(pipelines, "inactive", "").map((pipeline) => pipeline.pipelineId)).toEqual([
      "hubspot-inactive",
    ]);
  });

  it("searches by pipeline name case-insensitively and treats whitespace-only search as empty", () => {
    expect(filterPipelinesForOverview(pipelines, "all", " onboarding ").map((pipeline) => pipeline.pipelineId)).toEqual([
      "custom-active",
    ]);
    expect(filterPipelinesForOverview(pipelines, "all", "SALES").map((pipeline) => pipeline.pipelineId)).toEqual([
      "hubspot-active",
    ]);
    expect(filterPipelinesForOverview(pipelines, "custom", "   ").map((pipeline) => pipeline.pipelineId)).toEqual([
      "custom-active",
    ]);
  });

  it("puts active pipelines above inactive pipelines when no filter is applied", () => {
    const mixedPipelines = [
      makePipeline({ pipelineId: "inactive-first", naam: "Archived", isActive: false }),
      makePipeline({ pipelineId: "active-second", naam: "Current", isActive: true }),
      makePipeline({ pipelineId: "active-third", naam: "Current 2", isActive: true }),
      makePipeline({ pipelineId: "inactive-last", naam: "Archived 2", isActive: false }),
    ];

    expect(filterPipelinesForOverview(mixedPipelines, "all", "").map((pipeline) => pipeline.pipelineId)).toEqual([
      "active-second",
      "active-third",
      "inactive-first",
      "inactive-last",
    ]);
  });

  it("returns source labels and the correct timestamp per source", () => {
    const hubspotPipeline = makePipeline({
      source: "hubspot",
      syncedAt: "2026-05-03T10:00:00.000Z",
      updatedAt: "2026-05-04T11:00:00.000Z",
    });
    const customPipeline = makePipeline({
      source: "custom",
      syncedAt: "2026-05-05T12:00:00.000Z",
      updatedAt: "2026-05-06T13:00:00.000Z",
    });

    expect(getPipelineSourceLabel(hubspotPipeline)).toBe("HubSpot");
    expect(getPipelineDateLabel(hubspotPipeline)).toBe("Gesynchroniseerd");
    expect(getPipelineDateValue(hubspotPipeline)).toBe("2026-05-03T10:00:00.000Z");
    expect(getPipelineSourceLabel(customPipeline)).toBe("Intern proces");
    expect(getPipelineDateLabel(customPipeline)).toBe("Laatst bijgewerkt");
    expect(getPipelineDateValue(customPipeline)).toBe("2026-05-06T13:00:00.000Z");
  });

  it("sorts stages by display order and limits preview stages", () => {
    const stages = [
      makeStage({ stage_id: "stage-3", label: "Done", display_order: 30 }),
      makeStage({ stage_id: "stage-1", label: "Start", display_order: 10 }),
      makeStage({ stage_id: "stage-2", label: "Middle", display_order: 20 }),
    ];
    const pipeline = makePipeline({ stages });

    expect(sortPipelineStages(pipeline).map((stage) => stage.stage_id)).toEqual(["stage-1", "stage-2", "stage-3"]);
    expect(sortPipelineStages(pipeline)).not.toBe(stages);
    expect(getPreviewStages(pipeline, 2).map((stage) => stage.stage_id)).toEqual(["stage-1", "stage-2"]);
  });
});
