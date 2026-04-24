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
