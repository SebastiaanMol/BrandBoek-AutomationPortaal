# Flexible process journey placements

## Goal

Allow one process journey to be linked to multiple places in ProcessViewer without duplicating the process journey record.

This is the basis feature for process journey placement flexibility. Informational labels for trigger type and cross-pipeline data sync are intentionally deferred to a later feature.

## Problem

Process journeys can currently be attached to one flow arrow. That works for a journey that represents one exact stage transition, but it breaks down for:

- property-triggered journeys that have no stage transition;
- multi-branch journeys that control several stage transitions;
- journeys that need to be visible in more than one pipeline canvas.

The current model forces users to choose one arbitrary arrow, which makes the canvas misleading.

## Chosen approach

Keep process journey identity separate from canvas placement.

`flowLinks[flowId]` should support a placement list:

```ts
flowLinks[flowId] = [
  { kind: "connection", fromStepId: "step-a", toStepId: "step-b", pipelineId: "ib", order: 0, position: 0.5 },
  { kind: "pipeline_wide", pipelineId: "ib" },
]
```

The saved reader supports the old single-placement shape and the new array shape. The writer emits arrays.

In the initial implementation, each pipeline still owns its own saved process state. Cross-pipeline placement means the same `flowId` can have placements in multiple pipeline states. A single global placement registry is a later migration path, not part of this basis feature.

## Placement model

Use the existing canvas placement vocabulary instead of introducing a parallel `targetType` model:

- arrow placement: `kind: "connection"`;
- Automatic sync placement: `kind: "pipeline_wide"`;
- step placement: not allowed for process journeys in this basis feature.

Each process journey placement must carry `pipelineId`. This makes cross-pipeline placement explicit and keeps exports, imports, and future migration to a central placement registry understandable.

Placement identity is:

- connection: `(flowId, pipelineId, fromStepId, toStepId)`;
- sync block: `(flowId, pipelineId, "pipeline_wide")`.

The editor uses that identity for dedupe and removal.

## Storage and migration

Existing saved data remains valid:

```ts
flowLinks[flowId] = { fromStepId, toStepId, order, position }
```

On read, old data becomes:

```ts
flowLinks[flowId] = [
  { kind: "connection", fromStepId, toStepId, pipelineId: currentPipelineId, order, position }
]
```

The existing live IB process journey link, "IB procesreis: IB ingediend -> VA IB deal aanpassen", must remain visible and functional after normalization.

On first save after editing, the writer stores the new array shape. Old-format read support stays in place until all live process states have been resaved or a verified migration has run.

## Editor behavior

Dropping a process journey on a connection adds a connection placement.

Dropping a process journey on the Automatic sync block adds a pipeline-wide placement for the current pipeline.

Dropping the same process journey onto an already-linked target is a no-op. It must not create duplicate markers or duplicate saved entries.

Dropping the same process journey onto another connection in the same pipeline adds a second placement.

Dropping the same process journey onto another pipeline's sync block or connection creates an independent placement in that pipeline's saved state. Removing the IB placement must not remove the VPB placement.

Process journeys remain disallowed on step-bottom targets. Those remain for automations and process actions unless a later feature changes that rule.

## Canvas behavior

The canvas renders one process journey marker per placement that belongs to the current pipeline.

Connection placements appear on the relevant arrow. Pipeline-wide placements appear in the Automatic sync block.

When multiple process journeys or actions share a connection or sync block, ordering uses the placement `order` field and existing layout rules. Adding this feature must not change process action behavior.

## Linked sidebar behavior

The linked count for process journeys is unique per process journey within the current pipeline.

Examples:

- process journey X on three IB arrows counts as 1 in IB;
- process journey X on IB sync and VPB sync counts as 1 in IB and 1 in VPB;
- deleting the IB placement does not change the VPB count.

The linked list shows each linked process journey once per pipeline. If it has multiple placements in the current pipeline, it shows a placement sublist:

- `Automatic sync`;
- `Stap A -> Stap B`;
- `Stap C -> Stap D`.

Each placement row has its own remove control. Removing one row removes only that placement.

## Detail panel behavior

The process journey detail panel should list all placements for the current pipeline and allow per-placement unlinking.

If the UI has a whole-journey unlink action, its label must make the scope explicit, for example `Alle koppelingen loskoppelen`.

## Backup, import, and export

Process state backup export writes array-shaped `flowLinks`.

Backup import accepts old and new `flowLinks` shapes. Invalid or orphaned placements are dropped, but the process journey record remains available for linking again.

## Error handling

Invalid placements are ignored during restore:

- connection placement is valid only if both referenced steps exist in that pipeline;
- pipeline-wide placement is valid if it has a pipeline id matching the current saved pipeline context;
- step placement for a process journey is ignored in this basis feature.

When a step is deleted, process journey connection placements that reference that step are removed. Other placements for the same process journey remain.

## Acceptance criteria

Use `JR boekers instellen` as the concrete validation journey:

1. Drag it to the Automatic sync block of the Inkomstenbelasting pipeline. The placement is added and the IB linked count shows 1.
2. Drag it to the Automatic sync block of the VPB pipeline. The VPB linked count shows 1 and the IB linked count remains 1.
3. Drag it again to the IB sync block. No duplicate entry is created and the IB linked count remains 1.
4. Open the IB linked list. It shows the process journey with location `Automatic sync`.
5. Remove the IB sync placement. The VPB placement remains and the VPB linked count remains 1.
6. Place a multi-branch process journey on two different arrows in one pipeline. Both placements are visible and removable individually, while the linked count remains 1 as long as at least one placement exists.
7. Confirm the existing live IB process journey link remains visible and functional after old-format normalization.

## Testing

Add focused tests for:

- old single `flowLinks` value normalizes to a one-item placement array;
- writer emits array-shaped `flowLinks`;
- process journey can be dropped onto Automatic sync;
- process journey can be linked to multiple connections in one pipeline;
- duplicate connection or sync drop is a no-op;
- linked count counts unique process journeys per pipeline;
- linked list renders placement subrows and removes one placement only;
- deleting a step removes only affected process journey placements;
- backup import/export preserves array-shaped flow links;
- existing IB-style single connection link still renders.

## Out of scope

- Trigger-type labels.
- Cross-pipeline relationship labels such as `gekoppeld met: Jaarrekening`.
- A central global process journey placement registry.
- Changing process action placement behavior.
- Allowing process journeys on step-bottom targets.
- Live HubSpot write behavior.
