# HubSpot Pipelines Page — Design Spec

## Goal

Add a `/pipelines` page that shows all HubSpot deal-pipelines (fetched and synced via the existing Edge Function) as interactive cards. Each card displays the pipeline name, stage count, and a numbered stage list; clicking the header expands a horizontal flow-track.

## Architecture

All data infrastructure already exists — `usePipelines()`, `useHubSpotPipelinesSync()`, the `Pipeline` / `PipelineStage` types, and the `hubspot-pipelines` Edge Function. The work is purely UI: a new page component, a new card component, and two small additions (sidebar nav entry + route registration).

## Data Shape

```typescript
interface Pipeline {
  pipelineId: string;
  naam:       string;
  stages:     PipelineStage[];   // sort by display_order ascending before rendering
  syncedAt:   string;            // ISO timestamp
}

interface PipelineStage {
  stage_id:      string;
  label:         string;
  display_order: number;
  metadata:      Record<string, unknown>;
}
```

## New Files

### `src/components/PipelineCard.tsx`

Receives a single `Pipeline` prop. Renders:

**Header (clickable, toggles flow track):**
- Gradient background picked from a fixed 5-colour palette by pipeline index (mod 5):
  - 0: `#3b5bff → #6e8eff` (blauw)
  - 1: `#7c3aed → #a78bfa` (paars)
  - 2: `#f59e0b → #fcd34d` (amber)
  - 3: `#16a34a → #4ade80` (groen)
  - 4: `#ea580c → #fb923c` (oranje)
- Left: small rounded icon box (semi-transparent white), pipeline `naam`, subtitle `HubSpot CRM · {n} stages`
- Right: animated chevron (rotates 180° when expanded)

**Expandable flow track (max-height CSS transition):**
- Horizontal row of milestone dots connected by a line
- Line split: completed portion in pipeline colour, remaining in `--border`
- All dots filled (pipelines have no "current stage" concept — all stages shown as defined)
- Stage labels below each dot, `font-size: 9px`
- Background: lighter tint of the pipeline colour

**Stage rows (always visible):**
- Numbered circular badges (`01`, `02`, …) in pipeline colour
- Each row has a subtle tinted background that steps through: pipeline-colour tint → neutral → last stage always `bg-green-50 text-green-700`
- Arrow chevron on the right for all rows except the last

**Footer:**
- `text-[10px] text-muted-foreground`: `Gesynchroniseerd {relative date}` (e.g. "2 uur geleden")

### `src/pages/Pipelines.tsx`

**Hero section** (same pattern as `Flows.tsx`):
- Gradient hero card (`bg-gradient-hero`)
- Icon + `HubSpot CRM` badge in primary colour
- `h1`: "Pipelines"
- Description: "Alle deal-pipelines vanuit HubSpot CRM, inclusief de bijbehorende stages."
- Two stat badges: `{n} Pipelines`, `{total stages} Stages`
- Sync button (top-right of hero): calls `useHubSpotPipelinesSync()`, shows spinner while pending, toast on success/error

**Empty state** (when `pipelines.length === 0`):
- `card-elevated` with centred text: "Geen pipelines gevonden. Klik op Sync om pipelines op te halen vanuit HubSpot."
- Sync button repeated here too

**Grid:**
- `grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5`
- Maps `pipelines` array to `<PipelineCard pipeline={p} index={i} />`

**Loading state:**
- Centred spinner / "Laden…" text while `isLoading`

**Hooks used:** `usePipelines()`, `useHubSpotPipelinesSync()`

## Modified Files

### `src/components/AppLayout.tsx`

Add to the `Analysis` nav group (after `Flows`, before `Analysis`):

```typescript
{ title: "Pipelines", url: "/pipelines", icon: Layers2 }
```

Import `Layers2` from lucide-react.

### `src/App.tsx` (or routing file)

Add lazy-loaded route:

```tsx
<Route path="/pipelines" element={<Pipelines />} />
```

Import `Pipelines` the same way other pages are imported.

## Colour Palette Logic

```typescript
const PIPELINE_COLORS = [
  { from: "#3b5bff", to: "#6e8eff", tint: "#eff2ff", text: "#3b5bff" },
  { from: "#7c3aed", to: "#a78bfa", tint: "#f5f3ff", text: "#7c3aed" },
  { from: "#f59e0b", to: "#fcd34d", tint: "#fffbeb", text: "#d97706" },
  { from: "#16a34a", to: "#4ade80", tint: "#f0fdf4", text: "#16a34a" },
  { from: "#ea580c", to: "#fb923c", tint: "#fff7ed", text: "#ea580c" },
];

// Usage: PIPELINE_COLORS[index % PIPELINE_COLORS.length]
```

## Interaction Details

- **Sync button**: disabled while `syncMutation.isPending`; shows `toast.success("Pipelines gesynchroniseerd")` or `toast.error(...)` via sonner
- **Card expand/collapse**: local `useState<boolean>` per card, CSS `max-height` transition (0 → auto via a fixed max like `200px`)
- **Stage rows**: purely presentational, no click handlers
- **Relative date**: use `formatDistanceToNow` from `date-fns` (already used elsewhere in the codebase)

## Non-Goals

- No editing or creating pipelines (read-only)
- No search/filter (few pipelines expected)
- No deal counts per stage (not in current data model)
- No navigation to a pipeline detail page
