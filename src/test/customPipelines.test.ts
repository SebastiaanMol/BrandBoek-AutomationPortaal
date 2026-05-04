import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pipeline } from "@/lib/types";
import { buildCustomPipelineStages, canDeletePipeline } from "@/lib/storage/pipelines";

describe("custom pipeline helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds custom stages with generated ids and display order", () => {
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("stage-a")
      .mockReturnValueOnce("stage-b");

    const stages = buildCustomPipelineStages([" Intake ", "", "Afgerond"]);

    expect(stages).toEqual([
      {
        stage_id: "custom-stage-stage-a",
        label: "Intake",
        display_order: 0,
        metadata: {},
      },
      {
        stage_id: "custom-stage-stage-b",
        label: "Afgerond",
        display_order: 1,
        metadata: {},
      },
    ]);
  });

  it("only allows deleting custom pipelines", () => {
    expect(canDeletePipeline({ source: "custom" })).toBe(true);
    expect(canDeletePipeline({ source: "hubspot" })).toBe(false);
  });

  it("documents the pipeline source and timestamp contract", () => {
    const pipeline: Pipeline = {
      pipelineId: "custom-example",
      naam: "Extern proces",
      stages: [],
      syncedAt: "2026-04-30T10:00:00.000Z",
      updatedAt: "2026-04-30T11:00:00.000Z",
      beschrijving: null,
      isActive: true,
      source: "custom",
    };

    expect(pipeline.source).toBe("custom");
    expect(pipeline.updatedAt).toBe("2026-04-30T11:00:00.000Z");
  });
});
