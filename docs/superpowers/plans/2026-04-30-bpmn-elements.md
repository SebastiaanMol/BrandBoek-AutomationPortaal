# BPMN Elements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Terminate, Send, Receive event types and AND gateway to the process canvas, replacing the 2-button StepDialog toggle with a grouped visual icon picker.

**Architecture:** Three-file change — extend the `ProcessStep.type` union, add four shape-rendering sub-components and update canvas dispatch/ghost/context-menu in ProcessCanvas, replace the type toggle with an icon grid in StepDialog. No data migration needed; all new type values are additive.

**Tech Stack:** React 18, TypeScript, SVG canvas (hand-rolled, not a library), Vitest

---

## File Map

| File | Change |
|------|--------|
| `src/data/processData.ts` | Extend `ProcessStep.type` union (line 30) |
| `src/components/process/ProcessCanvas.tsx` | Update `isEvent()` + `isDecision()`, add 4 shape components, update render dispatch / drag ghost / context menu |
| `src/components/process/StepDialog.tsx` | Extend `StepType`, update `useEffect`, replace 2-button toggle with 8-button icon grid |
| `src/test/bpmnTypes.test.ts` | New: unit tests for type categorization logic |

---

### Task 1: Extend type union, helpers, and tests

**Files:**
- Modify: `src/data/processData.ts:30`
- Modify: `src/components/process/ProcessCanvas.tsx:36-42`
- Create: `src/test/bpmnTypes.test.ts`

- [ ] **Step 1: Write unit tests for the updated categorization logic**

Create `src/test/bpmnTypes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ProcessStep } from "@/data/processData";

// Inline the intended post-change logic (mirrors ProcessCanvas helpers).
// Pattern mirrors processCanvas.test.ts — pure logic duplicated for testability.

function isEvent(step: Pick<ProcessStep, "type">) {
  return step.type === "start" || step.type === "end"
    || step.type === "terminate" || step.type === "send" || step.type === "receive";
}

function isDecision(step: Pick<ProcessStep, "type">) {
  return step.type === "decision" || step.type === "and";
}

describe("BPMN-01: isEvent — event types", () => {
  it("returns true for start", () => expect(isEvent({ type: "start" })).toBe(true));
  it("returns true for end",   () => expect(isEvent({ type: "end" })).toBe(true));
  it("returns true for terminate", () => expect(isEvent({ type: "terminate" })).toBe(true));
  it("returns true for send",  () => expect(isEvent({ type: "send" })).toBe(true));
  it("returns true for receive", () => expect(isEvent({ type: "receive" })).toBe(true));
  it("returns false for task",     () => expect(isEvent({ type: "task" })).toBe(false));
  it("returns false for decision", () => expect(isEvent({ type: "decision" })).toBe(false));
  it("returns false for and",      () => expect(isEvent({ type: "and" })).toBe(false));
  it("returns false for undefined", () => expect(isEvent({ type: undefined })).toBe(false));
});

describe("BPMN-02: isDecision — gateway types", () => {
  it("returns true for decision", () => expect(isDecision({ type: "decision" })).toBe(true));
  it("returns true for and",      () => expect(isDecision({ type: "and" })).toBe(true));
  it("returns false for start",   () => expect(isDecision({ type: "start" })).toBe(false));
  it("returns false for task",    () => expect(isDecision({ type: "task" })).toBe(false));
  it("returns false for terminate", () => expect(isDecision({ type: "terminate" })).toBe(false));
  it("returns false for send",    () => expect(isDecision({ type: "send" })).toBe(false));
  it("returns false for receive", () => expect(isDecision({ type: "receive" })).toBe(false));
  it("returns false for undefined", () => expect(isDecision({ type: undefined })).toBe(false));
});

describe("BPMN-03: StepDialog type restoration logic", () => {
  const VALID_TYPES = ["task","decision","start","end","terminate","send","receive","and"] as const;
  type StepType = typeof VALID_TYPES[number];

  function restoreType(raw: string | undefined): StepType {
    return VALID_TYPES.includes(raw as StepType) ? (raw as StepType) : "task";
  }

  it("restores each valid type to itself", () => {
    for (const t of VALID_TYPES) expect(restoreType(t)).toBe(t);
  });
  it("falls back to 'task' for undefined", () => expect(restoreType(undefined)).toBe("task"));
  it("falls back to 'task' for unknown string", () => expect(restoreType("bogus")).toBe("task"));
});
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
npm test -- bpmnTypes
```
Expected: all 20 BPMN-01/02/03 tests pass (they test inline logic, not source yet).

- [ ] **Step 3: Extend the type union in processData.ts**

In `src/data/processData.ts` line 30, replace:
```ts
  type?: "task" | "start" | "end" | "decision";
```
with:
```ts
  type?: "task" | "start" | "end" | "decision" | "terminate" | "send" | "receive" | "and";
```

- [ ] **Step 4: Update isEvent() and isDecision() in ProcessCanvas.tsx**

In `src/components/process/ProcessCanvas.tsx`, replace lines 36–42:
```ts
function isEvent(step: ProcessStep) {
  return step.type === "start" || step.type === "end";
}

function isDecision(step: ProcessStep) {
  return step.type === "decision";
}
```
with:
```ts
function isEvent(step: ProcessStep) {
  return step.type === "start" || step.type === "end"
    || step.type === "terminate" || step.type === "send" || step.type === "receive";
}

function isDecision(step: ProcessStep) {
  return step.type === "decision" || step.type === "and";
}
```

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: all 127+ tests pass, 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/data/processData.ts src/components/process/ProcessCanvas.tsx src/test/bpmnTypes.test.ts
git commit -m "feat(bpmn): extend ProcessStep type union, update isEvent/isDecision helpers"
```

---

### Task 2: Add new shape components + update canvas dispatch

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`
  - After `DecisionDiamond` (around line 360): add 4 new components
  - Step render loop (~line 923): update dispatch
  - Drag ghost (~line 961): update event-type handling
  - Context menu (~line 1193): update local `isEvent` check

- [ ] **Step 1: Add TerminateCircle after the DecisionDiamond function**

Find the comment `// ── DecisionDiamond` in ProcessCanvas.tsx and locate the closing `}` of `DecisionDiamond`. After that closing brace, add:

```tsx
// ── TerminateCircle ───────────────────────────────────────────────────────────

function TerminateCircle({ step, cx, cy, isDragging, isTarget, customLanes, onMouseDown, onPortMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  customLanes?: CustomLane[];
  onMouseDown?: (e: React.MouseEvent) => void;
  onPortMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const cfg = getLaneConfig(step.team, customLanes);
  const str = cfg.stroke;
  const label = step.label.length > 14 ? step.label.slice(0, 13) + "…" : step.label;

  return (
    <g style={{ opacity: isDragging ? 0.35 : 1, cursor: "move" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onMouseDown={onMouseDown} onContextMenu={onContextMenu}>
      {isTarget && (
        <circle cx={cx} cy={cy} r={EVT_R + 6}
          fill="none" stroke={str} strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <circle cx={cx} cy={cy} r={EVT_R} fill="white" stroke={str} strokeWidth="3"
        style={{ filter: hov ? `drop-shadow(0 2px 8px ${str}88)` : undefined }} />
      <circle cx={cx} cy={cy} r={EVT_R * 0.5} fill={str} style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + EVT_R + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="600" fill={str}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      {hov && onPortMouseDown && (
        <circle cx={cx + EVT_R} cy={cy} r={5}
          fill={str} stroke="white" strokeWidth="1.5"
          style={{ cursor: "crosshair" }}
          onMouseDown={e => { e.stopPropagation(); onPortMouseDown(e); }} />
      )}
    </g>
  );
}

// ── SendCircle ────────────────────────────────────────────────────────────────

function SendCircle({ step, cx, cy, isDragging, isTarget, customLanes, onMouseDown, onPortMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  customLanes?: CustomLane[];
  onMouseDown?: (e: React.MouseEvent) => void;
  onPortMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const cfg = getLaneConfig(step.team, customLanes);
  const str = cfg.stroke;
  const label = step.label.length > 14 ? step.label.slice(0, 13) + "…" : step.label;

  return (
    <g style={{ opacity: isDragging ? 0.35 : 1, cursor: "move" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onMouseDown={onMouseDown} onContextMenu={onContextMenu}>
      {isTarget && (
        <circle cx={cx} cy={cy} r={EVT_R + 6}
          fill="none" stroke={str} strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <circle cx={cx} cy={cy} r={EVT_R} fill="white" stroke={str} strokeWidth="1.5"
        style={{ filter: hov ? `drop-shadow(0 2px 8px ${str}88)` : undefined }} />
      <rect x={cx - 7} y={cy - 5} width="14" height="10" rx="1" fill={str}
        style={{ pointerEvents: "none" }} />
      <polyline points={`${cx - 7},${cy - 5} ${cx},${cy + 1} ${cx + 7},${cy - 5}`}
        stroke="white" strokeWidth="1.2" fill="none" style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + EVT_R + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="600" fill={str}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      {hov && onPortMouseDown && (
        <circle cx={cx + EVT_R} cy={cy} r={5}
          fill={str} stroke="white" strokeWidth="1.5"
          style={{ cursor: "crosshair" }}
          onMouseDown={e => { e.stopPropagation(); onPortMouseDown(e); }} />
      )}
    </g>
  );
}

// ── ReceiveCircle ─────────────────────────────────────────────────────────────

function ReceiveCircle({ step, cx, cy, isDragging, isTarget, customLanes, onMouseDown, onPortMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  customLanes?: CustomLane[];
  onMouseDown?: (e: React.MouseEvent) => void;
  onPortMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [hov, setHov] = useState(false);
  const cfg = getLaneConfig(step.team, customLanes);
  const str = cfg.stroke;
  const label = step.label.length > 14 ? step.label.slice(0, 13) + "…" : step.label;

  return (
    <g style={{ opacity: isDragging ? 0.35 : 1, cursor: "move" }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onMouseDown={onMouseDown} onContextMenu={onContextMenu}>
      {isTarget && (
        <circle cx={cx} cy={cy} r={EVT_R + 6}
          fill="none" stroke={str} strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <circle cx={cx} cy={cy} r={EVT_R} fill="white" stroke={str} strokeWidth="1.5"
        style={{ filter: hov ? `drop-shadow(0 2px 8px ${str}88)` : undefined }} />
      <rect x={cx - 7} y={cy - 5} width="14" height="10" rx="1"
        fill="none" stroke={str} strokeWidth="1.2" style={{ pointerEvents: "none" }} />
      <polyline points={`${cx - 7},${cy - 5} ${cx},${cy + 1} ${cx + 7},${cy - 5}`}
        stroke={str} strokeWidth="1.2" fill="none" style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + EVT_R + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="600" fill={str}
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      {hov && onPortMouseDown && (
        <circle cx={cx + EVT_R} cy={cy} r={5}
          fill={str} stroke="white" strokeWidth="1.5"
          style={{ cursor: "crosshair" }}
          onMouseDown={e => { e.stopPropagation(); onPortMouseDown(e); }} />
      )}
    </g>
  );
}

// ── AndDiamond ────────────────────────────────────────────────────────────────

function AndDiamond({ step, cx, cy, isDragging, isTarget, onClick, onPortMouseDown, onStepMouseDown, customLanes }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  onClick?: () => void;
  onPortMouseDown?: (e: React.MouseEvent) => void;
  onStepMouseDown?: (e: React.MouseEvent) => void;
  customLanes?: CustomLane[];
}) {
  const [hov, setHov] = useState(false);
  const cfg = getLaneConfig(step.team, customLanes);
  const h = DECISION_H;
  const pts = `${cx},${cy - h} ${cx + h},${cy} ${cx},${cy + h} ${cx - h},${cy}`;
  const ptsTarget = `${cx},${cy - h - 6} ${cx + h + 6},${cy} ${cx},${cy + h + 6} ${cx - h - 6},${cy}`;
  const label = step.label.length > 13 ? step.label.slice(0, 12) + "…" : step.label;

  return (
    <g style={{ opacity: isDragging ? 0.3 : 1 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      {isTarget && (
        <polygon points={ptsTarget} fill="none" stroke={cfg.stroke}
          strokeWidth="2" strokeDasharray="5 3" opacity="0.7" />
      )}
      <polygon
        points={pts}
        fill="white"
        stroke={hov ? cfg.stroke : "#cbd5e1"}
        strokeWidth={hov ? 2 : 1.5}
        style={{ cursor: "pointer", filter: hov ? "drop-shadow(0 2px 6px rgba(0,0,0,.1))" : undefined }}
        onMouseDown={onStepMouseDown}
        onClick={onClick}
      />
      <line x1={cx} y1={cy - h * 0.55} x2={cx} y2={cy + h * 0.55}
        stroke={hov ? cfg.stroke : "#64748b"} strokeWidth="2" style={{ pointerEvents: "none" }} />
      <line x1={cx - h * 0.55} y1={cy} x2={cx + h * 0.55} y2={cy}
        stroke={hov ? cfg.stroke : "#64748b"} strokeWidth="2" style={{ pointerEvents: "none" }} />
      <text x={cx} y={cy + h + 10} textAnchor="middle" dominantBaseline="middle"
        fontSize="8" fontWeight="500" fill="#1e293b"
        style={{ pointerEvents: "none", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}>
        {label}
      </text>
      {onPortMouseDown && (
        <circle cx={cx + h} cy={cy} r={5} fill={cfg.stroke} stroke="white" strokeWidth="1.5"
          style={{ cursor: "crosshair" }}
          onMouseDown={e => { e.stopPropagation(); onPortMouseDown(e); }} />
      )}
    </g>
  );
}
```

- [ ] **Step 2: Update the step render dispatch (~line 923)**

Find this block in the `{steps.map(step => {` section:
```tsx
          if (isEvent(step)) {
            return (
              <EventCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (isDecision(step)) {
            return (
              <DecisionDiamond key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes}
                onClick={() => { if (!dragging?.moved) onStepClick?.(step); }}
                onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
                onStepMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }} />
            );
          }

          return (
            <StepBox key={step.id} step={step} cx={cx} cy={cy}
              isDragging={isDrag} isTarget={isTarget}
              customLanes={customLanes}
              onClick={() => { if (!dragging?.moved) onStepClick?.(step); }}
              onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
              onStepMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
              onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
          );
```

Replace with:
```tsx
          if (step.type === "start" || step.type === "end") {
            return (
              <EventCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (step.type === "terminate") {
            return (
              <TerminateCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes}
                onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (step.type === "send") {
            return (
              <SendCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes}
                onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (step.type === "receive") {
            return (
              <ReceiveCircle key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes}
                onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
                onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
                onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
            );
          }

          if (step.type === "and") {
            return (
              <AndDiamond key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes}
                onClick={() => { if (!dragging?.moved) onStepClick?.(step); }}
                onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
                onStepMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }} />
            );
          }

          if (step.type === "decision") {
            return (
              <DecisionDiamond key={step.id} step={step} cx={cx} cy={cy}
                isDragging={isDrag} isTarget={isTarget}
                customLanes={customLanes}
                onClick={() => { if (!dragging?.moved) onStepClick?.(step); }}
                onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
                onStepMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }} />
            );
          }

          return (
            <StepBox key={step.id} step={step} cx={cx} cy={cy}
              isDragging={isDrag} isTarget={isTarget}
              customLanes={customLanes}
              onClick={() => { if (!dragging?.moved) onStepClick?.(step); }}
              onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
              onStepMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
              onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
          );
```

- [ ] **Step 3: Update the drag ghost (~line 961)**

Find this block inside the `{dragging?.moved && (() => {` section:
```tsx
          if (isEvent(step)) {
            const isStart = step.type === "start";
            const fill = isStart ? "#dcfce7" : "#fee2e2";
            const str  = isStart ? "#16a34a" : "#dc2626";
            const targetCY = dragTarget
              ? laneStarts[dragTarget.team] + dragTarget.row * ROW_H + ROW_H / 2
              : gy;
            return (
              <g opacity={0.6} style={{ pointerEvents: "none" }}>
                <circle cx={gx} cy={gy} r={EVT_R} fill={fill} stroke={str} strokeWidth={isStart ? 2.5 : 4} />
                <circle cx={gx} cy={gy} r={isStart ? EVT_R * 0.38 : EVT_R * 0.55} fill={str} />
                {dragTarget && getColX(dragTarget.col) !== undefined && (
                  <circle cx={getColX(dragTarget.col)!} cy={targetCY} r={EVT_R + 6}
                    fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 3" opacity="0.6" />
                )}
              </g>
            );
          }
```

Replace with:
```tsx
          if (isEvent(step)) {
            const isStart = step.type === "start";
            const isEnd   = step.type === "end";
            const fill  = isStart ? "#dcfce7" : isEnd ? "#fee2e2" : "white";
            const str   = isStart ? "#16a34a"  : isEnd ? "#dc2626"  : getLaneConfig(step.team, customLanes).stroke;
            const sw    = isEnd ? 4 : isStart ? 2.5 : 2;
            const targetCY = dragTarget
              ? laneStarts[dragTarget.team] + dragTarget.row * ROW_H + ROW_H / 2
              : gy;
            return (
              <g opacity={0.6} style={{ pointerEvents: "none" }}>
                <circle cx={gx} cy={gy} r={EVT_R} fill={fill} stroke={str} strokeWidth={sw} />
                <circle cx={gx} cy={gy} r={EVT_R * 0.4} fill={str} />
                {dragTarget && getColX(dragTarget.col) !== undefined && (
                  <circle cx={getColX(dragTarget.col)!} cy={targetCY} r={EVT_R + 6}
                    fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 3" opacity="0.6" />
                )}
              </g>
            );
          }
```

- [ ] **Step 4: Update the context menu local isEvent check (~line 1193)**

Find:
```tsx
            const isEvent = step?.type === "start" || step?.type === "end";
            return isEvent ? (
```

Replace with:
```tsx
            const isEvt = step?.type === "start" || step?.type === "end"
              || step?.type === "terminate" || step?.type === "send" || step?.type === "receive";
            return isEvt ? (
```

- [ ] **Step 5: Run full test suite and lint**

```bash
npm test
npm run lint
```
Expected: all tests pass, 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/process/ProcessCanvas.tsx
git commit -m "feat(bpmn): add Terminate, Send, Receive, AND shape components to process canvas"
```

---

### Task 3: Update StepDialog icon picker

**Files:**
- Modify: `src/components/process/StepDialog.tsx`

- [ ] **Step 1: Add the inline SVG icon components at the top of StepDialog.tsx**

Add these after the imports (before the `type StepType` line):

```tsx
// ── BPMN type icon components (20×20 SVG, rendered at h-5 w-5) ───────────────

const StartEventIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="10" cy="10" r="2.5" fill="currentColor" />
  </svg>
);

const EndEventIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="3" />
    <circle cx="10" cy="10" r="3.5" fill="currentColor" />
  </svg>
);

const TerminateIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2.5" />
    <circle cx="10" cy="10" r="4.5" fill="currentColor" />
  </svg>
);

const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
    <rect x="5.5" y="7" width="9" height="6" rx="0.5" fill="currentColor" />
    <polyline points="5.5,7 10,10.5 14.5,7" stroke="white" strokeWidth="1" />
  </svg>
);

const ReceiveIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
    <rect x="5.5" y="7" width="9" height="6" rx="0.5" stroke="currentColor" strokeWidth="1" />
    <polyline points="5.5,7 10,10.5 14.5,7" stroke="currentColor" strokeWidth="1" />
  </svg>
);

const XorIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <polygon points="10,2 18,10 10,18 2,10" stroke="currentColor" strokeWidth="1.5" />
    <line x1="7" y1="7" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" />
    <line x1="13" y1="7" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const AndIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <polygon points="10,2 18,10 10,18 2,10" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10" y1="5" x2="10" y2="15" stroke="currentColor" strokeWidth="1.5" />
    <line x1="5" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const TaskIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="5" width="16" height="10" rx="3" stroke="currentColor" strokeWidth="1.5" />
    <rect x="2" y="5" width="3" height="10" rx="1.5" fill="currentColor" />
  </svg>
);
```

- [ ] **Step 2: Update StepType, TYPE_GROUPS, and the useEffect**

Replace the `type StepType` line:
```ts
type StepType = "task" | "decision";
```
with:
```ts
type StepType = "task" | "decision" | "start" | "end" | "terminate" | "send" | "receive" | "and";
```

Add the `TYPE_GROUPS` constant immediately after the `StepType` declaration (before the interface):
```ts
const TYPE_GROUPS: { label: string; types: { value: StepType; label: string; Icon: () => JSX.Element }[] }[] = [
  {
    label: "Events",
    types: [
      { value: "start",     label: "Start",     Icon: StartEventIcon },
      { value: "end",       label: "End",        Icon: EndEventIcon },
      { value: "terminate", label: "Terminate",  Icon: TerminateIcon },
      { value: "send",      label: "Send",       Icon: SendIcon },
      { value: "receive",   label: "Receive",    Icon: ReceiveIcon },
    ],
  },
  {
    label: "Gateways",
    types: [
      { value: "decision",  label: "XOR",        Icon: XorIcon },
      { value: "and",       label: "AND",        Icon: AndIcon },
    ],
  },
  {
    label: "Activity",
    types: [
      { value: "task",      label: "Task",       Icon: TaskIcon },
    ],
  },
];

const VALID_STEP_TYPES = TYPE_GROUPS.flatMap(g => g.types.map(t => t.value));
```

In the `useEffect`, replace the `setStepType` call for the editing branch:
```ts
      setStepType((step.type === "decision" ? "decision" : "task") as StepType);
```
with:
```ts
      setStepType(VALID_STEP_TYPES.includes(step.type as StepType) ? (step.type as StepType) : "task");
```

- [ ] **Step 3: Replace the 2-button toggle with the icon grid**

Find and replace this block in the JSX:
```tsx
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="flex gap-2">
                {(["task", "decision"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setStepType(t)}
                    className={[
                      "flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                      stepType === t
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    ].join(" ")}
                  >
                    {t === "task" ? "Taakstap" : "◇ Beslissingspunt"}
                  </button>
                ))}
              </div>
            </div>
```

with:
```tsx
            <div className="space-y-1.5">
              <Label>Type</Label>
              <div className="space-y-3">
                {TYPE_GROUPS.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {group.types.map(t => (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setStepType(t.value)}
                          className={[
                            "flex flex-col items-center gap-1 rounded-lg border p-2 text-[9px] transition-colors",
                            stepType === t.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/30",
                          ].join(" ")}
                        >
                          <t.Icon />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
```

- [ ] **Step 4: Run full test suite and lint**

```bash
npm test
npm run lint
```
Expected: all tests pass, 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/process/StepDialog.tsx
git commit -m "feat(bpmn): replace StepDialog type toggle with grouped BPMN icon picker"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `terminate` type: data model + TerminateCircle component + icon in dialog
- ✅ `send` type: data model + SendCircle component + icon in dialog
- ✅ `receive` type: data model + ReceiveCircle component + icon in dialog
- ✅ `and` type: data model + AndDiamond component + icon in dialog
- ✅ `isEvent()` extended to include terminate/send/receive
- ✅ `isDecision()` extended to include and (shares DECISION_H geometry)
- ✅ Column width: all new event types use EVT_COL_W (isEvent returns true)
- ✅ Edge attachment: same geometry as start/end for events, same as decision for and
- ✅ Description field: only shown for `"task"` — no change needed (condition already `stepType === "task"`)
- ✅ Existing diagrams: all existing type values render identically (no regressions)
- ✅ Context menu: events show "Verwijder", gateways/tasks show "Parkeer stap"
- ✅ Drag ghost: updated to use lane color for new event types
- ✅ StepDialog: grouped icon grid with 8 options across 3 categories
- ✅ Type restoration in useEffect: uses VALID_STEP_TYPES array to map all 8 types

**No placeholders detected.**

**Type consistency:** `StepType` in StepDialog matches `ProcessStep.type` union in processData.ts. `VALID_STEP_TYPES` is derived from `TYPE_GROUPS` so they stay in sync.
