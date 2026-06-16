import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProcessState } from "@/data/processData";
import {
  createManualExceptionBlock,
  deleteProcessArtifact,
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
});
