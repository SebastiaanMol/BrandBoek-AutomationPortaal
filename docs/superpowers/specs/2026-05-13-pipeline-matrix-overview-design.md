# Pipeline Matrix Overview Design

## Goal

Improve the `/pipelines` overview so users can see all available pipelines more clearly at once. The page should feel like a polished inventory of pipelines: compact, visual, searchable, and easy to scan.

## Chosen Direction

Use a pipeline matrix instead of the current card grid as the primary overview.

The matrix should keep the usefulness of a table while avoiding a plain admin-table feel. Each row represents one pipeline and includes visual cues such as a left color accent, status badge, and compact stage preview.

## User Experience

The page opens with a compact header containing:

- Page title: `Pipelines`
- Short supporting text
- Summary metrics: active pipelines, total pipelines, total stages, HubSpot pipelines, internal pipelines
- Primary actions: `Sync HubSpot` and `Intern proces`

Below the header is a toolbar for daily scanning:

- Search by pipeline name
- Source/status tabs or segmented filters: `Alles`, `HubSpot`, `Intern`, `Inactief`
- Optional sort control if the existing data order proves hard to scan

The main content is a matrix with one row per pipeline.

Each row shows:

- Pipeline name
- Source: `HubSpot` or `Intern proces`
- Status: active or inactive
- Stage count
- Stage preview as small colored bars or dots
- Last sync/update timestamp
- Open action via row click and a right-chevron affordance

Inactive rows remain visible but muted. Empty and no-results states keep the current behavior: explain the state and offer the relevant action.

## Interaction

Rows are clickable and navigate to `/pipelines/:id`, matching the existing detail-page pattern.

Search and filters are client-side because `usePipelines()` already loads the pipeline list. The current `Sync HubSpot` and `Intern proces` actions stay available from the overview header.

Keyboard accessibility should be preserved: rows must be focusable, have clear focus styling, and behave like buttons or links.

## Visual Design

The matrix should be dense but calm:

- Use a white or card-like surface for the matrix body
- Use subtle row separators
- Use one accent color per pipeline, reusing the existing `PIPELINE_COLORS`
- Show stage preview as a compact horizontal sequence, not a full stage list
- Keep typography smaller than the current hero/card treatment
- Avoid large gradients on every row; use accents instead

The design should work well on desktop and mobile. On smaller screens, rows can become stacked compact list items while preserving the same information hierarchy.

## Architecture

The implementation should stay close to the current pipeline structure:

- `src/pages/Pipelines.tsx` owns filtering, searching, summary metrics, and layout
- Replace or supplement the card grid with a matrix/list component
- Reuse `PipelineCard` color constants or extract shared color helpers if needed
- Keep `src/pages/PipelineDetail.tsx` mostly unchanged for now
- Keep the existing data model and hooks unchanged

No backend or Supabase schema changes are needed.

## Testing

Add focused tests where the project already has UI tests for this area. At minimum, manually verify:

- All pipelines render in the matrix
- Source/status filters work
- Search narrows results by name
- Clicking a row navigates to the detail page
- Empty and no-results states still render
- Desktop and mobile layouts do not overlap or truncate important text badly

## Non-Goals

- No new pipeline analytics
- No deal counts per stage
- No backend data changes
- No redesign of the detail page beyond small compatibility fixes if needed
- No audit or runtime validation features in this iteration
