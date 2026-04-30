# XOR Gateway Visual Fix — Design Spec

## Goal

Update the `DecisionDiamond` component to match the BPMN standard: X symbol inside the diamond and label below, consistent with how `AndDiamond` is already implemented.

## Current State

`DecisionDiamond` renders a plain diamond with the step label as a `<text>` element centered inside (`dominantBaseline="middle"`). No X symbol. This diverges from BPMN notation and from `AndDiamond`.

## Change

**File:** `src/components/process/ProcessCanvas.tsx` — `DecisionDiamond` component only.

Replace the `<text>` inside the diamond with two crossing `<line>` elements forming an X:

```tsx
<line
  x1={-DECISION_H * 0.55} y1={-DECISION_H * 0.55}
  x2={ DECISION_H * 0.55} y2={ DECISION_H * 0.55}
  stroke={stroke} strokeWidth={2}
/>
<line
  x1={ DECISION_H * 0.55} y1={-DECISION_H * 0.55}
  x2={-DECISION_H * 0.55} y2={ DECISION_H * 0.55}
  stroke={stroke} strokeWidth={2}
/>
```

Move the label below the diamond:

```tsx
<text x={cx} y={cy + DECISION_H + 10} textAnchor="middle" dominantBaseline="hanging" fontSize="8" ...>
  {label}
</text>
```

The X line scale factor (`0.55`) matches the `+` arms in `AndDiamond`. Label placement (`DECISION_H + 10`) matches `AndDiamond` exactly.

## Out of Scope

No changes to `isDecision()`, edge geometry, column width, `StepDialog`, or any other component.

## Files Changed

| File | Change |
|------|--------|
| `src/components/process/ProcessCanvas.tsx` | Modify `DecisionDiamond`: replace inner label with X marker, move label below |
