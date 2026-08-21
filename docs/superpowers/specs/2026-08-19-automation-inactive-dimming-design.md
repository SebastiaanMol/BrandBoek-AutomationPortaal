# Automation Catalog Inactive Dimming

## Goal

In the main automations table (`AlleAutomatiseringen.tsx`), visually distinguish disabled automations the same way inactive pipeline rows are distinguished in the Procesviewer cockpit table, and confirm active automations always sort ahead of disabled ones.

> **Revision note:** the first implementation of this spec mirrored `PipelineMatrix.tsx`'s dimming (`opacity-70` + `text-muted-foreground`, no background change). After shipping, the actual visual reference turned out to be a different, more elaborate pattern used in `Procesviewer.tsx`'s cockpit table for inactive pipelines — a diagonal-stripe/hatched background plus opacity, not `PipelineMatrix.tsx`'s plain dimming. This doc has been updated to describe the corrected, actually-approved treatment below; `PipelineMatrix.tsx` is no longer the reference.

## Scope

Only `src/pages/AlleAutomatiseringen.tsx` (the "Alle Automatiseringen" table). No changes to `Flows.tsx`, `AutomationSwimlaneBoard.tsx`, `WorkflowMatrix.tsx`, or `FlowCard.tsx`.

"Not active" means `automation.status === "Uitgeschakeld"` specifically — not "In review" or "Verouderd". Those keep their current appearance and sort position.

## Visual dimming

In `AutomationCatalogRow` (`src/pages/AlleAutomatiseringen.tsx`), compute `const isInactive = automation.status === "Uitgeschakeld";` alongside the existing `sourceFinding`/`sourceFindingIsCritical` computations, and add the same striped/hatched treatment `Procesviewer.tsx` uses for inactive pipeline rows (`src/pages/Procesviewer.tsx:613`) to the row's className:

```
isInactive
  ? "bg-slate-100/70 text-muted-foreground opacity-75 [background-image:repeating-linear-gradient(135deg,rgba(148,163,184,0.14)_0,rgba(148,163,184,0.14)_6px,transparent_6px,transparent_12px)]"
  : "text-foreground"
```

Unlike `Procesviewer.tsx`'s usage of this pattern (which also sets `disabled={!row.isActive}` on its action buttons), only the visual treatment is reused here — the row keeps its existing `onClick`/`onKeyDown` handlers and `cursor-pointer` styling unchanged. No `pointer-events` or `disabled` state is added; a disabled automation must remain fully clickable and keyboard-navigable.

## Sorting

No code change. `sortAutomationsForList` (`src/lib/automationListSort.ts`) already sorts by a hardcoded `STATUS_PRIORITY` (`Actief: 0, "In review": 1, Verouderd: 2, Uitgeschakeld: 3`) before applying the user-selected `sortOrder` as a tiebreaker, and this is applied to every filtered view in `AlleAutomatiseringen.tsx` (`sorted = sortAutomationsForList(filtered, sortOrder)`). Disabled automations already always sort after every other status, regardless of filter or sort-order selection. This spec locks that behavior in with an explicit test rather than leaving it as an implicit side effect of existing code.

## Testing

- A test on `AutomationCatalogRow` (or the row-rendering logic it uses) asserting the dimming classes are present when `status === "Uitgeschakeld"` and absent for every other status.
- A test on `sortAutomationsForList` explicitly asserting `Uitgeschakeld` automations always sort after Actief/In review/Verouderd ones, for every `sortOrder` value (`created_at`, `naam`, `status`) — guarding against a future change accidentally weakening the forced status priority.

## Non-goals

- No change to the `Uitgeschakeld` badge color/label (`StatusBadge`) — only the row-level dimming is new.
- No change to any automation view other than the main table.
- No change to what counts as "active" elsewhere in the app (e.g. `AutomationsPage.tsx` counts, `Flows.tsx`'s separate "uitgeschakeld" tab).
