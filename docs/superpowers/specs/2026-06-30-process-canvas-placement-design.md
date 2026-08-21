# Process Canvas Placement Design

## Context

The process canvas already supports placing automations and process journeys on a connection line between two step cards. The next interaction model needs to be more precise:

- An item on a connection line must be movable along that same line.
- Automations must also be attachable to a step card.
- Process journeys must support the same placement behavior as automations.
- Multiple automations and process journeys can be attached to the same step card.
- Step cards must not grow when items are attached.

The approved visual direction is compact bottom-edge dots on the step card. The dots sit half on the card and half below the card, using the same fixed lightning symbol for both item types. Automations use blue; process journeys use light orange with a dark orange lightning symbol so the icon remains readable.

## Goal

Create one placement model for automations and process journeys across the process canvas.

Items can be placed either:

- on a connection between two step cards; or
- on the bottom edge of a step card.

Both placement types must support multiple items and deterministic ordering.

## Non-Goals

- Do not increase the visual height of step cards.
- Do not introduce separate symbols for automations and process journeys.
- Do not require a database migration if the existing JSON storage can remain backward compatible.
- Do not redesign the full process canvas layout.

## Visual Design

### Connection Placement

Items placed on a connection line remain compact circular dots. The existing lightning symbol stays the fixed marker. When multiple items exist on one connection, they are ordered along that connection.

Users must be able to move an existing item along the same connection to change its position or order.

### Step Card Placement

Items attached to a step card render as compact circular dots on the bottom edge of that card:

- Dot diameter stays fixed.
- The dot center aligns with the card bottom border, so the dot is half inside and half outside the card.
- The dots are absolutely positioned and do not affect card layout or card height.
- Multiple dots appear horizontally next to each other.
- If there are more dots than fit cleanly, show the first visible dots and a compact overflow dot such as `+3`.

### Item Identity

Automations and process journeys use the same lightning symbol.

Color is the only visual distinction:

- Automation: blue dot with white lightning.
- Process journey: light orange dot with dark orange lightning.

Tooltips or accessible labels identify the concrete item name and whether it is an automation or process journey.

## Data Model

Use a shared placement shape for both automations and process journeys.

```ts
type CanvasPlacement =
  | {
      kind: "connection";
      fromStepId: string;
      toStepId: string;
      order: number;
    }
  | {
      kind: "step";
      stepId: string;
      order: number;
    };
```

Automations keep their existing fields for backward compatibility, but the runtime model should prefer `placement` when present. Existing automation records with `fromStepId` and `toStepId` are treated as connection placements with an inferred order.

Process journeys use the same placement shape in `flowLinks`. Existing flow links with only `fromStepId` and `toStepId` are treated as connection placements with an inferred order.

The saved process state can continue using `auto_links` and `flow_links` JSON:

- New entries store `kind`, target IDs, and `order`.
- Old entries with only `fromStepId` and `toStepId` still load correctly.

## Interaction Design

### Dragging To A Connection

Dragging an automation or process journey onto a connection attaches it to that connection. The drop position determines the item order along the line. If the item was already attached elsewhere, it moves to the new connection.

Dragging an existing connection dot along the same connection updates only its order or position.

### Dragging To A Step Card

Dragging an automation or process journey onto a step card attaches it to that step. The item appears in the bottom-edge dot row.

Dragging an existing step-card dot within the same card reorders it. Dragging it to another step card moves it there. Dragging it to a connection moves it back to line placement.

### Selection And Details

Clicking or keyboard-selecting a dot opens the existing item details behavior for that automation or process journey. Hover and focus states must expose the item name and type.

## Cleanup Rules

When a step is deleted, parked, or otherwise removed from the active canvas:

- Remove step placements targeting that step.
- Remove connection placements where `fromStepId` or `toStepId` references that step.
- Apply the same cleanup to automations and process journeys.

When a connection no longer exists, connection placements for that exact pair become unplaced or are removed from the active canvas according to the existing cleanup behavior.

## Components And Boundaries

`ProcessCanvas` owns the visual rendering of connection dots and step-card dots.

`ProcessenEditor` owns placement mutations:

- attach automation to connection;
- attach automation to step;
- attach process journey to connection;
- attach process journey to step;
- reorder items on a connection;
- reorder items on a step card;
- detach items during cleanup.

`processStateMapping` owns backward-compatible loading and saving between the runtime model and persisted `auto_links` / `flow_links`.

## Testing

Unit tests:

- Existing saved automation links without `kind` load as connection placements.
- Existing saved flow links without `kind` load as connection placements.
- Step placements save and load for automations.
- Step placements save and load for process journeys.
- Cleanup removes placements that reference removed steps.

UI tests:

- Multiple automations render as bottom-edge dots on one step card without increasing card size.
- Multiple process journeys render next to automations using the same lightning symbol and different color.
- A connection dot can be reordered along the same line.
- An automation can be moved from a connection to a step card.
- A process journey can be moved from a connection to a step card.
- Overflow is shown when a step card has more attached items than fit visibly.

Live browser verification:

- Place several automations and process journeys on one step card.
- Confirm the card dimensions remain unchanged.
- Confirm dots sit half on and half below the card bottom border.
- Confirm the blue and orange dots are visually distinct and both lightning symbols are readable.
- Move an item along a connection and confirm the order persists after save and reload.

