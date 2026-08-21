# Multiple Automation Placements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one automation to be placed multiple times on different targets in the same pipeline canvas without duplicating the automation record.

**Architecture:** Add placement-list support at the saved-state boundary, then expose placement instances to canvas/editor UI. Backward compatibility is handled by normalizing old single-placement saves to one-item arrays while writers always emit arrays. Placement identity is deterministic from `(automationId, target)` and is used for deduplication, move, and remove operations.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Supabase JSON process state.

---

## File Structure

- Modify `src/data/processData.ts`
  - Add `ProcessPlacementTargetKey`, `AutomationPlacementInstance`, and `ProcessPlacementLinkList` types.
  - Keep existing `Automation.placement` for compatibility while adding `Automation.placements?: CanvasPlacement[]`.
- Modify `src/lib/processPlacementInstances.ts`
  - New helper module for placement normalization, target keys, deduplication, and instance ids.
- Modify `src/lib/storage/processState.ts`
  - Widen `SavedProcessState.autoLinks` and `flowLinks` typing enough to accept old object values and new arrays.
- Modify `src/lib/processStateMapping.ts`
  - Read old and new `autoLinks`.
  - Write new array-shaped `autoLinks`.
  - Drop invalid/orphaned placements without dropping the automation record.
- Modify `src/components/process/ProcessCanvas.tsx`
  - Render automation placement instances instead of assuming one placement per automation.
  - Deduplicate drops on the same target.
  - Pass placement identity through automation click/drag callbacks.
- Modify `src/components/process/ProcessenEditor.tsx`
  - Add/remove/move individual automation placements.
  - Cascade-remove placements when steps/connections are deleted.
  - Keep unique-automation counts distinct from placement counts.
- Modify `src/components/process/AutomationDetailPanel.tsx`
  - Render "Gekoppeld aan" as a list of placement tags.
  - Add remove control per placement.
- Modify `src/pages/Procesviewer.tsx`
  - Normalize saved placements in viewer mode.
  - Keep KPI counts as unique automation counts.
- Modify tests:
  - `src/test/processStateMapping.test.ts`
  - `src/test/processCanvasPlacement.test.tsx`
  - `src/test/processenEditorEditMode.test.tsx`

## Task 1: Placement Helper Types And Normalization

**Files:**
- Modify: `src/data/processData.ts`
- Create: `src/lib/processPlacementInstances.ts`
- Test: `src/test/processStateMapping.test.ts`

- [ ] **Step 1: Add failing normalization tests**

Add imports in `src/test/processStateMapping.test.ts`:

```ts
import {
  normalizeAutomationPlacementLinks,
  placementTargetKey,
} from "@/lib/processPlacementInstances";
```

Add tests inside `describe("process state mapping", () => { ... })`:

```ts
it("normalizes old single-placement automation links to one placement", () => {
  const links = normalizeAutomationPlacementLinks(
    {
      "auto-1": { kind: "step", stepId: "step-1", order: 0 },
    },
    new Set(["step-1"]),
  );

  expect(links).toEqual({
    "auto-1": [{ kind: "step", stepId: "step-1", order: 0 }],
  });
});

it("deduplicates automation placements by automation id and target", () => {
  const links = normalizeAutomationPlacementLinks(
    {
      "auto-1": [
        { kind: "step", stepId: "step-1", order: 0 },
        { kind: "step", stepId: "step-1", order: 1 },
        { kind: "step", stepId: "step-2", order: 2 },
      ],
    },
    new Set(["step-1", "step-2"]),
  );

  expect(links).toEqual({
    "auto-1": [
      { kind: "step", stepId: "step-1", order: 0 },
      { kind: "step", stepId: "step-2", order: 2 },
    ],
  });
});

it("drops orphaned automation placements during normalization", () => {
  const links = normalizeAutomationPlacementLinks(
    {
      "auto-1": [
        { kind: "step", stepId: "step-1", order: 0 },
        { kind: "step", stepId: "missing-step", order: 1 },
        { kind: "connection", fromStepId: "step-1", toStepId: "missing-step", order: 2 },
      ],
    },
    new Set(["step-1"]),
  );

  expect(links).toEqual({
    "auto-1": [{ kind: "step", stepId: "step-1", order: 0 }],
  });
});

it("builds deterministic placement target keys", () => {
  expect(placementTargetKey({ kind: "step", stepId: "step-1" })).toBe("step:step-1");
  expect(placementTargetKey({ kind: "connection", fromStepId: "step-1", toStepId: "step-2" })).toBe("connection:step-1->step-2");
  expect(placementTargetKey({ kind: "pipeline_wide" })).toBe("pipeline_wide");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- src/test/processStateMapping.test.ts
```

Expected: FAIL because `@/lib/processPlacementInstances` does not exist.

- [ ] **Step 3: Add types**

In `src/data/processData.ts`, replace:

```ts
export type ProcessPlacementLink = CanvasPlacement | { fromStepId: string; toStepId: string; order?: number; position?: number };
```

with:

```ts
export type ProcessPlacementLink = CanvasPlacement | { fromStepId: string; toStepId: string; order?: number; position?: number };
export type ProcessPlacementLinkList = ProcessPlacementLink | ProcessPlacementLink[];
export type ProcessPlacementTargetKey = string;

export interface AutomationPlacementInstance {
  instanceId: string;
  automationId: string;
  placement: CanvasPlacement;
}
```

Update `Automation`:

```ts
export interface Automation {
  id: string;
  name: string;
  team: TeamKey;
  tool: string;
  goal: string;
  status?: string;
  link?: string;
  fromStepId?: string;
  toStepId?: string;
  placement?: CanvasPlacement;
  placements?: CanvasPlacement[];
  syncTiming?: string;
  checksSummary?: string;
  actionSummary?: string;
  affectedStageIds?: string[];
}
```

- [ ] **Step 4: Add normalization helper**

Create `src/lib/processPlacementInstances.ts`:

```ts
import type {
  Automation,
  AutomationPlacementInstance,
  CanvasPlacement,
  ProcessPlacementLink,
  ProcessPlacementLinkList,
} from "@/data/processData";
import { normalizePlacementLink } from "@/lib/processFlowLinks";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function placementTargetKey(placement: CanvasPlacement): string {
  if (placement.kind === "step") return `step:${placement.stepId}`;
  if (placement.kind === "connection") return `connection:${placement.fromStepId}->${placement.toStepId}`;
  return "pipeline_wide";
}

export function placementInstanceId(automationId: string, placement: CanvasPlacement): string {
  return `${automationId}:${placementTargetKey(placement)}`;
}

export function placementTargetExists(placement: CanvasPlacement, validStepIds: Set<string>): boolean {
  if (placement.kind === "pipeline_wide") return true;
  if (placement.kind === "step") return validStepIds.has(placement.stepId);
  return validStepIds.has(placement.fromStepId) && validStepIds.has(placement.toStepId);
}

export function normalizePlacementList(value: unknown, validStepIds?: Set<string>): CanvasPlacement[] {
  const rawValues = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const seen = new Set<string>();
  const placements: CanvasPlacement[] = [];

  for (const raw of rawValues) {
    if (!isRecord(raw)) continue;
    const placement = normalizePlacementLink(raw as ProcessPlacementLink);
    if (!placementTargetExists(placement, validStepIds ?? new Set())) {
      if (validStepIds) continue;
    }
    const key = placementTargetKey(placement);
    if (seen.has(key)) continue;
    seen.add(key);
    placements.push(placement);
  }

  return placements;
}

export function normalizeAutomationPlacementLinks(
  autoLinks: Record<string, ProcessPlacementLinkList | unknown>,
  validStepIds?: Set<string>,
): Record<string, CanvasPlacement[]> {
  return Object.fromEntries(
    Object.entries(autoLinks)
      .map(([automationId, value]) => [automationId, normalizePlacementList(value, validStepIds)] as const)
      .filter(([, placements]) => placements.length > 0),
  );
}

export function automationPlacementInstances(automation: Automation): AutomationPlacementInstance[] {
  const placements = automation.placements?.length
    ? automation.placements
    : automation.placement
      ? [automation.placement]
      : [];

  return placements.map((placement) => ({
    instanceId: placementInstanceId(automation.id, placement),
    automationId: automation.id,
    placement,
  }));
}

export function withPlacementList(automation: Automation, placements: CanvasPlacement[]): Automation {
  const firstConnection = placements.find((placement) => placement.kind === "connection");
  return {
    ...automation,
    placements,
    placement: placements[0],
    fromStepId: firstConnection?.kind === "connection" ? firstConnection.fromStepId : undefined,
    toStepId: firstConnection?.kind === "connection" ? firstConnection.toStepId : undefined,
  };
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- src/test/processStateMapping.test.ts
```

Expected: PASS for new helper tests or FAIL only where existing mapping still assumes single placement. Continue to Task 2 for mapping changes.

- [ ] **Step 6: Commit**

```bash
git add src/data/processData.ts src/lib/processPlacementInstances.ts src/test/processStateMapping.test.ts
git commit -m "feat: add automation placement normalization"
```

## Task 2: Saved State Read/Write Compatibility

**Files:**
- Modify: `src/lib/storage/processState.ts`
- Modify: `src/lib/processStateMapping.ts`
- Test: `src/test/processStateMapping.test.ts`

- [ ] **Step 1: Add failing mapping tests**

Add to `src/test/processStateMapping.test.ts`:

```ts
it("writes automation links as placement arrays", () => {
  const state: ProcessState = {
    ...baseState,
    steps: [
      { id: "step-1", label: "Intake", team: "sales", column: 0 },
      { id: "step-2", label: "Controle", team: "sales", column: 1 },
    ],
    automations: [
      {
        ...baseState.automations[0],
        placements: [
          { kind: "step", stepId: "step-1", order: 0 },
          { kind: "step", stepId: "step-2", order: 1 },
        ],
      },
    ],
  };

  const saved = buildSavedProcessState(state, [], ["sales"], []);

  expect(saved.autoLinks).toEqual({
    "auto-1": [
      { kind: "step", stepId: "step-1", order: 0 },
      { kind: "step", stepId: "step-2", order: 1 },
    ],
  });
});

it("maps new placement arrays while preserving one automation record", () => {
  const saved = {
    steps: [
      { id: "step-1", label: "Intake", team: "sales", column: 0 },
      { id: "step-2", label: "Controle", team: "sales", column: 1 },
    ],
    connections: [],
    autoLinks: {
      "auto-1": [
        { kind: "step", stepId: "step-1", order: 0 },
        { kind: "step", stepId: "step-2", order: 1 },
      ],
    },
    parkedSteps: [],
  };

  const mapped = buildProcessStateFromSaved(saved, baseState.automations);

  expect(mapped.automations).toHaveLength(2);
  expect(mapped.automations[0].placements).toEqual(saved.autoLinks["auto-1"]);
  expect(mapped.automations[0].placement).toEqual({ kind: "step", stepId: "step-1", order: 0 });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/processStateMapping.test.ts
```

Expected: FAIL because `SavedProcessState.autoLinks` and mapping still use one placement.

- [ ] **Step 3: Widen saved type**

In `src/lib/storage/processState.ts`, update imports:

```ts
import type { ProcessPlacementLink, ProcessPlacementLinkList } from "@/data/processData";
```

Update `SavedProcessState`:

```ts
autoLinks: Record<string, ProcessPlacementLinkList>;
flowLinks?: Record<string, ProcessPlacementLink>;
```

Update casts:

```ts
autoLinks: (data.auto_links ?? {}) as Record<string, ProcessPlacementLinkList>,
```

Keep `flowLinks` as single placement links.

- [ ] **Step 4: Update `buildSavedProcessState`**

In `src/lib/processStateMapping.ts`, import helpers:

```ts
import {
  normalizeAutomationPlacementLinks,
  withPlacementList,
} from "@/lib/processPlacementInstances";
```

Replace the `state.automations.forEach` body in `buildSavedProcessState` with:

```ts
state.automations.forEach((automation, index) => {
  const placements = normalizeAutomationPlacementLinks(
    {
      [automation.id]: automation.placements?.length
        ? automation.placements
        : automation.placement
          ? automation.placement
          : automation.fromStepId && automation.toStepId
            ? { kind: "connection", fromStepId: automation.fromStepId, toStepId: automation.toStepId, order: index }
            : undefined,
    },
    validStepIds,
  )[automation.id];

  if (placements?.length) {
    autoLinks[automation.id] = placements.map((placement, placementIndex) => ({
      ...placement,
      order: placement.order ?? placementIndex,
    }));
  }
});
```

- [ ] **Step 5: Update restore/map functions**

In `restoreSavedProcessState`, replace single-placement parsing with:

```ts
const savedLinks = normalizeAutomationPlacementLinks(
  Object.fromEntries(saved.automations.map((item, index) => [
    item.id,
    item.placements?.length
      ? item.placements
      : item.placement ?? item,
  ])),
  validStepIds,
);
```

Then map automations with:

```ts
const placements = savedLinks[automation.id] ?? [];
return savedAutomation
  ? withPlacementList(automation, placements)
  : withPlacementList(automation, []);
```

In `buildProcessStateFromSaved`, replace:

```ts
const placement = parsePlacement(saved.autoLinks[automation.id], index);
```

with:

```ts
const placements = normalizeAutomationPlacementLinks(saved.autoLinks, validStepIds)[automation.id] ?? [];
```

and return:

```ts
return withPlacementList(automation, placements);
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test -- src/test/processStateMapping.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/storage/processState.ts src/lib/processStateMapping.ts src/test/processStateMapping.test.ts
git commit -m "feat: persist multiple automation placements"
```

## Task 3: Canvas Rendering And Drop Deduplication

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`
- Test: `src/test/processCanvasPlacement.test.tsx`

- [ ] **Step 1: Add failing render/dedup tests**

Add to `src/test/processCanvasPlacement.test.tsx`:

```ts
it("renders multiple step markers for the same automation", () => {
  render(
    <ProcessCanvas
      steps={[
        { id: "intake", label: "Intake", team: "sales", column: 0 },
        { id: "controle", label: "Controle", team: "sales", column: 1 },
      ]}
      connections={[]}
      automations={[
        {
          id: "auto-1",
          name: "Stage automation",
          team: "sales",
          tool: "HubSpot",
          goal: "Runs in multiple stages",
          placements: [
            { kind: "step", stepId: "intake", order: 0 },
            { kind: "step", stepId: "controle", order: 0 },
          ],
        },
      ]}
    />,
  );

  expect(screen.getByLabelText("Automation Stage automation op stap Intake")).toBeInTheDocument();
  expect(screen.getByLabelText("Automation Stage automation op stap Controle")).toBeInTheDocument();
});
```

Add a drop test near existing step-drop tests:

```ts
it("does not request a duplicate step placement for the same automation", () => {
  const onAttachAutomationToStep = vi.fn();
  const { container } = render(
    <ProcessCanvas
      steps={[{ id: "intake", label: "Intake", team: "sales", column: 0 }]}
      connections={[]}
      automations={[
        {
          id: "auto-1",
          name: "Stage automation",
          team: "sales",
          tool: "HubSpot",
          goal: "Runs in intake",
          placements: [{ kind: "step", stepId: "intake", order: 0 }],
        },
      ]}
      onAttachAutomationToStep={onAttachAutomationToStep}
    />,
  );

  const svg = container.querySelector("svg")!;
  dropWithPoint(svg, { clientX: 180, clientY: 44 }, { automationId: "auto-1" });

  expect(onAttachAutomationToStep).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/processCanvasPlacement.test.tsx
```

Expected: FAIL because `ProcessCanvas` only renders one automation placement.

- [ ] **Step 3: Expand canvas automation placement loops**

In `src/components/process/ProcessCanvas.tsx`, import:

```ts
import {
  automationPlacementInstances,
  placementTargetKey,
} from "@/lib/processPlacementInstances";
```

Where step placements are grouped, replace single `automationPlacement(automation, index)` usage with instance expansion:

```ts
automations.forEach((automation) => {
  for (const instance of automationPlacementInstances(automation)) {
    if (instance.placement.kind !== "step") continue;
    const items = byStep.get(instance.placement.stepId) ?? [];
    items.push({
      id: instance.instanceId,
      kind: "automation",
      label: automation.name,
      item: automation,
      placement: instance.placement,
    });
    byStep.set(instance.placement.stepId, items);
  }
});
```

Where connection placement dots are filtered, use:

```ts
const connAutos = automations.flatMap((automation) =>
  automationPlacementInstances(automation)
    .filter((instance) =>
      instance.placement.kind === "connection"
      && instance.placement.fromStepId === conn.fromStepId
      && instance.placement.toStepId === conn.toStepId,
    )
    .map((instance) => ({ automation, instance })),
);
```

Render with `instance.instanceId` as the key and `instance.placement` for order/position.

- [ ] **Step 4: Add drop dedup check**

Before calling `onAttachAutomationToStep`, add:

```ts
const alreadyPlacedOnStep = automations.some((automation) =>
  automation.id === autoId
  && automationPlacementInstances(automation).some((instance) =>
    instance.placement.kind === "step" && instance.placement.stepId === step.id,
  ),
);
if (alreadyPlacedOnStep) return;
```

Before calling `onAttachAutomation` for a connection, add:

```ts
const targetKey = placementTargetKey({ kind: "connection", fromStepId: conn.fromStepId, toStepId: conn.toStepId });
const alreadyPlacedOnConnection = automations.some((automation) =>
  automation.id === autoId
  && automationPlacementInstances(automation).some((instance) => placementTargetKey(instance.placement) === targetKey),
);
if (alreadyPlacedOnConnection) return;
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- src/test/processCanvasPlacement.test.tsx
```

Expected: PASS for placement canvas tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/process/ProcessCanvas.tsx src/test/processCanvasPlacement.test.tsx
git commit -m "feat: render multiple automation placements"
```

## Task 4: Editor Add/Move/Remove Semantics

**Files:**
- Modify: `src/components/process/ProcessenEditor.tsx`
- Test: `src/test/processenEditorEditMode.test.tsx`

- [ ] **Step 1: Add failing editor tests**

Add tests to `src/test/processenEditorEditMode.test.tsx` next to existing placement tests:

```ts
it("adds a second placement instead of replacing an existing automation placement", async () => {
  renderEditorWithSavedState({
    ...savedState,
    steps: [
      { id: "intake", label: "Intake", team: "sales", column: 0 },
      { id: "controle", label: "Controle", team: "sales", column: 1 },
    ],
    autoLinks: {
      automationRoute: [{ kind: "step", stepId: "intake", order: 0 }],
    },
  });

  attachAutomationToStep("automationRoute", "controle");
  await saveEditor();

  expect(saveProcessStateMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      autoLinks: {
        automationRoute: [
          { kind: "step", stepId: "intake", order: 0 },
          { kind: "step", stepId: "controle", order: 1 },
        ],
      },
    }),
  );
});

it("removes only the selected automation placement", async () => {
  renderEditorWithSavedState({
    ...savedState,
    steps: [
      { id: "intake", label: "Intake", team: "sales", column: 0 },
      { id: "controle", label: "Controle", team: "sales", column: 1 },
    ],
    autoLinks: {
      automationRoute: [
        { kind: "step", stepId: "intake", order: 0 },
        { kind: "step", stepId: "controle", order: 1 },
      ],
    },
  });

  openAutomationDetail("automationRoute");
  fireEvent.click(screen.getByRole("button", { name: "Koppeling Intake verwijderen" }));
  await saveEditor();

  expect(saveProcessStateMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      autoLinks: {
        automationRoute: [{ kind: "step", stepId: "controle", order: 1 }],
      },
    }),
  );
});
```

If helper functions do not exist, implement the test using the file's existing render and drag utilities instead of inventing new global helpers.

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/processenEditorEditMode.test.tsx
```

Expected: FAIL because editor attachment replaces a single placement.

- [ ] **Step 3: Update `handleAttachAutomationToStep`**

In `src/components/process/ProcessenEditor.tsx`, import:

```ts
import {
  normalizePlacementList,
  placementTargetKey,
  withPlacementList,
} from "@/lib/processPlacementInstances";
```

Replace the single-placement update in `handleAttachAutomationToStep` with:

```ts
setState((s) => ({
  ...s,
  automations: s.automations.map((a) => {
    if (a.id !== autoId) return a;
    const current = normalizePlacementList(a.placements?.length ? a.placements : a.placement);
    const nextPlacement = { kind: "step" as const, stepId, order };
    const targetKey = placementTargetKey(nextPlacement);
    if (current.some((placement) => placementTargetKey(placement) === targetKey)) return a;
    return withPlacementList(a, [...current, nextPlacement]);
  }),
}));
toast.success("Automation aan stap gekoppeld");
```

- [ ] **Step 4: Update connection attachment**

Replace `handleAttach` single-placement update with:

```ts
setState((s) => ({
  ...s,
  automations: s.automations.map((a) => {
    if (a.id !== autoId) return a;
    const current = normalizePlacementList(a.placements?.length ? a.placements : a.placement);
    const nextPlacement = { kind: "connection" as const, fromStepId, toStepId, order, position };
    const targetKey = placementTargetKey(nextPlacement);
    if (current.some((placement) => placementTargetKey(placement) === targetKey)) return a;
    return withPlacementList(a, [...current, nextPlacement]);
  }),
}));
toast.success("Automation gekoppeld");
```

- [ ] **Step 5: Update detach/remove**

Change `handleDetachAutomation` signature to:

```ts
function handleDetachAutomation(autoId: string, targetKey?: string) {
```

Use:

```ts
setState((s) => ({
  ...s,
  automations: s.automations.map((a) => {
    if (a.id !== autoId) return a;
    if (!targetKey) return withPlacementList(a, []);
    const current = normalizePlacementList(a.placements?.length ? a.placements : a.placement);
    return withPlacementList(a, current.filter((placement) => placementTargetKey(placement) !== targetKey));
  }),
}));
toast.success("Automation losgekoppeld");
```

- [ ] **Step 6: Cascade step deletion**

In automation step-removal logic, replace single-placement clearing with:

```ts
function removeAutomationPlacementsForStep(automation: Automation, stepId: string): Automation {
  const current = normalizePlacementList(automation.placements?.length ? automation.placements : automation.placement);
  const remaining = current.filter((placement) => {
    if (placement.kind === "pipeline_wide") return true;
    if (placement.kind === "step") return placement.stepId !== stepId;
    return placement.fromStepId !== stepId && placement.toStepId !== stepId;
  });
  return withPlacementList(automation, remaining);
}
```

Use it wherever deleted steps currently clear `automation.placement`.

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test -- src/test/processenEditorEditMode.test.tsx src/test/processStateMapping.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/process/ProcessenEditor.tsx src/test/processenEditorEditMode.test.tsx
git commit -m "feat: edit individual automation placements"
```

## Task 5: Detail Panel Placement List

**Files:**
- Modify: `src/components/process/AutomationDetailPanel.tsx`
- Modify: `src/components/process/ProcessenEditor.tsx`
- Test: `src/test/processenEditorEditMode.test.tsx`

- [ ] **Step 1: Add failing detail panel test**

Add to `src/test/processenEditorEditMode.test.tsx`:

```ts
it("shows every automation placement in the detail panel", async () => {
  renderEditorWithSavedState({
    ...savedState,
    steps: [
      { id: "intake", label: "Intake", team: "sales", column: 0 },
      { id: "controle", label: "Controle", team: "sales", column: 1 },
    ],
    autoLinks: {
      automationRoute: [
        { kind: "step", stepId: "intake", order: 0 },
        { kind: "step", stepId: "controle", order: 1 },
      ],
    },
  });

  openAutomationDetail("automationRoute");

  expect(screen.getByText("Intake")).toBeInTheDocument();
  expect(screen.getByText("Controle")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Koppeling Intake verwijderen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Koppeling Controle verwijderen" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm run test -- src/test/processenEditorEditMode.test.tsx
```

Expected: FAIL because the panel shows one placement.

- [ ] **Step 3: Extend panel props**

In `src/components/process/AutomationDetailPanel.tsx`, add props:

```ts
onDetachPlacement?: (automationId: string, targetKey: string) => void;
```

Import helpers:

```ts
import {
  automationPlacementInstances,
  placementTargetKey,
} from "@/lib/processPlacementInstances";
```

- [ ] **Step 4: Render placement tags**

Replace the single "Gekoppeld aan" body with:

```tsx
const placementRows = automationPlacementInstances(automation).map((instance) => {
  const placement = instance.placement;
  if (placement.kind === "pipeline_wide") {
    return { key: placementTargetKey(placement), label: "Pipeline-breed" };
  }
  if (placement.kind === "step") {
    const step = steps.find((item) => item.id === placement.stepId);
    return { key: placementTargetKey(placement), label: step?.label ?? placement.stepId };
  }
  const from = steps.find((item) => item.id === placement.fromStepId);
  const to = steps.find((item) => item.id === placement.toStepId);
  return {
    key: placementTargetKey(placement),
    label: `${from?.label ?? placement.fromStepId} -> ${to?.label ?? placement.toStepId}`,
  };
});
```

Render:

```tsx
{placementRows.length > 0 && (
  <Section label="Gekoppeld aan">
    <div className="space-y-2">
      {placementRows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
          <span className="font-medium text-foreground truncate">{row.label}</span>
          {onDetachPlacement && (
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Koppeling ${row.label} verwijderen`}
              onClick={() => onDetachPlacement(automation.id, row.key)}
            >
              Verwijderen
            </button>
          )}
        </div>
      ))}
    </div>
  </Section>
)}
```

- [ ] **Step 5: Wire editor callback**

In `ProcessenEditor.tsx`, pass:

```tsx
onDetachPlacement={(automationId, targetKey) => handleDetachAutomation(automationId, targetKey)}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test -- src/test/processenEditorEditMode.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/process/AutomationDetailPanel.tsx src/components/process/ProcessenEditor.tsx src/test/processenEditorEditMode.test.tsx
git commit -m "feat: list automation placements in detail panel"
```

## Task 6: Viewer Mapping And Counts

**Files:**
- Modify: `src/pages/Procesviewer.tsx`
- Test: `src/test/procesviewerSharedCanvas.test.tsx`
- Test: `src/test/processStateMapping.test.ts`

- [ ] **Step 1: Add count expectations**

In the most focused available viewer/cockpit test, assert that two placements for the same automation still count as one linked automation:

```ts
expect(screen.getByText(/Gekoppelde automations/i)).toBeInTheDocument();
expect(screen.getByText("1")).toBeInTheDocument();
```

If the existing `procesviewerSharedCanvas.test.tsx` mock is still failing because of unrelated `useUpdateProcessManualStatus`, first add the missing mock export:

```ts
useUpdateProcessManualStatus: () => ({ mutateAsync: vi.fn(), isPending: false }),
```

- [ ] **Step 2: Update viewer conversion**

In `src/pages/Procesviewer.tsx`, change `toCanvasAutomation` to accept `ProcessPlacementLinkList | undefined` and use:

```ts
const placements = normalizePlacementList(link);
return {
  ...a,
  fromStepId: placements.find((placement) => placement.kind === "connection")?.fromStepId,
  toStepId: placements.find((placement) => placement.kind === "connection")?.toStepId,
  placement: placements[0],
  placements,
};
```

- [ ] **Step 3: Keep KPI counts unique**

Where `linkedAutomationCount` or `linkedAutomations` is computed, count by automation id:

```ts
const linkedAutomationIds = new Set(
  automations
    .filter((automation) => normalizePlacementList(automation.placements?.length ? automation.placements : automation.placement).length > 0)
    .map((automation) => automation.id),
);
const linkedAutomationCount = linkedAutomationIds.size;
```

Do not count placement instances unless the label says "plaatsingen".

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test -- src/test/procesviewerSharedCanvas.test.tsx src/test/processStateMapping.test.ts
```

Expected: PASS or only fail on unrelated pre-existing mocks if not touched by this task. Do not ignore new failures in `Procesviewer.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Procesviewer.tsx src/test/procesviewerSharedCanvas.test.tsx src/test/processStateMapping.test.ts
git commit -m "feat: show multiple placements in process viewer"
```

## Task 7: Final Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- src/test/processStateMapping.test.ts src/test/processCanvasPlacement.test.tsx src/test/processenEditorEditMode.test.tsx src/test/procesviewerSharedCanvas.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full build**

Run:

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Run full tests**

Run:

```bash
npm run test
```

Expected: PASS. If unrelated pre-existing tests fail, document exact files and errors and prove the diff does not touch those areas.

- [ ] **Step 4: Request final code review**

Use `superpowers:requesting-code-review` with the base commit before Task 1 and the current HEAD. The review must check:

- old and new `autoLinks` shapes;
- deduplication;
- placement-level remove/move behavior;
- detail panel tag removal;
- unique automation counts;
- orphan cleanup;
- regression risk in process canvas rendering.

- [ ] **Step 5: Fix review findings or document residual risk**

Fix Critical and Important findings before completion. Commit fixes separately:

```bash
git add <changed-files>
git commit -m "fix: address multiple placement review"
```

- [ ] **Step 6: Final status**

Report:

- commits created;
- tests run and results;
- any known unrelated failures;
- files changed.
