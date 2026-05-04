import { describe, expect, it } from "vitest";
import type { ProcessState } from "@/data/processData";
import { buildSavedProcessState, restoreSavedProcessState } from "@/lib/processStateMapping";

const baseState: ProcessState = {
  steps: [{ id: "step-1", label: "Intake", team: "sales", column: 0 }],
  connections: [{ id: "conn-1", fromStepId: "step-1", toStepId: "step-2" }],
  automations: [
    {
      id: "auto-1",
      name: "Linked",
      team: "sales",
      tool: "HubSpot",
      goal: "Do thing",
      fromStepId: "step-1",
      toStepId: "step-2",
    },
    {
      id: "auto-2",
      name: "Unlinked",
      team: "marketing",
      tool: "Mailchimp",
      goal: "Do other thing",
    },
  ],
};

describe("process state mapping", () => {
  it("builds a saved process state payload with only fully attached automation links", () => {
    const payload = buildSavedProcessState(baseState, [], ["sales"], []);

    expect(payload.steps).toBe(baseState.steps);
    expect(payload.connections).toBe(baseState.connections);
    expect(payload.autoLinks).toEqual({
      "auto-1": { fromStepId: "step-1", toStepId: "step-2" },
    });
    expect(payload.parkedSteps).toEqual([]);
    expect(payload.activeLanes).toEqual(["sales"]);
    expect(payload.customLanes).toEqual([]);
  });

  it("restores saved step state while preserving current automation records", () => {
    const savedState: ProcessState = {
      ...baseState,
      automations: [
        {
          id: "auto-1",
          name: "Old name",
          team: "sales",
          tool: "HubSpot",
          goal: "Old goal",
          fromStepId: "saved-from",
          toStepId: "saved-to",
        },
      ],
    };

    const restored = restoreSavedProcessState(baseState, savedState);

    expect(restored.steps).toBe(savedState.steps);
    expect(restored.connections).toBe(savedState.connections);
    expect(restored.automations).toEqual([
      {
        ...baseState.automations[0],
        fromStepId: "saved-from",
        toStepId: "saved-to",
      },
      {
        ...baseState.automations[1],
        fromStepId: undefined,
        toStepId: undefined,
      },
    ]);
  });
});
