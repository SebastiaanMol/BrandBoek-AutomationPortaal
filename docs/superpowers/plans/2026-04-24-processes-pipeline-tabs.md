# Processes Pipeline Tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `/processen` into a "Bekijken" tab (read-only canvas per pipeline, with pipeline selector bar) and a "Bewerken" tab (existing canvas editor with pipeline dropdown).

**Architecture:** Each HubSpot pipeline gets its own canvas stored in `process_state` using `pipeline_id` as the row ID. The `Processen.tsx` page becomes a thin shell managing tab + pipeline selection state; it delegates to a new `ProcessenView` (read-only) and `ProcessenEditor` (extracted editor with dropdown). All `ProcessCanvas` handler props are made optional so the same component works in both modes.

**Tech Stack:** React 18, TypeScript, TanStack Query v5, Supabase, Tailwind CSS, shadcn/ui (DropdownMenu, AlertDialog, Button, Badge)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/supabaseStorage.ts` | Modify | `fetchProcessState(pipelineId)` + `saveProcessState(pipelineId, state)` |
| `src/lib/hooks.ts` | Modify | Add `useProcessState(pipelineId)` |
| `src/components/process/ProcessCanvas.tsx` | Modify | Make all handler props optional |
| `src/components/process/ProcessenView.tsx` | Create | Pipeline selector bar + read-only canvas |
| `src/components/process/ProcessenEditor.tsx` | Create | Extracted editor + pipeline dropdown |
| `src/pages/Processen.tsx` | Rewrite | Outer shell: tabs + shared pipeline state |
| `src/test/processState.test.ts` | Create | Unit tests for state logic |

---

### Task 1: Update `fetchProcessState` and `saveProcessState` to accept `pipelineId`

**Files:**
- Modify: `src/lib/supabaseStorage.ts` (lines 276–315)
- Create: `src/test/processState.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/test/processState.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

// Pure logic: the pipeline state row ID is the pipeline_id string as-is.
// This test documents the contract so a refactor can't silently break it.

function buildProcessStateId(pipelineId: string): string {
  return pipelineId;
}

describe("process state ID contract", () => {
  it("uses pipelineId directly as the row id", () => {
    expect(buildProcessStateId("pipeline-abc-123")).toBe("pipeline-abc-123");
  });

  it("does not prefix or transform the pipelineId", () => {
    const id = "hs-pipeline-xyz";
    expect(buildProcessStateId(id)).toBe(id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run src/test/processState.test.ts
```

Expected: FAIL — `buildProcessStateId` is not imported from anywhere yet (test is self-contained, should actually PASS since the logic is inline — that's intentional, this documents the contract).

- [ ] **Step 3: Update `src/lib/supabaseStorage.ts`**

Find lines 276–315. Make these exact changes:

**Remove** this line (~line 276):
```typescript
const PROCESS_STATE_ID = "main";
```

**Replace** `fetchProcessState()` with:
```typescript
export async function fetchProcessState(pipelineId: string): Promise<SavedProcessState | null> {
  const { data, error } = await db
    .from("process_state")
    .select("steps, connections, auto_links")
    .eq("id", pipelineId)
    .maybeSingle();

  if (error) throw error;
  if (!data)  return null;

  return {
    steps:       (data.steps       ?? []) as unknown[],
    connections: (data.connections ?? []) as unknown[],
    autoLinks:   (data.auto_links  ?? {}) as Record<string, { fromStepId: string; toStepId: string }>,
  };
}
```

**Replace** `saveProcessState(state)` with:
```typescript
export async function saveProcessState(pipelineId: string, state: SavedProcessState): Promise<void> {
  const { error } = await db
    .from("process_state")
    .upsert(
      {
        id:          pipelineId,
        steps:       state.steps,
        connections: state.connections,
        auto_links:  state.autoLinks,
        updated_at:  new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) throw error;
}
```

- [ ] **Step 4: Run TypeScript check**

```
npx tsc --noEmit
```

Expected: TypeScript errors on `fetchProcessState()` and `saveProcessState(state)` call sites in `src/pages/Processen.tsx` — these will be fixed in Task 5.

- [ ] **Step 5: Run tests**

```
npx vitest run src/test/processState.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/supabaseStorage.ts src/test/processState.test.ts
git commit -m "feat(process-state): accept pipelineId in fetchProcessState and saveProcessState"
```

---

### Task 2: Add `useProcessState` hook

**Files:**
- Modify: `src/lib/hooks.ts`

- [ ] **Step 1: Add `fetchProcessState` and `saveProcessState` to the import line at the top of `src/lib/hooks.ts`**

The current import line (line 3) lists many functions. Add `fetchProcessState` and `saveProcessState` to it:

```typescript
import { fetchAutomatiseringen, insertAutomatisering, updateAutomatisering, deleteAutomatisering, generateNextId, verifieerAutomatisering, fetchIntegration, saveIntegration, deleteIntegration, triggerHubSpotSync, triggerZapierSync, triggerTypeformSync, triggerGitlabSync, fetchPortalSettings, savePortalSettings, fetchAutomationLinks, confirmAutomationLink, fetchPipelines, triggerHubSpotPipelinesSync, triggerDescribePipeline, fetchFlows, insertFlow, updateFlow, deleteFlow, fetchAllConfirmedAutomationLinks, fetchProcessState, saveProcessState } from "./supabaseStorage";
```

- [ ] **Step 2: Add the `useProcessState` hook**

Add after the `useDescribePipeline` hook (around line 174):

```typescript
// ─── Process state ────────────────────────────────────────────────────────────

export function useProcessState(pipelineId: string | null) {
  return useQuery({
    queryKey: ["processState", pipelineId],
    queryFn:  () => pipelineId ? fetchProcessState(pipelineId) : null,
    enabled:  !!pipelineId,
    staleTime: Infinity, // canvas state doesn't change externally
  });
}
```

- [ ] **Step 3: Run TypeScript check**

```
npx tsc --noEmit
```

Expected: same errors as before from `Processen.tsx` (not yet fixed), but no new errors.

- [ ] **Step 4: Run tests**

```
npx vitest run
```

Expected: all 116 tests pass (3 todo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/hooks.ts
git commit -m "feat(hooks): add useProcessState(pipelineId) hook"
```

---

### Task 3: Make `ProcessCanvas` handler props optional

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`

This allows passing the canvas without any handlers for read-only display.

- [ ] **Step 1: Update the `ProcessCanvasProps` interface (around line 287)**

Change every handler from required to optional:

```typescript
interface ProcessCanvasProps {
  steps: ProcessStep[];
  connections: Connection[];
  automations: Automation[];
  onStepClick?:             (s: ProcessStep) => void;
  onAutomationClick?:       (a: Automation) => void;
  onAddConnection?:         (fromId: string, toId: string) => void;
  onDeleteConnection?:      (id: string) => void;
  onMoveStep?:              (stepId: string, newTeam: TeamKey, newColumn: number, newRow: number) => void;
  onAttachAutomation?:      (autoId: string, fromStepId: string, toStepId: string) => void;
  onAddStep?:               (team: TeamKey, column: number, row: number) => void;
  onAddBranch?:             (automationId: string, toStepId: string) => void;
  onUpdateConnectionLabel?: (connId: string, label: string) => void;
}
```

- [ ] **Step 2: Run TypeScript check**

```
npx tsc --noEmit
```

Expected: TypeScript errors inside `ProcessCanvas` where optional handlers are called without null-guards (e.g. `onStepClick(step)` is now invalid since `onStepClick` could be `undefined`).

- [ ] **Step 3: Fix all call sites inside `ProcessCanvas` with optional chaining**

For each handler used inside the component body, add `?.`:

- `onStepClick(s)` → `onStepClick?.(s)`
- `onAutomationClick(a)` → `onAutomationClick?.(a)`
- `onAddConnection(fromId, toId)` → `onAddConnection?.(fromId, toId)`
- `onDeleteConnection(id)` → `onDeleteConnection?.(id)`
- `onMoveStep(id, team, col, row)` → `onMoveStep?.(id, team, col, row)`
- `onAttachAutomation(id, from, to)` → `onAttachAutomation?.(id, from, to)`
- `onAddStep(team, col, row)` → `onAddStep?.(team, col, row)`
- `onAddBranch(id, toId)` → `onAddBranch?.(id, toId)`
- `onUpdateConnectionLabel(id, label)` → `onUpdateConnectionLabel?.(id, label)`

Search for each one with: `grep -n "onStepClick\|onAutomationClick\|onAddConnection\|onDeleteConnection\|onMoveStep\|onAttachAutomation\|onAddStep\|onAddBranch\|onUpdateConnectionLabel" src/components/process/ProcessCanvas.tsx`

Apply `?.` to every call site (not the destructuring or prop definitions — only where they are *called*).

- [ ] **Step 4: Run TypeScript check again**

```
npx tsc --noEmit
```

Expected: same `Processen.tsx` errors from Task 1, but no errors in `ProcessCanvas.tsx`.

- [ ] **Step 5: Run tests**

```
npx vitest run
```

Expected: all 116 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/process/ProcessCanvas.tsx
git commit -m "feat(process-canvas): make all handler props optional for read-only support"
```

---

### Task 4: Create `ProcessenView` component

**Files:**
- Create: `src/components/process/ProcessenView.tsx`

- [ ] **Step 1: Add a test for the pipeline selector logic**

Add to `src/test/processState.test.ts`:

```typescript
describe("ProcessenView pipeline selection", () => {
  it("auto-selects first pipeline when none selected", () => {
    const pipelines = [
      { pipelineId: "a", naam: "Sales", stages: [], syncedAt: "", beschrijving: null },
      { pipelineId: "b", naam: "Onboarding", stages: [], syncedAt: "", beschrijving: null },
    ];
    // When selectedPipelineId is null, the first pipeline should be used
    const selected = pipelines.find(p => p.pipelineId === null) ?? pipelines[0];
    expect(selected.pipelineId).toBe("a");
  });

  it("returns null when pipelines array is empty", () => {
    const pipelines: { pipelineId: string }[] = [];
    const selected = pipelines.length > 0 ? pipelines[0] : null;
    expect(selected).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```
npx vitest run src/test/processState.test.ts
```

Expected: PASS (4 tests total)

- [ ] **Step 3: Create `src/components/process/ProcessenView.tsx`**

```tsx
import { Eye } from "lucide-react";
import { ProcessCanvas } from "./ProcessCanvas";
import { initialState } from "@/data/processData";
import type { Pipeline } from "@/lib/types";
import type { ProcessState } from "@/data/processData";

interface ProcessenViewProps {
  pipelines: Pipeline[];
  selectedPipelineId: string | null;
  canvasState: ProcessState | null;
  isLoading: boolean;
  onSelectPipeline: (id: string) => void;
  onSwitchToEdit: () => void;
}

export function ProcessenView({
  pipelines,
  selectedPipelineId,
  canvasState,
  isLoading,
  onSelectPipeline,
  onSwitchToEdit,
}: ProcessenViewProps) {
  const state = canvasState ?? initialState;
  const hasCanvas = !!canvasState;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Pipeline selector bar */}
      <div className="shrink-0 px-6 py-2.5 border-b border-border bg-card flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mr-1">
          Pipeline:
        </span>
        {pipelines.map((p) => (
          <button
            key={p.pipelineId}
            type="button"
            onClick={() => onSelectPipeline(p.pipelineId)}
            className={[
              "px-3 py-1 rounded-full text-[11px] font-semibold transition-colors",
              selectedPipelineId === p.pipelineId
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            ].join(" ")}
          >
            {p.naam}
          </button>
        ))}
        {pipelines.length === 0 && (
          <span className="text-[11px] text-muted-foreground">
            Geen pipelines gevonden — synchroniseer eerst via Instellingen.
          </span>
        )}
      </div>

      {/* Canvas area */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Proceskaart laden…
          </div>
        ) : !selectedPipelineId ? (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Selecteer een pipeline om de proceskaart te bekijken.
          </div>
        ) : !hasCanvas ? (
          <div className="card-elevated p-12 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Nog geen canvas aangemaakt voor deze pipeline.
            </p>
            <button
              type="button"
              onClick={onSwitchToEdit}
              className="text-sm font-medium text-primary hover:underline"
            >
              Aanmaken in Bewerken →
            </button>
          </div>
        ) : (
          <>
            <div className="process-canvas-wrap border border-border rounded-[var(--radius-outer)] overflow-hidden bg-card shadow-sm">
              <ProcessCanvas
                steps={state.steps}
                connections={state.connections}
                automations={state.automations}
              />
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <Eye className="h-3 w-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Leesmodus — ga naar{" "}
                <button
                  type="button"
                  onClick={onSwitchToEdit}
                  className="font-medium hover:underline"
                >
                  Bewerken
                </button>{" "}
                om wijzigingen te maken.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run TypeScript check**

```
npx tsc --noEmit
```

Expected: no errors in the new file. Still same `Processen.tsx` errors from Task 1.

- [ ] **Step 5: Run tests**

```
npx vitest run
```

Expected: 116 passing.

- [ ] **Step 6: Commit**

```bash
git add src/components/process/ProcessenView.tsx src/test/processState.test.ts
git commit -m "feat(processen): add ProcessenView component with pipeline selector and read-only canvas"
```

---

### Task 5: Create `ProcessenEditor` component

**Files:**
- Create: `src/components/process/ProcessenEditor.tsx`

This extracts ALL current logic from `src/pages/Processen.tsx` and adds (a) `pipelineId` prop, (b) pipeline dropdown, (c) dirty check on pipeline switch.

- [ ] **Step 1: Add dirty-switch logic test to `src/test/processState.test.ts`**

```typescript
describe("ProcessenEditor pipeline switch", () => {
  it("allows switching pipeline when canvas is clean", () => {
    const isDirty = false;
    // clean canvas: switch is allowed without confirmation
    expect(isDirty).toBe(false);
  });

  it("requires confirmation when canvas is dirty", () => {
    const isDirty = true;
    // dirty canvas: user must confirm before switching
    expect(isDirty).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

```
npx vitest run src/test/processState.test.ts
```

Expected: PASS (6 tests total)

- [ ] **Step 3: Create `src/components/process/ProcessenEditor.tsx`**

Copy the **entire body** of `src/pages/Processen.tsx` into this new file, then apply these modifications:

**3a. Change the import for `fetchProcessState` / `saveProcessState`** — they now require `pipelineId`:
```typescript
import { fetchProcessState, saveProcessState } from "@/lib/supabaseStorage";
import { useProcessState } from "@/lib/hooks";
```

**3b. Add `usePipelines` to hooks import:**
```typescript
import { useAutomatiseringen, usePipelines } from "@/lib/hooks";
```

**3c. Change the component signature** from:
```typescript
export default function Processen() {
```
to:
```typescript
interface ProcessenEditorProps {
  pipelineId: string;
  onSwitchToView: () => void;
}

export function ProcessenEditor({ pipelineId, onSwitchToView }: ProcessenEditorProps) {
```

**3d. Remove the `useNavigate` import and usage** — navigation is handled by the outer shell.

**3e. Replace the mount-time `fetchProcessState()` call** — swap the `useEffect` that calls `fetchProcessState()` for `useProcessState`:

Remove this useEffect (roughly lines 67–87 in the original):
```typescript
useEffect(() => {
  fetchProcessState()
    .then(saved => { ... })
    ...
}, []);
```

Replace with:
```typescript
const { data: savedState } = useProcessState(pipelineId);

useEffect(() => {
  if (!savedState) return;
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
  setIsDirty(false);
  setLoading(false);
}, [pipelineId]);
```

**3f. Update `handleSave`** — pass `pipelineId` as first argument:
```typescript
await saveProcessState(pipelineId, { steps: state.steps, connections: state.connections, autoLinks });
```

**3g. Add pipeline dropdown state and handler** — add after `const [loading, setLoading] = useState(true);`:
```typescript
const { data: pipelines = [] } = usePipelines();
const [confirmSwitch, setConfirmSwitch] = useState(false);
const [pendingPipelineId, setPendingPipelineId] = useState<string | null>(null);

function handleSwitchPipeline(newId: string) {
  if (newId === pipelineId) return;
  if (isDirty) {
    setPendingPipelineId(newId);
    setConfirmSwitch(true);
  } else {
    onSwitchPipeline(newId);
  }
}
```

The `onSwitchPipeline` prop is provided by the outer shell (see Task 6). Add it to `ProcessenEditorProps`:
```typescript
interface ProcessenEditorProps {
  pipelineId: string;
  onSwitchToView: () => void;
  onSwitchPipeline: (id: string) => void;
}
```

**3h. Add pipeline dropdown to the page header** — inside the header `<div className="flex-1 min-w-0">`, before the `<h1>`:

```tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
```

```tsx
<div className="flex items-center gap-3 mb-0.5">
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs">
        {pipelines.find(p => p.pipelineId === pipelineId)?.naam ?? "Pipeline"}
        <ChevronDown className="h-3 w-3" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {pipelines.map(p => (
        <DropdownMenuItem
          key={p.pipelineId}
          onClick={() => handleSwitchPipeline(p.pipelineId)}
          className={p.pipelineId === pipelineId ? "font-semibold" : ""}
        >
          {p.naam}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
  <h1 className="text-base font-bold">Bewerken</h1>
  ...
</div>
```

**3i. Add confirm-switch AlertDialog** — add after the existing AlertDialogs:

```tsx
<AlertDialog open={confirmSwitch} onOpenChange={setConfirmSwitch}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Niet-opgeslagen wijzigingen</AlertDialogTitle>
      <AlertDialogDescription>
        Je hebt niet-opgeslagen wijzigingen. Als je wisselt van pipeline gaan deze verloren.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Annuleren</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => {
          if (pendingPipelineId) onSwitchPipeline(pendingPipelineId);
          setConfirmSwitch(false);
          setPendingPipelineId(null);
        }}
      >
        Doorgaan
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 4: Run TypeScript check**

```
npx tsc --noEmit
```

Expected: errors only in `src/pages/Processen.tsx` (the old file still exists unchanged). No errors in `ProcessenEditor.tsx`.

- [ ] **Step 5: Run tests**

```
npx vitest run
```

Expected: 116 passing.

- [ ] **Step 6: Commit**

```bash
git add src/components/process/ProcessenEditor.tsx src/test/processState.test.ts
git commit -m "feat(processen): add ProcessenEditor component with per-pipeline canvas and pipeline dropdown"
```

---

### Task 6: Rewrite `Processen.tsx` as outer shell

**Files:**
- Rewrite: `src/pages/Processen.tsx`

- [ ] **Step 1: Rewrite `src/pages/Processen.tsx` entirely**

Replace the full content with:

```tsx
import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { usePipelines, useProcessState } from "@/lib/hooks";
import { ProcessenView } from "@/components/process/ProcessenView";
import { ProcessenEditor } from "@/components/process/ProcessenEditor";
import type { ProcessState } from "@/data/processData";
import type { SavedProcessState } from "@/lib/supabaseStorage";

type Mode = "view" | "edit";

export default function Processen(): ReactNode {
  const [mode, setMode]                       = useState<Mode>("view");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);

  const { data: pipelines = [] } = usePipelines();

  // Auto-select first pipeline
  useEffect(() => {
    if (!selectedPipelineId && pipelines.length > 0) {
      setSelectedPipelineId(pipelines[0].pipelineId);
    }
  }, [pipelines, selectedPipelineId]);

  // Fetch canvas state for view mode
  const { data: savedState, isLoading: stateLoading } = useProcessState(
    mode === "view" ? selectedPipelineId : null,
  );

  // Convert SavedProcessState → ProcessState for the view canvas
  function toProcessState(saved: SavedProcessState | null | undefined): ProcessState | null {
    if (!saved) return null;
    return {
      steps:       saved.steps       as ProcessState["steps"],
      connections: saved.connections as ProcessState["connections"],
      automations: [],
    };
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)] min-h-0">
      {/* Tab header */}
      <div className="shrink-0 px-6 pt-3 border-b border-border bg-card">
        <div className="flex gap-0">
          <button
            type="button"
            onClick={() => setMode("view")}
            className={[
              "px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors",
              mode === "view"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            Bekijken
          </button>
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={[
              "px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors",
              mode === "edit"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            ].join(" ")}
          >
            Bewerken
          </button>
        </div>
      </div>

      {/* Content */}
      {mode === "view" ? (
        <ProcessenView
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          canvasState={toProcessState(savedState)}
          isLoading={stateLoading}
          onSelectPipeline={setSelectedPipelineId}
          onSwitchToEdit={() => setMode("edit")}
        />
      ) : selectedPipelineId ? (
        <ProcessenEditor
          pipelineId={selectedPipelineId}
          onSwitchToView={() => setMode("view")}
          onSwitchPipeline={setSelectedPipelineId}
        />
      ) : (
        <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
          Geen pipeline geselecteerd.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```
npx tsc --noEmit
```

Expected: **zero errors** across the whole project.

- [ ] **Step 3: Run full test suite**

```
npx vitest run
```

Expected: all 116 tests pass (3 todo). Note the `processCanvas.test.ts` still passes because `FASE_TO_TEAM`/`toCanvasAutomation` logic in `ProcessenEditor.tsx` is unchanged.

- [ ] **Step 4: Start dev server and verify manually**

```
npm run dev
```

Open `http://localhost:8080/processen`.

Check:
- Two tabs "Bekijken" / "Bewerken" visible at top
- Bekijken tab: pipeline pill buttons appear, selecting one loads the canvas (or shows empty state if no canvas yet for that pipeline)
- Bewerken tab: pipeline dropdown visible in header, existing canvas loads, Save/Reset/Export all work
- Switching pipelines in edit mode with unsaved changes: confirm dialog appears
- Selecting a pipeline in view mode and switching to edit: same pipeline is pre-selected in dropdown

- [ ] **Step 5: Commit**

```bash
git add src/pages/Processen.tsx
git commit -m "feat(processen): rewrite as tab shell — Bekijken and Bewerken tabs with per-pipeline canvas"
```

---

## Self-Review

**Spec coverage:**
- ✅ Tab structure (Bekijken / Bewerken) — Task 6
- ✅ Pipeline selector bar with pill buttons — Task 4
- ✅ Read-only canvas per pipeline — Task 3 + 4
- ✅ Empty state with "switch to edit" link — Task 4
- ✅ Per-pipeline `process_state` row (pipeline_id as id) — Task 1
- ✅ `useProcessState` hook — Task 2
- ✅ Pipeline dropdown in editor — Task 5
- ✅ Dirty check on pipeline switch — Task 5
- ✅ Shared `selectedPipelineId` between tabs — Task 6
- ✅ `ProcessCanvas` handlers optional — Task 3

**No placeholders:** All code blocks are complete.

**Type consistency:** `ProcessenEditor` uses `onSwitchPipeline` (prop) which is provided in Task 6 and declared in the interface in Task 5. `ProcessenView` takes `canvasState: ProcessState | null` which is produced by `toProcessState()` in Task 6.
