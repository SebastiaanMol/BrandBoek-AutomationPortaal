import { describe, expect, it } from "vitest";
import type { Automation, ProcessState } from "@/data/processData";
import { buildProcessStateFromSaved, buildSavedProcessState } from "@/lib/processStateMapping";
import { filterFlowLinksForSteps, removeFlowLinksForStep } from "@/lib/processFlowLinks";
import type { SavedProcessState } from "@/lib/storage/processState";

const steps = [
  { id: "intake", label: "Intake", team: "sales", column: 0 },
  { id: "controle", label: "Controle", team: "sales", column: 1 },
];

const baseState: ProcessState = {
  steps,
  connections: [{ id: "route", fromStepId: "intake", toStepId: "controle" }],
  automations: [],
};

describe("process canvas placements", () => {
  it("saves automation step placements and legacy connection links", () => {
    const state: ProcessState = {
      ...baseState,
      automations: [
        {
          id: "auto-step",
          name: "Stap automation",
          team: "sales",
          tool: "HubSpot",
          goal: "Op stap",
          placement: { kind: "step", stepId: "intake", order: 0 },
        },
        {
          id: "auto-route",
          name: "Route automation",
          team: "sales",
          tool: "HubSpot",
          goal: "Op route",
          fromStepId: "intake",
          toStepId: "controle",
        },
      ],
    };

    const saved = buildSavedProcessState(state, [], ["sales"], []);

    expect(saved.autoLinks).toEqual({
      "auto-step": { kind: "step", stepId: "intake", order: 0 },
      "auto-route": { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1 },
    });
  });

  it("loads old automation links as connection placements", () => {
    const saved: SavedProcessState = {
      steps,
      connections: baseState.connections,
      autoLinks: {
        "auto-route": { fromStepId: "intake", toStepId: "controle" },
      },
      parkedSteps: [],
    };
    const automations: Automation[] = [
      { id: "auto-route", name: "Route automation", team: "sales", tool: "HubSpot", goal: "Route" },
    ];

    const restored = buildProcessStateFromSaved(saved, automations);

    expect(restored.automations[0]).toEqual(expect.objectContaining({
      fromStepId: "intake",
      toStepId: "controle",
      placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 0 },
    }));
  });

  it("preserves exact connection positions through save and load", () => {
    const state: ProcessState = {
      ...baseState,
      automations: [
        {
          id: "auto-route",
          name: "Route automation",
          team: "sales",
          tool: "HubSpot",
          goal: "Op route",
          placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 0, position: 0.72 },
        },
      ],
      flowLinks: {
        "flow-route": { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1, position: 0.38 },
      },
    };

    const saved = buildSavedProcessState(state, [], ["sales"], []);
    const restored = buildProcessStateFromSaved(saved, state.automations);

    expect(saved.autoLinks["auto-route"]).toEqual({
      kind: "connection",
      fromStepId: "intake",
      toStepId: "controle",
      order: 0,
      position: 0.72,
    });
    expect(restored.automations[0].placement).toEqual({
      kind: "connection",
      fromStepId: "intake",
      toStepId: "controle",
      order: 0,
      position: 0.72,
    });
    expect(restored.flowLinks?.["flow-route"]).toEqual({
      kind: "connection",
      fromStepId: "intake",
      toStepId: "controle",
      order: 1,
      position: 0.38,
    });
  });

  it("persists process actions in the saved artifacts payload and restores them as process actions", () => {
    const state: ProcessState = {
      ...baseState,
      processActions: [
        {
          id: "action-wait",
          type: "wait",
          label: "Wacht 3 dagen",
          detail: "3 dagen",
          placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1, position: 0.62 },
        },
        {
          id: "action-email",
          type: "email",
          label: "Stuur e-mail",
          placement: { kind: "step", stepId: "intake", order: 2 },
        },
      ],
    };

    const saved = buildSavedProcessState(state, [], ["sales"], []);
    const restored = buildProcessStateFromSaved(saved, state.automations);

    expect(saved.artifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "action-wait",
        type: "processAction",
        actionType: "wait",
        label: "Wacht 3 dagen",
        detail: "3 dagen",
        placement: { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1, position: 0.62 },
      }),
    ]));
    expect(restored.processActions).toEqual(state.processActions);
  });

  it("keeps valid flow step placements while filtering missing step targets", () => {
    const filtered = filterFlowLinksForSteps({
      "flow-step": { kind: "step", stepId: "intake", order: 0 },
      "flow-route": { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1 },
      "flow-stale-step": { kind: "step", stepId: "missing", order: 2 },
      "flow-stale-route": { kind: "connection", fromStepId: "missing", toStepId: "controle", order: 3 },
    }, ["intake", "controle"]);

    expect(filtered).toEqual({
      "flow-step": { kind: "step", stepId: "intake", order: 0 },
      "flow-route": { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1 },
    });
  });

  it("removes flow placements that reference a removed step", () => {
    const remaining = removeFlowLinksForStep({
      "flow-step": { kind: "step", stepId: "intake", order: 0 },
      "flow-route": { kind: "connection", fromStepId: "intake", toStepId: "controle", order: 1 },
      "flow-other": { kind: "step", stepId: "controle", order: 2 },
    }, "intake");

    expect(remaining).toEqual({
      "flow-other": { kind: "step", stepId: "controle", order: 2 },
    });
  });
});
