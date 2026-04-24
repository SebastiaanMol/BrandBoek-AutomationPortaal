# Pipelines UX Redesign — Design Spec

## Goal

Redesign the `/pipelines` page from expandable cards to a compact card overview that navigates to a dedicated `/pipelines/:id` detail page.

## Architecture

Two-screen navigation pattern: overview (compact cards, no expansion) → detail (full stage list). `PipelineCard` is rewritten as a slim clickable card. A new `PipelineDetail` page handles the detail view. No new data fetching is needed — `usePipelines()` already returns all pipeline data including stages.

## Data Shape (unchanged)

```typescript
interface Pipeline {
  pipelineId: string;
  naam:       string;
  stages:     PipelineStage[];
  syncedAt:   string; // ISO timestamp
}

interface PipelineStage {
  stage_id:      string;
  label:         string;
  display_order: number;
  metadata:      Record<string, unknown>;
}
```

---

## Modified Files

### `src/components/PipelineCard.tsx` — rewrite

Remove all expand/collapse state, the flow track section, and the stage rows. The component becomes a compact, fully-clickable card.

**Structure:**
- Single `<button>` element (or wrapping `<div>` with `onClick`), full-width, navigates to `/pipelines/${pipeline.pipelineId}` via `useNavigate`
- Gradient background (same `PIPELINE_COLORS` palette by index)
- Left: icon box (semi-transparent white) + pipeline `naam` + subtitle `HubSpot CRM · {n} stages`
- Right: `ChevronRight` icon (white, semi-transparent) to signal navigability
- Footer row below gradient: sync date `text-[10px] text-muted-foreground`

**Removed:** `useState`, `expanded`, flow track, stage rows, `ChevronDown`, `Check`

**Props:** unchanged — `{ pipeline: Pipeline; index: number }`

---

### `src/pages/PipelineDetail.tsx` — new file

Uses `useParams<{ id: string }>()` to get the pipeline ID and `usePipelines()` to find the matching pipeline.

**Sections (top to bottom):**

1. **Back button** — `ArrowLeft` icon + "Terug naar Pipelines" text, `useNavigate("/pipelines")`. Positioned above the hero.

2. **Hero card** — gradient background using `PIPELINE_COLORS[index % 5]` (index derived from pipeline position in the list). Contains:
   - Icon box + pipeline `naam` as `h1`
   - Subtitle: `HubSpot CRM · {n} stages`
   - Sync date bottom-right: `Gesynchroniseerd {formatted date}`

3. **Horizontal flow track** — same dot-and-line track as the previous `PipelineCard`. Dots connected by a line in pipeline colour, last dot green with `Check`. Stage labels below each dot (`font-size: 9px`). Background: `color.tint`.

4. **Numbered stage list** — same rows as the previous `PipelineCard`:
   - Numbered circular badges (`01`, `02`, …) in pipeline colour
   - Tinted row backgrounds; last stage always `bg-green-50 text-green-700` with `Check`
   - `ChevronRight` on all rows except last

**Not-found state:** if no pipeline matches the ID, show a card with "Pipeline niet gevonden" and a back link.

**Loading state:** centred "Laden…" while `isLoading`.

**PIPELINE_COLORS constant:** export from `PipelineCard.tsx` and import in `PipelineDetail.tsx` to avoid duplication.

---

### `src/App.tsx`

Add route after the existing `/pipelines` route:

```tsx
import PipelineDetail from "./pages/PipelineDetail";
// ...
<Route path="/pipelines/:id" element={<PipelineDetail />} />
```

---

### `src/components/AppLayout.tsx`

1. **`p-0` exclusion list:** Add `location.pathname.startsWith("/pipelines/")` so the detail page also gets no padding wrapper.

2. **Header title lookup:** The `find` over nav items won't match `/pipelines/:id`. Add a fallback: if `location.pathname.startsWith("/pipelines/")`, display `"Pipeline Detail"` (or derive the pipeline naam via context — keep it simple, use a static fallback).

---

## Interaction Details

- **Card click:** `useNavigate` (not `<Link>`) so the whole card area is tappable without nested anchor issues
- **Back button:** `useNavigate("/pipelines")` — not `navigate(-1)` to avoid history edge cases
- **Colour index on detail page:** `usePipelines()` returns an array; find the index of the current pipeline in that array and use `index % 5`
- **Sorted stages:** `[...pipeline.stages].sort((a, b) => a.display_order - b.display_order)` in both components

## Non-Goals

- No editing pipelines (read-only)
- No search/filter on overview
- No deal counts per stage
- No transition animation between overview and detail
