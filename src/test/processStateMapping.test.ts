import { describe, expect, it } from "vitest";
import type { ProcessState } from "@/data/processData";
import {
  buildProcessStateFromSaved,
  buildSavedProcessState,
  restoreSavedProcessState,
} from "@/lib/processStateMapping";

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

  it("maps saved view state while preserving active lanes and custom lane overrides", () => {
    const saved = buildSavedProcessState(
      baseState,
      [],
      ["sales"],
      [
        {
          key: "sales",
          label: "Intake",
          bg: "hsl(215 80% 97%)",
          stroke: "hsl(215 80% 50%)",
          text: "hsl(215 70% 32%)",
          dot: "hsl(215 75% 55%)",
        },
      ],
    );

    const mapped = buildProcessStateFromSaved(saved, baseState.automations);

    expect(mapped.steps).toBe(saved.steps);
    expect(mapped.connections).toBe(saved.connections);
    expect(mapped.automations).toBe(baseState.automations);
    expect(mapped.activeLanes).toEqual(["sales"]);
    expect(mapped.customLanes).toEqual(saved.customLanes);
  });

  it.each([null, [], "bad", 42])(
    "ignores malformed top-level flowLinks payloads without throwing",
    (flowLinks) => {
      const saved = {
        steps: baseState.steps,
        connections: baseState.connections,
        autoLinks: {},
        parkedSteps: [],
        flowLinks,
      };

      expect(() => buildProcessStateFromSaved(saved, baseState.automations)).not.toThrow();
      expect(buildProcessStateFromSaved(saved, baseState.automations).flowLinks).toEqual({});
    },
  );

  it("skips malformed flowLinks entries without throwing", () => {
    const steps = [
      ...baseState.steps,
      { id: "step-2", label: "Follow-up", team: "sales", column: 1 },
    ];
    const saved = {
      steps,
      connections: baseState.connections,
      autoLinks: {},
      parkedSteps: [],
      flowLinks: {
        valid: { fromStepId: "step-1", toStepId: "step-2" },
        missingTo: { fromStepId: "step-1" },
        numericFrom: { fromStepId: 123, toStepId: "step-2" },
        nullEntry: null,
        arrayEntry: ["step-1", "step-2"],
      },
    };

    expect(() => buildProcessStateFromSaved(saved, baseState.automations)).not.toThrow();
    expect(buildProcessStateFromSaved(saved, baseState.automations).flowLinks).toEqual({
      valid: { fromStepId: "step-1", toStepId: "step-2" },
    });
  });

  it("preserves attachments when building and mapping saved process state", () => {
    const stateWithAttachments: ProcessState = {
      ...baseState,
      attachments: [
        {
          id: "attachment-1",
          type: "annotation",
          label: "Review note",
          description: "Check before sending",
          attachedTo: { kind: "step", id: "step-1" },
          offset: { x: 12, y: -8 },
        },
        {
          id: "attachment-2",
          type: "dataObject",
          label: "Lead record",
          attachedTo: { kind: "connection", id: "conn-1" },
        },
      ],
    };

    const saved = buildSavedProcessState(stateWithAttachments, [], ["sales"], []);
    const mapped = buildProcessStateFromSaved(saved, baseState.automations);
    const restored = restoreSavedProcessState(baseState, stateWithAttachments);

    expect(saved.attachments).toEqual(stateWithAttachments.attachments);
    expect(mapped.attachments).toEqual(stateWithAttachments.attachments);
    expect(restored.attachments).toEqual(stateWithAttachments.attachments);
  });

  it("preserves step attachments for parked steps when building and mapping saved process state", () => {
    const parkedStep = { id: "step-parked", label: "Parked", team: "sales", column: 1 };
    const stateWithParkedAttachment: ProcessState = {
      ...baseState,
      attachments: [
        {
          id: "attachment-parked",
          type: "annotation",
          label: "Parked note",
          attachedTo: { kind: "step", id: "step-parked" },
        },
      ],
    };

    const saved = buildSavedProcessState(stateWithParkedAttachment, [parkedStep], ["sales"], []);
    const mapped = buildProcessStateFromSaved(saved, baseState.automations);

    expect(saved.attachments).toEqual(stateWithParkedAttachment.attachments);
    expect(mapped.attachments).toEqual(stateWithParkedAttachment.attachments);
  });

  it("includes attachments in the saved payload shape", () => {
    const stateWithAttachments: ProcessState = {
      ...baseState,
      attachments: [
        {
          id: "attachment-1",
          type: "annotation",
          label: "Review note",
          attachedTo: { kind: "step", id: "step-1" },
        },
      ],
    };

    const saved = buildSavedProcessState(stateWithAttachments, [], ["sales"], []);

    expect(saved).toMatchObject({
      attachments: stateWithAttachments.attachments,
    });
  });

  it("ignores malformed attachment payloads without throwing", () => {
    const saved = {
      steps: baseState.steps,
      connections: baseState.connections,
      autoLinks: {},
      parkedSteps: [],
      attachments: [
        null,
        "bad",
        { id: "missing-fields" },
        {
          id: "bad-type",
          type: "report",
          label: "Bad type",
          attachedTo: { kind: "step", id: "step-1" },
        },
        {
          id: "bad-target",
          type: "annotation",
          label: "Bad target",
          attachedTo: { kind: "lane", id: "step-1" },
        },
        {
          id: "bad-offset",
          type: "annotation",
          label: "Bad offset",
          attachedTo: { kind: "step", id: "step-1" },
          offset: { x: "12", y: 0 },
        },
        {
          id: "valid",
          type: "dataStore",
          label: "Valid",
          description: "Useful context",
          attachedTo: { kind: "connection", id: "conn-1" },
          offset: { x: 12, y: 0 },
        },
      ],
    };

    expect(() => buildProcessStateFromSaved(saved, baseState.automations)).not.toThrow();
    expect(buildProcessStateFromSaved(saved, baseState.automations).attachments).toEqual([
      {
        id: "valid",
        type: "dataStore",
        label: "Valid",
        description: "Useful context",
        attachedTo: { kind: "connection", id: "conn-1" },
        offset: { x: 12, y: 0 },
      },
    ]);
  });

  it.each([{ id: "not-an-array" }, "not-an-array"])(
    "ignores malformed top-level attachment payloads without throwing",
    (attachments) => {
      const saved = {
        steps: baseState.steps,
        connections: baseState.connections,
        autoLinks: {},
        parkedSteps: [],
        attachments,
      };

      expect(() => buildProcessStateFromSaved(saved, baseState.automations)).not.toThrow();
      expect(buildProcessStateFromSaved(saved, baseState.automations).attachments).toEqual([]);
    },
  );

  it("drops attachments whose target no longer exists", () => {
    const stateWithAttachments: ProcessState = {
      ...baseState,
      attachments: [
        {
          id: "attachment-1",
          type: "annotation",
          label: "Review note",
          attachedTo: { kind: "step", id: "step-1" },
        },
        {
          id: "attachment-2",
          type: "dataObject",
          label: "Removed step",
          attachedTo: { kind: "step", id: "missing-step" },
        },
        {
          id: "attachment-3",
          type: "dataStore",
          label: "Removed connection",
          attachedTo: { kind: "connection", id: "missing-connection" },
        },
      ],
    };

    const saved = buildSavedProcessState(stateWithAttachments, [], ["sales"], []);
    const mapped = buildProcessStateFromSaved(saved, baseState.automations);
    const restored = restoreSavedProcessState(baseState, stateWithAttachments);

    expect(saved.attachments).toEqual([stateWithAttachments.attachments?.[0]]);
    expect(mapped.attachments).toEqual([stateWithAttachments.attachments?.[0]]);
    expect(restored.attachments).toEqual([stateWithAttachments.attachments?.[0]]);
  });
});
