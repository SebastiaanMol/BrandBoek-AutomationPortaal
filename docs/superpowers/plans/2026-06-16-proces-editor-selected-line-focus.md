# Proces Editor Selected Line Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a selected route in the Proces Editor visually clear and render it above other routes so manual waypoints are easier to adjust.

**Architecture:** Keep the change inside `ProcessCanvas`. Add small local helpers for route render ordering and selected-control sizing, then use the existing `selectedConnectionId` state and `selected` rendering branch.

**Tech Stack:** React, TypeScript, SVG, Vitest, Testing Library.

---

## File Structure

- Modify: `src/components/process/ProcessCanvas.tsx`
  - Add local helper functions near the existing route helpers.
  - Render the selected connection after all non-selected step connections in edit mode.
  - Add stable test attributes and selected styling for focused routes and handles.
- Modify: `src/test/processCanvasManualConnections.test.tsx`
  - Add tests for selected route DOM ordering, selected route focus styling, larger handles, and read-only behavior.

---

### Task 1: Add Failing Tests For Selected Route Focus

**Files:**
- Modify: `src/test/processCanvasManualConnections.test.tsx`

- [ ] **Step 1: Add a shared overlapping route fixture**

Add this helper below `steppedRows`:

```tsx
const overlappingConnections: Connection[] = [
  {
    id: "manual-back",
    fromStepId: "intake",
    toStepId: "controle",
    manual: true,
    routeType: "main",
    fromSide: "right",
    toSide: "left",
    waypoints: [{ x: 308, y: 42 }],
  },
  {
    id: "manual-front",
    fromStepId: "intake",
    toStepId: "controle",
    manual: true,
    routeType: "optional",
    fromSide: "right",
    toSide: "left",
    waypoints: [{ x: 336, y: 70 }],
  },
];
```

- [ ] **Step 2: Add a failing test for selected route render order**

Add this test inside `describe("ProcessCanvas manual connections in edit mode", () => { ... })`:

```tsx
  it("renders the selected editable route after other step routes", () => {
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={overlappingConnections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige correctie/optioneel route"));

    const routeGroups = Array.from(container.querySelectorAll("[data-route-id]"));
    expect(routeGroups.map(group => group.getAttribute("data-route-id"))).toEqual([
      "manual-back",
      "manual-front",
    ]);
    expect(routeGroups.at(-1)).toHaveAttribute("data-route-selected", "true");
  });
```

- [ ] **Step 3: Add a failing test for focus styling and larger handles**

Add this test after the render-order test:

```tsx
  it("marks a selected editable route with focus styling and larger handles", () => {
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={overlappingConnections}
        automations={[]}
        activeLanes={["sales"]}
        onUpdateConnectionWaypoints={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige correctie/optioneel route"));

    const selectedRoute = container.querySelector('[data-route-id="manual-front"]');
    expect(selectedRoute).toHaveAttribute("data-route-selected", "true");
    expect(selectedRoute?.querySelector('[data-route-focus-outline="true"]')).toBeInTheDocument();
    expect(selectedRoute?.querySelector('[data-route-visible-path="true"]')).toHaveAttribute("stroke-width", "2.8");

    const dragHandle = screen.getByRole("button", { name: "Sleep knikpunt 1" });
    expect(dragHandle).toHaveAttribute("r", "7");
  });
```

- [ ] **Step 4: Add a failing test that read-only mode does not apply edit focus**

Add this test after the focus-styling test:

```tsx
  it("does not apply edit route focus styling in read-only mode", () => {
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={overlappingConnections}
        automations={[]}
        activeLanes={["sales"]}
        readOnly
        onUpdateConnectionWaypoints={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Handmatige correctie/optioneel route"));

    expect(container.querySelector('[data-route-selected="true"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-route-focus-outline="true"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sleep knikpunt/ })).not.toBeInTheDocument();
  });
```

- [ ] **Step 5: Run the focused test file and verify failure**

Run:

```bash
npm test -- src/test/processCanvasManualConnections.test.tsx
```

Expected: FAIL because `data-route-id`, `data-route-selected`, `data-route-focus-outline`, and selected handle radius `7` do not exist yet.

---

### Task 2: Implement Selected Route Ordering And Focus Styling

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`

- [ ] **Step 1: Add selected route helpers**

Add these helpers near `buildBendInsertionTargets`:

```tsx
function orderedStepConnectionsForRender(connections: Connection[], selectedConnectionId: string | null, readOnly: boolean): Connection[] {
  if (readOnly || !selectedConnectionId) return connections;
  const selected = connections.find(connection => connection.id === selectedConnectionId);
  if (!selected) return connections;
  return [
    ...connections.filter(connection => connection.id !== selectedConnectionId),
    selected,
  ];
}

function routeVisibleStrokeWidth(selected: boolean): number {
  return selected ? 2.8 : 1.7;
}

function routeFocusOutlineStrokeWidth(selected: boolean): number {
  return selected ? 7 : 0;
}

function waypointOuterRadius(selected: boolean): number {
  return selected ? 12 : 10;
}

function waypointInnerRadius(selected: boolean): number {
  return selected ? 7 : 5;
}
```

- [ ] **Step 2: Render ordered step connections**

Find the step connection render block:

```tsx
        {stepConnections.map(conn => {
```

Replace it with:

```tsx
        {orderedStepConnectionsForRender(stepConnections, selectedConnectionId, readOnly).map(conn => {
```

- [ ] **Step 3: Gate selected focus to edit mode**

Find:

```tsx
          const isSelected = selectedConnectionId === conn.id;
```

Replace it with:

```tsx
          const isSelected = !readOnly && selectedConnectionId === conn.id;
```

- [ ] **Step 4: Add route group data attributes**

Find:

```tsx
            <g key={conn.id}>
```

Replace it with:

```tsx
            <g
              key={conn.id}
              data-route-id={conn.id}
              data-route-selected={isSelected ? "true" : undefined}
            >
```

- [ ] **Step 5: Add focus outline and selected stroke width for split automation routes**

Inside the `splitForAutomation ? (` branch, before the existing `<>`, insert selected outline paths:

```tsx
                <>
                  {isSelected && (
                    <>
                      <path
                        d={arrow.preDotPath}
                        stroke="#ffffff"
                        strokeWidth={routeFocusOutlineStrokeWidth(isSelected)}
                        fill="none"
                        data-route-focus-outline="true"
                        style={{ pointerEvents: "none" }}
                      />
                      <path
                        d={arrow.postDotPath}
                        stroke="#ffffff"
                        strokeWidth={routeFocusOutlineStrokeWidth(isSelected)}
                        fill="none"
                        data-route-focus-outline="true"
                        style={{ pointerEvents: "none" }}
                      />
                    </>
                  )}
```

Then update the existing split paths to use selected width and stable attributes:

```tsx
                  <path d={arrow.preDotPath} stroke={mainStroke} strokeWidth={routeVisibleStrokeWidth(isSelected)} fill="none"
                    aria-label={labelForRoute}
                    data-route-visible-path="true"
                    strokeDasharray={isHov ? "6 3" : undefined} style={{ pointerEvents: "none" }} />
                  <path d={arrow.postDotPath} stroke={postStroke} strokeWidth={routeVisibleStrokeWidth(isSelected)} strokeDasharray={isEndRoute ? undefined : "5 3"} fill="none"
                    aria-label={isEndRoute ? labelForRoute : "correctie/optioneel route"}
                    data-route-visible-path="true"
                    markerEnd={`url(#${isEndRoute ? "ah-end" : "ah-branch"})`} opacity={0.9} style={{ pointerEvents: "none" }} />
```

- [ ] **Step 6: Add focus outline and selected stroke width for normal routes**

Find the normal route path:

```tsx
                <path d={arrow.path} stroke={mainStroke} strokeWidth="1.7" fill="none"
```

Replace that single path block with this outline plus visible path:

```tsx
                <>
                  {isSelected && (
                    <path
                      d={arrow.path}
                      stroke="#ffffff"
                      strokeWidth={routeFocusOutlineStrokeWidth(isSelected)}
                      fill="none"
                      data-route-focus-outline="true"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  <path d={arrow.path} stroke={mainStroke} strokeWidth={routeVisibleStrokeWidth(isSelected)} fill="none"
                    aria-label={labelForRoute}
                    data-route-visible-path="true"
                    markerEnd={`url(#${markerId})`}
                    strokeDasharray={isOptionalRoute ? "5 3" : isHov ? "6 3" : undefined}
                    onClick={readOnly ? undefined : selectConnection}
                    style={{
                      filter: isSelected ? `drop-shadow(0 2px 5px ${mainStroke}55)` : undefined,
                      cursor: readOnly ? undefined : "pointer",
                      pointerEvents: "stroke",
                    }} />
                </>
```

- [ ] **Step 7: Keep the hitbox unchanged**

Verify this existing hitbox stays after the visible route rendering:

```tsx
              <path d={arrow.path} stroke="transparent" strokeWidth="22" fill="none" className="cursor-pointer"
```

Do not reduce `strokeWidth="22"`; this preserves easy route selection.

- [ ] **Step 8: Make selected waypoint handles larger**

Find the waypoint handle circles:

```tsx
                    r={10}
```

Replace with:

```tsx
                    r={waypointOuterRadius(isSelected)}
```

Find:

```tsx
                    r={5}
```

in the draggable waypoint handle circle and replace with:

```tsx
                    r={waypointInnerRadius(isSelected)}
```

Leave bend insertion controls unchanged so the editor does not become visually noisy.

- [ ] **Step 9: Run the focused tests**

Run:

```bash
npm test -- src/test/processCanvasManualConnections.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit implementation**

Run:

```bash
git add src/components/process/ProcessCanvas.tsx src/test/processCanvasManualConnections.test.tsx
git commit -m "Improve selected process editor route focus"
```

---

### Task 3: Regression Verification

**Files:**
- Verify only, no code edits expected.

- [ ] **Step 1: Run related process editor tests**

Run:

```bash
npm test -- src/test/processCanvasManualConnections.test.tsx src/test/processTimerEvent.test.tsx src/test/processenEditorEditMode.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run related viewer/shared canvas tests**

Run:

```bash
npm test -- src/test/procesviewerSharedCanvas.test.tsx src/test/processviewerManualConnections.test.tsx src/test/processCanvas.test.ts
```

Expected: PASS. This confirms viewer mode and shared canvas behavior remain stable.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS. Vite may print chunk-size warnings; those are acceptable if the build exits successfully.

- [ ] **Step 4: Inspect git status**

Run:

```bash
git status --short
```

Expected: only pre-existing unrelated dirty files plus the committed implementation. If implementation files are still modified, review and commit or fix before finishing.

---

## Self-Review Notes

- Spec coverage: selected route visual clarity is covered by Task 1 tests and Task 2 styling; render-on-top is covered by ordered rendering; edit-only behavior is covered by read-only test; waypoint usability is covered by handle radius test.
- Data safety: no `Connection` schema or persistence code changes are planned.
- Scope control: no routing rules, detail panels, or viewer selection behavior are changed.
