import { describe, it, expect } from "vitest";
import { detectDrift } from "@/lib/processDrift";
import type { ProcessStep } from "@/data/processData";
import type { Pipeline } from "@/lib/types";

function makeStep(stageId: string, label: string): ProcessStep {
  return { id: `stage-${stageId}`, label, team: "sales", column: 1, type: "task" };
}

function makePipeline(stages: { stage_id: string; label: string }[]): Pipeline {
  return {
    pipelineId: "p1", naam: "Test", syncedAt: "", beschrijving: null, isActive: true,
    stages: stages.map((s, i) => ({ stage_id: s.stage_id, label: s.label, display_order: i, metadata: {} })),
  };
}

describe("detectDrift", () => {
  it("returns empty when canvas matches pipeline exactly", () => {
    const steps = [makeStep("s1", "Intake"), makeStep("s2", "Offerte")];
    const pipeline = makePipeline([{ stage_id: "s1", label: "Intake" }, { stage_id: "s2", label: "Offerte" }]);
    const result = detectDrift(steps, pipeline);
    expect(result.driftNew).toHaveLength(0);
    expect(result.driftRenamed).toHaveLength(0);
  });

  it("detects a new stage not on canvas", () => {
    const steps = [makeStep("s1", "Intake")];
    const pipeline = makePipeline([
      { stage_id: "s1", label: "Intake" },
      { stage_id: "s2", label: "Offerte" },
    ]);
    const result = detectDrift(steps, pipeline);
    expect(result.driftNew).toHaveLength(1);
    expect(result.driftNew[0].stage_id).toBe("s2");
    expect(result.driftNew[0].label).toBe("Offerte");
  });

  it("detects a renamed stage", () => {
    const steps = [makeStep("s1", "Intake")];
    const pipeline = makePipeline([{ stage_id: "s1", label: "Kennismaking" }]);
    const result = detectDrift(steps, pipeline);
    expect(result.driftNew).toHaveLength(0);
    expect(result.driftRenamed).toHaveLength(1);
    expect(result.driftRenamed[0]).toEqual({
      stepId: "stage-s1",
      oldLabel: "Intake",
      newLabel: "Kennismaking",
    });
  });

  it("ignores manually added steps (non-stage IDs)", () => {
    const steps = [
      makeStep("s1", "Intake"),
      { id: "s-manual-1", label: "Custom stap", team: "sales" as const, column: 2, type: "task" as const },
    ];
    const pipeline = makePipeline([{ stage_id: "s1", label: "Intake" }]);
    const result = detectDrift(steps, pipeline);
    expect(result.driftNew).toHaveLength(0);
    expect(result.driftRenamed).toHaveLength(0);
  });

  it("ignores deleted stages — no driftDeleted (they stay on canvas)", () => {
    const steps = [makeStep("s1", "Intake"), makeStep("s2", "Offerte")];
    const pipeline = makePipeline([{ stage_id: "s1", label: "Intake" }]);
    const result = detectDrift(steps, pipeline);
    expect(result.driftNew).toHaveLength(0);
    expect(result.driftRenamed).toHaveLength(0);
  });
});
