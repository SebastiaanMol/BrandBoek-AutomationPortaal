# Manual Exception Step Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag existing process steps into a manual exception block, keep multiple sortable manual steps in that block, and drag them back to the canvas without restoring routes.

**Architecture:** Extend `ProcessArtifact` with `stepIds?: string[]` and treat those step ids as manual-contained steps. The canonical `ProcessStep` objects stay in `ProcessState.steps`; rendering filters them out of the main flow and draws them inside the manual block. Editor handlers perform the state transitions and remove connections/connection-linked metadata when a step enters a manual block.

**Tech Stack:** React, TypeScript, SVG, Vitest, Testing Library, existing process canvas/editor helpers.

---

## File Structure

- Modify: `src/data/processData.ts`
  - Add `stepIds?: string[]` to `ProcessArtifact`.
- Modify: `src/lib/processArtifacts.ts`
  - Add helpers to move steps into/out of manual blocks and reorder contained step ids.
- Modify: `src/lib/processStateMapping.ts`
  - Parse and preserve valid `stepIds`.
  - Dedupe step ids across manual blocks.
- Modify: `src/components/process/ProcessCanvas.tsx`
  - Render normal canvas steps excluding artifact-contained step ids.
  - Render contained steps inside manual blocks.
  - Expose callbacks for dropping a canvas step into a manual block, dragging a manual step back to canvas, and reordering manual steps.
- Modify: `src/components/process/ProcessenEditor.tsx`
  - Wire step-to-manual, manual-to-canvas, and manual reorder handlers.
  - Remove connections, flow links, and connection attachments when moving a step into manual.
  - Keep block delete conservative by returning contained steps to the canvas without lines.
- Test: `src/test/processArtifacts.test.ts`
  - Add helper and parser tests for `stepIds`.
- Test: `src/test/processCanvasBpmnArtifacts.test.tsx`
  - Add canvas tests for contained step rendering, read-only behavior, drop highlight, reorder, and return drag callbacks.
- Test: `src/test/processenEditorEditMode.test.tsx`
  - Add integration tests for moving a step into manual, removing lines, saving, and returning a step to canvas.
- Test: `src/test/procesviewerSharedCanvas.test.tsx`
  - Add/keep viewer test that contained manual steps render read-only in the shared viewer path.

---

### Task 1: Artifact StepIds Model And Helpers

**Files:**
- Modify: `src/data/processData.ts`
- Modify: `src/lib/processArtifacts.ts`
- Modify: `src/lib/processStateMapping.ts`
- Modify: `src/test/processArtifacts.test.ts`

- [ ] **Step 1: Add failing helper tests for manual step ids**

Append these tests inside `describe("processArtifacts", () => { ... })` in `src/test/processArtifacts.test.ts`:

```ts
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
```

Update the import at the top of the same file:

```ts
import {
  createManualExceptionBlock,
  deleteProcessArtifact,
  moveStepIntoManualArtifact,
  removeStepFromManualArtifact,
  reorderManualArtifactStep,
  updateProcessArtifact,
} from "@/lib/processArtifacts";
```

- [ ] **Step 2: Run helper tests and verify RED**

Run:

```bash
npm test -- src/test/processArtifacts.test.ts
```

Expected: FAIL because `moveStepIntoManualArtifact`, `removeStepFromManualArtifact`, and `reorderManualArtifactStep` do not exist.

- [ ] **Step 3: Extend the artifact type**

In `src/data/processData.ts`, update `ProcessArtifact`:

```ts
export interface ProcessArtifact {
  id: string;
  type: ProcessArtifactType;
  title: string;
  description?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  association?: {
    label?: string;
    anchor: "process";
  };
  stepIds?: string[];
}
```

- [ ] **Step 4: Add manual step helper functions**

In `src/lib/processArtifacts.ts`, update `ProcessArtifactPatch` so `stepIds` can be patched:

```ts
type ProcessArtifactPatch = Partial<
  Pick<ProcessArtifact, "title" | "description" | "position" | "size" | "association" | "stepIds">
>;
```

Add these helpers below `deleteProcessArtifact`:

```ts
function withoutStepId(stepIds: string[] | undefined, stepId: string): string[] {
  return (stepIds ?? []).filter((id) => id !== stepId);
}

export function moveStepIntoManualArtifact(
  artifacts: ProcessArtifact[] | undefined,
  artifactId: string,
  stepId: string,
): ProcessArtifact[] {
  return (artifacts ?? []).map((artifact) => {
    const currentStepIds = withoutStepId(artifact.stepIds, stepId);
    if (artifact.id !== artifactId) {
      return artifact.stepIds ? { ...artifact, stepIds: currentStepIds } : artifact;
    }
    return {
      ...artifact,
      stepIds: [...currentStepIds, stepId],
    };
  });
}

export function removeStepFromManualArtifact(
  artifacts: ProcessArtifact[] | undefined,
  artifactId: string,
  stepId: string,
): ProcessArtifact[] {
  return (artifacts ?? []).map((artifact) =>
    artifact.id === artifactId
      ? { ...artifact, stepIds: withoutStepId(artifact.stepIds, stepId) }
      : artifact,
  );
}

export function reorderManualArtifactStep(
  artifacts: ProcessArtifact[] | undefined,
  artifactId: string,
  stepId: string,
  targetIndex: number,
): ProcessArtifact[] {
  return (artifacts ?? []).map((artifact) => {
    if (artifact.id !== artifactId) return artifact;
    const remaining = withoutStepId(artifact.stepIds, stepId);
    const index = Math.max(0, Math.min(targetIndex, remaining.length));
    return {
      ...artifact,
      stepIds: [
        ...remaining.slice(0, index),
        stepId,
        ...remaining.slice(index),
      ],
    };
  });
}
```

- [ ] **Step 5: Run helper tests and verify GREEN**

Run:

```bash
npm test -- src/test/processArtifacts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add failing parser test for artifact stepIds**

Append this test to `src/test/processArtifacts.test.ts`:

```ts
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
```

- [ ] **Step 7: Run parser test and verify RED**

Run:

```bash
npm test -- src/test/processArtifacts.test.ts
```

Expected: FAIL because `stepIds` are currently ignored by artifact parsing.

- [ ] **Step 8: Parse and dedupe artifact stepIds**

In `src/lib/processStateMapping.ts`, replace the current artifact validation helper with a version that knows available step ids and dedupes contained ids. Keep the existing checks for id/type/title/position/size/association.

Use this shape:

```ts
function parseArtifact(value: unknown): ProcessArtifact | null {
  if (!isRecord(value)) return null;

  const { id, type, title, description, position, size, association, stepIds } = value;
  if (typeof id !== "string") return null;
  if (type !== "manualExceptionBlock") return null;
  if (typeof title !== "string") return null;
  if (description !== undefined && typeof description !== "string") return null;
  if (!isRecord(position) || typeof position.x !== "number" || typeof position.y !== "number") return null;

  const artifact: ProcessArtifact = {
    id,
    type,
    title,
    position: { x: position.x, y: position.y },
  };

  if (description !== undefined) artifact.description = description;

  if (size !== undefined) {
    if (!isRecord(size) || typeof size.width !== "number" || typeof size.height !== "number") return null;
    artifact.size = { width: size.width, height: size.height };
  }

  if (association !== undefined) {
    if (!isRecord(association) || association.anchor !== "process") return null;
    artifact.association = {
      anchor: "process",
      label: typeof association.label === "string" ? association.label : undefined,
    };
  }

  if (Array.isArray(stepIds)) {
    artifact.stepIds = stepIds.filter((stepId): stepId is string => typeof stepId === "string");
  }

  return artifact;
}

function validArtifacts(artifacts: unknown, validStepIds: Set<string>): ProcessArtifact[] {
  const values = Array.isArray(artifacts) ? artifacts : [];
  const usedStepIds = new Set<string>();

  return values.flatMap((value) => {
    const artifact = parseArtifact(value);
    if (!artifact) return [];
    const stepIds = (artifact.stepIds ?? []).filter((stepId) => {
      if (!validStepIds.has(stepId) || usedStepIds.has(stepId)) return false;
      usedStepIds.add(stepId);
      return true;
    });
    return [{ ...artifact, ...(stepIds.length ? { stepIds } : {}) }];
  });
}
```

Update call sites so they pass valid step ids:

```ts
const targetSteps = [...state.steps, ...parkedSteps];
const validStepIds = new Set(targetSteps.map((step) => step.id));
```

Use `validArtifacts(state.artifacts, validStepIds)` in `buildSavedProcessState`, `restoreSavedProcessState`, and `buildProcessStateFromSaved`.

- [ ] **Step 9: Run parser tests and verify GREEN**

Run:

```bash
npm test -- src/test/processArtifacts.test.ts src/test/processStateMapping.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

Run:

```bash
git add src/data/processData.ts src/lib/processArtifacts.ts src/lib/processStateMapping.ts src/test/processArtifacts.test.ts
git commit -m "Add manual step ids to process artifacts"
```

---

### Task 2: Canvas Rendering For Manual Steps

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`
- Modify: `src/test/processCanvasBpmnArtifacts.test.tsx`

- [ ] **Step 1: Add failing render tests for contained manual steps**

Append these tests inside `describe("ProcessCanvas BPMN attachments", () => { ... })` in `src/test/processCanvasBpmnArtifacts.test.tsx`:

```tsx
  it("renders artifact-contained steps inside the manual block and not in the main flow", () => {
    render(
      <ProcessCanvas
        steps={[
          ...steps,
          { id: "manual-step", type: "task", label: "Betalingsregeling", team: "sales", column: 2 },
        ]}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-manual",
            type: "manualExceptionBlock",
            title: "Manual acties",
            position: { x: 360, y: 160 },
            stepIds: ["manual-step"],
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Manual exception block Manual acties")).toBeInTheDocument();
    expect(screen.getByLabelText("Manual step Betalingsregeling in Manual acties")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Stap Betalingsregeling" })).not.toBeInTheDocument();
  });

  it("shows multiple manual steps in artifact order", () => {
    render(
      <ProcessCanvas
        steps={[
          ...steps,
          { id: "manual-one", type: "task", label: "Betalingsregeling", team: "sales", column: 2 },
          { id: "manual-two", type: "task", label: "Escalatie", team: "sales", column: 3 },
        ]}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-manual",
            type: "manualExceptionBlock",
            title: "Manual acties",
            position: { x: 360, y: 160 },
            stepIds: ["manual-two", "manual-one"],
          },
        ]}
      />,
    );

    const manualSteps = screen.getAllByLabelText(/Manual step .* in Manual acties/);
    expect(manualSteps.map((node) => node.getAttribute("aria-label"))).toEqual([
      "Manual step Escalatie in Manual acties",
      "Manual step Betalingsregeling in Manual acties",
    ]);
  });

  it("does not expose manual step drag handles in read-only mode", () => {
    render(
      <ProcessCanvas
        steps={[...steps, { id: "manual-step", type: "task", label: "Betalingsregeling", team: "sales", column: 2 }]}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        readOnly
        artifacts={[
          {
            id: "artifact-manual",
            type: "manualExceptionBlock",
            title: "Manual acties",
            position: { x: 360, y: 160 },
            stepIds: ["manual-step"],
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Manual step Betalingsregeling in Manual acties")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manual stap Betalingsregeling terugplaatsen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manual stap Betalingsregeling sorteren" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run canvas tests and verify RED**

Run:

```bash
npm test -- src/test/processCanvasBpmnArtifacts.test.tsx
```

Expected: FAIL because manual contained steps are not rendered inside artifacts and still render as normal steps.

- [ ] **Step 3: Compute contained step ids and visible steps**

In `src/components/process/ProcessCanvas.tsx`, add these memoized values near other derived canvas values:

```ts
  const manualStepIds = useMemo(() => {
    return new Set(artifacts.flatMap((artifact) => artifact.stepIds ?? []));
  }, [artifacts]);

  const canvasSteps = useMemo(
    () => steps.filter((step) => !manualStepIds.has(step.id)),
    [manualStepIds, steps],
  );

  const stepsById = useMemo(
    () => new Map(steps.map((step) => [step.id, step])),
    [steps],
  );
```

Replace layout/rendering data sources that should only consider normal canvas steps from `steps` to `canvasSteps`:

```ts
const visibleTeams = useMemo(
  () => filterValidActiveLanes(activeLanes, customLanes).filter((team) => canvasSteps.some((step) => step.team === team)),
  [activeLanes, canvasSteps, customLanes],
);
const laneStarts = useMemo(() => buildLaneStarts(canvasSteps, visibleTeams), [canvasSteps, visibleTeams]);
const colX = useMemo(() => computeColX(canvasSteps, stepConnections, automations), [automations, canvasSteps, stepConnections]);
```

Also update main step rendering loops and normal route target lookups to use `canvasSteps` where contained manual steps should not appear in the sequence flow.

- [ ] **Step 4: Render contained steps inside manual blocks**

Add constants near manual artifact dimensions:

```ts
const MANUAL_STEP_W = 176;
const MANUAL_STEP_H = 34;
const MANUAL_STEP_GAP = 8;
const MANUAL_STEP_TOP = 76;
const MANUAL_STEP_LEFT = 14;
```

Add a helper above `ProcessCanvas`:

```tsx
function renderManualContainedStep(
  artifact: ProcessArtifact,
  step: ProcessStep,
  index: number,
  readOnly: boolean,
) {
  const x = artifact.position.x + MANUAL_STEP_LEFT;
  const y = artifact.position.y + MANUAL_STEP_TOP + index * (MANUAL_STEP_H + MANUAL_STEP_GAP);
  return (
    <g
      aria-label={`Manual step ${step.label} in ${artifact.title}`}
      data-manual-step-id={step.id}
      data-manual-artifact-id={artifact.id}
    >
      {!readOnly && (
        <text
          x={x - 8}
          y={y + MANUAL_STEP_H / 2 + 4}
          textAnchor="middle"
          fontSize={14}
          fontWeight={800}
          fill="#a16207"
          style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}
        >
          ::
        </text>
      )}
      <rect
        x={x}
        y={y}
        width={MANUAL_STEP_W}
        height={MANUAL_STEP_H}
        rx={8}
        fill="#eff6ff"
        stroke="#2563eb"
        strokeWidth={1.5}
      />
      <text
        x={x + MANUAL_STEP_W / 2}
        y={y + MANUAL_STEP_H / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={9}
        fontWeight={700}
        fill="#1d4ed8"
        style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}
      >
        {step.label.length > 24 ? `${step.label.slice(0, 23)}...` : step.label}
      </text>
    </g>
  );
}
```

Inside the existing artifact map render, compute contained steps:

```ts
const containedSteps = (artifact.stepIds ?? [])
  .map((stepId) => stepsById.get(stepId))
  .filter((step): step is ProcessStep => Boolean(step));
const contentHeight = containedSteps.length
  ? MANUAL_STEP_TOP + containedSteps.length * MANUAL_STEP_H + (containedSteps.length - 1) * MANUAL_STEP_GAP + 16
  : 0;
const height = Math.max(artifact.size?.height ?? MANUAL_EXCEPTION_DEFAULT_H, contentHeight);
```

Render a small count label and the contained steps after `renderManualExceptionBlock(...)`.

- [ ] **Step 5: Run render tests and verify GREEN**

Run:

```bash
npm test -- src/test/processCanvasBpmnArtifacts.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/components/process/ProcessCanvas.tsx src/test/processCanvasBpmnArtifacts.test.tsx
git commit -m "Render steps inside manual exception blocks"
```

---

### Task 3: Canvas Drag Callbacks For Manual Step Moves

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`
- Modify: `src/test/processCanvasBpmnArtifacts.test.tsx`

- [ ] **Step 1: Add failing callback tests**

Append these tests to `src/test/processCanvasBpmnArtifacts.test.tsx`:

```tsx
  it("calls onMoveStepToArtifact when a canvas step is dropped on a manual block", () => {
    const onMoveStepToArtifact = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={[...steps, { id: "move-me", type: "task", label: "Betalingsregeling", team: "sales", column: 2 }]}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          { id: "artifact-manual", type: "manualExceptionBlock", title: "Manual acties", position: { x: 360, y: 160 } },
        ]}
        onMoveStepToArtifact={onMoveStepToArtifact}
      />,
    );
    mockSvgRect(container);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Stap Betalingsregeling" }), {
      button: 0,
      clientX: 500,
      clientY: 44,
    });
    fireEvent.mouseMove(window, { clientX: 390, clientY: 190 });
    fireEvent.mouseUp(window, { clientX: 390, clientY: 190 });

    expect(onMoveStepToArtifact).toHaveBeenCalledWith("move-me", "artifact-manual");
  });

  it("calls onMoveManualStepToCanvas when dragging a manual step back to the canvas", () => {
    const onMoveManualStepToCanvas = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={[...steps, { id: "manual-step", type: "task", label: "Betalingsregeling", team: "sales", column: 2 }]}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-manual",
            type: "manualExceptionBlock",
            title: "Manual acties",
            position: { x: 360, y: 160 },
            stepIds: ["manual-step"],
          },
        ]}
        onMoveManualStepToCanvas={onMoveManualStepToCanvas}
      />,
    );
    mockSvgRect(container);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Manual stap Betalingsregeling terugplaatsen" }), {
      button: 0,
      clientX: 390,
      clientY: 245,
    });
    fireEvent.mouseMove(window, { clientX: 180, clientY: 44 });
    fireEvent.mouseUp(window, { clientX: 180, clientY: 44 });

    expect(onMoveManualStepToCanvas).toHaveBeenCalledWith("artifact-manual", "manual-step", {
      team: "sales",
      column: expect.any(Number),
      row: expect.any(Number),
    });
  });

  it("calls onReorderManualArtifactStep when a manual step is dropped over another manual step", () => {
    const onReorderManualArtifactStep = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={[
          ...steps,
          { id: "manual-one", type: "task", label: "Betalingsregeling", team: "sales", column: 2 },
          { id: "manual-two", type: "task", label: "Escalatie", team: "sales", column: 3 },
        ]}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-manual",
            type: "manualExceptionBlock",
            title: "Manual acties",
            position: { x: 360, y: 160 },
            stepIds: ["manual-one", "manual-two"],
          },
        ]}
        onReorderManualArtifactStep={onReorderManualArtifactStep}
      />,
    );
    mockSvgRect(container);

    fireEvent.mouseDown(screen.getByRole("button", { name: "Manual stap Escalatie sorteren" }), {
      button: 0,
      clientX: 385,
      clientY: 286,
    });
    fireEvent.mouseMove(window, { clientX: 385, clientY: 244 });
    fireEvent.mouseUp(window, { clientX: 385, clientY: 244 });

    expect(onReorderManualArtifactStep).toHaveBeenCalledWith("artifact-manual", "manual-two", 0);
  });
```

- [ ] **Step 2: Run callback tests and verify RED**

Run:

```bash
npm test -- src/test/processCanvasBpmnArtifacts.test.tsx
```

Expected: FAIL because the new callback props and manual step drag controls do not exist.

- [ ] **Step 3: Add callback prop types**

In `ProcessCanvasProps`, add:

```ts
  onMoveStepToArtifact?: (stepId: string, artifactId: string) => void;
  onMoveManualStepToCanvas?: (
    artifactId: string,
    stepId: string,
    target: { team: string; column: number; row: number },
  ) => void;
  onReorderManualArtifactStep?: (artifactId: string, stepId: string, targetIndex: number) => void;
```

Add them to the component parameter destructuring.

- [ ] **Step 4: Add hit testing for manual blocks**

Add helper functions inside `ProcessCanvas` near other hit target functions:

```ts
  function findArtifactDropTarget(point: Pt): ProcessArtifact | null {
    return artifacts.find((artifact) => {
      if (artifact.type !== "manualExceptionBlock") return false;
      const containedCount = artifact.stepIds?.length ?? 0;
      const width = artifact.size?.width ?? MANUAL_EXCEPTION_DEFAULT_W;
      const height = Math.max(
        artifact.size?.height ?? MANUAL_EXCEPTION_DEFAULT_H,
        containedCount ? MANUAL_STEP_TOP + containedCount * (MANUAL_STEP_H + MANUAL_STEP_GAP) + 16 : 0,
      );
      return point.x >= artifact.position.x
        && point.x <= artifact.position.x + width
        && point.y >= artifact.position.y
        && point.y <= artifact.position.y + height;
    }) ?? null;
  }

  function manualStepIndexAtPoint(artifact: ProcessArtifact, point: Pt): number {
    const count = artifact.stepIds?.length ?? 0;
    const relativeY = point.y - artifact.position.y - MANUAL_STEP_TOP;
    const rawIndex = Math.floor(relativeY / (MANUAL_STEP_H + MANUAL_STEP_GAP));
    return Math.max(0, Math.min(rawIndex, count - 1));
  }
```

- [ ] **Step 5: Call step-to-artifact callback on drop**

In the existing step drag mouseup logic, before normal `onMoveStep?.(...)`, check whether the pointer is over a manual artifact:

```ts
const artifactTarget = onMoveStepToArtifact ? findArtifactDropTarget(pt) : null;
if (artifactTarget && dragging?.stepId) {
  onMoveStepToArtifact(dragging.stepId, artifactTarget.id);
  setDragging(null);
  setDragTarget(null);
  return;
}
```

Keep this guarded by `!readOnly`.

- [ ] **Step 6: Add manual contained step drag buttons**

When rendering a contained manual step in edit mode, wrap the manual shape with two hit controls:

```tsx
<g
  role="button"
  aria-label={`Manual stap ${step.label} sorteren`}
  tabIndex={0}
  onMouseDown={event => handleManualStepMouseDown(event, artifact, step, "sort")}
>
  {renderManualContainedStep(artifact, step, index, readOnly)}
</g>
<rect
  role="button"
  aria-label={`Manual stap ${step.label} terugplaatsen`}
  x={artifact.position.x + MANUAL_STEP_LEFT}
  y={artifact.position.y + MANUAL_STEP_TOP + index * (MANUAL_STEP_H + MANUAL_STEP_GAP)}
  width={MANUAL_STEP_W}
  height={MANUAL_STEP_H}
  fill="transparent"
  onMouseDown={event => handleManualStepMouseDown(event, artifact, step, "return")}
/>
```

Use one drag ref:

```ts
const manualStepDragRef = useRef<{
  artifactId: string;
  stepId: string;
  mode: "sort" | "return";
  startPoint: Pt;
} | null>(null);
```

On global mouseup:

```ts
const manualDrag = manualStepDragRef.current;
if (manualDrag) {
  const point = clientToSvg(e.clientX, e.clientY);
  const targetArtifact = findArtifactDropTarget(point);
  if (manualDrag.mode === "sort" && targetArtifact?.id === manualDrag.artifactId && onReorderManualArtifactStep) {
    onReorderManualArtifactStep(manualDrag.artifactId, manualDrag.stepId, manualStepIndexAtPoint(targetArtifact, point));
  } else if (manualDrag.mode === "return" && !targetArtifact && onMoveManualStepToCanvas) {
    const target = dropTargetFromPoint(point);
    if (target) onMoveManualStepToCanvas(manualDrag.artifactId, manualDrag.stepId, target);
  }
  manualStepDragRef.current = null;
}
```

If no `dropTargetFromPoint` helper exists, extract the existing row/column/team target logic used by step drag into a function returning `{ team, column, row } | null`.

- [ ] **Step 7: Run callback tests and route regressions**

Run:

```bash
npm test -- src/test/processCanvasBpmnArtifacts.test.tsx src/test/processCanvasManualConnections.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add src/components/process/ProcessCanvas.tsx src/test/processCanvasBpmnArtifacts.test.tsx
git commit -m "Support dragging steps to manual blocks"
```

---

### Task 4: Editor State Transitions And Save Integration

**Files:**
- Modify: `src/components/process/ProcessenEditor.tsx`
- Modify: `src/test/processenEditorEditMode.test.tsx`

- [ ] **Step 1: Add failing editor test for moving a step into manual**

Append this test to `src/test/processenEditorEditMode.test.tsx`:

```tsx
  it("moves a step into a manual block, removes its routes, and saves the manual step id", async () => {
    render(<ProcessenEditor pipelineId="pipe-1" onSwitchPipeline={() => undefined} />);

    await screen.findByText("Intake");

    fireEvent.click(screen.getByRole("button", { name: /Toevoegen/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Manual exception/i }));

    const step = screen.getByRole("button", { name: "Stap Intake" });
    fireEvent.mouseDown(step, { button: 0, clientX: 120, clientY: 44 });
    fireEvent.mouseMove(window, { clientX: 390, clientY: 240 });
    fireEvent.mouseUp(window, { clientX: 390, clientY: 240 });

    fireEvent.click(screen.getByRole("button", { name: /Opslaan/i }));

    await waitFor(() => expect(saveProcessStateMock).toHaveBeenCalledOnce());
    expect(saveProcessStateMock).toHaveBeenCalledWith(
      "pipe-1",
      expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            type: "manualExceptionBlock",
            stepIds: ["intake"],
          }),
        ],
        connections: expect.not.arrayContaining([
          expect.objectContaining({ fromStepId: "intake" }),
          expect.objectContaining({ toStepId: "intake" }),
        ]),
      }),
    );
  });
```

This test assumes the existing editor test fixture uses the visible step `Intake` with id `intake`, matching the earlier save test in this file. If the fixture has drifted, first update the fixture to keep the visible first step id as `intake`; do not weaken the assertion.

- [ ] **Step 2: Run editor test and verify RED**

Run:

```bash
npm test -- src/test/processenEditorEditMode.test.tsx
```

Expected: FAIL because the editor does not pass `onMoveStepToArtifact` and does not update artifact `stepIds`.

- [ ] **Step 3: Import helper functions**

In `src/components/process/ProcessenEditor.tsx`, extend the process artifact import:

```ts
import {
  createManualExceptionBlock,
  deleteProcessArtifact,
  moveStepIntoManualArtifact,
  removeStepFromManualArtifact,
  reorderManualArtifactStep,
  updateProcessArtifact,
} from "@/lib/processArtifacts";
```

- [ ] **Step 4: Add cleanup helper for manual move**

Near existing attachment/flow cleanup handlers in `ProcessenEditor`, add:

```ts
function removeConnectionsForStep(state: ProcessState, stepId: string): ProcessState {
  const removedConnectionIds = new Set(
    state.connections
      .filter((connection) => connection.fromStepId === stepId || connection.toStepId === stepId)
      .map((connection) => connection.id),
  );

  const nextFlowLinks = Object.fromEntries(
    Object.entries(state.flowLinks ?? {}).filter(([, link]) =>
      link.fromStepId !== stepId && link.toStepId !== stepId,
    ),
  );

  return {
    ...state,
    connections: state.connections.filter((connection) => !removedConnectionIds.has(connection.id)),
    attachments: (state.attachments ?? []).filter((attachment) =>
      attachment.attachedTo.kind !== "connection" || !removedConnectionIds.has(attachment.attachedTo.id),
    ),
    flowLinks: nextFlowLinks,
  };
}
```

- [ ] **Step 5: Add manual artifact editor handlers**

Add these handlers near artifact handlers:

```ts
function handleMoveStepToArtifact(stepId: string, artifactId: string) {
  update((current) => {
    const cleaned = removeConnectionsForStep(current, stepId);
    return {
      ...cleaned,
      artifacts: moveStepIntoManualArtifact(cleaned.artifacts, artifactId, stepId),
    };
  });
  toast.info("Stap naar manual block verplaatst");
}

function handleMoveManualStepToCanvas(
  artifactId: string,
  stepId: string,
  target: { team: string; column: number; row: number },
) {
  update((current) => ({
    ...current,
    steps: current.steps.map((step) =>
      step.id === stepId
        ? { ...step, team: target.team, column: target.column, row: target.row }
        : step,
    ),
    artifacts: removeStepFromManualArtifact(current.artifacts, artifactId, stepId),
  }));
  toast.info("Manual stap teruggezet zonder lijnen");
}

function handleReorderManualArtifactStep(artifactId: string, stepId: string, targetIndex: number) {
  update((current) => ({
    ...current,
    artifacts: reorderManualArtifactStep(current.artifacts, artifactId, stepId, targetIndex),
  }));
}
```

- [ ] **Step 6: Pass callbacks to ProcessCanvas**

In the editor `ProcessCanvas` props, add:

```tsx
onMoveStepToArtifact={handleMoveStepToArtifact}
onMoveManualStepToCanvas={handleMoveManualStepToCanvas}
onReorderManualArtifactStep={handleReorderManualArtifactStep}
```

- [ ] **Step 7: Make block delete return contained steps**

Update `handleDeleteArtifact` so deleting a block removes the artifact only. Because steps are stored in `state.steps`, removing the artifact automatically returns those steps to the normal canvas rendering:

```ts
function handleDeleteArtifact(artifactId: string) {
  update(s => ({
    ...s,
    artifacts: deleteProcessArtifact(s.artifacts, artifactId),
  }));
  toast.success("Manual block verwijderd; stappen zijn teruggezet zonder lijnen");
}
```

- [ ] **Step 8: Run editor tests and verify GREEN**

Run:

```bash
npm test -- src/test/processenEditorEditMode.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

Run:

```bash
git add src/components/process/ProcessenEditor.tsx src/test/processenEditorEditMode.test.tsx
git commit -m "Move editor steps into manual blocks"
```

---

### Task 5: Viewer, Backup, And Regression Verification

**Files:**
- Modify: `src/test/procesviewerSharedCanvas.test.tsx`
- Verify: no production code edits expected unless tests reveal a real gap.

- [ ] **Step 1: Add viewer assertion for contained manual steps**

In `src/test/procesviewerSharedCanvas.test.tsx`, ensure `fixtures.savedState.artifacts` includes a `stepIds` entry and the mocked `ProcessCanvas` receives it. Use this fixture shape:

```ts
artifacts: [
  {
    id: "artifact-1",
    type: "manualExceptionBlock",
    title: "Manual acties",
    position: { x: 360, y: 180 },
    stepIds: ["s2"],
  },
],
```

Update the mocked `ProcessCanvas` to render artifact step ids:

```tsx
ProcessCanvas: ({
  artifacts = [],
}: {
  artifacts?: Array<{ id: string; title: string; stepIds?: string[] }>;
}) => (
  <div data-testid="shared-process-canvas" style={{ width: 800, height: 400 }}>
    {artifacts.map((artifact) => (
      <span key={artifact.id}>{`${artifact.title}:${artifact.stepIds?.join(",") ?? ""}`}</span>
    ))}
  </div>
),
```

Add assertion:

```ts
expect(screen.getByText("Manual acties:s2")).toBeInTheDocument();
```

- [ ] **Step 2: Run viewer test**

Run:

```bash
npm test -- src/test/procesviewerSharedCanvas.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run artifact and editor test groups**

Run:

```bash
npm test -- src/test/processArtifacts.test.ts src/test/processBackup.test.ts src/test/processCanvasBpmnArtifacts.test.tsx src/test/processenEditorEditMode.test.tsx src/test/procesviewerSharedCanvas.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run route and viewer regressions**

Run:

```bash
npm test -- src/test/processCanvasManualConnections.test.tsx src/test/processTimerEvent.test.tsx src/test/procesviewerSharedCanvas.test.tsx src/test/processviewerManualConnections.test.tsx src/test/processCanvas.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS. Vite chunk-size warnings are acceptable if exit code is 0.

- [ ] **Step 6: Remove generated build info files if present**

Run:

```powershell
if (Test-Path tsconfig.app.tsbuildinfo) { Remove-Item -LiteralPath tsconfig.app.tsbuildinfo -Force }
if (Test-Path tsconfig.node.tsbuildinfo) { Remove-Item -LiteralPath tsconfig.node.tsbuildinfo -Force }
git status --short
```

Expected: no generated `tsbuildinfo` files remain.

- [ ] **Step 7: Commit viewer test coverage**

Commit the Step 1 viewer test change:

```bash
git add src/test/procesviewerSharedCanvas.test.tsx
git commit -m "Cover manual block steps in viewer tests"
```

Expected: one test-only commit unless the same assertion already exists from an earlier task execution.

---

## Self-Review Notes

- Spec coverage: moving steps into manual blocks, removing lines, multiple contained steps, sorting, returning to canvas without lines, read-only viewer, backup/state compatibility, and regressions are covered.
- Scope control: no auto reconnect, no routes inside manual blocks, no BPMN XML, and no automatic HubSpot detection are included.
- Risk: `ProcessCanvas.tsx` is large and drag logic is sensitive. Keep Task 3 narrowly focused and run route/waypoint regression tests before committing.
