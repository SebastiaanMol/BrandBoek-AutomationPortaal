# Procesviewer and Proces Editor

This document explains how the Procesviewer and Proces Editor work in the automation portal. It is intended as a practical reference for future development, cleanup, debugging, and MVP release work.

## Purpose

The Procesviewer is the business-facing BPMN-style process view for a selected pipeline. It shows the process as swimlanes, steps, gateways, events, routes, automations, attachments, and manual exception blocks.

The Proces Editor is the editable version of the same process canvas. It lets the user turn raw pipeline stages into a maintained process model by adding process logic, drawing routes, linking automations, adding BPMN context, and saving the result.

The important rule is that viewer and editor share the same process model. The viewer should show the saved state exactly as the editor saved it. The editor may expose controls, handles, dialogs, and staging panels, but those edit controls must not leak into viewer mode.

## Main Files

- `src/pages/Procesviewer.tsx`
  Owns the Procesviewer page, pipeline selection, view/edit mode switching, viewer zoom/pan, and the detail side panel.

- `src/components/process/ProcessenEditor.tsx`
  Owns the editable process state, toolbar, right panels, save/reset/import/export, editor zoom/pan, and all edit callbacks passed into the canvas.

- `src/components/process/ProcessCanvas.tsx`
  Shared SVG canvas renderer for both viewer and editor. It renders BPMN shapes and supports optional editing callbacks.

- `src/data/processData.ts`
  Defines the process data model: steps, connections, automations, attachments, artifacts, lanes, and pipeline-stage conversion.

- `src/lib/processStateMapping.ts`
  Converts between saved database state and runtime `ProcessState`.

- `src/lib/storage/processState.ts`
  Fetches and saves process state in Supabase.

- `src/lib/processArtifacts.ts`
  Creates and updates manual exception blocks.

## Modes

### Viewer Mode

Viewer mode is read-only. It is selected by default after choosing a pipeline.

Responsibilities:

- Select a pipeline.
- Load saved process state if available.
- Fall back to pipeline stages if no saved state exists.
- Render the shared canvas read-only.
- Show the process detail panel when a step or automation is selected.
- Support viewer pan, wheel zoom, toolbar zoom, reset, fullscreen, and legend.

Viewer mode is implemented primarily in `Procesviewer.tsx`. The shared viewer canvas passes `readOnly` into `ProcessCanvas`, so edit handles, drag behavior, inline editing, and mutation callbacks are disabled.

### Editor Mode

Editor mode starts when the user clicks `Bewerken`.

Responsibilities:

- Load the same pipeline process state into editable local state.
- Track dirty state.
- Save to Supabase.
- Reset to last saved state.
- Prevent navigation away with unsaved changes.
- Add, move, edit, and delete process elements.
- Import/export backups.
- Export PNG/PDF.
- Keep the editable canvas zoom/pan behavior aligned with viewer mode.

Editor mode is implemented in `ProcessenEditor.tsx`. It passes mutation callbacks into `ProcessCanvas`, such as `onMoveStep`, `onAddConnection`, `onUpdateConnectionWaypoints`, `onUpdateArtifact`, and `onMoveStepToArtifact`.

## Process State Model

The runtime process model is `ProcessState`.

```ts
interface ProcessState {
  steps: ProcessStep[];
  connections: Connection[];
  automations: Automation[];
  attachments?: ProcessAttachment[];
  artifacts?: ProcessArtifact[];
  activeLanes?: string[];
  customLanes?: CustomLane[];
  flowLinks?: Record<string, { fromStepId: string; toStepId: string }>;
}
```

### Steps

Steps are BPMN-like nodes on the canvas.

Supported step types include:

- `task`
- `optional`
- `start`
- `end`
- `timer`
- `decision`
- `terminate`
- `send`
- `receive`
- `and`

Each step has a `team` lane, `column`, and optional `row`. Normal steps can be edited through `StepDialog`. Start and end events are guarded from normal step editing in `ProcessenEditor.handleStepClick`.

### Connections

Connections represent routes between steps or branches from automations.

Important fields:

- `fromStepId`
- `fromAutomationId`
- `toStepId`
- `routeType`
- `fromSide`
- `toSide`
- `waypoints`
- `manual`

Route types:

- `main`: main process route.
- `optional`: optional/correction route.
- `end`: end/exception route.

Manual routes are user-drawn/editor-controlled routes. They can have explicit waypoints and selected bend handles. Viewer mode must show saved waypoints but not expose editing handles.

### Automations

Automations are loaded from the automation database and mapped into canvas automations. They may be linked to a route through `fromStepId` and `toStepId`.

In the editor:

- Unlinked automations appear in the right-side automation panel.
- Dragging an automation onto a connection links it.
- Clicking an automation dot opens the automation detail panel.
- Automation branches can be drawn from an automation dot to a target step.

### Attachments

Attachments are BPMN artifacts attached to a step or connection.

Types:

- `annotation`
- `dataObject`
- `dataStore`

Attachments can be moved and edited in edit mode. They render read-only in viewer mode.

### Artifacts

Artifacts are BPMN/context objects that are not sequence-flow steps. The current artifact type is `manualExceptionBlock`.

Artifacts are persisted in `ProcessState.artifacts` and saved to the `artifacts` column in `process_state`.

## Pipeline Loading and Saved State

When a pipeline is selected in `Procesviewer.tsx`:

1. The app checks `useProcessState(selectedProcessId)`.
2. If saved state exists, `buildProcessStateFromSaved` restores it.
3. If no saved state exists, `stagesToProcessState` converts pipeline stages into a simple sequential sales-lane process.

This means a new pipeline can be opened immediately, but once the editor saves state, the saved state becomes the source of truth.

In editor mode, `ProcessenEditor` separately loads the saved state for the selected pipeline. It keeps:

- `state`: current editable state.
- `saved`: last loaded/saved state.
- `isDirty`: whether local edits need saving.

Saving calls `buildSavedProcessState`, then `saveProcessState`.

## Viewer Canvas Behavior

The viewer wraps `ProcessCanvas` in a viewport controlled by `SharedProcessViewerCanvas` in `Procesviewer.tsx`.

Viewer interactions:

- Mouse wheel zooms around the cursor.
- Dragging empty canvas pans the view.
- Toolbar buttons support zoom in, zoom out, reset, and fullscreen.
- Clicking a step opens the detail side panel.
- Clicking an automation opens automation details.
- The BPMN legend is visible.

Viewer mode should not allow:

- Moving steps.
- Drawing or editing routes.
- Editing text.
- Editing artifacts or attachments.
- Dragging manual block steps.
- Showing waypoint handles.

## Editor Canvas Behavior

The editor wraps `ProcessCanvas` in an editable viewport controlled by `ProcessenEditor`.

Editor interactions:

- Mouse wheel zooms around the cursor.
- Dragging empty canvas pans the view.
- Toolbar buttons support zoom in, zoom out, reset, fullscreen, and route type controls.
- Steps can be moved between lanes, columns, and rows.
- Steps can be edited through `StepDialog`.
- Routes can be drawn from step ports.
- Manual route bend points can be selected and adjusted.
- Automations and flows can be attached to routes.
- BPMN attachments can be added to steps or routes.
- Manual exception blocks can be added, moved, edited, and deleted.

The editor passes `disableInternalPan` to `ProcessCanvas` because pan/zoom is handled by the outer editor viewport.

## Editor Toolbar and Panels

The editor top toolbar includes:

- Pipeline selector.
- View route type selection: `Hoofd`, `Opt.`, `Einde`.
- Export.
- Import.
- Reset.
- Save.
- Add menu.
- Lane controls.

The right side panel has two primary tabs:

- `Automations`: unlinked automations and flows.
- `Stappen`: staged, new, renamed, or parked steps.

The editor can show detail panels for selected automations or flows instead of the normal right panel.

## Step Editing

Normal steps open `StepDialog` when clicked in edit mode.

Inside the dialog, users can update step properties. Saving updates `state.steps`. Deleting removes the step and cleans up related data such as routes, flow links, and attachments where appropriate.

Manual-block-contained steps also use this same step editing flow. A step inside a manual exception block is still a normal `ProcessStep`; it is only visually contained in an artifact through `artifact.stepIds`.

## Route Editing

Routes are stored in `connections`.

In edit mode:

- Drawing starts from a step port.
- Route type comes from `selectedRouteType`.
- New manual routes are marked with `manual: true`.
- Selected manual routes render handles for saved waypoints.
- Users can drag bend points or add extra bend points.
- Route rendering is orthogonal and uses snapped side information where available.

Viewer mode shows the route geometry but does not expose editing handles.

## Manual Exception Block

The manual exception block represents a pipeline action that is always manually available but not part of the mandatory sequence flow.

It exists to model situations such as:

- payment arrangement;
- manual review;
- internal escalation;
- exceptional follow-up;
- customer-requested intervention;
- special handling stage.

The BPMN rule is: do not draw a sequence flow from every process step to this block. The block is not a required process step. It is a separate contextual artifact for manual availability.

### Data Shape

Manual blocks are stored as `ProcessArtifact`:

```ts
interface ProcessArtifact {
  id: string;
  type: "manualExceptionBlock";
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

### Creating a Manual Block

`createManualExceptionBlock` creates:

- title: `Altijd beschikbare handmatige actie`
- description: `Mogelijk vanuit elke pipeline stage. Geen verplichte processtap.`
- association label: `Mogelijk vanuit elke pipeline stage`

### Moving Steps Into Manual

Dragging a canvas step onto a manual block moves the step visually into that block:

- The step remains in `state.steps`.
- The step id is added to `artifact.stepIds`.
- Routes connected to that step are removed from the normal canvas flow.
- The step is excluded from main-canvas rendering while it is contained in the artifact.

This preserves the step data while making clear that the step is an always-available/manual action, not a normal sequence step.

### Manual Step Interactions

Steps inside a manual block support:

- click: open the normal step editor;
- drag handle: move the step back to the canvas;
- sort control: reorder steps inside the manual block.

The same step can only be contained by one manual artifact. `moveStepIntoManualArtifact` removes it from other artifacts before adding it to the target block.

### Manual Text Editing

The manual block title and description are edited inline:

- Double-click the block/title area to edit the title.
- Double-click the description text to edit the description.
- Title uses an inline input.
- Description uses an inline textarea.
- Clicking outside or pressing Escape/Enter behavior exits editing.

The old side input bar was removed. Manual text editing should stay inside the manual block.

### Manual Block Sizing

Manual blocks calculate their height dynamically:

- long title wraps;
- long description wraps;
- contained step labels wrap;
- the block grows to keep all text visible.

This prevents clipped manual text and keeps manual steps readable.

## Swimlanes

Preset lanes are defined in `TEAM_ORDER` and `TEAM_CONFIG`:

- Marketing
- Sales
- Onboarding
- Klantrelaties
- Boekhouding
- Management

Custom lanes are stored in `customLanes`.

Active lane visibility is stored in `activeLanes`. Saved states restore both active lanes and custom lanes. `filterValidActiveLanes` prevents stale lane keys from breaking rendering.

## Attachments

Attachments add BPMN context without changing flow logic.

Supported usage:

- Add note/data/document/source to a step or route.
- Move the attachment offset.
- Edit label and text.
- Delete attachment.

Attachments are validated during save/load so stale references to missing steps or connections are discarded.

## Import, Export, Save, and Reset

### Save

Saving in the editor:

1. Builds a `SavedProcessState`.
2. Validates attachments and artifacts.
3. Filters flow links to valid steps.
4. Saves to Supabase `process_state`.
5. Clears dirty state.

### Reset

Reset returns the editor to the last saved state. Unsaved changes are discarded after confirmation.

### Import and Export

Backups use the process state mapping layer. They include:

- steps;
- connections;
- auto links;
- parked steps;
- active lanes;
- custom lanes;
- flow links;
- attachments;
- artifacts.

Older backups without optional fields remain valid.

### PNG/PDF Export

The editor can export the current process canvas as PNG or PDF through `processExport`.

## Data Validation and Backward Compatibility

The mapping layer is defensive:

- missing optional columns are handled for attachments and flow links;
- artifacts are required once used, so missing `artifacts` during save is treated as an error;
- attachments must point to existing steps or connections;
- artifact `stepIds` must point to valid normal or parked steps;
- duplicate manual-contained step ids are filtered;
- unknown artifact types are ignored.

This protects older saved data and prevents stale references from corrupting the canvas.

## Testing Coverage

Important test files:

- `src/test/processCanvasBpmnArtifacts.test.tsx`
  BPMN attachments, manual exception blocks, manual step containment, drag behavior, inline manual text editing.

- `src/test/processCanvasManualConnections.test.tsx`
  Manual route rendering, selected route priority, waypoint behavior, bend insertion, snapping behavior.

- `src/test/processenEditorEditMode.test.tsx`
  Editor integration: saving, manual block persistence, step movement, canvas zoom/pan, embedded editor layout.

- `src/test/procesviewerSharedCanvas.test.tsx`
  Viewer/editor shared state handoff, read-only rendering, saved artifacts passed into viewer canvas.

- `src/test/processviewerManualConnections.test.tsx`
  Viewer behavior for manual connections and waypoint editing when mutation handlers are explicitly provided.

When changing process view behavior, run at least:

```bash
npm test -- src/test/processCanvasBpmnArtifacts.test.tsx src/test/processenEditorEditMode.test.tsx src/test/processCanvasManualConnections.test.tsx src/test/procesviewerSharedCanvas.test.tsx
npm run build
```

For route changes, also run:

```bash
npm test -- src/test/processviewerManualConnections.test.tsx
```

## Common Pitfalls

### Viewer and Editor Drifting Apart

The viewer and editor must render the same saved `ProcessState`. If editor changes are not visible after returning to viewer mode, check:

- query invalidation after save;
- whether `buildSavedProcessState` includes the changed field;
- whether `buildProcessStateFromSaved` restores it;
- whether viewer passes that field to `ProcessCanvas`.

### Edit Controls Leaking Into Viewer

If handles, inputs, or drag behavior appear in viewer mode, check whether `readOnly` is passed into `ProcessCanvas` and whether callbacks are accidentally supplied in viewer mode.

### Manual Blocks Behaving Like Tasks

Manual exception blocks are artifacts, not steps. They should not have ports, normal route handles, or sequence-flow assumptions.

### Losing Manual Block Steps

Manual-contained steps still live in `state.steps`. If they disappear, check:

- `artifact.stepIds`;
- `validArtifacts`;
- step id cleanup during save/load;
- route cleanup when moving a step into manual.

### Zoom/Pan Bugs

Viewer and editor have separate outer viewport wrappers. The inner `ProcessCanvas` receives scale information through `viewportScale`, and the editor disables internal canvas panning. If coordinates jump, compare the viewer and editor zoom math before changing `ProcessCanvas`.

## Release Notes for MVP Readiness

Before release, the process area should be checked for:

- viewer/editor state parity;
- read-only guardrails in viewer mode;
- save/load reliability for all optional fields;
- manual block persistence;
- import/export compatibility;
- route editing stability;
- browser checks for zoom, pan, manual block editing, and step editing.

The process canvas is a central workflow tool. Avoid broad refactors unless backed by tests and browser verification.
