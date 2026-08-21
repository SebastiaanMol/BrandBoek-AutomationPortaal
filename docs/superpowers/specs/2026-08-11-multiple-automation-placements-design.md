# Multiple automation placements per pipeline

## Goal

Allow one automation to stay linked to multiple places within the same pipeline canvas.

Example: automation `X` can be placed on step A and also on step G in the same pipeline. These are separate canvas placements, but they point to the same automation record.

## Problem

The current process canvas treats an automation as having one saved placement. Moving or placing the automation elsewhere risks replacing the previous placement. That does not match automations that can run from multiple pipeline stages.

The portal needs to model:

- one automation record;
- multiple canvas placements for that automation;
- separate placement-level move/delete behavior;
- no duplicate automation records;
- no duplicate placement for the same automation on the same canvas target.

## Chosen approach

Use one automation with many placements.

The automation identity remains stable:

```ts
automation.id === "automation-x"
```

The canvas state stores multiple placements for that same id:

```ts
autoLinks["automation-x"] = [
  { kind: "step", stepId: "stage-a", order: 0 },
  { kind: "step", stepId: "stage-g", order: 1 }
]
```

Each placement behaves as its own canvas instance. Rendering shows one marker per placement. Clicking any marker opens the same automation details.

The scope is one pipeline canvas. Process state is stored per `pipelineId`, so multi-placement means "multiple places inside this saved pipeline state." Cross-pipeline bridge automations are out of scope for this change and need a separate cross-pipeline relation model later.

## Data model

### Saved state

Current saved shape:

```ts
autoLinks[automationId] = placement
```

New saved shape:

```ts
autoLinks[automationId] = placement[]
```

The reader must support both shapes:

- if the saved value is a placement object, treat it as `[placement]`;
- if the saved value is an array, parse every valid placement;
- invalid placements are ignored;
- duplicate placements for the same automation and target are collapsed to one placement;
- empty arrays mean the automation is not placed.

The writer should always emit the new array shape. This gives an implicit migration: the first save of an old pipeline rewrites old single-placement values as arrays. There is no separate destructive database migration in the initial implementation, because live saved process states may not all be opened and verified at the same time.

### Runtime state

Runtime code needs a placement-level representation so the canvas can render and manipulate each placement separately. A placement instance needs:

- a stable instance id;
- the automation id;
- the placement target;
- order within that target.

The instance id must be deterministic from saved data when possible, so reloading the same canvas does not reshuffle markers.

Placement identity is based on the automation id plus the placement target:

- step placement: `(automationId, stepId)`;
- connection placement: `(automationId, fromStepId, toStepId)`;
- pipeline-wide placement: `(automationId, "pipeline_wide")`.

This identity is used for deduplication, moving, and removing placements. For the user's concrete case, moving or removing the marker on `stage-a` uses `(automationId, "stage-a")` and must not affect the marker on `stage-g`.

## UI behavior

Placing an already-placed automation on another step adds a new placement instead of replacing the old one.

Dropping the same automation onto a step where it already has a step placement is a no-op. The UI may show a small message, but it must not create a second identical marker on the same target.

Moving a marker moves only that marker's placement.

Removing a marker removes only that marker's placement. Other placements for the same automation remain.

The detail panel still represents the underlying automation. Its current "Gekoppeld aan" area must become a list when an automation has multiple placements in the current pipeline. Each tag should identify one placement target, and each tag should have its own remove action so users can unlink one placement without using the canvas.

Existing counters keep their current meaning unless explicitly relabeled:

- "aantal automations" counts unique automation records;
- "Gekoppeld" counts unique automations with at least one placement;
- any count that counts markers must be labeled as placements or plaatsingen.

## Backward compatibility

Existing saved process states must keep loading without migration. A single old placement is normalized to a one-item placement list at read time.

The first save after editing can write the new array shape.

Old-format read support should stay in the implementation until all known live pipeline states have been resaved or an explicit migration has been run and verified. It should not be removed as part of the initial implementation.

## Error handling

Invalid saved placements are dropped during restore, using the same validation rules as current placements:

- step placements require an existing step;
- connection placements require both existing steps;
- pipeline-wide placements remain valid.

Dropping invalid placements must not remove the automation itself.

When a step is removed or replaced in the editor, placements targeting that step are removed from the canvas state before save. This is a cascade delete for placement instances only. It must not delete the automation record, and it must not remove placements for the same automation on other still-existing steps.

## Testing

Add focused tests for:

- restoring old single-placement saves;
- restoring new multi-placement saves;
- saving multiple placements as an array;
- placing an already-placed automation adds a placement instead of replacing;
- dropping onto a step that already has the same automation placement is a no-op;
- deleting one placement keeps the other placements;
- rendering multiple markers for the same automation;
- showing multiple "Gekoppeld aan" tags in the detail panel and removing one tag;
- keeping unique-automation counts distinct from placement counts;
- removing orphaned placements when a step is deleted or missing on restore.

## Out of scope

- Duplicating automation records.
- Cross-pipeline placements for the same canvas entry.
- Live HubSpot write behavior.
- Changing how automations are imported.
