# Pipelines UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace expandable pipeline cards with compact clickable cards that navigate to a dedicated `/pipelines/:id` detail page.

**Architecture:** `PipelineCard` is rewritten as a slim navigating button (no expand state). A new `PipelineDetail` page uses `useParams` + `usePipelines()` to render the full stage list. `PIPELINE_COLORS` is exported from `PipelineCard` so `PipelineDetail` can reuse it. Routing and AppLayout get two small additions each.

**Tech Stack:** React 18, TypeScript, React Router v6, TanStack Query v5, Tailwind CSS, lucide-react, date-fns v3

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/PipelineCard.tsx` | Rewrite | Compact card, export PIPELINE_COLORS |
| `src/pages/PipelineDetail.tsx` | Create | Detail page: back button, hero, flow track, stage list |
| `src/App.tsx` | Modify (2 lines) | Add `/pipelines/:id` route |
| `src/components/AppLayout.tsx` | Modify (2 spots) | p-0 for detail path, title fallback |

---

## Task 1: Rewrite PipelineCard as compact navigating card

**Files:**
- Modify: `src/components/PipelineCard.tsx`

Remove all expand/collapse state, the flow track section, and the stage rows. Export `PIPELINE_COLORS` so `PipelineDetail` can import it. The component becomes a single `<button>` that navigates on click.

- [ ] **Step 1: Replace the entire file with the compact card implementation**

Replace `src/components/PipelineCard.tsx` with:

```tsx
import { useNavigate } from "react-router-dom";
import { ChevronRight, Layers2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { Pipeline } from "@/lib/types";

export const PIPELINE_COLORS = [
  { from: "#3b5bff", to: "#6e8eff", tint: "#eff2ff", textHex: "#3b5bff" },
  { from: "#7c3aed", to: "#a78bfa", tint: "#f5f3ff", textHex: "#7c3aed" },
  { from: "#d97706", to: "#fcd34d", tint: "#fffbeb", textHex: "#d97706" },
  { from: "#16a34a", to: "#4ade80", tint: "#f0fdf4", textHex: "#16a34a" },
  { from: "#ea580c", to: "#fb923c", tint: "#fff7ed", textHex: "#ea580c" },
] as const;

interface PipelineCardProps {
  pipeline: Pipeline;
  index: number;
}

export function PipelineCard({ pipeline, index }: PipelineCardProps) {
  const navigate = useNavigate();
  const color = PIPELINE_COLORS[index % PIPELINE_COLORS.length];
  const stageCount = pipeline.stages.length;

  return (
    <button
      type="button"
      onClick={() => navigate(`/pipelines/${pipeline.pipelineId}`)}
      className="card-elevated overflow-hidden w-full text-left focus-ring hover:brightness-105 transition-[filter] duration-150"
    >
      {/* Gradient header */}
      <div
        className="p-4"
        style={{ background: `linear-gradient(135deg, ${color.from} 0%, ${color.to} 100%)` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.2)" }}
          >
            <Layers2 className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white leading-snug truncate">
              {pipeline.naam}
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
              HubSpot CRM · {stageCount} stage{stageCount === 1 ? "" : "s"}
            </p>
          </div>
          <ChevronRight
            className="w-4 h-4 flex-shrink-0"
            style={{ color: "rgba(255,255,255,0.8)" }}
          />
        </div>
      </div>
      {/* Footer */}
      <div className="px-4 py-2.5">
        <p className="text-[10px] text-muted-foreground">
          Gesynchroniseerd{" "}
          {format(new Date(pipeline.syncedAt), "d MMM yyyy, HH:mm", { locale: nl })}
        </p>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors related to PipelineCard. If there are errors in unrelated files, ignore them.

- [ ] **Step 3: Commit**

```bash
git add src/components/PipelineCard.tsx
git commit -m "refactor(pipelines): rewrite PipelineCard as compact navigating card"
```

---

## Task 2: Create PipelineDetail page

**Files:**
- Create: `src/pages/PipelineDetail.tsx`

New page at `/pipelines/:id`. Uses `useParams` to get the id, `usePipelines()` to find the pipeline, and renders: back button → hero → horizontal flow track → numbered stage list.

- [ ] **Step 1: Create the file**

Create `src/pages/PipelineDetail.tsx` with the following content:

```tsx
import type { ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, Layers2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { usePipelines } from "@/lib/hooks";
import { PIPELINE_COLORS } from "@/components/PipelineCard";

export default function PipelineDetail(): ReactNode {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pipelines = [], isLoading } = usePipelines();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  const pipelineIndex = pipelines.findIndex((p) => p.pipelineId === id);
  const pipeline = pipelines[pipelineIndex];

  if (!pipeline) {
    return (
      <div className="min-h-screen bg-background p-8">
        <button
          type="button"
          onClick={() => navigate("/pipelines")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 focus-ring rounded"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar Pipelines
        </button>
        <div className="card-elevated p-12 text-center">
          <p className="text-sm text-muted-foreground">Pipeline niet gevonden.</p>
        </div>
      </div>
    );
  }

  const color = PIPELINE_COLORS[pipelineIndex % PIPELINE_COLORS.length];
  const sortedStages = [...pipeline.stages].sort(
    (a, b) => a.display_order - b.display_order,
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[900px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        {/* Back button */}
        <button
          type="button"
          onClick={() => navigate("/pipelines")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 focus-ring rounded"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar Pipelines
        </button>

        {/* Hero */}
        <div
          className="rounded-2xl p-6 mb-6"
          style={{
            background: `linear-gradient(135deg, ${color.from} 0%, ${color.to} 100%)`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.2)" }}
              >
                <Layers2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-widest mb-0.5"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  HubSpot CRM · {sortedStages.length} stages
                </p>
                <h1 className="text-2xl font-bold text-white leading-tight">
                  {pipeline.naam}
                </h1>
              </div>
            </div>
            <p
              className="text-[10px] text-right flex-shrink-0 pt-1"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              Gesynchroniseerd
              <br />
              {format(new Date(pipeline.syncedAt), "d MMM yyyy, HH:mm", {
                locale: nl,
              })}
            </p>
          </div>
        </div>

        {/* Horizontal flow track */}
        {sortedStages.length > 0 && (
          <div className="card-elevated overflow-hidden mb-4">
            <div className="px-6 py-5" style={{ background: color.tint }}>
              <div className="relative pb-6">
                {/* Track line — background */}
                <div className="absolute top-[9px] left-[9px] right-[9px] h-[2px] rounded-full bg-border" />
                {/* Track line — filled */}
                <div
                  className="absolute top-[9px] left-[9px] right-[9px] h-[2px] rounded-full"
                  style={{ background: color.from }}
                />
                <div className="relative flex justify-between">
                  {sortedStages.map((stage, i) => {
                    const isLast = i === sortedStages.length - 1;
                    return (
                      <div key={stage.stage_id} className="flex flex-col items-center">
                        <div
                          className="w-[18px] h-[18px] rounded-full border-2 border-white flex items-center justify-center"
                          style={{
                            background: isLast ? "#16a34a" : color.from,
                            boxShadow: `0 0 0 2px ${isLast ? "#16a34a" : color.from}`,
                          }}
                        >
                          {isLast && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                        <span
                          className="mt-1.5 text-[9px] font-semibold text-center leading-none max-w-[56px] overflow-hidden text-ellipsis whitespace-nowrap"
                          style={{ color: isLast ? "#16a34a" : color.textHex }}
                        >
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Numbered stage list */}
        <div className="card-elevated overflow-hidden">
          <div className="p-4 flex flex-col gap-1.5">
            {sortedStages.map((stage, i) => {
              const isLast = i === sortedStages.length - 1;
              return (
                <div
                  key={stage.stage_id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                  style={{ background: isLast ? "#f0fdf4" : color.tint }}
                >
                  <span
                    className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ background: isLast ? "#16a34a" : color.from }}
                  >
                    {isLast ? (
                      <Check className="w-2.5 h-2.5 text-white" />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span
                    className="text-[11px] font-semibold flex-1 truncate"
                    style={{ color: isLast ? "#16a34a" : color.textHex }}
                  >
                    {stage.label}
                  </span>
                  {!isLast && (
                    <ChevronRight
                      className="w-2.5 h-2.5 flex-shrink-0"
                      style={{ color: color.textHex }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors in PipelineDetail.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PipelineDetail.tsx
git commit -m "feat(pipelines): add PipelineDetail page with back button, hero, flow track, stage list"
```

---

## Task 3: Wire routing and AppLayout

**Files:**
- Modify: `src/App.tsx` (2 lines)
- Modify: `src/components/AppLayout.tsx` (2 spots)

Add the `/pipelines/:id` route. Update AppLayout so the detail page gets `p-0` (no outer padding) and the header shows a sensible title.

- [ ] **Step 1: Add import and route to App.tsx**

In `src/App.tsx`, add the import after the existing `Pipelines` import:

```tsx
import PipelineDetail from "./pages/PipelineDetail";
```

Then add the route immediately after `<Route path="/pipelines" element={<Pipelines />} />`:

```tsx
<Route path="/pipelines/:id" element={<PipelineDetail />} />
```

The relevant section of `src/App.tsx` should now look like:

```tsx
import Pipelines from "./pages/Pipelines";
import PipelineDetail from "./pages/PipelineDetail";
// ...
<Route path="/pipelines" element={<Pipelines />} />
<Route path="/pipelines/:id" element={<PipelineDetail />} />
```

- [ ] **Step 2: Update the p-0 condition in AppLayout.tsx**

In `src/components/AppLayout.tsx`, the `<main>` className condition currently ends with:

```tsx
location.pathname === "/pipelines"
  ? "p-0"
```

Change it to also include the detail path:

```tsx
location.pathname === "/pipelines" ||
location.pathname.startsWith("/pipelines/")
  ? "p-0"
```

The full condition block should look like:

```tsx
<main className={`flex-1 w-full ${
  location.pathname === "/processen" ||
  location.pathname === "/brandy" ||
  location.pathname === "/flows" ||
  location.pathname.startsWith("/flows/") ||
  location.pathname === "/pipelines" ||
  location.pathname.startsWith("/pipelines/")
    ? "p-0"
    : "p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto"
}`}>
```

- [ ] **Step 3: Update the header title fallback in AppLayout.tsx**

The header title currently reads:

```tsx
{[...navGroups.flatMap(g => g.items), ...bottomNavItems].find((n) => n.url === location.pathname)?.title || "Portal"}
```

Replace it with:

```tsx
{location.pathname.startsWith("/pipelines/")
  ? "Pipeline Detail"
  : [...navGroups.flatMap(g => g.items), ...bottomNavItems].find((n) => n.url === location.pathname)?.title || "Portal"}
```

- [ ] **Step 4: Verify build is clean**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/AppLayout.tsx
git commit -m "feat(pipelines): add /pipelines/:id route and AppLayout support"
```

---

## Manual Verification

After all three tasks are committed:

1. Start dev server: `npm run dev`
2. Navigate to `/pipelines` — cards should be compact (gradient header + footer only, no stage list visible)
3. Click a card — should navigate to `/pipelines/{id}`
4. Detail page should show: back button, coloured hero, horizontal flow dots, numbered stage list
5. Click "Terug naar Pipelines" — should return to `/pipelines`
6. Header bar should show "Pipeline Detail" on the detail page
7. Navigate to a non-existent ID (e.g., `/pipelines/fake`) — should show "Pipeline niet gevonden" with a back link
