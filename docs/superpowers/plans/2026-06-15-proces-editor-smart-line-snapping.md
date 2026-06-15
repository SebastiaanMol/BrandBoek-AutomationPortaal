# Proces Editor Smart Line Snapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New manual lines in the Proces Editor automatically snap to sensible ports and save default orthogonal waypoints, while existing manually adjusted routes remain untouched.

**Architecture:** Keep the routing behavior inside `ProcessCanvas`, where port detection and route rendering already live. Extend the `onAddConnection` contract to pass default waypoints to `ProcessenEditor`, then persist those waypoints in the normal `Connection` state. Do not reroute existing connections after creation.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, SVG canvas rendering.

---

## File Structure

- Modify `src/components/process/ProcessCanvas.tsx`
  - Add a small helper for default manual waypoints at creation time.
  - Extend the `onAddConnection` callback signature with `waypoints?: ConnectionWaypoint[]`.
  - Pass default snapped waypoints when completing a new drawn route.
- Modify `src/components/process/ProcessenEditor.tsx`
  - Accept the new `waypoints` argument in `handleAddConnection`.
  - Store those waypoints on the new `Connection`.
- Modify `src/test/processCanvasManualConnections.test.tsx`
  - Add failing tests for new-route waypoint emission and side selection.
  - Update existing callback expectations to include the new sixth argument where needed.
- Modify `src/test/processenEditorEditMode.test.tsx`
  - Add a save-path test proving drawn routes persist default waypoints into process state.

---

### Task 1: Canvas Emits Default Waypoints For New Manual Routes

**Files:**
- Modify: `src/test/processCanvasManualConnections.test.tsx`
- Modify: `src/components/process/ProcessCanvas.tsx`

- [ ] **Step 1: Write the failing horizontal route test**

Add this test inside `describe("ProcessCanvas manual connections in edit mode", () => { ... })` in `src/test/processCanvasManualConnections.test.tsx`, near the existing `"adds a manual route with the selected route type from the edit canvas"` test:

```tsx
  it("emits default snapped waypoints when adding a new horizontal manual route", () => {
    const onAddConnection = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        selectedRouteType="optional"
        onAddConnection={onAddConnection}
      />,
    );
    const svg = mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("Verbindingspoort Intake"), {
      clientX: 247,
      clientY: 44,
      button: 0,
    });
    fireEvent.mouseMove(svg, { clientX: 384, clientY: 44 });
    fireEvent.mouseUp(svg, { clientX: 384, clientY: 44 });

    expect(onAddConnection).toHaveBeenCalledWith(
      "intake",
      "controle",
      "optional",
      "right",
      "left",
      [
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      ],
    );
    const waypoints = onAddConnection.mock.calls[0][5];
    expect(waypoints).toHaveLength(3);
    for (const point of waypoints) {
      expect(point.x % 14).toBe(0);
      expect(point.y % 14).toBe(0);
    }
  });
```

- [ ] **Step 2: Write the failing vertical route test**

Add this test in the same file near the stacked route tests:

```tsx
  it("chooses vertical ports and default waypoints for a new stacked manual route", () => {
    const onAddConnection = vi.fn();
    const stackedSteps: ProcessStep[] = [
      { id: "from", type: "task", label: "Doorzetten", team: "sales", column: 0, row: 0 },
      { id: "to", type: "task", label: "Incasso", team: "sales", column: 0, row: 1 },
    ];
    const { container } = render(
      <ProcessCanvas
        steps={stackedSteps}
        connections={[]}
        automations={[]}
        activeLanes={["sales"]}
        selectedRouteType="main"
        onAddConnection={onAddConnection}
      />,
    );
    const svg = mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("Verbindingspoort Doorzetten onder"), {
      clientX: 186,
      clientY: 65,
      button: 0,
    });
    fireEvent.mouseMove(svg, { clientX: 186, clientY: 111 });
    fireEvent.mouseUp(svg, { clientX: 186, clientY: 111 });

    expect(onAddConnection).toHaveBeenCalledWith(
      "from",
      "to",
      "main",
      "bottom",
      "top",
      [
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
        expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      ],
    );
  });
```

- [ ] **Step 3: Run the new tests and verify failure**

Run:

```bash
npm test -- src/test/processCanvasManualConnections.test.tsx
```

Expected: FAIL because `onAddConnection` currently receives only five arguments and does not receive default `waypoints`.

- [ ] **Step 4: Extend the canvas callback type**

In `src/components/process/ProcessCanvas.tsx`, update the `onAddConnection` callback signature in `ProcessCanvasProps`:

```ts
  onAddConnection?: (
    fromId: string,
    toId: string,
    routeType?: ConnectionRouteType,
    fromSide?: ConnectionSide,
    toSide?: ConnectionSide,
    waypoints?: ConnectionWaypoint[],
  ) => void;
```

- [ ] **Step 5: Add a creation helper**

In `src/components/process/ProcessCanvas.tsx`, add this helper directly after `defaultWaypointsForConnection(...)`:

```ts
function defaultWaypointsForNewManualConnection(
  from: ProcessStep,
  to: ProcessStep,
  colX: number[],
  laneStarts: Record<string, number>,
  fromSide: ConnectionSide,
  toSide: ConnectionSide,
): ConnectionWaypoint[] {
  return defaultWaypointsForConnection(from, to, colX, laneStarts, fromSide, toSide);
}
```

This intentionally wraps the existing helper so the creation rule has a named boundary and can evolve without changing drag-handle fallback behavior.

- [ ] **Step 6: Pass default waypoints when completing a drawn route**

In `handleMouseUp`, replace the existing add call:

```ts
          onAddConnection?.(drawing.fromId, target.id, selectedRouteType, drawing.fromSide, targetSide);
```

with:

```ts
          const defaultWaypoints = source
            ? defaultWaypointsForNewManualConnection(source, target, colX, laneStarts, drawing.fromSide, targetSide)
            : [];
          onAddConnection?.(
            drawing.fromId,
            target.id,
            selectedRouteType,
            drawing.fromSide,
            targetSide,
            defaultWaypoints,
          );
```

- [ ] **Step 7: Update existing test expectations for the new callback argument**

In `src/test/processCanvasManualConnections.test.tsx`, update existing `onAddConnection` expectations that currently use five arguments. For example:

```tsx
expect(onAddConnection).toHaveBeenCalledWith("intake", "controle", "optional", "right", "left");
```

becomes:

```tsx
expect(onAddConnection).toHaveBeenCalledWith(
  "intake",
  "controle",
  "optional",
  "right",
  "left",
  expect.any(Array),
);
```

Apply the same pattern to the side-port and target-port tests that assert `onAddConnection`.

- [ ] **Step 8: Run canvas manual connection tests**

Run:

```bash
npm test -- src/test/processCanvasManualConnections.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add src/components/process/ProcessCanvas.tsx src/test/processCanvasManualConnections.test.tsx
git commit -m "Add default waypoints for new process editor routes"
```

---

### Task 2: Persist New Route Waypoints In ProcessenEditor

**Files:**
- Modify: `src/components/process/ProcessenEditor.tsx`
- Modify: `src/test/processenEditorEditMode.test.tsx`

- [ ] **Step 1: Write the failing editor persistence test**

In `src/test/processenEditorEditMode.test.tsx`, change `savedProcessState.steps` from one step to two connectable steps:

```ts
const savedProcessState = {
  steps: [
    { id: "s1", label: "Intake", team: "sales", column: 0 },
    { id: "s2", label: "Controle", team: "sales", column: 1 },
  ],
  connections: [],
  autoLinks: {},
  parkedSteps: [],
  activeLanes: ["sales"],
  customLanes: [],
  flowLinks: {},
  attachments: [],
};
```

Then add this test inside `describe("ProcessenEditor edit mode", () => { ... })`:

```tsx
  it("saves newly drawn manual routes with snapped sides and default waypoints", async () => {
    const { container } = render(
      <ProcessenEditor
        pipelineId="pipe-1"
        onSwitchPipeline={() => undefined}
      />,
    );

    await screen.findByText("Intake");
    const svg = container.querySelector("svg") as SVGSVGElement;
    const width = Number(svg.getAttribute("width")) || 900;
    const height = Number(svg.getAttribute("height")) || 500;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(screen.getByLabelText("Verbindingspoort Intake"), {
      clientX: 247,
      clientY: 44,
      button: 0,
    });
    fireEvent.mouseMove(svg, { clientX: 384, clientY: 44 });
    fireEvent.mouseUp(svg, { clientX: 384, clientY: 44 });
    fireEvent.click(screen.getByRole("button", { name: /Opslaan/i }));

    await waitFor(() => {
      expect(saveProcessStateMock).toHaveBeenCalledOnce();
    });
    expect(saveProcessStateMock).toHaveBeenCalledWith(
      "pipe-1",
      expect.objectContaining({
        connections: [
          expect.objectContaining({
            fromStepId: "s1",
            toStepId: "s2",
            manual: true,
            fromSide: "right",
            toSide: "left",
            waypoints: [
              expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
              expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
              expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
            ],
          }),
        ],
      }),
    );
  });
```

- [ ] **Step 2: Run the editor test and verify failure**

Run:

```bash
npm test -- src/test/processenEditorEditMode.test.tsx
```

Expected: FAIL because `handleAddConnection` currently stores `waypoints: []`.

- [ ] **Step 3: Extend `handleAddConnection` to accept waypoints**

In `src/components/process/ProcessenEditor.tsx`, update `handleAddConnection`:

```ts
  function handleAddConnection(
    fromId: string,
    toId: string,
    routeType: ConnectionRouteType = selectedRouteType,
    fromSide?: ConnectionSide,
    toSide?: ConnectionSide,
    waypoints: ConnectionWaypoint[] = [],
  ) {
    update(s => {
      const exists = s.connections.some(c => c.fromStepId === fromId && c.toStepId === toId);
      if (exists) return s;
      return {
        ...s,
        connections: [...s.connections, {
          id: `c-${Date.now()}`,
          fromStepId: fromId,
          toStepId: toId,
          routeType,
          fromSide,
          toSide,
          manual: true,
          waypoints,
        }],
      };
    });
  }
```

- [ ] **Step 4: Run editor tests**

Run:

```bash
npm test -- src/test/processenEditorEditMode.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/components/process/ProcessenEditor.tsx src/test/processenEditorEditMode.test.tsx
git commit -m "Persist default waypoints for new process editor routes"
```

---

### Task 3: Guard Viewer Mode And Existing Manual Routes

**Files:**
- Modify: `src/test/processCanvasManualConnections.test.tsx`
- Modify: `src/components/process/ProcessCanvas.tsx` only if the new tests fail

- [ ] **Step 1: Write a viewer read-only regression test**

Add this test to `src/test/processCanvasManualConnections.test.tsx`:

```tsx
  it("does not expose manual waypoint handles in read-only viewer mode", () => {
    const connections: Connection[] = [
      {
        id: "manual-read-only",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "main",
        fromSide: "right",
        toSide: "left",
        waypoints: [
          { x: 280, y: 42 },
          { x: 308, y: 42 },
          { x: 336, y: 42 },
        ],
      },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        readOnly
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige hoofdroute route"));

    expect(screen.queryByRole("button", { name: /Sleep knikpunt/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Knikpunt toevoegen/ })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Write a manual waypoint preservation test**

Add this test to the same file:

```tsx
  it("keeps existing manual waypoints instead of replacing them with default route waypoints", () => {
    const connections: Connection[] = [
      {
        id: "manual-preserved",
        fromStepId: "intake",
        toStepId: "controle",
        manual: true,
        routeType: "main",
        fromSide: "right",
        toSide: "left",
        waypoints: [
          { x: 280, y: 86 },
          { x: 340, y: 114 },
        ],
      },
    ];

    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige hoofdroute route"));

    const handles = screen.getAllByRole("button", { name: /Sleep knikpunt/ });
    expect(handles).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Knikpunt toevoegen/ })).toHaveLength(3);
  });
```

- [ ] **Step 3: Run the regression tests**

Run:

```bash
npm test -- src/test/processCanvasManualConnections.test.tsx
```

Expected: PASS. If this fails because handles appear in read-only mode, ensure `handleWaypoints` and `bendInsertionTargets` remain guarded by `!readOnly`.

- [ ] **Step 4: Commit Task 3**

Run:

```bash
git add src/components/process/ProcessCanvas.tsx src/test/processCanvasManualConnections.test.tsx
git commit -m "Guard process editor manual route regressions"
```

---

### Task 4: Full Verification

**Files:**
- No planned source edits unless verification exposes a regression.

- [ ] **Step 1: Run focused process editor tests**

Run:

```bash
npm test -- src/test/processCanvasManualConnections.test.tsx src/test/processTimerEvent.test.tsx src/test/processenEditorEditMode.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run shared viewer/editor tests**

Run:

```bash
npm test -- src/test/procesviewerSharedCanvas.test.tsx src/test/processviewerManualConnections.test.tsx src/test/processCanvas.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. Vite may print chunk-size warnings; those are acceptable if the build exits with code 0.

- [ ] **Step 4: Commit verification-only test adjustments if any were needed**

If no files changed during Task 4, do not commit. If small test-only fixes were required, commit only those files:

```bash
git add <changed-files>
git commit -m "Verify process editor smart line snapping"
```

---

## Self-Review Notes

- Spec coverage: new-route snapping is covered by Task 1; persistence is covered by Task 2; viewer read-only and existing manual routes are covered by Task 3; build/test acceptance is covered by Task 4.
- Scope control: no global reroute action is planned, and no existing manual route is recalculated after creation.
- Type consistency: the new callback argument is `waypoints?: ConnectionWaypoint[]` in `ProcessCanvasProps` and `waypoints: ConnectionWaypoint[] = []` in `ProcessenEditor.handleAddConnection`.
