# Process Artifacts Manual Exception Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hand-placed `manualExceptionBlock` process artifact for always-available manual pipeline actions without treating it as a normal process step or route.

**Architecture:** Introduce `ProcessArtifact` as a separate `ProcessState` collection. Render artifacts in `ProcessCanvas` with dotted process-context associations, manage them in `ProcessenEditor`, pass them through read-only views, and persist them through process state and JSON backups.

**Tech Stack:** React, TypeScript, SVG, Supabase JSON storage, Vitest, Testing Library.

---

## File Structure

- Modify: `src/data/processData.ts`
  - Add `ProcessArtifact` types and `ProcessState.artifacts`.
- Create: `src/lib/processArtifacts.ts`
  - Centralize default artifact creation and small update helpers.
- Modify: `src/lib/processStateMapping.ts`
  - Parse and preserve valid artifacts.
- Modify: `src/lib/storage/processState.ts`
  - Add optional `artifacts` column handling with the same fallback behavior as `attachments`.
- Modify: `src/lib/processBackup.ts`
  - Export/import artifacts.
- Modify: `src/components/process/ProcessCanvas.tsx`
  - Render manual exception blocks and support edit interactions.
- Modify: `src/components/process/ProcessenEditor.tsx`
  - Add toolbar action and artifact state handlers.
- Modify: `src/components/process/ProcessenView.tsx`
  - Pass artifacts to read-only canvas.
- Test: `src/test/processCanvasBpmnArtifacts.test.tsx`
  - Add artifact rendering, read-only, drag, edit, delete, and association tests.
- Test: `src/test/processenEditorEditMode.test.tsx`
  - Add toolbar/save test.
- Create: `src/test/processArtifacts.test.ts`
  - Unit tests for helper defaults.
- Create: `src/test/processBackup.test.ts`
  - Import/export mapping tests for artifacts.
- Modify if present: process state mapping/storage tests.

---

### Task 1: Data Model And State Mapping

**Files:**
- Modify: `src/data/processData.ts`
- Create: `src/lib/processArtifacts.ts`
- Modify: `src/lib/processStateMapping.ts`
- Create: `src/test/processArtifacts.test.ts`

- [ ] **Step 1: Write helper tests for default manual exception artifacts**

Create `src/test/processArtifacts.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createManualExceptionBlock,
  updateProcessArtifact,
  deleteProcessArtifact,
} from "@/lib/processArtifacts";

describe("processArtifacts", () => {
  it("creates a default manual exception block at the requested position", () => {
    vi.spyOn(Date, "now").mockReturnValue(1710000000000);

    const artifact = createManualExceptionBlock({ x: 420, y: 260 });

    expect(artifact).toEqual({
      id: "artifact-1710000000000",
      type: "manualExceptionBlock",
      title: "Altijd beschikbare handmatige actie",
      description: "Mogelijk vanuit elke pipeline stage. Geen verplichte processtap.",
      position: { x: 420, y: 260 },
      size: { width: 250, height: 112 },
      association: {
        anchor: "process",
        label: "Mogelijk vanuit elke pipeline stage",
      },
    });

    vi.restoreAllMocks();
  });

  it("updates one artifact without changing the others", () => {
    const original = [
      createManualExceptionBlock({ x: 10, y: 20 }),
      { ...createManualExceptionBlock({ x: 30, y: 40 }), id: "artifact-second" },
    ];

    const updated = updateProcessArtifact(original, original[0].id, {
      title: "Betalingsregeling",
      description: "Handmatig beschikbaar",
    });

    expect(updated[0]).toMatchObject({
      title: "Betalingsregeling",
      description: "Handmatig beschikbaar",
    });
    expect(updated[1]).toBe(original[1]);
  });

  it("deletes only the selected artifact", () => {
    const first = createManualExceptionBlock({ x: 10, y: 20 });
    const second = { ...createManualExceptionBlock({ x: 30, y: 40 }), id: "artifact-second" };

    expect(deleteProcessArtifact([first, second], first.id)).toEqual([second]);
  });
});
```

- [ ] **Step 2: Run helper tests and verify RED**

Run:

```bash
npm test -- src/test/processArtifacts.test.ts
```

Expected: FAIL because `src/lib/processArtifacts.ts` does not exist.

- [ ] **Step 3: Add artifact types to process data**

In `src/data/processData.ts`, after `ProcessAttachment`, add:

```ts
export type ProcessArtifactType = "manualExceptionBlock";

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
}
```

Then extend `ProcessState`:

```ts
artifacts?: ProcessArtifact[];
```

- [ ] **Step 4: Create artifact helper module**

Create `src/lib/processArtifacts.ts`:

```ts
import type { ProcessArtifact } from "@/data/processData";

const DEFAULT_MANUAL_EXCEPTION_SIZE = { width: 250, height: 112 };

export function createManualExceptionBlock(position: { x: number; y: number }): ProcessArtifact {
  return {
    id: `artifact-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
    type: "manualExceptionBlock",
    title: "Altijd beschikbare handmatige actie",
    description: "Mogelijk vanuit elke pipeline stage. Geen verplichte processtap.",
    position,
    size: DEFAULT_MANUAL_EXCEPTION_SIZE,
    association: {
      anchor: "process",
      label: "Mogelijk vanuit elke pipeline stage",
    },
  };
}

export function updateProcessArtifact(
  artifacts: ProcessArtifact[] | undefined,
  artifactId: string,
  patch: Partial<Pick<ProcessArtifact, "title" | "description" | "position" | "size" | "association">>,
): ProcessArtifact[] {
  return (artifacts ?? []).map((artifact) =>
    artifact.id === artifactId ? { ...artifact, ...patch } : artifact,
  );
}

export function deleteProcessArtifact(
  artifacts: ProcessArtifact[] | undefined,
  artifactId: string,
): ProcessArtifact[] {
  return (artifacts ?? []).filter((artifact) => artifact.id !== artifactId);
}
```

- [ ] **Step 5: Run helper tests and verify GREEN**

Run:

```bash
npm test -- src/test/processArtifacts.test.ts
```

Expected: PASS.

- [ ] **Step 6: Add artifact parsing to state mapping**

In `src/lib/processStateMapping.ts`, update the import:

```ts
import type { Automation, Connection, CustomLane, ProcessArtifact, ProcessAttachment, ProcessState, ProcessStep } from "@/data/processData";
```

Add parser functions below `parseAttachment`:

```ts
function parseArtifact(value: unknown): ProcessArtifact | null {
  if (!isRecord(value)) return null;

  const { id, type, title, description, position, size, association } = value;
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

  return artifact;
}

function validArtifacts(artifacts?: unknown): ProcessArtifact[] {
  const values = Array.isArray(artifacts) ? artifacts : [];
  return values.flatMap((value) => {
    const artifact = parseArtifact(value);
    return artifact ? [artifact] : [];
  });
}
```

Then include artifacts in all returned states:

```ts
artifacts: validArtifacts(state.artifacts),
```

for `buildSavedProcessState`, and:

```ts
artifacts: validArtifacts(saved.artifacts),
```

for `restoreSavedProcessState` and `buildProcessStateFromSaved`.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add src/data/processData.ts src/lib/processArtifacts.ts src/lib/processStateMapping.ts src/test/processArtifacts.test.ts
git commit -m "Add process artifact data model"
```

---

### Task 2: Storage And Backup Persistence

**Files:**
- Modify: `src/lib/storage/processState.ts`
- Modify: `src/lib/processBackup.ts`
- Create: `src/test/processBackup.test.ts`

- [ ] **Step 1: Write backup import test for artifacts**

Create `src/test/processBackup.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { importProcessBackup } from "@/lib/processBackup";

function jsonFile(name: string, value: unknown): File {
  return new File([JSON.stringify(value)], name, { type: "application/json" });
}

describe("processBackup", () => {
  it("imports artifacts from JSON backups", async () => {
    const saved = await importProcessBackup(jsonFile("backup.json", {
      version: 1,
      pipelineName: "Sales",
      exportedAt: "2026-06-16T00:00:00.000Z",
      state: {
        steps: [{ id: "s1", label: "Intake", team: "sales", column: 0 }],
        connections: [],
        autoLinks: {},
        parkedSteps: [],
        activeLanes: ["sales"],
        customLanes: [],
        flowLinks: {},
        attachments: [],
        artifacts: [
          {
            id: "artifact-1",
            type: "manualExceptionBlock",
            title: "Betalingsregeling",
            description: "Mogelijk vanuit elke pipeline stage",
            position: { x: 320, y: 240 },
            size: { width: 250, height: 112 },
            association: { anchor: "process", label: "Mogelijk vanuit elke pipeline stage" },
          },
        ],
      },
    }));

    expect(saved.artifacts).toEqual([
      expect.objectContaining({
        id: "artifact-1",
        type: "manualExceptionBlock",
        title: "Betalingsregeling",
        position: { x: 320, y: 240 },
      }),
    ]);
  });

  it("keeps old backups without artifacts valid", async () => {
    const saved = await importProcessBackup(jsonFile("old-backup.json", {
      version: 1,
      pipelineName: "Sales",
      exportedAt: "2026-06-16T00:00:00.000Z",
      state: {
        steps: [],
        connections: [],
        autoLinks: {},
        parkedSteps: [],
      },
    }));

    expect(saved.artifacts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run backup tests and verify RED**

Run:

```bash
npm test -- src/test/processBackup.test.ts
```

Expected: FAIL because `SavedProcessState.artifacts` and backup mapping do not exist yet.

- [ ] **Step 3: Add artifacts to storage type and optional column fallback**

In `src/lib/storage/processState.ts`, extend `SavedProcessState`:

```ts
artifacts?: unknown[];
```

Add `"artifacts"` to `PROCESS_STATE_COLUMNS`.

Update `isMissingOptionalColumnError` signature:

```ts
function isMissingOptionalColumnError(error: unknown, column: "attachments" | "flow_links" | "artifacts"): boolean
```

Update options shapes to include `artifacts?: boolean` in:

- `processStateColumns`
- `fetchProcessStateWithColumns`
- `buildProcessStateUpsertPayload`
- `upsertProcessState`

Mirror the existing attachment fallback:

```ts
let includeArtifacts = true;
```

Fetch should retry without artifacts if missing, and return:

```ts
artifacts: includeArtifacts ? (data.artifacts ?? []) as unknown[] : [],
```

Save should include:

```ts
...(includeArtifacts ? { artifacts: (state.artifacts ?? []) as unknown as Json } : {}),
```

and retry without `artifacts` if the column is missing.

- [ ] **Step 4: Add artifacts to process backup**

In `src/lib/processBackup.ts`, update imports:

```ts
import type { CustomLane, ProcessArtifact, ProcessStep, Connection, ProcessAttachment } from "@/data/processData";
```

Add `artifacts?: unknown[]` to `ProcessBackup.state`.

Add `artifacts?: ProcessArtifact[]` to `exportProcessBackup` state parameter.

Include in export:

```ts
artifacts: state.artifacts ?? [],
```

Include in import:

```ts
artifacts: Array.isArray(s.artifacts) ? s.artifacts : [],
```

When returning `buildSavedProcessState`, pass through artifacts by ensuring `buildProcessStateFromSaved(imported, [])` receives them.

- [ ] **Step 5: Run backup tests and verify GREEN**

Run:

```bash
npm test -- src/test/processBackup.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/lib/storage/processState.ts src/lib/processBackup.ts src/test/processBackup.test.ts
git commit -m "Persist process artifacts in state backups"
```

---

### Task 3: Canvas Rendering And Artifact Interactions

**Files:**
- Modify: `src/components/process/ProcessCanvas.tsx`
- Modify: `src/test/processCanvasBpmnArtifacts.test.tsx`

- [ ] **Step 1: Add failing canvas artifact tests**

Append these tests inside `describe("ProcessCanvas BPMN attachments", () => { ... })` in `src/test/processCanvasBpmnArtifacts.test.tsx`:

```tsx
  it("renders a manual exception block with a process-context association", () => {
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-manual",
            type: "manualExceptionBlock",
            title: "Betalingsregeling",
            description: "Mogelijk vanuit elke pipeline stage",
            position: { x: 360, y: 160 },
            size: { width: 250, height: 112 },
            association: { anchor: "process", label: "Mogelijk vanuit elke pipeline stage" },
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Manual exception block Betalingsregeling")).toBeInTheDocument();
    expect(screen.getByText("Mogelijk vanuit elke pipeline stage")).toBeInTheDocument();
    expect(container.querySelector('[data-process-association="artifact-manual"]')).toHaveAttribute("stroke-dasharray", "4 5");
    expect(container.querySelector('[data-process-association="artifact-manual"]')).not.toHaveAttribute("marker-end");
  });

  it("drags manual exception blocks in edit mode", () => {
    const onMoveArtifact = vi.fn();
    const { container } = render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-draggable",
            type: "manualExceptionBlock",
            title: "Manual actie",
            position: { x: 360, y: 160 },
          },
        ]}
        onMoveArtifact={onMoveArtifact}
      />,
    );
    mockSvgRect(container);

    fireEvent.mouseDown(screen.getByLabelText("Manual exception block Manual actie"), {
      button: 0,
      clientX: 370,
      clientY: 170,
    });
    fireEvent.mouseMove(window, { clientX: 400, clientY: 190 });
    fireEvent.mouseUp(window);

    expect(onMoveArtifact).toHaveBeenCalledWith("artifact-draggable", { x: 390, y: 180 });
  });

  it("edits manual exception block title and description in edit mode", () => {
    const onUpdateArtifact = vi.fn();
    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        artifacts={[
          {
            id: "artifact-editable",
            type: "manualExceptionBlock",
            title: "Manual actie",
            description: "Oud",
            position: { x: 360, y: 160 },
          },
        ]}
        onUpdateArtifact={onUpdateArtifact}
      />,
    );

    fireEvent.click(screen.getByLabelText("Manual exception block Manual actie"));
    fireEvent.change(screen.getByLabelText("Manual exception titel"), {
      target: { value: "Betalingsregeling" },
    });
    fireEvent.change(screen.getByLabelText("Manual exception beschrijving"), {
      target: { value: "Kan altijd gekozen worden" },
    });

    expect(onUpdateArtifact).toHaveBeenCalledWith("artifact-editable", { title: "Betalingsregeling" });
    expect(onUpdateArtifact).toHaveBeenCalledWith("artifact-editable", { description: "Kan altijd gekozen worden" });
  });

  it("does not show manual exception edit controls in read-only mode", () => {
    const onMoveArtifact = vi.fn();
    render(
      <ProcessCanvas
        steps={steps}
        connections={connections}
        automations={[]}
        activeLanes={["sales"]}
        readOnly
        artifacts={[
          {
            id: "artifact-readonly",
            type: "manualExceptionBlock",
            title: "Alleen lezen",
            position: { x: 360, y: 160 },
          },
        ]}
        onMoveArtifact={onMoveArtifact}
      />,
    );

    fireEvent.click(screen.getByLabelText("Manual exception block Alleen lezen"));

    expect(screen.queryByLabelText("Manual exception titel")).not.toBeInTheDocument();
    expect(onMoveArtifact).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run canvas artifact tests and verify RED**

Run:

```bash
npm test -- src/test/processCanvasBpmnArtifacts.test.tsx
```

Expected: FAIL because `ProcessCanvas` does not accept/render `artifacts`.

- [ ] **Step 3: Add artifact props and state to ProcessCanvas**

In `src/components/process/ProcessCanvas.tsx`, import `ProcessArtifact`.

Extend `ProcessCanvasProps`:

```ts
artifacts?: ProcessArtifact[];
onMoveArtifact?: (artifactId: string, position: { x: number; y: number }) => void;
onUpdateArtifact?: (artifactId: string, patch: Partial<Pick<ProcessArtifact, "title" | "description" | "position" | "size" | "association">>) => void;
onDeleteArtifact?: (artifactId: string) => void;
```

Add defaults in function args:

```ts
artifacts = [],
```

Add local state:

```ts
const [editingArtifactId, setEditingArtifactId] = useState<string | null>(null);
```

Extend drag state/ref to support artifact dragging similarly to attachments:

```ts
const artifactDragRef = useRef<{ artifactId: string; start: Pt; startPosition: Pt } | null>(null);
```

Update window mousemove/mouseup handlers to call `onMoveArtifact` with new absolute position.

- [ ] **Step 4: Add manual exception render helper**

Add constants near attachment constants:

```ts
const MANUAL_EXCEPTION_DEFAULT_W = 250;
const MANUAL_EXCEPTION_DEFAULT_H = 112;
```

Add helper:

```tsx
function renderManualExceptionBlock(
  artifact: ProcessArtifact,
  editing: boolean,
  readOnly: boolean,
  onUpdateArtifact?: ProcessCanvasProps["onUpdateArtifact"],
) {
  const width = artifact.size?.width ?? MANUAL_EXCEPTION_DEFAULT_W;
  const height = artifact.size?.height ?? MANUAL_EXCEPTION_DEFAULT_H;
  const x = artifact.position.x;
  const y = artifact.position.y;

  return (
    <>
      <rect x={x} y={y} width={width} height={height} rx={8} fill="#fff7ed" stroke="#d97706" strokeWidth={1.5} strokeDasharray="7 4" />
      <circle cx={x + 20} cy={y + 22} r={9} fill="#fffbeb" stroke="#d97706" strokeWidth={1.5} />
      <text x={x + 38} y={y + 24} fontSize={11} fontWeight={800} fill="#92400e" style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
        Manual
      </text>
      <text x={x + 14} y={y + 52} fontSize={12} fontWeight={800} fill="#111827" style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
        {artifact.title.length > 30 ? `${artifact.title.slice(0, 29)}...` : artifact.title}
      </text>
      <foreignObject x={x + 14} y={y + 62} width={width - 28} height={height - 72} style={{ pointerEvents: "none" }}>
        <div style={{ color: "#78716c", fontFamily: "IBM Plex Sans, system-ui, sans-serif", fontSize: 11, lineHeight: 1.25, overflow: "hidden", wordBreak: "break-word" }}>
          {artifact.description ?? "Mogelijk vanuit elke pipeline stage. Geen verplichte processtap."}
        </div>
      </foreignObject>
      {editing && !readOnly && onUpdateArtifact && (
        <foreignObject x={x + width + 8} y={y} width={220} height={132} style={{ overflow: "visible" }}>
          <div
            onMouseDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8, border: "1px solid #f59e0b", borderRadius: 6, background: "rgba(255,255,255,0.98)", boxShadow: "0 8px 20px rgba(15,23,42,0.16)", fontFamily: "IBM Plex Sans, system-ui, sans-serif" }}
          >
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontWeight: 700, color: "#334155" }}>
              Titel
              <input aria-label="Manual exception titel" value={artifact.title} onChange={event => onUpdateArtifact(artifact.id, { title: event.target.value })} style={{ height: 24, border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 11, padding: "0 6px" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 10, fontWeight: 700, color: "#334155" }}>
              Beschrijving
              <textarea aria-label="Manual exception beschrijving" value={artifact.description ?? ""} onChange={event => onUpdateArtifact(artifact.id, { description: event.target.value })} rows={3} style={{ border: "1px solid #cbd5e1", borderRadius: 4, fontSize: 11, lineHeight: 1.25, padding: "5px 6px", resize: "none" }} />
            </label>
          </div>
        </foreignObject>
      )}
    </>
  );
}
```

- [ ] **Step 5: Render artifacts after attachments**

After attachment rendering, add:

```tsx
        {artifacts.map((artifact) => {
          if (artifact.type !== "manualExceptionBlock") return null;
          const width = artifact.size?.width ?? MANUAL_EXCEPTION_DEFAULT_W;
          const height = artifact.size?.height ?? MANUAL_EXCEPTION_DEFAULT_H;
          const processAnchor = { x: LANE_HDR_W + 24, y: 24 };
          const blockAnchor = { x: artifact.position.x, y: artifact.position.y + height / 2 };
          const clickable = !readOnly && (!!onUpdateArtifact || !!onDeleteArtifact);
          const draggable = !readOnly && !!onMoveArtifact;
          const editing = editingArtifactId === artifact.id;

          return (
            <g key={artifact.id}>
              <line
                data-process-association={artifact.id}
                x1={processAnchor.x}
                y1={processAnchor.y}
                x2={blockAnchor.x}
                y2={blockAnchor.y}
                stroke="#64748b"
                strokeWidth={1.2}
                strokeDasharray="4 5"
                style={{ pointerEvents: "none" }}
              />
              {artifact.association?.label && (
                <text x={(processAnchor.x + blockAnchor.x) / 2} y={(processAnchor.y + blockAnchor.y) / 2 - 6} textAnchor="middle" fontSize={9} fontWeight={700} fill="#64748b" style={{ fontFamily: "IBM Plex Sans, system-ui, sans-serif", pointerEvents: "none" }}>
                  {artifact.association.label}
                </text>
              )}
              <g
                aria-label={`Manual exception block ${artifact.title}`}
                role={clickable ? "button" : undefined}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? event => {
                  event.stopPropagation();
                  if (!readOnly && onUpdateArtifact) setEditingArtifactId(artifact.id);
                } : undefined}
                onMouseDown={draggable ? event => {
                  event.stopPropagation();
                  artifactDragRef.current = {
                    artifactId: artifact.id,
                    start: clientToSvg(event.clientX, event.clientY),
                    startPosition: artifact.position,
                  };
                } : undefined}
                onContextMenu={readOnly || !onDeleteArtifact ? undefined : event => {
                  event.preventDefault();
                  event.stopPropagation();
                  setContextMenu({ type: "artifact", artifactId: artifact.id, x: event.clientX, y: event.clientY });
                }}
                style={{ cursor: draggable ? "move" : clickable ? "pointer" : undefined }}
              >
                {renderManualExceptionBlock(artifact, editing, readOnly, onUpdateArtifact)}
              </g>
            </g>
          );
        })}
```

Extend context menu union/state with `{ type: "artifact"; artifactId: string; x: number; y: number }`, and add menu action:

```tsx
{contextMenu.type === "artifact" && (
  <button onClick={() => { onDeleteArtifact?.(contextMenu.artifactId); setContextMenu(null); }}>
    Artifact verwijderen
  </button>
)}
```

Use the same visual/context-menu style as existing attachment delete action.

- [ ] **Step 6: Run canvas artifact tests**

Run:

```bash
npm test -- src/test/processCanvasBpmnArtifacts.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add src/components/process/ProcessCanvas.tsx src/test/processCanvasBpmnArtifacts.test.tsx
git commit -m "Render manual exception process artifacts"
```

---

### Task 4: Editor Toolbar And Save Integration

**Files:**
- Modify: `src/components/process/ProcessenEditor.tsx`
- Modify: `src/components/process/ProcessenView.tsx`
- Modify: `src/test/processenEditorEditMode.test.tsx`

- [ ] **Step 1: Add failing editor test for adding and saving artifact**

Append to `src/test/processenEditorEditMode.test.tsx`:

```tsx
  it("adds and saves a manual exception artifact", async () => {
    render(
      <ProcessenEditor
        pipelineId="pipe-1"
        onSwitchPipeline={() => undefined}
      />,
    );

    await screen.findByText("Intake");

    fireEvent.click(screen.getByRole("button", { name: /Toevoegen/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Manual exception/i }));
    fireEvent.click(screen.getByRole("button", { name: /Opslaan/i }));

    await waitFor(() => {
      expect(saveProcessStateMock).toHaveBeenCalledOnce();
    });
    expect(saveProcessStateMock).toHaveBeenCalledWith(
      "pipe-1",
      expect.objectContaining({
        artifacts: [
          expect.objectContaining({
            type: "manualExceptionBlock",
            title: "Altijd beschikbare handmatige actie",
            association: expect.objectContaining({
              anchor: "process",
              label: "Mogelijk vanuit elke pipeline stage",
            }),
          }),
        ],
      }),
    );
  });
```

- [ ] **Step 2: Run editor tests and verify RED**

Run:

```bash
npm test -- src/test/processenEditorEditMode.test.tsx
```

Expected: FAIL because the toolbar action does not exist.

- [ ] **Step 3: Wire artifacts through editor saved state**

In `src/components/process/ProcessenEditor.tsx`, import:

```ts
import type { ProcessArtifact } from "@/data/processData";
import { createManualExceptionBlock, deleteProcessArtifact, updateProcessArtifact } from "@/lib/processArtifacts";
```

When applying saved state, include:

```ts
artifacts: restoredState.artifacts,
```

in both `setState` and `setSaved`.

When importing backup, include:

```ts
artifacts: savedState.artifacts as ProcessState["artifacts"] ?? prev.artifacts ?? [],
```

In `handleExportBackup`, include:

```ts
artifacts: state.artifacts ?? [],
```

- [ ] **Step 4: Add editor artifact handlers**

Add near attachment handlers:

```ts
function handleAddManualExceptionArtifact() {
  update(s => ({
    ...s,
    artifacts: [
      ...(s.artifacts ?? []),
      createManualExceptionBlock({ x: 360, y: 220 }),
    ],
  }));
}

function handleMoveArtifact(artifactId: string, position: { x: number; y: number }) {
  update(s => ({
    ...s,
    artifacts: updateProcessArtifact(s.artifacts, artifactId, { position }),
  }));
}

function handleUpdateArtifact(
  artifactId: string,
  patch: Partial<Pick<ProcessArtifact, "title" | "description" | "position" | "size" | "association">>,
) {
  update(s => ({
    ...s,
    artifacts: updateProcessArtifact(s.artifacts, artifactId, patch),
  }));
}

function handleDeleteArtifact(artifactId: string) {
  update(s => ({
    ...s,
    artifacts: deleteProcessArtifact(s.artifacts, artifactId),
  }));
  toast.success("Artifact verwijderd");
}
```

- [ ] **Step 5: Add toolbar button**

Inside the `Toevoegen` popover, after existing BPMN element groups, add:

```tsx
<div>
  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Artifacts</p>
  <button
    type="button"
    onClick={() => {
      setPaletteOpen(false);
      handleAddManualExceptionArtifact();
    }}
    className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
  >
    <span className="inline-flex h-4 w-5 rounded border border-dashed border-amber-500 bg-amber-50" />
    Manual exception
  </button>
</div>
```

- [ ] **Step 6: Pass artifacts to ProcessCanvas**

In `ProcessenEditor`, pass:

```tsx
artifacts={state.artifacts ?? []}
onMoveArtifact={handleMoveArtifact}
onUpdateArtifact={handleUpdateArtifact}
onDeleteArtifact={handleDeleteArtifact}
```

In `src/components/process/ProcessenView.tsx`, pass:

```tsx
artifacts={canvasState.artifacts ?? []}
```

- [ ] **Step 7: Run editor tests**

Run:

```bash
npm test -- src/test/processenEditorEditMode.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add src/components/process/ProcessenEditor.tsx src/components/process/ProcessenView.tsx src/test/processenEditorEditMode.test.tsx
git commit -m "Add manual exception artifact editor controls"
```

---

### Task 5: Full Regression Verification

**Files:**
- Verify only, no code edits expected.

- [ ] **Step 1: Run artifact and editor test groups**

Run:

```bash
npm test -- src/test/processArtifacts.test.ts src/test/processBackup.test.ts src/test/processCanvasBpmnArtifacts.test.tsx src/test/processenEditorEditMode.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run route and viewer regressions**

Run:

```bash
npm test -- src/test/processCanvasManualConnections.test.tsx src/test/processTimerEvent.test.tsx src/test/procesviewerSharedCanvas.test.tsx src/test/processviewerManualConnections.test.tsx src/test/processCanvas.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS. Vite may print chunk-size warnings; those are acceptable if exit code is 0.

- [ ] **Step 4: Commit verification-only changes if needed**

Expected: no changes. If formatting or small fixes were required during verification, inspect the exact file list with `git status --short` and commit only those files with:

```bash
git add src/components/process/ProcessCanvas.tsx src/components/process/ProcessenEditor.tsx src/components/process/ProcessenView.tsx src/data/processData.ts src/lib/processArtifacts.ts src/lib/processBackup.ts src/lib/processStateMapping.ts src/lib/storage/processState.ts src/test/processArtifacts.test.ts src/test/processBackup.test.ts src/test/processCanvasBpmnArtifacts.test.tsx src/test/processenEditorEditMode.test.tsx
git commit -m "Stabilize manual exception artifact tests"
```

---

## Self-Review Notes

- Spec coverage: datamodel, editor placement, drag/edit/delete, viewer read-only, dotted process association, persistence, backup import/export, and regression tests are covered.
- Scope control: no automatic stage detection, no BPMN XML, no route generation from every task, and no route/snapping changes are planned.
- Risk: `process_state.artifacts` is a new optional DB column. Storage fallback mirrors attachments/flow_links so deployments without the column do not break, but artifacts only persist remotely once the column exists.
