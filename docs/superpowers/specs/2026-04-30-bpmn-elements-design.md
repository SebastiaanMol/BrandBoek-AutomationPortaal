# BPMN Element Types — Design Spec

## Goal

Add the basic BPMN element vocabulary to the process canvas: message events (Send, Receive), a Terminate end event, and an AND parallel gateway. Replace the current two-button type toggle in StepDialog with a grouped visual icon picker.

Sub-Process and Embedded Sub-Process are explicitly out of scope.

---

## Current State

`ProcessStep.type` accepts `"task" | "start" | "end" | "decision"`. The canvas renders:
- `task` → rounded rectangle (`STEP_W × STEP_H`)
- `start` / `end` → plain circles (`EVT_R` radius)
- `decision` → diamond (`DECISION_H` half-diagonal)

`isEvent(step)` returns true for `start` and `end`, which gates column-width calculation and edge attachment points.

---

## New Types

| Type value     | Shape                          | Category |
|----------------|-------------------------------|----------|
| `"start"`      | Thin circle (unchanged)        | Event    |
| `"end"`        | Thick-stroke circle (unchanged)| Event    |
| `"terminate"`  | Thick circle + filled inner dot| Event    |
| `"send"`       | Circle + filled envelope icon  | Event    |
| `"receive"`    | Circle + outlined envelope icon| Event    |
| `"decision"`   | Plain diamond — XOR gate (unchanged) | Gateway |
| `"and"`        | Diamond with + symbol          | Gateway  |
| `"task"`       | Rounded rectangle (unchanged)  | Activity |

No existing type values change. No data migration required.

---

## Data Model

`src/data/processData.ts` — extend the union type:

```ts
type?: "task" | "start" | "end" | "decision" | "terminate" | "send" | "receive" | "and";
```

---

## Canvas Rendering (`ProcessCanvas.tsx`)

### `isEvent()` update

Extend to include all circle-shaped types:

```ts
function isEvent(step: ProcessStep) {
  return step.type === "start" || step.type === "end"
    || step.type === "terminate" || step.type === "send" || step.type === "receive";
}
```

This automatically gives all event types:
- `EVT_COL_W` column width
- `EVT_R` edge attachment radius
- Correct `edgeRight/Left/Up/Down` geometry

### Shape rendering

Each step is rendered in a `renderStep()` block (currently an if/else tree). Add cases:

**Terminate** — thick outer ring + filled inner circle:
```svg
<circle r={EVT_R} stroke-width="3" fill="white" />
<circle r={EVT_R * 0.5} fill="currentColor" />
```

**Send** — circle + filled envelope:
```svg
<circle r={EVT_R} stroke-width="1.5" fill="white" />
<!-- filled rect + white V-fold line -->
<rect x="-7" y="-5" width="14" height="10" rx="1" fill="currentColor" />
<polyline points="-7,-5 0,1 7,-5" stroke="white" stroke-width="1.2" fill="none" />
```

**Receive** — circle + outlined envelope:
```svg
<circle r={EVT_R} stroke-width="1.5" fill="white" />
<!-- outline rect + V-fold line in same color -->
<rect x="-7" y="-5" width="14" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2" />
<polyline points="-7,-5 0,1 7,-5" stroke="currentColor" stroke-width="1.2" fill="none" />
```

**AND gateway** — diamond + plus sign:
```svg
<polygon points="0,-DECISION_H DECISION_H,0 0,DECISION_H -DECISION_H,0" fill="white" stroke="currentColor" stroke-width="1.5" />
<line x1="0" y1={-DECISION_H * 0.55} x2="0" y2={DECISION_H * 0.55} stroke-width="2" />
<line x1={-DECISION_H * 0.55} y1="0" x2={DECISION_H * 0.55} y2="0" stroke-width="2" />
```

All new shapes inherit the lane's `stroke` colour for `currentColor` (same pattern as existing shapes).

---

## StepDialog (`StepDialog.tsx`)

Replace the 2-button toggle with a grouped visual icon grid.

### Structure

```tsx
<Label>Type</Label>
<div className="space-y-3">
  {TYPE_GROUPS.map(group => (
    <div key={group.label}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">{group.label}</p>
      <div className="grid grid-cols-5 gap-1.5">
        {group.types.map(t => (
          <button
            key={t.value}
            type="button"
            onClick={() => setStepType(t.value)}
            className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-[9px] transition-colors ${
              stepType === t.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30"
            }`}
          >
            <t.Icon className="h-5 w-5" />
            {t.label}
          </button>
        ))}
      </div>
    </div>
  ))}
</div>
```

### `TYPE_GROUPS` constant

Each icon is a small inline SVG component (not lucide — BPMN shapes have no lucide equivalent).

```ts
const TYPE_GROUPS = [
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
```

Each `*Icon` is a small functional component rendering an `<svg>` with the BPMN shape at 20×20px.

### `StepType` union update

```ts
type StepType = "task" | "decision" | "start" | "end" | "terminate" | "send" | "receive" | "and";
```

The `description` field remains visible only for `"task"` type (no change to that logic).

---

## Edge cases

- **Description field**: hidden for all non-task types (same as current `decision` behaviour).
- **Existing diagrams**: all existing steps with `type` undefined or `"task"/"start"/"end"/"decision"` render identically — no change.
- **Column width**: Send/Receive/Terminate are events (`isEvent()` returns true) so they get `EVT_COL_W` columns, same as Start/End.
- **AND gateway**: uses same `DECISION_H` geometry as XOR — edge attachment, column width, and arrow routing are identical.

---

## Files Changed

| File | Change |
|------|--------|
| `src/data/processData.ts` | Extend `ProcessStep.type` union |
| `src/components/process/ProcessCanvas.tsx` | Extend `isEvent()`, add 3 new shape renderers |
| `src/components/process/StepDialog.tsx` | Replace type toggle with grouped icon grid, update `StepType` union |
