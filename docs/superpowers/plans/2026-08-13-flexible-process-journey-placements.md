# Flexible Process Journey Placements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one process journey to be linked to multiple arrows and/or the Automatic sync block without duplicating the process journey record.

**Architecture:** Add flow-placement list helpers at the saved-state boundary, then update canvas/editor/sidebar/detail panel behavior to render and mutate placement instances. Existing single `flowLinks[flowId] = placement` data remains readable, while writers emit arrays with explicit `pipelineId` context.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Supabase JSON process state.

---

## File Structure

- Modify `src/data/processData.ts`
  - Add `ProcessFlowPlacement`, `ProcessFlowPlacementList`, and `ProcessFlowPlacementInstance` types.
  - Widen `ProcessState.flowLinks` to accept old single links and new arrays.
- Create `src/lib/processFlowPlacements.ts`
  - Normalize old/new `flowLinks`.
  - Build target keys, instance ids, dedupe, pipeline filtering, and placement removal helpers.
- Modify `src/lib/processFlowLinks.ts`
  - Either delegate to the new helper or keep backward-compatible wrappers for existing callers.
- Modify `src/lib/storage/processState.ts`
  - Widen `SavedProcessState.flowLinks` typing to old/new shapes.
- Modify `src/lib/processStateMapping.ts`
  - Read old/new flow links.
  - Write array-shaped flow links.
  - Filter invalid/orphaned flow placements.
- Modify `src/lib/processBackup.ts`
  - Export and import array-shaped `flowLinks`.
- Modify `src/components/process/ProcessCanvas.tsx`
  - Render multiple process journey placements.
  - Allow process journey drops on Automatic sync.
  - Deduplicate duplicate connection/sync drops.
  - Keep process journeys disallowed on step-bottom targets.
- Modify `src/components/process/ProcessenEditor.tsx`
  - Append/deduplicate/remove individual flow placements.
  - Cascade-remove only affected flow placements when steps/connections are deleted.
  - Track selected flow placement target for detail panel removal.
- Modify `src/components/process/UnassignedPanel.tsx`
  - Count linked process journeys uniquely per current pipeline.
  - Render process journey placement subrows with per-placement remove controls.
- Modify `src/components/process/FlowDetailPanel.tsx`
  - Show all current-pipeline placements and allow per-placement unlinking.
- Modify `src/pages/Procesviewer.tsx`
  - Normalize flow placement lists before passing to read-only canvas.
- Modify tests:
  - `src/test/processStateMapping.test.ts`
  - `src/test/processBackup.test.ts`
  - `src/test/processCanvasPlacement.test.tsx`
  - `src/test/processenEditorEditMode.test.tsx`
  - `src/test/procesviewerSharedCanvas.test.tsx`

## Task 1: Flow Placement Helper Types

**Files:**
- Modify: `src/data/processData.ts`
- Create: `src/lib/processFlowPlacements.ts`
- Test: `src/test/processStateMapping.test.ts`

- [ ] **Step 1: Add failing helper tests**

Add imports to `src/test/processStateMapping.test.ts`:

```ts
import {
  flowPlacementTargetKey,
  normalizeFlowPlacementList,
  normalizeFlowPlacementLinks,
  removeFlowPlacementByTarget,
} from "@/lib/processFlowPlacements";
```

Add tests inside the existing process state mapping describe block:

```ts
it("normalizes old single process journey link to one placement for the current pipeline", () => {
  const links = normalizeFlowPlacementLinks(
    {
      "flow-1": { kind: "connection", fromStepId: "a", toStepId: "b", order: 0 },
    },
    { validStepIds: new Set(["a", "b"]), pipelineId: "ib" },
  );

  expect(links).toEqual({
    "flow-1": [{ kind: "connection", fromStepId: "a", toStepId: "b", order: 0, pipelineId: "ib" }],
  });
});

it("deduplicates process journey placements by flow id, pipeline id, and target", () => {
  const links = normalizeFlowPlacementLinks(
    {
      "flow-1": [
        { kind: "pipeline_wide", pipelineId: "ib", order: 0 },
        { kind: "pipeline_wide", pipelineId: "ib", order: 1 },
        { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib", order: 2 },
      ],
    },
    { validStepIds: new Set(["a", "b"]), pipelineId: "ib" },
  );

  expect(links).toEqual({
    "flow-1": [
      { kind: "pipeline_wide", pipelineId: "ib", order: 0 },
      { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib", order: 2 },
    ],
  });
});

it("drops process journey step placements and orphaned connection placements", () => {
  const links = normalizeFlowPlacementLinks(
    {
      "flow-1": [
        { kind: "step", stepId: "a", pipelineId: "ib" },
        { kind: "connection", fromStepId: "a", toStepId: "missing", pipelineId: "ib" },
        { kind: "pipeline_wide", pipelineId: "ib" },
      ],
    },
    { validStepIds: new Set(["a"]), pipelineId: "ib" },
  );

  expect(links).toEqual({
    "flow-1": [{ kind: "pipeline_wide", pipelineId: "ib" }],
  });
});

it("removes one process journey placement by target key", () => {
  const placements = normalizeFlowPlacementList(
    [
      { kind: "pipeline_wide", pipelineId: "ib" },
      { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib" },
    ],
    { validStepIds: new Set(["a", "b"]), pipelineId: "ib" },
  );

  const remaining = removeFlowPlacementByTarget(
    placements,
    flowPlacementTargetKey({ kind: "pipeline_wide", pipelineId: "ib" }),
  );

  expect(remaining).toEqual([
    { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib" },
  ]);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- src/test/processStateMapping.test.ts
```

Expected: FAIL because `@/lib/processFlowPlacements` does not exist and flow placement types are not defined.

- [ ] **Step 3: Add flow placement types**

In `src/data/processData.ts`, add after `ProcessPlacementLink`:

```ts
export type ProcessFlowPlacement =
  | (Extract<CanvasPlacement, { kind: "connection" }> & { pipelineId: string })
  | (Extract<CanvasPlacement, { kind: "pipeline_wide" }> & { pipelineId: string });

export type ProcessFlowPlacementList = ProcessPlacementLink | ProcessFlowPlacement | ProcessFlowPlacement[];

export interface ProcessFlowPlacementInstance {
  instanceId: string;
  flowId: string;
  placement: ProcessFlowPlacement;
}
```

Update `ProcessState`:

```ts
flowLinks?: Record<string, ProcessFlowPlacementList>;
```

- [ ] **Step 4: Add normalization helper**

Create `src/lib/processFlowPlacements.ts`:

```ts
import type {
  CanvasPlacement,
  ProcessFlowPlacement,
  ProcessFlowPlacementInstance,
  ProcessFlowPlacementList,
  ProcessPlacementLink,
} from "@/data/processData";
import { normalizePlacementLink } from "@/lib/processFlowLinks";

interface NormalizeFlowPlacementOptions {
  validStepIds?: Set<string>;
  pipelineId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withPipelineId(placement: CanvasPlacement, pipelineId: string): ProcessFlowPlacement | null {
  if (placement.kind === "step") return null;
  return { ...placement, pipelineId };
}

export function flowPlacementTargetKey(placement: ProcessFlowPlacement): string {
  if (placement.kind === "pipeline_wide") return JSON.stringify(["pipeline_wide", placement.pipelineId]);
  return JSON.stringify(["connection", placement.pipelineId, placement.fromStepId, placement.toStepId]);
}

export function flowPlacementInstanceId(flowId: string, placement: ProcessFlowPlacement): string {
  return JSON.stringify([flowId, flowPlacementTargetKey(placement)]);
}

export function flowPlacementTargetExists(placement: ProcessFlowPlacement, validStepIds?: Set<string>): boolean {
  if (placement.kind === "pipeline_wide") return true;
  if (!validStepIds) return true;
  return validStepIds.has(placement.fromStepId) && validStepIds.has(placement.toStepId);
}

export function normalizeFlowPlacementList(
  value: unknown,
  options: NormalizeFlowPlacementOptions,
): ProcessFlowPlacement[] {
  const rawValues = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  const seen = new Set<string>();
  const placements: ProcessFlowPlacement[] = [];

  for (const raw of rawValues) {
    if (!isRecord(raw)) continue;
    const rawPipelineId = typeof raw.pipelineId === "string" && raw.pipelineId.trim()
      ? raw.pipelineId
      : options.pipelineId;
    const parsed = normalizePlacementLink(raw as ProcessPlacementLink);
    const placement = withPipelineId(parsed, rawPipelineId);
    if (!placement) continue;
    if (placement.pipelineId !== options.pipelineId) continue;
    if (!flowPlacementTargetExists(placement, options.validStepIds)) continue;
    const key = flowPlacementTargetKey(placement);
    if (seen.has(key)) continue;
    seen.add(key);
    placements.push(placement);
  }

  return placements;
}

export function normalizeFlowPlacementLinks(
  flowLinks: Record<string, ProcessFlowPlacementList | unknown> | undefined,
  options: NormalizeFlowPlacementOptions,
): Record<string, ProcessFlowPlacement[]> {
  return Object.fromEntries(
    Object.entries(flowLinks ?? {})
      .map(([flowId, value]) => [flowId, normalizeFlowPlacementList(value, options)] as const)
      .filter(([, placements]) => placements.length > 0),
  );
}

export function flowPlacementInstances(
  flowLinks: Record<string, ProcessFlowPlacementList | unknown> | undefined,
  options: NormalizeFlowPlacementOptions,
): ProcessFlowPlacementInstance[] {
  return Object.entries(normalizeFlowPlacementLinks(flowLinks, options)).flatMap(([flowId, placements]) =>
    placements.map((placement) => ({
      instanceId: flowPlacementInstanceId(flowId, placement),
      flowId,
      placement,
    })),
  );
}

export function appendFlowPlacement(
  current: ProcessFlowPlacementList | unknown,
  placement: ProcessFlowPlacement,
  options: NormalizeFlowPlacementOptions,
): ProcessFlowPlacement[] {
  const placements = normalizeFlowPlacementList(current, options);
  const targetKey = flowPlacementTargetKey(placement);
  if (placements.some((item) => flowPlacementTargetKey(item) === targetKey)) return placements;
  return [...placements, placement];
}

export function replaceFlowPlacement(
  current: ProcessFlowPlacementList | unknown,
  placement: ProcessFlowPlacement,
  options: NormalizeFlowPlacementOptions,
): ProcessFlowPlacement[] {
  const placements = normalizeFlowPlacementList(current, options);
  const targetKey = flowPlacementTargetKey(placement);
  const replaced = placements.map((item) => flowPlacementTargetKey(item) === targetKey ? placement : item);
  return replaced.some((item) => flowPlacementTargetKey(item) === targetKey) ? replaced : [...placements, placement];
}

export function removeFlowPlacementByTarget(
  placements: ProcessFlowPlacement[],
  targetKey: string,
): ProcessFlowPlacement[] {
  return placements.filter((placement) => flowPlacementTargetKey(placement) !== targetKey);
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm run test -- src/test/processStateMapping.test.ts
```

Expected: PASS for the new helper tests or FAIL only where existing mapping still has narrower `flowLinks` assumptions.

- [ ] **Step 6: Commit**

```bash
git add src/data/processData.ts src/lib/processFlowPlacements.ts src/test/processStateMapping.test.ts
git commit -m "feat: add process journey placement helpers"
```

## Task 2: Saved State And Backup Compatibility

**Files:**
- Modify: `src/lib/storage/processState.ts`
- Modify: `src/lib/processStateMapping.ts`
- Modify: `src/lib/processBackup.ts`
- Modify: `src/lib/processFlowLinks.ts`
- Test: `src/test/processStateMapping.test.ts`
- Test: `src/test/processBackup.test.ts`

- [ ] **Step 1: Add failing saved-state tests**

Add to `src/test/processStateMapping.test.ts`:

```ts
it("writes process journey links as placement arrays with pipeline id", () => {
  const state: ProcessState = {
    ...baseState,
    flowLinks: {
      "flow-ib": [
        { kind: "pipeline_wide", pipelineId: "ib", order: 0 },
        { kind: "connection", fromStepId: "step-1", toStepId: "step-2", pipelineId: "ib", order: 1 },
      ],
    },
  };

  const saved = buildSavedProcessState(state, [], ["sales"], [], "ib");

  expect(saved.flowLinks).toEqual({
    "flow-ib": [
      { kind: "pipeline_wide", pipelineId: "ib", order: 0 },
      { kind: "connection", fromStepId: "step-1", toStepId: "step-2", pipelineId: "ib", order: 1 },
    ],
  });
});

it("restores legacy process journey links as one placement for the current pipeline", () => {
  const saved = {
    steps: [
      { id: "step-1", label: "Indienen eind april", team: "sales", column: 0 },
      { id: "step-2", label: "Akkoord en ingediend", team: "sales", column: 1 },
    ],
    connections: [{ id: "conn-1", fromStepId: "step-1", toStepId: "step-2" }],
    autoLinks: {},
    flowLinks: {
      "ib-procesreis-ingediend": { fromStepId: "step-1", toStepId: "step-2", order: 0 },
    },
    parkedSteps: [],
  };

  const mapped = buildProcessStateFromSaved(saved, [], "ib");

  expect(mapped.flowLinks).toEqual({
    "ib-procesreis-ingediend": [
      { kind: "connection", fromStepId: "step-1", toStepId: "step-2", order: 0, pipelineId: "ib" },
    ],
  });
});
```

These tests should fail at compile/runtime before implementation because the mapping functions do not yet accept or emit array-shaped process journey placements with `pipelineId`.

- [ ] **Step 2: Add failing backup test**

Add to `src/test/processBackup.test.ts`:

```ts
it("imports and exports array-shaped process journey links", () => {
  const state: ProcessState = {
    steps: [
      { id: "a", label: "A", team: "sales", column: 0 },
      { id: "b", label: "B", team: "sales", column: 1 },
    ],
    connections: [{ id: "a-b", fromStepId: "a", toStepId: "b" }],
    automations: [],
    flowLinks: {
      "flow-1": [
        { kind: "pipeline_wide", pipelineId: "ib" },
        { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib" },
      ],
    },
  };

  const exported = exportProcessBackup(state);
  const imported = importProcessBackup(JSON.stringify(exported));

  expect(imported.flowLinks).toEqual(state.flowLinks);
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm run test -- src/test/processStateMapping.test.ts src/test/processBackup.test.ts
```

Expected: FAIL because saved-state and backup types still treat `flowLinks` as single placements.

- [ ] **Step 4: Widen saved storage types**

In `src/lib/storage/processState.ts`, import `ProcessFlowPlacementList`:

```ts
import type { ProcessFlowPlacementList, ProcessPlacementLink } from "@/data/processData";
```

Update `SavedProcessState`:

```ts
flowLinks?: Record<string, ProcessFlowPlacementList>;
```

Update every `flow_links` cast to:

```ts
flowLinks: includeFlowLinks
  ? ((data.flow_links ?? {}) as Record<string, ProcessFlowPlacementList>)
  : {},
```

Keep `autoLinks` behavior unchanged unless the multiple automation placements branch is also present in the worktree; if it is present, preserve its wider type.

- [ ] **Step 5: Update process mapping signatures and writer**

In `src/lib/processStateMapping.ts`, import the helper:

```ts
import {
  normalizeFlowPlacementLinks,
} from "@/lib/processFlowPlacements";
```

Change the signatures:

```ts
export function buildSavedProcessState(
  state: ProcessState,
  parkedSteps: ProcessStep[],
  activeLanes: string[],
  customLanes: CustomLane[],
  pipelineId = "current",
): SavedProcessState
```

```ts
export function buildProcessStateFromSaved(
  saved: SavedProcessState,
  automations: Automation[],
  pipelineId = "current",
): ProcessState
```

In `buildSavedProcessState`, replace the current `flowLinks` write with:

```ts
flowLinks: normalizeFlowPlacementLinks(state.flowLinks, {
  validStepIds: new Set(state.steps.map((step) => step.id)),
  pipelineId,
}),
```

In `buildProcessStateFromSaved`, replace the current flow link parse/filter with:

```ts
flowLinks: normalizeFlowPlacementLinks(saved.flowLinks, {
  validStepIds: new Set(steps.map((step) => step.id)),
  pipelineId,
}),
```

Update `restoreSavedProcessState` to accept the same optional fifth argument:

```ts
export function restoreSavedProcessState(
  current: ProcessState,
  saved: ProcessState,
  parkedSteps: ProcessStep[] = [],
  pipelineId = "current",
): ProcessState
```

Inside the return object, normalize restored flow links:

```ts
flowLinks: normalizeFlowPlacementLinks(saved.flowLinks, {
  validStepIds,
  pipelineId,
}),
```

Keep the default `"current"` so existing tests and non-pipeline-specific call sites continue to compile. Later editor/viewer tasks must pass the real selected pipeline id.

- [ ] **Step 6: Update `processFlowLinks` wrappers**

In `src/lib/processFlowLinks.ts`, update `ProcessFlowLinks`:

```ts
import type { CanvasPlacement, ProcessFlowPlacementList, ProcessPlacementLink } from "@/data/processData";
import {
  normalizeFlowPlacementLinks,
  flowPlacementTargetKey,
} from "@/lib/processFlowPlacements";

export type ProcessFlowLinks = Record<string, ProcessFlowPlacementList>;
```

Update `filterFlowLinksForSteps`, `removeFlowLinksForStep`, and `removeFlowLinksForConnection` so they preserve arrays:

```ts
export function filterFlowLinksForSteps(
  flowLinks: ProcessFlowLinks | undefined,
  stepIds: string[],
  pipelineId = "current",
): ProcessFlowLinks {
  return normalizeFlowPlacementLinks(flowLinks, {
    validStepIds: new Set(stepIds),
    pipelineId,
  });
}
```

For removal helpers, normalize first, filter affected placements, and keep the `flowId` only when at least one placement remains.

- [ ] **Step 7: Update backup typing**

In `src/lib/processBackup.ts`, replace narrow flow link backup types with:

```ts
import type { ProcessFlowPlacementList } from "@/data/processData";

flowLinks?: Record<string, ProcessFlowPlacementList>;
```

When validating import:

```ts
flowLinks: typeof s.flowLinks === "object" && s.flowLinks !== null && !Array.isArray(s.flowLinks)
  ? (s.flowLinks as Record<string, ProcessFlowPlacementList>)
  : {},
```

- [ ] **Step 8: Run tests**

Run:

```bash
npm run test -- src/test/processStateMapping.test.ts src/test/processBackup.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/storage/processState.ts src/lib/processStateMapping.ts src/lib/processBackup.ts src/lib/processFlowLinks.ts src/test/processStateMapping.test.ts src/test/processBackup.test.ts
git commit -m "feat: persist process journey placement lists"
```

## Task 3: Canvas Rendering And Drop Rules

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`
- Test: `src/test/processCanvasPlacement.test.tsx`

- [ ] **Step 1: Add failing canvas tests**

Add tests to `src/test/processCanvasPlacement.test.tsx`:

```tsx
it("renders one process journey marker for each connection placement", () => {
  render(
    <ProcessCanvas
      steps={[
        { id: "a", label: "A", team: "sales", column: 0 },
        { id: "b", label: "B", team: "sales", column: 1 },
        { id: "c", label: "C", team: "sales", column: 2 },
      ]}
      connections={[
        { id: "a-b", fromStepId: "a", toStepId: "b" },
        { id: "b-c", fromStepId: "b", toStepId: "c" },
      ]}
      flows={[{ id: "flow-1", naam: "Correct Stage IB", beschrijving: "", automationIds: [], systemen: [] }]}
      flowLinks={{
        "flow-1": [
          { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib" },
          { kind: "connection", fromStepId: "b", toStepId: "c", pipelineId: "ib" },
        ],
      }}
      pipelineId="ib"
    />,
  );

  expect(screen.getByLabelText("Procesreis Correct Stage IB op lijn A naar B")).toBeInTheDocument();
  expect(screen.getByLabelText("Procesreis Correct Stage IB op lijn B naar C")).toBeInTheDocument();
});

it("drops a process journey on Automatic sync", () => {
  const onAttachFlowToPipelineWide = vi.fn();
  const { container } = render(
    <ProcessCanvas
      steps={[]}
      connections={[]}
      flows={[{ id: "flow-1", naam: "JR boekers instellen", beschrijving: "", automationIds: [], systemen: [] }]}
      flowLinks={{}}
      pipelineId="ib"
      onAttachFlowToPipelineWide={onAttachFlowToPipelineWide}
    />,
  );

  const syncDropTarget = screen.getByLabelText(/Automatic sync/i);
  fireEvent.drop(syncDropTarget, {
    dataTransfer: createDataTransfer({ flowId: "flow-1" }),
  });

  expect(onAttachFlowToPipelineWide).toHaveBeenCalledWith("flow-1");
});

it("does not request duplicate process journey placements on the same connection", () => {
  const onAttachFlow = vi.fn();
  const { container } = render(
    <ProcessCanvas
      steps={[
        { id: "a", label: "A", team: "sales", column: 0 },
        { id: "b", label: "B", team: "sales", column: 1 },
      ]}
      connections={[{ id: "a-b", fromStepId: "a", toStepId: "b" }]}
      flows={[{ id: "flow-1", naam: "Procesreis", beschrijving: "", automationIds: [], systemen: [] }]}
      flowLinks={{ "flow-1": [{ kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib" }] }}
      pipelineId="ib"
      onAttachFlow={onAttachFlow}
    />,
  );

  const svg = container.querySelector("svg")!;
  dropWithPoint(svg, { clientX: 180, clientY: 80 }, { flowId: "flow-1" });

  expect(onAttachFlow).not.toHaveBeenCalled();
});
```

Use the `dropWithPoint` helper already present in `src/test/processCanvasPlacement.test.tsx`. If that helper is scoped inside a describe block, move it to the nearest shared scope in the same file without changing its behavior.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- src/test/processCanvasPlacement.test.tsx
```

Expected: FAIL because `ProcessCanvas` renders one `flowLinks` placement and does not support flow drops on Automatic sync.

- [ ] **Step 3: Add canvas props**

In `ProcessCanvasProps`, add:

```ts
pipelineId?: string;
onAttachFlowToPipelineWide?: (flowId: string) => void;
onFlowClick?: (flowId: string, targetKey?: string) => void;
```

Keep existing prop names if already present; widen rather than duplicate them.

- [ ] **Step 4: Render flow placement instances**

Import:

```ts
import {
  flowPlacementInstances,
  flowPlacementTargetKey,
} from "@/lib/processFlowPlacements";
```

Create a memo:

```ts
const flowPlacementList = useMemo(
  () => flowPlacementInstances(flowLinks, {
    validStepIds: new Set(canvasSteps.map((step) => step.id)),
    pipelineId,
  }),
  [canvasSteps, flowLinks, pipelineId],
);
```

Replace connection flow loops with `flowPlacementList` filtered by `placement.kind === "connection"`. Render each dot with:

```tsx
<FlowDot
  key={instance.instanceId}
  flowId={flow.id}
  flowName={flow.naam}
  ariaLabel={`Procesreis ${flow.naam} op lijn ${from.label} naar ${to.label}`}
  alert={flowHasInactiveAutomation(flow, automations)}
  cx={pos.x}
  cy={pos.y}
  onClick={(e) => {
    e.stopPropagation();
    setSelectedConnectionId(null);
    onFlowClick?.(flow.id, flowPlacementTargetKey(instance.placement));
  }}
/>
```

Render pipeline-wide flow placements in the existing Automatic sync block placement group, next to automation/process-action items.

- [ ] **Step 5: Add flow drop dedupe**

Before `onAttachFlow` on a connection:

```ts
const target = { kind: "connection" as const, fromStepId, toStepId, pipelineId };
const targetKey = flowPlacementTargetKey(target);
const alreadyPlaced = flowPlacementInstances(flowLinks, { validStepIds: new Set(canvasSteps.map(step => step.id)), pipelineId })
  .some((instance) => instance.flowId === flowId && flowPlacementTargetKey(instance.placement) === targetKey);
if (alreadyPlaced) return;
```

For Automatic sync drop:

```ts
const target = { kind: "pipeline_wide" as const, pipelineId };
const targetKey = flowPlacementTargetKey(target);
const alreadyPlaced = flowPlacementInstances(flowLinks, { pipelineId })
  .some((instance) => instance.flowId === flowId && flowPlacementTargetKey(instance.placement) === targetKey);
if (alreadyPlaced) return;
onAttachFlowToPipelineWide?.(flowId);
```

In step-bottom drop logic, remove or guard `onAttachFlowToStep` so process journeys remain disallowed on step-bottom targets.

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test -- src/test/processCanvasPlacement.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/process/ProcessCanvas.tsx src/test/processCanvasPlacement.test.tsx
git commit -m "feat: render flexible process journey placements"
```

## Task 4: Editor Placement Mutations

**Files:**
- Modify: `src/components/process/ProcessenEditor.tsx`
- Test: `src/test/processenEditorEditMode.test.tsx`

- [ ] **Step 1: Add failing editor tests**

Add tests to `src/test/processenEditorEditMode.test.tsx`:

```tsx
it("adds a second process journey connection placement instead of replacing the first", async () => {
  renderEditorWithSavedState({
    ...savedState,
    steps: [
      { id: "a", label: "A", team: "sales", column: 0 },
      { id: "b", label: "B", team: "sales", column: 1 },
      { id: "c", label: "C", team: "sales", column: 2 },
    ],
    connections: [
      { id: "a-b", fromStepId: "a", toStepId: "b" },
      { id: "b-c", fromStepId: "b", toStepId: "c" },
    ],
    flowLinks: {
      "flow-1": [{ kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib", order: 0 }],
    },
  });

  attachFlowToConnection("flow-1", "b", "c");
  await saveEditor();

  expect(saveProcessStateMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      flowLinks: {
        "flow-1": [
          { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib", order: 0 },
          expect.objectContaining({ kind: "connection", fromStepId: "b", toStepId: "c", pipelineId: "ib" }),
        ],
      },
    }),
  );
});

it("adds a process journey placement on Automatic sync", async () => {
  renderEditorWithSavedState({
    ...savedState,
    flowLinks: {},
  });

  attachFlowToAutomaticSync("flow-1");
  await saveEditor();

  expect(saveProcessStateMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      flowLinks: {
        "flow-1": [{ kind: "pipeline_wide", pipelineId: "ib" }],
      },
    }),
  );
});

it("removes only the selected process journey placement", async () => {
  renderEditorWithSavedState({
    ...savedState,
    flowLinks: {
      "flow-1": [
        { kind: "pipeline_wide", pipelineId: "ib" },
        { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib" },
      ],
    },
  });

  openFlowDetail("flow-1");
  fireEvent.click(screen.getByRole("button", { name: "Koppeling Automatic sync verwijderen" }));
  await saveEditor();

  expect(saveProcessStateMock).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      flowLinks: {
        "flow-1": [{ kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib" }],
      },
    }),
  );
});
```

Add local test helpers in `src/test/processenEditorEditMode.test.tsx` when missing:

```ts
function attachFlowToConnection(flowId: string, fromStepId: string, toStepId: string) {
  const canvas = screen.getByTestId("process-canvas");
  fireEvent.drop(canvas, {
    dataTransfer: createDataTransfer({ flowId }),
    clientX: 180,
    clientY: 80,
  });
}

function attachFlowToAutomaticSync(flowId: string) {
  const syncTarget = screen.getByLabelText(/Automatic sync/i);
  fireEvent.drop(syncTarget, {
    dataTransfer: createDataTransfer({ flowId }),
  });
}

function openFlowDetail(flowId: string) {
  fireEvent.click(screen.getByTestId(`linked-flow-${flowId}`));
}
```

If the file already has equivalent helpers, extend those helpers instead of adding duplicates.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- src/test/processenEditorEditMode.test.tsx
```

Expected: FAIL because editor flow attachment replaces the existing single link and has no sync-drop handler.

- [ ] **Step 3: Add editor state helpers**

In `src/components/process/ProcessenEditor.tsx`, import:

```ts
import {
  appendFlowPlacement,
  flowPlacementTargetKey,
  normalizeFlowPlacementList,
  removeFlowPlacementByTarget,
  replaceFlowPlacement,
} from "@/lib/processFlowPlacements";
```

Add a helper near existing placement helpers:

```ts
function currentPipelineIdFromSelection(pipelineId: string | null | undefined): string {
  return pipelineId ?? "current";
}
```

Use the actual selected process/pipeline id already available in `ProcessenEditor`. Do not hard-code `"ib"` in production code.

- [ ] **Step 4: Update connection attach**

Replace `handleAttachFlow` with append/dedupe semantics:

```ts
function handleAttachFlow(flowId: string, fromStepId: string, toStepId: string, order = 0, position = 0.5) {
  const pipelineId = currentPipelineIdFromSelection(processId);
  update((s) => ({
    ...s,
    flowLinks: {
      ...(s.flowLinks ?? {}),
      [flowId]: appendFlowPlacement(
        s.flowLinks?.[flowId],
        { kind: "connection", fromStepId, toStepId, order, position, pipelineId },
        { validStepIds: new Set(s.steps.map((step) => step.id)), pipelineId },
      ),
    },
  }));
  toast.success("Procesreis gekoppeld");
}
```

The existing handler is `handleAttachFlow(flowId, fromStepId, toStepId, order, position)` in `src/components/process/ProcessenEditor.tsx`; replace that body.

- [ ] **Step 5: Add sync attach**

Add:

```ts
function handleAttachFlowToPipelineWide(flowId: string) {
  const pipelineId = currentPipelineIdFromSelection(processId);
  update((s) => ({
    ...s,
    flowLinks: {
      ...(s.flowLinks ?? {}),
      [flowId]: appendFlowPlacement(
        s.flowLinks?.[flowId],
        { kind: "pipeline_wide", pipelineId },
        { validStepIds: new Set(s.steps.map((step) => step.id)), pipelineId },
      ),
    },
  }));
  toast.success("Procesreis aan Automatic sync gekoppeld");
}
```

Pass it into `ProcessCanvas`:

```tsx
onAttachFlowToPipelineWide={handleAttachFlowToPipelineWide}
pipelineId={currentPipelineIdFromSelection(processId)}
```

- [ ] **Step 6: Update detach**

Change flow detach to accept a target key:

```ts
function handleDetachFlow(flowId: string, targetKey?: string) {
  const pipelineId = currentPipelineIdFromSelection(processId);
  update((s) => {
    const current = normalizeFlowPlacementList(s.flowLinks?.[flowId], {
      validStepIds: new Set(s.steps.map((step) => step.id)),
      pipelineId,
    });
    const nextPlacements = targetKey ? removeFlowPlacementByTarget(current, targetKey) : [];
    const nextFlowLinks = { ...(s.flowLinks ?? {}) };
    if (nextPlacements.length) nextFlowLinks[flowId] = nextPlacements;
    else delete nextFlowLinks[flowId];
    return { ...s, flowLinks: nextFlowLinks };
  });
  setSelectedFlowId(null);
  toast.success("Procesreis losgekoppeld");
}
```

- [ ] **Step 7: Cascade step and connection deletion**

Where step deletion currently calls `removeFlowLinksForStep`, ensure it removes only affected placements. The reducer should behave like:

```ts
flowLinks: removeFlowLinksForStep(current.flowLinks, stepId, currentPipelineIdFromSelection(processId)),
```

Where connection deletion currently calls `removeFlowLinksForConnection`, ensure only that connection target is removed:

```ts
flowLinks: removeFlowLinksForConnection(current.flowLinks, connection, currentPipelineIdFromSelection(processId)),
```

- [ ] **Step 8: Run tests**

Run:

```bash
npm run test -- src/test/processenEditorEditMode.test.tsx src/test/processStateMapping.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/process/ProcessenEditor.tsx src/test/processenEditorEditMode.test.tsx
git commit -m "feat: edit process journey placements"
```

## Task 5: Linked Sidebar And Flow Detail Panel

**Files:**
- Modify: `src/components/process/UnassignedPanel.tsx`
- Modify: `src/components/process/FlowDetailPanel.tsx`
- Modify: `src/components/process/ProcessenEditor.tsx`
- Test: `src/test/processenEditorEditMode.test.tsx`

- [ ] **Step 1: Add failing linked sidebar tests**

Add tests to `src/test/processenEditorEditMode.test.tsx`:

```tsx
it("counts one linked process journey with multiple placements once", () => {
  renderEditorWithSavedState({
    ...savedState,
    flowLinks: {
      "flow-1": [
        { kind: "pipeline_wide", pipelineId: "ib" },
        { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib" },
      ],
    },
  });

  expect(screen.getByText("Gekoppeld")).toBeInTheDocument();
  expect(screen.getByTestId("linked-flow-flow-1")).toBeInTheDocument();
  expect(screen.getByText("Automatic sync")).toBeInTheDocument();
  expect(screen.getByText(/A.*B/)).toBeInTheDocument();
});

it("shows all process journey placements in the flow detail panel", () => {
  renderEditorWithSavedState({
    ...savedState,
    flowLinks: {
      "flow-1": [
        { kind: "pipeline_wide", pipelineId: "ib" },
        { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib" },
      ],
    },
  });

  openFlowDetail("flow-1");

  expect(screen.getByRole("button", { name: "Koppeling Automatic sync verwijderen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Koppeling A -> B verwijderen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Alle koppelingen loskoppelen" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- src/test/processenEditorEditMode.test.tsx
```

Expected: FAIL because linked flow UI and detail panel show one placement.

- [ ] **Step 3: Add placement row label helper**

Create the helper in `src/lib/processFlowPlacements.ts`:

```ts
export function flowPlacementLabel(
  placement: ProcessFlowPlacement,
  steps: Array<{ id: string; label: string }>,
): string {
  if (placement.kind === "pipeline_wide") return "Automatic sync";
  const from = steps.find((step) => step.id === placement.fromStepId);
  const to = steps.find((step) => step.id === placement.toStepId);
  return `${from?.label ?? placement.fromStepId} -> ${to?.label ?? placement.toStepId}`;
}
```

- [ ] **Step 4: Update `UnassignedPanel` props**

In `src/components/process/UnassignedPanel.tsx`, widen props:

```ts
flowLinks: Record<string, ProcessFlowPlacementList>;
pipelineId: string;
onDetachFlow?: (flowId: string, targetKey?: string) => void;
```

Build linked flow rows using:

```ts
const linkedFlowPlacements = normalizeFlowPlacementLinks(flowLinks, {
  validStepIds: new Set(steps.map((step) => step.id)),
  pipelineId,
});
const linkedFlows = flows.filter((flow) => (linkedFlowPlacements[flow.id]?.length ?? 0) > 0);
```

For each linked flow, render placement subrows:

```tsx
{linkedFlowPlacements[flow.id]?.map((placement) => {
  const label = flowPlacementLabel(placement, steps);
  const targetKey = flowPlacementTargetKey(placement);
  return (
    <div key={targetKey} className="ml-6 flex items-center justify-between gap-2 text-[10px] text-slate-500">
      <span className="truncate">{label}</span>
      {onDetachFlow && (
        <button
          type="button"
          aria-label={`Koppeling ${label} verwijderen`}
          onClick={(event) => {
            event.stopPropagation();
            onDetachFlow(flow.id, targetKey);
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
})}
```

- [ ] **Step 5: Update `FlowDetailPanel`**

Change props:

```ts
placements?: ProcessFlowPlacement[];
steps: Array<{ id: string; label: string }>;
onDetachPlacement?: (flowId: string, targetKey: string) => void;
```

Replace the single `fromStep/toStep` placement block with:

```tsx
{(placements?.length ?? 0) > 0 && (
  <Section label="Gekoppeld aan">
    <div className="space-y-2">
      {placements!.map((placement) => {
        const label = flowPlacementLabel(placement, steps);
        const targetKey = flowPlacementTargetKey(placement);
        return (
          <div key={targetKey} className="flex items-center justify-between gap-2 rounded-md bg-secondary px-3 py-2 text-xs">
            <span className="font-medium text-foreground truncate">{label}</span>
            {!readOnly && onDetachPlacement && (
              <button
                type="button"
                aria-label={`Koppeling ${label} verwijderen`}
                onClick={() => onDetachPlacement(flow.id, targetKey)}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  </Section>
)}
```

Relabel the footer clear-all button:

```tsx
<Unlink className="h-3.5 w-3.5 mr-2" />
Alle koppelingen loskoppelen
```

and set:

```tsx
aria-label="Alle koppelingen loskoppelen"
```

- [ ] **Step 6: Wire editor props**

In `ProcessenEditor.tsx`, pass `pipelineId`, normalized placements, and callbacks:

```tsx
const currentPipelineId = currentPipelineIdFromSelection(processId);
const selectedFlowPlacements = selectedFlowId
  ? normalizeFlowPlacementList(flowLinks[selectedFlowId], {
      validStepIds: new Set(state.steps.map((step) => step.id)),
      pipelineId: currentPipelineId,
    })
  : [];
```

```tsx
<FlowDetailPanel
  flow={flow}
  placements={selectedFlowPlacements}
  steps={state.steps}
  isAttached={selectedFlowPlacements.length > 0}
  onClose={() => setSelectedFlowId(null)}
  onDetach={handleDetachFlow}
  onDetachPlacement={handleDetachFlow}
/>
```

```tsx
<UnassignedPanel
  pipelineId={currentPipelineId}
  flowLinks={flowLinks}
  onDetachFlow={handleDetachFlow}
  ...
/>
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm run test -- src/test/processenEditorEditMode.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/process/UnassignedPanel.tsx src/components/process/FlowDetailPanel.tsx src/components/process/ProcessenEditor.tsx src/lib/processFlowPlacements.ts src/test/processenEditorEditMode.test.tsx
git commit -m "feat: list process journey placements"
```

## Task 6: Viewer Integration And Final Verification

**Files:**
- Modify: `src/pages/Procesviewer.tsx`
- Test: `src/test/procesviewerSharedCanvas.test.tsx`
- Test: `src/test/processCanvasPlacement.test.tsx`

- [ ] **Step 1: Add failing viewer test**

Add to `src/test/procesviewerSharedCanvas.test.tsx`:

```tsx
it("passes multiple process journey placements into the shared viewer canvas", async () => {
  mockUseProcessState.mockReturnValue({
    data: {
      steps: [
        { id: "a", label: "A", team: "sales", column: 0 },
        { id: "b", label: "B", team: "sales", column: 1 },
      ],
      connections: [{ id: "a-b", fromStepId: "a", toStepId: "b" }],
      autoLinks: {},
      flowLinks: {
        "flow-1": [
          { kind: "pipeline_wide", pipelineId: "ib" },
          { kind: "connection", fromStepId: "a", toStepId: "b", pipelineId: "ib" },
        ],
      },
      parkedSteps: [],
    },
    isLoading: false,
  });

  render(<Procesviewer />);

  await userEvent.click(screen.getByRole("button", { name: /open/i }));

  expect(await screen.findByLabelText("Procesreis JR boekers instellen op lijn A naar B")).toBeInTheDocument();
  expect(screen.getByText("JR boekers instellen")).toBeInTheDocument();
});
```

Adapt mocks to the existing test setup and actual flow names in the file.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- src/test/procesviewerSharedCanvas.test.tsx
```

Expected: FAIL if viewer still treats `flowLinks` as single placements or does not pass `pipelineId`.

- [ ] **Step 3: Update viewer pipeline id wiring**

In `src/pages/Procesviewer.tsx`, pass the selected pipeline id to mapping and canvas:

```ts
return buildProcessStateFromSaved(savedState, autos, selectedProcessId ?? "current");
```

```tsx
<ProcessCanvas
  pipelineId={selectedProcessId ?? "current"}
  flowLinks={processState.flowLinks}
  ...
/>
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm run test -- src/test/procesviewerSharedCanvas.test.tsx src/test/processCanvasPlacement.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run final focused suite**

Run:

```bash
npm run test -- src/test/processStateMapping.test.ts src/test/processBackup.test.ts src/test/processCanvasPlacement.test.tsx src/test/processenEditorEditMode.test.tsx src/test/procesviewerSharedCanvas.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run build and typecheck**

Run:

```bash
npm run build
npx tsc --noEmit --pretty false
```

Expected: both exit 0. The Vite large chunk warning is acceptable if unchanged.

- [ ] **Step 7: Run full tests**

Run:

```bash
npm run test
```

Expected: PASS. If unrelated pre-existing tests fail, document exact failures and verify this branch does not touch those files.

- [ ] **Step 8: Commit viewer changes**

Commit the viewer and any final focused test changes before whole-feature review:

```bash
git add src/pages/Procesviewer.tsx src/test/procesviewerSharedCanvas.test.tsx src/test/processCanvasPlacement.test.tsx
git commit -m "feat: show process journey placement lists in viewer"
```

- [ ] **Step 9: Request final review**

Use `superpowers:requesting-code-review` for the full implementation range. The review must check:

- old/new `flowLinks` compatibility;
- `pipelineId` preservation;
- connection and sync dedupe;
- process journeys remain disallowed on step-bottom targets;
- per-placement removal;
- linked counts are unique process journeys per current pipeline;
- existing live IB-style single connection link still renders;
- backup import/export support;
- no process action regression.

- [ ] **Step 10: Commit review fixes if needed**

If the final review finds Critical or Important issues, fix them and commit separately:

```bash
git add <changed-files>
git commit -m "fix: address process journey placement review"
```
