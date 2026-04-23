# HubSpot Pipelines Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/pipelines` page that shows all HubSpot deal-pipelines as interactive cards with an expandable horizontal flow track.

**Architecture:** Two new files (`PipelineCard` component + `Pipelines` page) plus two small edits (route in `App.tsx`, nav item in `AppLayout.tsx`). All data infrastructure already exists — `usePipelines()`, `useHubSpotPipelinesSync()`, `Pipeline`/`PipelineStage` types, and the Edge Function are untouched.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, TanStack Query v5, lucide-react, date-fns v3, sonner (toasts)

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/components/PipelineCard.tsx` | Card with gradient header, expandable flow track, stage rows |
| Create | `src/pages/Pipelines.tsx` | Page with hero, stats, sync button, grid of PipelineCard |
| Modify | `src/App.tsx` | Register `/pipelines` route |
| Modify | `src/components/AppLayout.tsx` | Add Pipelines nav item to Analysis group |

---

## Task 1: PipelineCard component

**Files:**
- Create: `src/components/PipelineCard.tsx`

### Context

`Pipeline` and `PipelineStage` types (from `src/lib/types.ts`):
```typescript
interface PipelineStage {
  stage_id:      string;
  label:         string;
  display_order: number;
  metadata:      Record<string, unknown>;
}
interface Pipeline {
  pipelineId: string;
  naam:       string;
  stages:     PipelineStage[];
  syncedAt:   string;  // ISO timestamp
}
```

Date formatting pattern used in this codebase (from `src/pages/Instellingen.tsx`):
```typescript
import { format } from "date-fns";
import { nl } from "date-fns/locale";
// Usage:
format(new Date(someIsoString), "d MMM yyyy, HH:mm", { locale: nl })
```

- [ ] **Step 1: Create `src/components/PipelineCard.tsx`**

```tsx
import { useState } from "react";
import { ChevronDown, ChevronRight, Check, Layers2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import type { Pipeline } from "@/lib/types";

const PIPELINE_COLORS = [
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
  const [expanded, setExpanded] = useState(false);
  const color = PIPELINE_COLORS[index % PIPELINE_COLORS.length];
  const sortedStages = [...pipeline.stages].sort(
    (a, b) => a.display_order - b.display_order,
  );

  return (
    <div className="card-elevated overflow-hidden">
      {/* Header — click to expand/collapse flow track */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left p-4"
        style={{
          background: `linear-gradient(135deg, ${color.from} 0%, ${color.to} 100%)`,
        }}
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
              HubSpot CRM · {sortedStages.length} stage
              {sortedStages.length === 1 ? "" : "s"}
            </p>
          </div>
          <ChevronDown
            className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            style={{ color: "rgba(255,255,255,0.8)" }}
          />
        </div>
      </button>

      {/* Expandable horizontal flow track */}
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: expanded ? "140px" : "0px" }}
      >
        <div
          className="px-4 py-4 border-b border-border"
          style={{ background: color.tint }}
        >
          {sortedStages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center">
              Geen stages geconfigureerd
            </p>
          ) : (
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
          )}
        </div>
      </div>

      {/* Stage rows */}
      <div className="p-3 flex flex-col gap-1.5">
        {sortedStages.length === 0 ? (
          <p className="text-xs text-muted-foreground px-2 py-1">
            Geen stages geconfigureerd
          </p>
        ) : (
          sortedStages.map((stage, i) => {
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
                  {isLast ? "✓" : String(i + 1).padStart(2, "0")}
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
          })
        )}
      </div>

      {/* Footer — sync timestamp */}
      <div className="px-3 pb-3">
        <p className="text-[10px] text-muted-foreground">
          Gesynchroniseerd{" "}
          {format(new Date(pipeline.syncedAt), "d MMM yyyy, HH:mm", {
            locale: nl,
          })}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd "automation-navigator" && npx tsc --noEmit`

Expected: no errors. If you see errors about missing types or imports, fix them before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/components/PipelineCard.tsx
git commit -m "feat(pipelines): add PipelineCard component with expandable flow track"
```

---

## Task 2: Pipelines page

**Files:**
- Create: `src/pages/Pipelines.tsx`

### Context

- `usePipelines()` returns `{ data: Pipeline[], isLoading: boolean }` — reads from DB
- `useHubSpotPipelinesSync()` returns a TanStack `useMutation` result — triggers Edge Function `hubspot-pipelines`, returns `{ upserted: number }`
- Both are exported from `src/lib/hooks.ts`
- `StatBadge` is a local helper (do NOT import from anywhere — define inline)
- Hero pattern comes from `src/pages/Flows.tsx` (use same structure verbatim)
- `toast.success` / `toast.error` from `"sonner"`

- [ ] **Step 1: Create `src/pages/Pipelines.tsx`**

```tsx
import { toast } from "sonner";
import { Layers2 } from "lucide-react";
import { usePipelines, useHubSpotPipelinesSync } from "@/lib/hooks";
import { PipelineCard } from "@/components/PipelineCard";

export default function Pipelines(): React.ReactNode {
  const { data: pipelines = [], isLoading } = usePipelines();
  const syncMutation = useHubSpotPipelinesSync();

  const totalStages = pipelines.reduce((sum, p) => sum + p.stages.length, 0);

  async function handleSync(): Promise<void> {
    try {
      const result = await syncMutation.mutateAsync();
      toast.success(`${result.upserted} pipeline(s) gesynchroniseerd`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync mislukt");
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Laden...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1400px] px-6 py-8 lg:px-10 lg:py-10 animate-fade-in">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-hero mb-8">
          <div className="px-8 py-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary">
                <Layers2 className="w-4 h-4" />
              </span>
              <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-primary">
                HubSpot CRM
              </span>
            </div>
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                  Pipelines
                </h1>
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
                  Alle deal-pipelines vanuit HubSpot CRM, inclusief de bijbehorende stages.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:border-primary/40 transition-colors focus-ring disabled:opacity-50"
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? "Bezig…" : "↻ Sync HubSpot"}
              </button>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <StatBadge label="Pipelines" value={pipelines.length} />
              <StatBadge label="Stages" value={totalStages} />
            </div>
          </div>
        </header>

        {/* Empty state */}
        {pipelines.length === 0 && (
          <div className="card-elevated p-12 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Geen pipelines gevonden. Klik op Sync om pipelines op te halen vanuit HubSpot.
            </p>
            <button
              type="button"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors focus-ring disabled:opacity-50"
              onClick={handleSync}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? "Bezig…" : "↻ Sync HubSpot"}
            </button>
          </div>
        )}

        {/* Grid */}
        {pipelines.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {pipelines.map((pipeline, i) => (
              <PipelineCard key={pipeline.pipelineId} pipeline={pipeline} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const StatBadge = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded-xl bg-card/80 backdrop-blur-sm border border-border px-4 py-2.5">
    <p className="text-xl font-semibold text-foreground tabular-nums leading-tight">
      {value}
    </p>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
      {label}
    </p>
  </div>
);
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Pipelines.tsx
git commit -m "feat(pipelines): add Pipelines page with hero, sync button and card grid"
```

---

## Task 3: Route + navigation wiring

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/AppLayout.tsx`

### Context

**`src/App.tsx` current imports and routes (lines 1–55):**
- Pages are imported with static imports at the top: `import Flows from "./pages/Flows";`
- Routes are inside `ProtectedRoutes` component, as `<Route path="/flows" element={<Flows />} />`
- Add `Pipelines` the same way — no lazy loading needed (rest of the app doesn't use it)

**`src/components/AppLayout.tsx` Analysis nav group (around line 49):**
```typescript
{
  title: "Analysis",
  items: [
    { title: "Processes", url: "/processen", icon: GitBranch },
    { title: "Flows",     url: "/flows",     icon: GitMerge  },
    { title: "Analysis",  url: "/analyse",   icon: BarChart3 },
  ],
},
```
Add `{ title: "Pipelines", url: "/pipelines", icon: Layers2 }` after the Flows entry.

`Layers2` must be imported from `lucide-react` — add it to the existing import at the top of `AppLayout.tsx`.

- [ ] **Step 1: Add route in `src/App.tsx`**

Add the import after line 20 (`import FlowDetail from "./pages/FlowDetail";`):
```typescript
import Pipelines from "./pages/Pipelines";
```

Add the route after `<Route path="/flows/:id" element={<FlowDetail />} />`:
```tsx
<Route path="/pipelines" element={<Pipelines />} />
```

- [ ] **Step 2: Add nav item in `src/components/AppLayout.tsx`**

In the lucide-react import at the top, add `Layers2` to the existing import list. The current import ends with `PanelLeftOpen,` — add `Layers2` to it:
```typescript
import {
  LayoutDashboard,
  PlusCircle,
  List,
  GitBranch,
  GitMerge,
  BarChart3,
  Menu,
  LogOut,
  Settings,
  Download,
  Server,
  Users,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  Layers2,
} from "lucide-react";
```

In the `navGroups` array, find the Analysis group and add the Pipelines item after Flows:
```typescript
{
  title: "Analysis",
  items: [
    { title: "Processes", url: "/processen", icon: GitBranch },
    { title: "Flows",     url: "/flows",     icon: GitMerge  },
    { title: "Pipelines", url: "/pipelines", icon: Layers2   },
    { title: "Analysis",  url: "/analyse",   icon: BarChart3 },
  ],
},
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Smoke-test in browser**

Run: `npm run dev`

Verify:
1. Sidebar shows "Pipelines" in the Analysis group between Flows and Analysis
2. Navigating to `/pipelines` loads the hero + "Geen pipelines gevonden" empty state (if no data) or the card grid (if data exists)
3. Sync button calls the Edge Function (check network tab for `hubspot-pipelines` invocation)
4. After sync, cards appear in the grid
5. Clicking a card's gradient header expands/collapses the horizontal flow track with stage dots
6. Stage rows show numbered badges + chevrons, last stage in green

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/AppLayout.tsx
git commit -m "feat(pipelines): wire up /pipelines route and sidebar nav entry"
```
