# Process Step Staging Area — Design

## Goal

Give the process canvas editor a step staging area: a tab in the existing right panel where unplaced HubSpot drift steps and manually parked steps live. Nothing changes on the canvas without a human physically placing or approving it.

## Architecture

Two independent concerns that share the same UI surface:

1. **HubSpot drift detection** — after every pipeline sync, compare live stages against saved canvas steps and surface the delta as actionable items in the sidebar.
2. **Manual parking** — let the user drag any canvas step off into the sidebar as a temporary holding area while reorganising the canvas.

Both feed into the same "Stappen" tab in the right panel.

## Right Panel Changes

The existing right panel (currently always shows "Niet geplaatst" automations) gets a two-tab header:

- **Automations** — existing `UnassignedPanel` content, unchanged
- **Stappen** — new staging area

The Stappen tab shows three sections, each only rendered when non-empty:

### Nieuw in HubSpot
Steps that exist in the pipeline stages but have no matching canvas step. Amber/yellow styling with a "✦ Nieuw" badge. Each item is draggable onto the canvas.

Detection: a canvas step created from a HubSpot stage always has ID `stage-{stageId}`. After load, compare every `pipeline.stages[].stage_id` against the set of canvas step IDs. Missing → show here.

### Hernoemd in HubSpot
Canvas steps whose label no longer matches the current stage label in HubSpot. Shows "Intake → Kennismaking" format. Each item has an "Toepassen" button (renames the canvas step) and a dismiss (×) button (keeps the old label, removes the suggestion).

Detection: for every canvas step with ID `stage-{stageId}`, find the matching stage and compare labels.

### Geparkeerd
Steps the user manually moved off the canvas. Neutral grey styling. Draggable back onto the canvas.

## Parking a Step

Two ways to park a step from the canvas:

1. **Right-click context menu** on a step → "Parkeer stap" option (primary interaction)
2. **Drag the step** and release it over the right panel (shortcut) — detected on `mouseup` by checking if the cursor position falls outside the SVG bounds and within the right panel's bounding rect

When a step is parked:
- It is removed from `state.steps`
- All connections `fromStepId === step.id` or `toStepId === step.id` are removed from `state.connections`
- Any automations attached to those connections are detached
- The step is added to `parkedSteps[]` in the canvas state
- Canvas marks dirty → user must still click "Opslaan"

Connections are **not** restored when a parked step is placed back onto the canvas. The user redraws them manually.

## Placing a Step from the Sidebar

Drag a step from the Stappen tab onto the canvas. The existing drop-zone logic handles placement — same as dragging the "Stap" button from the toolbar. The step lands in the swimlane/column/row the user drops it onto.

On drop:
- Step is added to `state.steps` at the target position
- Removed from `parkedSteps[]` (for parked steps) or from the drift list (for new HubSpot steps)
- Canvas marks dirty

## Rename Suggestion ("Hernoemd")

"Toepassen" button:
- Updates `step.label` in `state.steps` to the new HubSpot label
- Removes the rename suggestion from the list
- Canvas marks dirty

Dismiss (×):
- Removes the suggestion from the list for this session
- The old label stays on the canvas
- The suggestion reappears after the next pipeline sync

## Data Storage

`SavedProcessState` gains a `parkedSteps` field:

```typescript
interface SavedProcessState {
  steps:       ProcessStep[];
  connections: Connection[];
  autoLinks:   Record<string, { fromStepId: string; toStepId: string }>;
  parkedSteps: ProcessStep[];   // new
}
```

Persisted in the existing `process_state` table as part of the JSONB blob — no schema migration needed.

Dismissed rename suggestions are **not** persisted (they reset on next load). This is intentional: after the next sync the suggestion is re-evaluated from live data.

## Drift Detection Timing

Detection runs in `ProcessenEditor` after both `savedState` and the current `pipeline` are loaded. It is a pure derived computation — no API calls, no writes. Results are held in local state and regenerated whenever either input changes (e.g. after a manual sync).

```typescript
// Pseudo-code
const driftNew     = pipeline.stages.filter(s => !stepIds.has(`stage-${s.stage_id}`));
const driftRenamed = canvasStageSteps.filter(s => {
  const stage = stageMap.get(s.id.replace("stage-", ""));
  return stage && stage.label !== s.label;
});
```

## What Never Happens Automatically

- Stages added in HubSpot do **not** appear on the canvas without a drag
- Stages renamed in HubSpot do **not** rename canvas steps without "Toepassen"
- Stages deleted in HubSpot do **not** remove canvas steps (they simply stop appearing as drift candidates)
- Nothing saves without the user clicking "Opslaan"
