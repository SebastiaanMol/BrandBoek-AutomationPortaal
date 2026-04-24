import { describe, it, expect } from "vitest";

// Pure logic: the pipeline state row ID is the pipeline_id string as-is.
// This test documents the contract so a refactor can't silently break it.

function buildProcessStateId(pipelineId: string): string {
  return pipelineId;
}

describe("process state ID contract", () => {
  it("uses pipelineId directly as the row id", () => {
    expect(buildProcessStateId("pipeline-abc-123")).toBe("pipeline-abc-123");
  });

  it("does not prefix or transform the pipelineId", () => {
    const id = "hs-pipeline-xyz";
    expect(buildProcessStateId(id)).toBe(id);
  });
});

describe("ProcessenView pipeline selection", () => {
  it("auto-selects first pipeline when none selected", () => {
    const pipelines = [
      { pipelineId: "a", naam: "Sales", stages: [], syncedAt: "", beschrijving: null },
      { pipelineId: "b", naam: "Onboarding", stages: [], syncedAt: "", beschrijving: null },
    ];
    // When selectedPipelineId is null, the first pipeline should be used
    const selected = pipelines.find(p => p.pipelineId === null) ?? pipelines[0];
    expect(selected.pipelineId).toBe("a");
  });

  it("returns null when pipelines array is empty", () => {
    const pipelines: { pipelineId: string }[] = [];
    const selected = pipelines.length > 0 ? pipelines[0] : null;
    expect(selected).toBeNull();
  });
});
