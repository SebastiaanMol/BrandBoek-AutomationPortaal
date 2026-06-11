# Procesviewer Task Detail Menu Design

## Summary

Replace the current small Procesviewer detail panel with a richer right-side task detail menu. The menu opens when a user clicks a task in the Procesviewer and shows the task context, route context, linked automations, and linked attachments in one structured read-only panel.

The panel should make the selected task understandable without forcing the user to leave the process canvas, while still offering links to full automation detail pages when deeper source-specific information is needed.

## Goals

- Replace the existing compact `ProcessviewerDetailPanel` with a more complete side menu.
- Keep the menu read-only in Procesviewer view mode.
- Show all relevant information available for a selected task.
- Keep the close `X` visible in the panel header.
- Reuse the same panel shell for task and automation detail states.
- Preserve current canvas behavior for pan, zoom, click selection, fullscreen, and legend.

## Non-Goals

- No task editing from the viewer.
- No route or connection editing from the viewer.
- No attachment creation or editing from the viewer.
- No new database fields.
- No full replacement for the automation detail page.
- No changes under `gitlabtest`.

## Interaction Model

The panel replaces the current small right-side Details panel.

When a user clicks a task:

- `selectedStepId` is set.
- `selectedAutoId` is cleared.
- The side menu opens in task detail mode.

When a user clicks an automation dot:

- `selectedAutoId` is set.
- `selectedStepId` is cleared.
- The same side menu shell opens in automation detail mode.

When a user clicks an automation inside the task detail menu:

- the panel switches to automation detail mode for that automation.

The primary close control is an `X` button in the top-right of the sticky header. Closing clears both selected ids and hides the panel.

## Panel Layout

The panel is a fixed right-side overlay inside the Procesviewer viewport.

- Desktop width: about `360px` to `420px`.
- Height: full canvas height below the top selector bar.
- Header: sticky at the top of the panel.
- Body: vertically scrollable.
- Mobile or narrow viewport: use nearly full width so the content remains readable.

The sticky header contains:

- detail type label, such as `Taak`, `Gateway`, `Start event`, `Eind event`, or `Automation`;
- selected task or automation name;
- lane/team badge for tasks;
- compact metadata badges when useful;
- close `X` button.

## Task Detail Sections

### Overview

Shows the selected task's direct context:

- task label;
- task type;
- lane/team label;
- task description when available;
- pipeline/stage marker when the task is a pipeline step.

If there is no description, show a compact empty state instead of leaving blank space.

### Route Context

Shows how the task sits in the process:

- incoming routes;
- outgoing routes;
- source and target task names;
- route labels;
- route type, such as hoofdroute, correctie/optioneel, or uitzondering/einde.

Routes are derived from `processState.connections`.

### Linked Automations

Shows automations connected before or after the selected task.

For each linked automation, show:

- automation name;
- whether it runs before or after the task;
- source system;
- status;
- category;
- trigger summary;
- goal summary;
- systems;
- owner;
- link to the full automation detail page.

The menu should use the canvas automation for linkage and the database automation record for richer metadata.

### Attachments

Shows task-linked attachments from `processState.attachments`.

Supported attachment types:

- annotation;
- data object;
- data store.

Each item should show its label, type, and description when present. If no attachments exist, show an empty state.

## Automation Detail Mode

Automation detail mode should use the same side menu shell and sticky header. It should preserve the useful pieces from the current automation panel and expand them where data exists.

Show:

- automation name;
- source;
- status;
- category;
- connected from/to task chips;
- goal;
- trigger;
- systems;
- owner;
- verification date/status when available;
- link to full automation detail page.

Source-specific technical detail can remain on the full automation detail page unless it is already concise and easy to display.

## Data Sources

The panel should derive its content from data already loaded by `Procesviewer.tsx`:

- `processState.steps`;
- `processState.connections`;
- `processState.automations`;
- `processState.attachments`;
- `dbAutomations`.

No extra network request is required for the first implementation.

## Empty And Error States

The panel should handle missing data defensively:

- missing selected task: render nothing or close the panel;
- no incoming routes: show `Geen inkomende routes`;
- no outgoing routes: show `Geen uitgaande routes`;
- no linked automations: show `Geen automations gekoppeld aan deze taak`;
- no attachments: show `Geen bijlagen gekoppeld aan deze taak`;
- missing database automation record: fall back to canvas automation name and linkage.

## Visual Direction

The menu should feel like part of the existing Procesviewer UI:

- white panel background;
- left border and subtle shadow;
- compact section headings;
- badges for type, lane, source, status, and category;
- clear information hierarchy;
- no nested cards unless they represent repeated items like linked automations or attachments.

The panel should remain functional and readable with long task labels, many automations, and missing optional data.

## Testing

Component tests:

- clicking a task opens the task detail menu;
- clicking the close `X` hides the panel;
- incoming and outgoing route sections render correctly;
- linked automation metadata renders when a database record exists;
- linked automation display falls back safely when only canvas automation data exists;
- empty task sections render useful empty states;
- clicking a linked automation switches to automation detail mode;
- mobile or narrow rendering keeps the panel readable.

Regression checks:

- existing Procesviewer shared canvas tests still pass;
- existing process canvas click behavior still works;
- pan, zoom, fullscreen, toolbar, and legend behavior are unchanged.

## Implementation Notes

- Keep the work centered on `src/components/procesviewer/ProcessviewerDetailPanel.tsx` and `src/pages/Procesviewer.tsx`.
- Prefer helper functions inside the panel file or a small local presentation helper if the derivation logic becomes too large.
- Avoid changing the process storage shape.
- Avoid touching `gitlabtest`.
- Keep the viewer read-only.
