# Process Step Staging Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a step staging area (Stappen tab in the right panel) where HubSpot drift steps and manually parked steps live, giving users full control over how canvas changes are applied — nothing auto-updates without a human dragging or approving it.

**Architecture:** Drift detection is a pure frontend computation comparing `stage-{stageId}` step IDs against live pipeline stages. Parked steps are stored in `process_state.parked_steps` (new DB column). The right panel gains a two-tab header (Automations / Stappen) rendered in ProcessenEditor when no automation detail panel is open. Parking is triggered via right-click context menu on a step or by dragging a step to the right of the SVG canvas boundary.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Supabase (JSONB column), Vitest

---

## File Map

| File | Change |
|------|--------|
| `supabase/migrations/20260429000000_process_state_parked.sql` | NEW — add `parked_steps` column |
| `src/lib/supabaseStorage.ts` | Add `parkedSteps` to `SavedProcessState`, update fetch/save |
| `src/lib/processDrift.ts` | NEW — pure drift detection logic |
| `src/test/processDrift.test.ts` | NEW — unit tests for drift detection |
| `src/components/process/ProcessCanvas.tsx` | Add `onParkStep`, `onPlaceStagedStep` props; extend context menu; handle `stagedStep` drag type; drag-to-sidebar detection |
| `src/components/process/StepStagingPanel.tsx` | NEW — Stappen tab UI |
| `src/components/process/ProcessenEditor.tsx` | Wire state, handlers, tabs, new components |

---

## Task 1: DB migration — add parked_steps column

**Files:**
- Create: `supabase/migrations/20260429000000_process_state_parked.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add parked_steps column to process_state (no migration needed for existing rows — DEFAULT handles them)
ALTER TABLE process_state
  ADD COLUMN IF NOT EXISTS parked_steps JSONB NOT NULL DEFAULT '[]';
```

- [ ] **Step 2: Apply locally**

```bash
npx supabase db push
```

Expected: migration applied, no errors. If Supabase CLI is not set up, apply via the Supabase dashboard SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260429000000_process_state_parked.sql
git commit -m "feat(db): add parked_steps column to process_state"
```

---

## Task 2: Update storage layer

**Files:**
- Modify: `src/lib/supabaseStorage.ts:270-313`

- [ ] **Step 1: Extend `SavedProcessState` interface**

Replace the existing interface (lines 270-274):

```typescript
export interface SavedProcessState {
  steps:       unknown[];
  connections: unknown[];
  autoLinks:   Record<string, { fromStepId: string; toStepId: string }>;
  parkedSteps: unknown[];   // ProcessStep[] — persisted across sessions
}
```

- [ ] **Step 2: Update `fetchProcessState` to read `parked_steps`**

Replace the existing `fetchProcessState` function:

```typescript
export async function fetchProcessState(pipelineId: string): Promise<SavedProcessState | null> {
  const { data, error } = await db
    .from("process_state")
    .select("steps, connections, auto_links, parked_steps")
    .eq("id", pipelineId)
    .maybeSingle();

  if (error) throw error;
  if (!data)  return null;

  return {
    steps:       (data.steps        ?? []) as unknown[],
    connections: (data.connections  ?? []) as unknown[],
    autoLinks:   (data.auto_links   ?? {}) as Record<string, { fromStepId: string; toStepId: string }>,
    parkedSteps: (data.parked_steps ?? []) as unknown[],
  };
}
```

- [ ] **Step 3: Update `saveProcessState` to write `parked_steps`**

Replace the existing `saveProcessState` function:

```typescript
export async function saveProcessState(pipelineId: string, state: SavedProcessState): Promise<void> {
  const { error } = await db
    .from("process_state")
    .upsert(
      {
        id:           pipelineId,
        steps:        state.steps,
        connections:  state.connections,
        auto_links:   state.autoLinks,
        parked_steps: state.parkedSteps,
        updated_at:   new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) throw error;
}
```

- [ ] **Step 4: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabaseStorage.ts
git commit -m "feat(storage): add parkedSteps to SavedProcessState"
```

---

## Task 3: Drift detection utility + tests

**Files:**
- Create: `src/lib/processDrift.ts`
- Create: `src/test/processDrift.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/test/processDrift.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { detectDrift } from "@/lib/processDrift";
import type { ProcessStep } from "@/data/processData";
import type { Pipeline } from "@/lib/types";

function makeStep(stageId: string, label: string): ProcessStep {
  return { id: `stage-${stageId}`, label, team: "sales", column: 1, type: "task" };
}

function makePipeline(stages: { stage_id: string; label: string }[]): Pipeline {
  return {
    pipelineId: "p1", naam: "Test", syncedAt: "", beschrijving: null, isActive: true,
    stages: stages.map((s, i) => ({ stage_id: s.stage_id, label: s.label, display_order: i, metadata: {} })),
  };
}

describe("detectDrift", () => {
  it("returns empty when canvas matches pipeline exactly", () => {
    const steps = [makeStep("s1", "Intake"), makeStep("s2", "Offerte")];
    const pipeline = makePipeline([{ stage_id: "s1", label: "Intake" }, { stage_id: "s2", label: "Offerte" }]);
    const result = detectDrift(steps, pipeline);
    expect(result.driftNew).toHaveLength(0);
    expect(result.driftRenamed).toHaveLength(0);
  });

  it("detects a new stage not on canvas", () => {
    const steps = [makeStep("s1", "Intake")];
    const pipeline = makePipeline([
      { stage_id: "s1", label: "Intake" },
      { stage_id: "s2", label: "Offerte" },
    ]);
    const result = detectDrift(steps, pipeline);
    expect(result.driftNew).toHaveLength(1);
    expect(result.driftNew[0].stage_id).toBe("s2");
    expect(result.driftNew[0].label).toBe("Offerte");
  });

  it("detects a renamed stage", () => {
    const steps = [makeStep("s1", "Intake")];
    const pipeline = makePipeline([{ stage_id: "s1", label: "Kennismaking" }]);
    const result = detectDrift(steps, pipeline);
    expect(result.driftNew).toHaveLength(0);
    expect(result.driftRenamed).toHaveLength(1);
    expect(result.driftRenamed[0]).toEqual({
      stepId: "stage-s1",
      oldLabel: "Intake",
      newLabel: "Kennismaking",
    });
  });

  it("ignores manually added steps (non-stage IDs)", () => {
    const steps = [
      makeStep("s1", "Intake"),
      { id: "s-manual-1", label: "Custom stap", team: "sales" as const, column: 2, type: "task" as const },
    ];
    const pipeline = makePipeline([{ stage_id: "s1", label: "Intake" }]);
    const result = detectDrift(steps, pipeline);
    expect(result.driftNew).toHaveLength(0);
    expect(result.driftRenamed).toHaveLength(0);
  });

  it("ignores deleted stages — no driftDeleted (they stay on canvas)", () => {
    const steps = [makeStep("s1", "Intake"), makeStep("s2", "Offerte")];
    const pipeline = makePipeline([{ stage_id: "s1", label: "Intake" }]);
    const result = detectDrift(steps, pipeline);
    // s2 was deleted from HubSpot — we do NOT surface it in drift
    expect(result.driftNew).toHaveLength(0);
    expect(result.driftRenamed).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/test/processDrift.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/processDrift'`

- [ ] **Step 3: Implement `detectDrift`**

Create `src/lib/processDrift.ts`:

```typescript
import type { ProcessStep } from "@/data/processData";
import type { Pipeline, PipelineStage } from "@/lib/types";

export interface DriftRename {
  stepId:   string;
  oldLabel: string;
  newLabel: string;
}

export interface DriftResult {
  driftNew:     PipelineStage[];
  driftRenamed: DriftRename[];
}

/**
 * Compare canvas steps against live pipeline stages and return what has changed.
 * Only steps with ID `stage-{stageId}` are considered (HubSpot-origin steps).
 * Manually added steps (e.g. `s-1234`) are ignored.
 * Deleted stages are NOT surfaced — they simply stop appearing as drift candidates.
 */
export function detectDrift(steps: ProcessStep[], pipeline: Pipeline): DriftResult {
  const stageStepIds = new Set(steps.map(s => s.id));
  const stageMap     = new Map(pipeline.stages.map(s => [s.stage_id, s]));

  // New: stages in pipeline that have no matching canvas step
  const driftNew = pipeline.stages.filter(
    s => !stageStepIds.has(`stage-${s.stage_id}`),
  );

  // Renamed: canvas steps whose label differs from the current stage label
  const driftRenamed: DriftRename[] = steps
    .filter(s => s.id.startsWith("stage-"))
    .flatMap(s => {
      const stageId = s.id.slice("stage-".length);
      const stage   = stageMap.get(stageId);
      if (!stage || stage.label === s.label) return [];
      return [{ stepId: s.id, oldLabel: s.label, newLabel: stage.label }];
    });

  return { driftNew, driftRenamed };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/test/processDrift.test.ts
```

Expected: 5 tests passing, 0 failing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/processDrift.ts src/test/processDrift.test.ts
git commit -m "feat(drift): add detectDrift utility with tests"
```

---

## Task 4: Extend ProcessCanvas — step context menu + park callback

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`

The canvas currently has a context menu only for connections. We need to:
1. Extend `contextMenu` state to discriminate conn vs step
2. Add `onParkStep` prop
3. Wire `onContextMenu` on each step shape
4. Update context menu rendering

- [ ] **Step 1: Add `onParkStep` prop to `ProcessCanvasProps`**

In the `ProcessCanvasProps` interface (around line 342), add after `onUpdateConnectionLabel`:

```typescript
onParkStep?: (stepId: string) => void;
```

And add it to the destructured props in `ProcessCanvas`:

```typescript
export function ProcessCanvas({
  steps, connections, automations,
  readOnly = false,
  onStepClick, onAutomationClick,
  onAddConnection, onDeleteConnection,
  onMoveStep, onAttachAutomation, onAddStep, onAddBranch, onUpdateConnectionLabel,
  onParkStep,
}: ProcessCanvasProps) {
```

- [ ] **Step 2: Extend the `contextMenu` state type**

Replace:
```typescript
const [contextMenu, setContextMenu] = useState<{
  connId: string; x: number; y: number;
} | null>(null);
```

With:
```typescript
const [contextMenu, setContextMenu] = useState<
  | { type: "conn"; connId: string; x: number; y: number }
  | { type: "step"; stepId: string; x: number; y: number }
  | null
>(null);
```

- [ ] **Step 3: Update all existing `setContextMenu` calls for connections**

There are two places that currently set `{ connId, x, y }` — find them with the search `setContextMenu({ connId` and change each to:

```typescript
setContextMenu({ type: "conn", connId: conn.id, x: e.clientX, y: e.clientY })
```

- [ ] **Step 4: Add `onContextMenu` prop to `StepBox`, `DecisionDiamond`, `EventCircle`**

For `StepBox` (around line 256), add `onContextMenu?: (e: React.MouseEvent) => void` to the props interface and wire it to the `<g>` element's `onContextMenu`.

Current `StepBox` signature:
```typescript
function StepBox({ step, cx, cy, isDragging, isTarget, onClick, onPortMouseDown, onStepMouseDown }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  onClick?: () => void;
  onPortMouseDown?: (e: React.MouseEvent) => void;
  onStepMouseDown?: (e: React.MouseEvent) => void;
}) {
```

Change to:
```typescript
function StepBox({ step, cx, cy, isDragging, isTarget, onClick, onPortMouseDown, onStepMouseDown, onContextMenu }: {
  step: ProcessStep; cx: number; cy: number;
  isDragging?: boolean; isTarget?: boolean;
  onClick?: () => void;
  onPortMouseDown?: (e: React.MouseEvent) => void;
  onStepMouseDown?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
```

Find the `<g>` opening tag in `StepBox` and add:
```tsx
onContextMenu={onContextMenu}
```

Apply the same pattern to `DecisionDiamond` (around line 296) and `EventCircle` (around line 215).

- [ ] **Step 5: Pass `onContextMenu` handler when rendering each step (around line 818)**

In the step rendering loop, for each shape add:
```typescript
onContextMenu={readOnly ? undefined : e => {
  e.preventDefault();
  e.stopPropagation();
  setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY });
}}
```

So the three renders become:

```tsx
// EventCircle (line ~820):
<EventCircle key={step.id} step={step} cx={cx} cy={cy}
  isDragging={isDrag} isTarget={isTarget}
  onMouseDown={readOnly ? undefined : e => { e.stopPropagation(); handleStepMouseDown(e, step); }}
  onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
  onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />

// DecisionDiamond (line ~828):
<DecisionDiamond key={step.id} step={step} cx={cx} cy={cy}
  isDragging={isDrag} isTarget={isTarget}
  onClick={() => { if (!dragging?.moved) onStepClick?.(step); }}
  onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
  onStepMouseDown={readOnly ? undefined : e => handleStepMouseDown(e, step)}
  onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />

// StepBox (line ~837):
<StepBox key={step.id} step={step} cx={cx} cy={cy}
  isDragging={isDrag} isTarget={isTarget}
  onClick={() => { if (!dragging?.moved) onStepClick?.(step); }}
  onPortMouseDown={readOnly ? undefined : e => handlePortMouseDown(e, step)}
  onStepMouseDown={readOnly ? undefined : e => handleStepMouseDown(e, step)}
  onContextMenu={readOnly ? undefined : e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ type: "step", stepId: step.id, x: e.clientX, y: e.clientY }); }} />
```

- [ ] **Step 6: Update context menu rendering (around line 1068)**

Replace the existing context menu JSX:

```tsx
{contextMenu && (
  <div
    className="fixed z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
    style={{ left: contextMenu.x, top: contextMenu.y }}
    onMouseLeave={() => setContextMenu(null)}
  >
    {contextMenu.type === "conn" && (
      <button
        className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
        onClick={() => { onDeleteConnection?.(contextMenu.connId); setContextMenu(null); }}
      >
        Verbinding verwijderen
      </button>
    )}
    {contextMenu.type === "step" && (
      <button
        className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50 transition-colors"
        onClick={() => { onParkStep?.(contextMenu.stepId); setContextMenu(null); }}
      >
        Parkeer stap
      </button>
    )}
  </div>
)}
```

- [ ] **Step 7: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/components/process/ProcessCanvas.tsx
git commit -m "feat(canvas): add step context menu with park action"
```

---

## Task 5: Extend ProcessCanvas — staged step drop + drag-to-sidebar

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`

Two additions: (a) handle a dragged staged step from the sidebar being dropped onto the canvas, (b) detect when an in-canvas drag ends to the right of the SVG and auto-park.

- [ ] **Step 1: Add `onPlaceStagedStep` prop**

In `ProcessCanvasProps`, add:
```typescript
onPlaceStagedStep?: (step: ProcessStep, team: TeamKey, column: number, row: number) => void;
```

Add to the destructured props in `ProcessCanvas`:
```typescript
onPlaceStagedStep,
```

- [ ] **Step 2: Add a `draggingRef` to track current drag state in closures**

Add after the `dragging` state declaration (around line 393):

```typescript
const draggingRef = useRef(dragging);
useEffect(() => { draggingRef.current = dragging; }, [dragging]);
```

- [ ] **Step 3: Update the first global `mouseup` useEffect to detect drag-to-sidebar**

Find the `useEffect` that adds `window.addEventListener("mouseup", onGlobalUp)` with `[]` dependency. Replace it with:

```typescript
useEffect(() => {
  function onGlobalUp(e: MouseEvent) {
    const d = draggingRef.current;
    if (d?.moved) {
      const svgRect = svgRef.current?.getBoundingClientRect();
      // If released to the right of the SVG, park the step
      if (svgRect && e.clientX > svgRect.right) {
        onParkStep?.(d.stepId);
        setDragging(null);
        setDrawing(null);
        setDrawingBranch(null);
        return;
      }
    }
    setDragging(null);
    setDrawing(null);
    setDrawingBranch(null);
  }
  window.addEventListener("mouseup", onGlobalUp);
  return () => window.removeEventListener("mouseup", onGlobalUp);
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Extend `onDragOver` to accept `stagedstep` type**

Find the SVG `onDragOver` handler (around line 631). Change the guard from:
```typescript
if (!e.dataTransfer.types.includes("newstep")) return;
```
To:
```typescript
if (!e.dataTransfer.types.includes("newstep") && !e.dataTransfer.types.includes("stagedstep")) return;
```

- [ ] **Step 5: Extend `onDrop` to handle `stagedstep`**

Find the SVG `onDrop` handler (around line 643). After the `newStep` check, add handling for `stagedstep`:

```typescript
onDrop={e => {
  if (readOnly) return;
  e.preventDefault();
  const pt  = clientToSvg(e.clientX, e.clientY);
  const col = nearestCol(pt.x);
  const { team, row } = nearestTeamRow(pt.y);
  setNewStepDrag(null);

  const stepType = e.dataTransfer.getData("newStep") as ProcessStep["type"] | "";
  if (stepType) {
    onAddStep?.(team, col, row, stepType);
    return;
  }

  const stagedStepJson = e.dataTransfer.getData("stagedStep");
  if (stagedStepJson) {
    try {
      const step = JSON.parse(stagedStepJson) as ProcessStep;
      onPlaceStagedStep?.(step, team, col, row);
    } catch { /* ignore malformed data */ }
  }
}}
```

- [ ] **Step 6: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/process/ProcessCanvas.tsx
git commit -m "feat(canvas): handle staged step drop and drag-to-sidebar parking"
```

---

## Task 6: Create StepStagingPanel component

**Files:**
- Create: `src/components/process/StepStagingPanel.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { GripVertical, X, Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProcessStep } from "@/data/processData";
import type { PipelineStage } from "@/lib/types";
import type { DriftRename } from "@/lib/processDrift";
import { TEAM_ORDER, TEAM_CONFIG } from "@/data/processData";
import { stagesToProcessState } from "@/data/processData";

interface StepStagingPanelProps {
  driftNew:        PipelineStage[];
  driftRenamed:    DriftRename[];
  parkedSteps:     ProcessStep[];
  onApplyRename:   (stepId: string, newLabel: string) => void;
  onDismissRename: (stepId: string) => void;
}

export function StepStagingPanel({
  driftNew, driftRenamed, parkedSteps, onApplyRename, onDismissRename,
}: StepStagingPanelProps) {
  const isEmpty = driftNew.length === 0 && driftRenamed.length === 0 && parkedSteps.length === 0;

  function handleDragStartNew(e: React.DragEvent, stage: PipelineStage) {
    // Build a minimal ProcessStep from the stage; ProcessenEditor will set the
    // final team/column/row when it's placed on the canvas.
    const step: ProcessStep = {
      id:    `stage-${stage.stage_id}`,
      label: stage.label,
      team:  "sales",
      column: 0,
      type:  "task",
    };
    e.dataTransfer.setData("stagedStep", JSON.stringify(step));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragStartParked(e: React.DragEvent, step: ProcessStep) {
    e.dataTransfer.setData("stagedStep", JSON.stringify(step));
    e.dataTransfer.effectAllowed = "move";
  }

  if (isEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <p className="text-xs text-muted-foreground text-center leading-relaxed">
          Geen stappen in de bak.<br />
          Klik rechts op een stap om hem te parkeren.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto divide-y divide-border">

      {/* ── Nieuw in HubSpot ─────────────────────────────────────────── */}
      {driftNew.length > 0 && (
        <div>
          <div className="px-4 py-3 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-foreground">Nieuw in HubSpot</span>
            <Badge variant="secondary" className="ml-auto text-[10px] bg-amber-50 text-amber-700 border-amber-200">
              {driftNew.length}
            </Badge>
          </div>
          <p className="px-4 pb-2 text-[11px] text-muted-foreground">Sleep naar de canvas om te plaatsen</p>
          <div className="divide-y divide-border">
            {driftNew.map(stage => (
              <div
                key={stage.stage_id}
                draggable
                onDragStart={e => handleDragStartNew(e, stage)}
                className="flex items-center gap-3 px-4 py-2.5 cursor-grab active:cursor-grabbing hover:bg-amber-50/50 transition-colors group"
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-amber-400 transition-colors" />
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-sm text-foreground truncate">{stage.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Hernoemd in HubSpot ─────────────────────────────────────── */}
      {driftRenamed.length > 0 && (
        <div>
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Hernoemd in HubSpot</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">{driftRenamed.length}</Badge>
          </div>
          <div className="divide-y divide-border">
            {driftRenamed.map(r => (
              <div key={r.stepId} className="px-4 py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground line-through truncate">{r.oldLabel}</p>
                  <p className="text-sm text-foreground font-medium truncate">→ {r.newLabel}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => onApplyRename(r.stepId, r.newLabel)}
                    className="h-6 w-6 rounded flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    title="Toepassen"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onDismissRename(r.stepId)}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-secondary/70 transition-colors text-muted-foreground"
                    title="Negeren"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Geparkeerd ───────────────────────────────────────────────── */}
      {parkedSteps.length > 0 && (
        <div>
          <div className="px-4 py-3 flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Geparkeerd</span>
            <Badge variant="secondary" className="ml-auto text-[10px]">{parkedSteps.length}</Badge>
          </div>
          <p className="px-4 pb-2 text-[11px] text-muted-foreground">Sleep terug naar de canvas</p>
          <div className="divide-y divide-border">
            {parkedSteps.map(step => {
              const cfg = TEAM_CONFIG[step.team];
              return (
                <div
                  key={step.id}
                  draggable
                  onDragStart={e => handleDragStartParked(e, step)}
                  className="flex items-center gap-3 px-4 py-2.5 cursor-grab active:cursor-grabbing hover:bg-secondary/50 transition-colors group"
                >
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground/70 transition-colors" />
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.dot }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{step.label}</p>
                    <p className="text-[11px] text-muted-foreground">{cfg.label}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify type-check passes**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/process/StepStagingPanel.tsx
git commit -m "feat(ui): add StepStagingPanel component"
```

---

## Task 7: Wire everything in ProcessenEditor

**Files:**
- Modify: `src/components/process/ProcessenEditor.tsx`

This task integrates all the previous pieces: parkedSteps state, drift detection, parking/placing handlers, tab UI, and new component props.

- [ ] **Step 1: Add imports**

At the top of `ProcessenEditor.tsx`, add:

```typescript
import { detectDrift } from "@/lib/processDrift";
import type { DriftRename } from "@/lib/processDrift";
import { StepStagingPanel } from "@/components/process/StepStagingPanel";
```

- [ ] **Step 2: Add parkedSteps state, tab state, and dismissedRenames**

After the existing `useState` declarations (around line 63):

```typescript
const [parkedSteps, setParkedSteps]           = useState<ProcessStep[]>([]);
const [rightTab, setRightTab]                 = useState<"automations" | "stappen">("automations");
const [dismissedRenames, setDismissedRenames] = useState<Set<string>>(new Set());
```

- [ ] **Step 3: Load parkedSteps from savedState**

In the `useEffect` that applies saved state (around line 103), after setting steps/connections, also restore parkedSteps:

```typescript
useEffect(() => {
  if (stateLoading) return;
  setLoading(false);
  if (!savedState) {
    const pipeline = pipelines.find(p => p.pipelineId === pipelineId) ?? null;
    if (pipeline && pipeline.stages.length > 0) {
      const stagesState = stagesToProcessState(pipeline);
      setState(stagesState);
      setSaved(stagesState);
    }
    return;
  }
  savedLinksRef.current = savedState.autoLinks;
  setState(prev => ({
    ...prev,
    steps:       savedState.steps       as ProcessState["steps"],
    connections: savedState.connections as ProcessState["connections"],
  }));
  setSaved(s => ({
    ...s,
    steps:       savedState.steps       as ProcessState["steps"],
    connections: savedState.connections as ProcessState["connections"],
  }));
  setParkedSteps(savedState.parkedSteps as ProcessStep[]);
  setIsDirty(false);
}, [savedState, stateLoading]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 4: Reset parkedSteps when pipeline changes**

In the `useEffect` that resets state on `pipelineId` change (around line 90):

```typescript
useEffect(() => {
  const pipeline = pipelines.find(p => p.pipelineId === pipelineId) ?? null;
  const baseState = pipeline && pipeline.stages.length > 0
    ? stagesToProcessState(pipeline)
    : initialState;
  savedLinksRef.current = {};
  setState(baseState);
  setSaved(baseState);
  setParkedSteps([]);
  setDismissedRenames(new Set());
  setIsDirty(false);
  setLoading(true);
}, [pipelineId]); // eslint-disable-line react-hooks/exhaustive-deps
```

- [ ] **Step 5: Compute drift (useMemo)**

Add after the `loading` state declaration (around line 68):

```typescript
const currentPipeline = pipelines.find(p => p.pipelineId === pipelineId) ?? null;

const { driftNew, driftRenamed: allDriftRenamed } = useMemo(
  () => currentPipeline && !loading
    ? detectDrift(state.steps, currentPipeline)
    : { driftNew: [], driftRenamed: [] },
  [state.steps, currentPipeline, loading],
);

const driftRenamed = allDriftRenamed.filter(r => !dismissedRenames.has(r.stepId));
```

Note: `useMemo` is not yet in ProcessenEditor's React import. Add it: change line 1 from `import { useState, useCallback, useEffect, useRef }` to `import { useState, useCallback, useEffect, useRef, useMemo }`.

- [ ] **Step 6: Add park/place/rename handlers**

After `handleDetach` (around line 438):

```typescript
// ── Staging area handlers ─────────────────────────────────────────────────
function handleParkStep(stepId: string) {
  const step = state.steps.find(s => s.id === stepId);
  if (!step) return;
  update(s => ({
    steps: s.steps.filter(x => x.id !== stepId),
    connections: s.connections.filter(c => c.fromStepId !== stepId && c.toStepId !== stepId),
    automations: s.automations.map(a =>
      a.fromStepId === stepId || a.toStepId === stepId
        ? { ...a, fromStepId: undefined, toStepId: undefined }
        : a,
    ),
  }));
  setParkedSteps(prev => [...prev, step]);
  toast.info(`"${step.label}" geparkeerd`);
}

function handlePlaceStep(step: ProcessStep, team: TeamKey, column: number, row: number) {
  const placed = { ...step, team, column, row };
  update(s => ({ ...s, steps: [...s.steps, placed] }));
  setParkedSteps(prev => prev.filter(p => p.id !== step.id));
  toast.success(`"${step.label}" geplaatst`);
}

function handleApplyRename(stepId: string, newLabel: string) {
  update(s => ({
    ...s,
    steps: s.steps.map(x => x.id === stepId ? { ...x, label: newLabel } : x),
  }));
  setDismissedRenames(prev => new Set([...prev, stepId]));
  toast.success("Stap hernoemd");
}

function handleDismissRename(stepId: string) {
  setDismissedRenames(prev => new Set([...prev, stepId]));
}
```

- [ ] **Step 7: Include parkedSteps in handleSave**

In `handleSave` (around line 157), update the `saveProcessState` call:

```typescript
await saveProcessState(pipelineId, {
  steps: state.steps,
  connections: state.connections,
  autoLinks,
  parkedSteps,
});
```

- [ ] **Step 8: Add right panel tabs and wire StepStagingPanel**

Find the right panels section (around line 633):

```tsx
{/* Right panels */}
{selectedAuto ? (
  <AutomationDetailPanel ... />
) : (
  <UnassignedPanel ... />
)}
```

Replace with:

```tsx
{/* Right panels */}
{selectedAuto ? (
  <AutomationDetailPanel
    automation={selectedAuto}
    fullData={dbAutomations?.find(a => a.id === selectedAuto?.id)}
    steps={state.steps}
    branchConnections={[
      ...state.connections.filter(c =>
        selectedAuto?.fromStepId && c.fromStepId === selectedAuto.fromStepId && c.toStepId === selectedAuto.toStepId
      ),
      ...state.connections.filter(c => c.fromAutomationId === selectedAuto?.id),
    ]}
    onClose={() => setSelectedAuto(null)}
    onDetach={handleDetach}
  />
) : (
  <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col h-full">
    {/* Tab header */}
    <div className="shrink-0 flex border-b border-border">
      <button
        type="button"
        onClick={() => setRightTab("automations")}
        className={[
          "flex-1 px-3 py-2.5 text-[11px] font-semibold transition-colors border-b-2",
          rightTab === "automations"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        Automations
      </button>
      <button
        type="button"
        onClick={() => setRightTab("stappen")}
        className={[
          "flex-1 px-3 py-2.5 text-[11px] font-semibold transition-colors border-b-2 flex items-center justify-center gap-1.5",
          rightTab === "stappen"
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        Stappen
        {(driftNew.length + driftRenamed.length + parkedSteps.length) > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold">
            {driftNew.length + driftRenamed.length + parkedSteps.length}
          </span>
        )}
      </button>
    </div>
    {/* Tab content */}
    {rightTab === "automations" ? (
      <UnassignedPanel
        automations={state.automations}
        steps={state.steps}
        onAutomationClick={handleAutoClick}
      />
    ) : (
      <StepStagingPanel
        driftNew={driftNew}
        driftRenamed={driftRenamed}
        parkedSteps={parkedSteps}
        onApplyRename={handleApplyRename}
        onDismissRename={handleDismissRename}
      />
    )}
  </div>
)}
```

- [ ] **Step 9: Add `onParkStep` and `onPlaceStagedStep` to `ProcessCanvas`**

Find the `<ProcessCanvas` element and add:

```tsx
onParkStep={handleParkStep}
onPlaceStagedStep={handlePlaceStep}
```

- [ ] **Step 10: Run full type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 11: Run all tests**

```bash
npx vitest run
```

Expected: all tests passing.

- [ ] **Step 12: Manual smoke test**

1. Open `/processen`, switch to Bewerken tab
2. Right-click a step → "Parkeer stap" → step disappears from canvas, appears in Stappen tab under "Geparkeerd"
3. Drag a parked step back onto the canvas → it lands at the dropped swimlane/column
4. Sync pipelines from HubSpot (add a stage in HubSpot first) → "Nieuw in HubSpot" section appears in Stappen tab with the new stage
5. Drag the new stage onto the canvas → it lands and disappears from the staging area
6. Click "Opslaan" → parked steps survive a page reload

- [ ] **Step 13: Commit**

```bash
git add src/components/process/ProcessenEditor.tsx
git commit -m "feat(editor): wire step staging area — park, place, drift detection"
```
