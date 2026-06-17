import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProcessState } from "@/data/processData";
import {
  createManualExceptionBlock,
  deleteProcessArtifact,
  moveStepIntoManualArtifact,
  removeStepFromManualArtifact,
  reorderManualArtifactStep,
  updateProcessArtifact,
} from "@/lib/processArtifacts";
import {
  buildProcessStateFromSaved,
  buildSavedProcessState,
  restoreSavedProcessState,
} from "@/lib/processStateMapping";
import type { SavedProcessState } from "@/lib/storage/processState";

const baseState: ProcessState = {
  steps: [{ id: "s1", label: "Intake", team: "sales", column: 0 }],
  connections: [],
  automations: [],
};

describe("processArtifacts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses crypto randomUUID for manual exception block ids when available", () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => "uuid-123"),
    });

    const artifact = createManualExceptionBlock({ x: 420, y: 260 });

    expect(artifact.id).toBe("artifact-uuid-123");
  });

  it("creates a default manual exception block at the requested position", () => {
    vi.stubGlobal("crypto", undefined);
    vi.spyOn(Date, "now").mockReturnValue(1710000000000);

    const artifact = createManualExceptionBlock({ x: 420, y: 260 });

    expect(artifact).toEqual({
      id: "artifact-1710000000000",
      type: "manualExceptionBlock",
      title: "Altijd beschikbare handmatige actie",
      description: "Mogelijk vanuit elke pipeline stage. Geen verplichte processtap.",
      position: { x: 420, y: 260 },
      size: { width: 250, height: 112 },
      association: {
        anchor: "process",
        label: "Mogelijk vanuit elke pipeline stage",
      },
    });

  });

  it("updates one artifact without changing the others", () => {
    const original = [
      createManualExceptionBlock({ x: 10, y: 20 }),
      { ...createManualExceptionBlock({ x: 30, y: 40 }), id: "artifact-second" },
    ];

    const updated = updateProcessArtifact(original, original[0].id, {
      title: "Betalingsregeling",
      description: "Handmatig beschikbaar",
    });

    expect(updated[0]).toMatchObject({
      title: "Betalingsregeling",
      description: "Handmatig beschikbaar",
    });
    expect(updated[1]).toBe(original[1]);
  });

  it("deletes only the selected artifact", () => {
    const first = createManualExceptionBlock({ x: 10, y: 20 });
    const second = { ...createManualExceptionBlock({ x: 30, y: 40 }), id: "artifact-second" };

    expect(deleteProcessArtifact([first, second], first.id)).toEqual([second]);
  });

  it("moves a step into one manual exception block and removes it from other blocks", () => {
    const first = {
      ...createManualExceptionBlock({ x: 10, y: 20 }),
      id: "artifact-first",
      stepIds: ["existing", "move-me"],
    };
    const second = {
      ...createManualExceptionBlock({ x: 30, y: 40 }),
      id: "artifact-second",
      stepIds: ["other"],
    };

    const updated = moveStepIntoManualArtifact([first, second], "artifact-second", "move-me");

    expect(updated).toEqual([
      expect.objectContaining({ id: "artifact-first", stepIds: ["existing"] }),
      expect.objectContaining({ id: "artifact-second", stepIds: ["other", "move-me"] }),
    ]);
  });

  it("leaves artifacts unchanged when moving a step into an unknown manual exception block", () => {
    const first = {
      ...createManualExceptionBlock({ x: 10, y: 20 }),
      id: "artifact-first",
      stepIds: ["existing", "move-me"],
    };
    const second = {
      ...createManualExceptionBlock({ x: 30, y: 40 }),
      id: "artifact-second",
      stepIds: ["other"],
    };

    expect(moveStepIntoManualArtifact([first, second], "artifact-missing", "move-me")).toEqual([
      first,
      second,
    ]);
  });

  it("removes a step from a manual exception block", () => {
    const artifact = {
      ...createManualExceptionBlock({ x: 10, y: 20 }),
      id: "artifact-manual",
      stepIds: ["one", "two"],
    };

    expect(removeStepFromManualArtifact([artifact], "artifact-manual", "one")).toEqual([
      expect.objectContaining({ id: "artifact-manual", stepIds: ["two"] }),
    ]);
  });

  it("reorders manual steps inside a block", () => {
    const artifact = {
      ...createManualExceptionBlock({ x: 10, y: 20 }),
      id: "artifact-manual",
      stepIds: ["one", "two", "three"],
    };

    expect(reorderManualArtifactStep([artifact], "artifact-manual", "three", 0)).toEqual([
      expect.objectContaining({ id: "artifact-manual", stepIds: ["three", "one", "two"] }),
    ]);
  });

  it("preserves valid artifacts in saved and restored process state", () => {
    const artifact = {
      id: "artifact-manual",
      type: "manualExceptionBlock" as const,
      title: "Betalingsregeling",
      description: "Handmatig beschikbaar",
      position: { x: 320, y: 240 },
      size: { width: 250, height: 112 },
      association: { anchor: "process" as const, label: "Mogelijk vanuit elke pipeline stage" },
    };
    const stateWithArtifact: ProcessState = {
      ...baseState,
      artifacts: [artifact],
    };

    const saved = buildSavedProcessState(stateWithArtifact, [], ["sales"], []);
    const mapped = buildProcessStateFromSaved(saved, baseState.automations);
    const restored = restoreSavedProcessState(baseState, stateWithArtifact);

    expect(saved.artifacts).toEqual([artifact]);
    expect(mapped.artifacts).toEqual([artifact]);
    expect(restored.artifacts).toEqual([artifact]);
  });

  it("keeps artifacts independent from step and connection ids", () => {
    const artifact = {
      id: "artifact-manual",
      type: "manualExceptionBlock" as const,
      title: "Losstaand artifact",
      position: { x: 320, y: 240 },
      association: { anchor: "process" as const },
    };
    const stateWithArtifact: ProcessState = {
      steps: [],
      connections: [],
      automations: [],
      artifacts: [artifact],
    };

    expect(buildSavedProcessState(stateWithArtifact, [], [], []).artifacts).toEqual([artifact]);
  });

  it("drops invalid artifacts while keeping valid ones", () => {
    const saved: SavedProcessState = {
      steps: baseState.steps,
      connections: baseState.connections,
      autoLinks: {},
      parkedSteps: [],
      artifacts: [
        {
          id: "artifact-valid",
          type: "manualExceptionBlock",
          title: "Valid",
          position: { x: 1, y: 2 },
        },
        {
          id: "artifact-step-linked",
          type: "manualExceptionBlock",
          title: "Invalid association",
          position: { x: 1, y: 2 },
          association: { anchor: "s1" },
        },
        {
          id: "artifact-missing-position",
          type: "manualExceptionBlock",
          title: "Invalid position",
        },
      ],
    };

    expect(buildProcessStateFromSaved(saved, []).artifacts).toEqual([
      {
        id: "artifact-valid",
        type: "manualExceptionBlock",
        title: "Valid",
        position: { x: 1, y: 2 },
      },
    ]);
  });

  it("preserves valid manual step ids and removes duplicates across blocks", () => {
    const saved: SavedProcessState = {
      steps: [
        { id: "s1", label: "Intake", team: "sales", column: 0 },
        { id: "s2", label: "Betalingsregeling", team: "sales", column: 1 },
        { id: "s3", label: "Escalatie", team: "sales", column: 2 },
      ],
      connections: [],
      autoLinks: {},
      parkedSteps: [],
      artifacts: [
        {
          id: "artifact-first",
          type: "manualExceptionBlock",
          title: "Manual first",
          position: { x: 10, y: 20 },
          stepIds: ["s2", "missing", "s3"],
        },
        {
          id: "artifact-second",
          type: "manualExceptionBlock",
          title: "Manual second",
          position: { x: 30, y: 40 },
          stepIds: ["s2", "s1"],
        },
      ],
    };

    expect(buildProcessStateFromSaved(saved, []).artifacts).toEqual([
      expect.objectContaining({ id: "artifact-first", stepIds: ["s2", "s3"] }),
      expect.objectContaining({ id: "artifact-second", stepIds: ["s1"] }),
    ]);
  });

  it("removes stepIds when every manual step id is invalid or duplicate", () => {
    const saved: SavedProcessState = {
      steps: [
        { id: "s1", label: "Intake", team: "sales", column: 0 },
      ],
      connections: [],
      autoLinks: {},
      parkedSteps: [],
      artifacts: [
        {
          id: "artifact-first",
          type: "manualExceptionBlock",
          title: "Manual first",
          position: { x: 10, y: 20 },
          stepIds: ["s1"],
        },
        {
          id: "artifact-duplicate",
          type: "manualExceptionBlock",
          title: "Manual duplicate",
          position: { x: 30, y: 40 },
          stepIds: ["s1"],
        },
        {
          id: "artifact-invalid",
          type: "manualExceptionBlock",
          title: "Manual invalid",
          position: { x: 50, y: 60 },
          stepIds: ["missing"],
        },
      ],
    };

    const artifacts = buildProcessStateFromSaved(saved, []).artifacts ?? [];

    expect(artifacts[0]).toEqual(expect.objectContaining({ id: "artifact-first", stepIds: ["s1"] }));
    expect(artifacts[1]).toEqual(expect.objectContaining({ id: "artifact-duplicate" }));
    expect(artifacts[1]).not.toHaveProperty("stepIds");
    expect(artifacts[2]).toEqual(expect.objectContaining({ id: "artifact-invalid" }));
    expect(artifacts[2]).not.toHaveProperty("stepIds");
  });
});
