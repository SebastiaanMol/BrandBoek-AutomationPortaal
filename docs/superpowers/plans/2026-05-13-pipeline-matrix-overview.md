# Pipeline Matrix Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/pipelines` card grid with a compact, visual matrix that shows all pipelines clearly at once.

**Architecture:** Keep the current data flow and route structure. Add small pure helper functions for filtering/searching pipeline data, add a focused `PipelineMatrix` presentation component, and update `src/pages/Pipelines.tsx` to use search, filters, and the matrix.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/Radix UI primitives already in the repo, lucide-react icons, Vitest, Testing Library.

---

## File Structure

- Create `src/lib/pipelineOverview.ts`
  - Owns pure functions for pipeline filtering, source labels, timestamps, sorted stages, and stage preview data.
  - This keeps `Pipelines.tsx` focused on page state and layout.

- Create `src/test/pipelineOverview.test.ts`
  - Tests search, filter, timestamp, and stage ordering logic without rendering React.

- Create `src/components/PipelineMatrix.tsx`
  - Renders the desktop matrix and mobile stacked list.
  - Receives already filtered pipelines, so it stays presentational.

- Create `src/test/PipelineMatrix.test.tsx`
  - Verifies matrix rendering, row click navigation, stage preview, and inactive status.

- Modify `src/pages/Pipelines.tsx`
  - Replace the card grid with `PipelineMatrix`.
  - Add search state and reuse existing tabs for filtering.
  - Keep the existing loading, empty, sync, create custom pipeline, and dialog behavior.

- No changes to `src/pages/PipelineDetail.tsx`, storage hooks, Supabase, or backend.

---

### Task 1: Pipeline Overview Helpers

**Files:**
- Create: `src/lib/pipelineOverview.ts`
- Test: `src/test/pipelineOverview.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/test/pipelineOverview.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Pipeline } from "@/lib/types";
import {
  filterPipelinesForOverview,
  getPipelineDateLabel,
  getPipelineDateValue,
  getPipelineSourceLabel,
  getPreviewStages,
  sortPipelineStages,
} from "@/lib/pipelineOverview";

function pipeline(overrides: Partial<Pipeline>): Pipeline {
  return {
    pipelineId: "pipeline-default",
    naam: "Default pipeline",
    stages: [],
    syncedAt: "2026-05-01T08:00:00.000Z",
    updatedAt: "2026-05-01T09:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
    ...overrides,
  };
}

describe("pipeline overview helpers", () => {
  it("filters by source and inactive status", () => {
    const pipelines = [
      pipeline({ pipelineId: "sales", naam: "Sales", source: "hubspot", isActive: true }),
      pipeline({ pipelineId: "internal", naam: "Intern onboarding", source: "custom", isActive: true }),
      pipeline({ pipelineId: "old", naam: "Oude pipeline", source: "hubspot", isActive: false }),
    ];

    expect(filterPipelinesForOverview(pipelines, "hubspot", "")).toEqual([pipelines[0], pipelines[2]]);
    expect(filterPipelinesForOverview(pipelines, "custom", "")).toEqual([pipelines[1]]);
    expect(filterPipelinesForOverview(pipelines, "inactive", "")).toEqual([pipelines[2]]);
  });

  it("searches case-insensitively by pipeline name", () => {
    const pipelines = [
      pipeline({ pipelineId: "btw", naam: "BTW - Q" }),
      pipeline({ pipelineId: "jr", naam: "Jaarrekening" }),
    ];

    expect(filterPipelinesForOverview(pipelines, "all", "btw")).toEqual([pipelines[0]]);
    expect(filterPipelinesForOverview(pipelines, "all", "JAAR")).toEqual([pipelines[1]]);
    expect(filterPipelinesForOverview(pipelines, "all", "   ")).toEqual(pipelines);
  });

  it("returns source labels and the correct timestamp per source", () => {
    const hubspot = pipeline({
      source: "hubspot",
      syncedAt: "2026-05-02T10:00:00.000Z",
      updatedAt: "2026-05-02T11:00:00.000Z",
    });
    const custom = pipeline({
      source: "custom",
      syncedAt: "2026-05-03T10:00:00.000Z",
      updatedAt: "2026-05-03T12:00:00.000Z",
    });

    expect(getPipelineSourceLabel(hubspot)).toBe("HubSpot");
    expect(getPipelineSourceLabel(custom)).toBe("Intern proces");
    expect(getPipelineDateLabel(hubspot)).toBe("Gesynchroniseerd");
    expect(getPipelineDateLabel(custom)).toBe("Laatst bijgewerkt");
    expect(getPipelineDateValue(hubspot)).toBe("2026-05-02T10:00:00.000Z");
    expect(getPipelineDateValue(custom)).toBe("2026-05-03T12:00:00.000Z");
  });

  it("sorts stages by display order and limits preview stages", () => {
    const item = pipeline({
      stages: [
        { stage_id: "third", label: "Derde", display_order: 3, metadata: {} },
        { stage_id: "first", label: "Eerste", display_order: 1, metadata: {} },
        { stage_id: "second", label: "Tweede", display_order: 2, metadata: {} },
        { stage_id: "fourth", label: "Vierde", display_order: 4, metadata: {} },
      ],
    });

    expect(sortPipelineStages(item).map((stage) => stage.stage_id)).toEqual([
      "first",
      "second",
      "third",
      "fourth",
    ]);
    expect(getPreviewStages(item, 3).map((stage) => stage.stage_id)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});
```

- [ ] **Step 2: Run the helper tests to verify they fail**

Run:

```bash
npm test -- src/test/pipelineOverview.test.ts
```

Expected: FAIL because `src/lib/pipelineOverview.ts` does not exist.

- [ ] **Step 3: Implement the helper module**

Create `src/lib/pipelineOverview.ts`:

```ts
import type { Pipeline, PipelineStage } from "@/lib/types";

export type PipelineFilter = "all" | "hubspot" | "custom" | "inactive";

export function getPipelineSourceLabel(pipeline: Pick<Pipeline, "source">): string {
  return pipeline.source === "custom" ? "Intern proces" : "HubSpot";
}

export function getPipelineDateLabel(pipeline: Pick<Pipeline, "source">): string {
  return pipeline.source === "custom" ? "Laatst bijgewerkt" : "Gesynchroniseerd";
}

export function getPipelineDateValue(
  pipeline: Pick<Pipeline, "source" | "syncedAt" | "updatedAt">,
): string {
  return pipeline.source === "custom" ? pipeline.updatedAt : pipeline.syncedAt;
}

export function sortPipelineStages(pipeline: Pick<Pipeline, "stages">): PipelineStage[] {
  return [...pipeline.stages].sort((a, b) => a.display_order - b.display_order);
}

export function getPreviewStages(
  pipeline: Pick<Pipeline, "stages">,
  limit = 8,
): PipelineStage[] {
  return sortPipelineStages(pipeline).slice(0, limit);
}

export function filterPipelinesForOverview(
  pipelines: Pipeline[],
  filter: PipelineFilter,
  search: string,
): Pipeline[] {
  const normalizedSearch = search.trim().toLowerCase();

  return pipelines.filter((pipeline) => {
    if (filter === "hubspot" && pipeline.source !== "hubspot") return false;
    if (filter === "custom" && pipeline.source !== "custom") return false;
    if (filter === "inactive" && pipeline.isActive) return false;
    if (!normalizedSearch) return true;

    return pipeline.naam.toLowerCase().includes(normalizedSearch);
  });
}
```

- [ ] **Step 4: Run the helper tests to verify they pass**

Run:

```bash
npm test -- src/test/pipelineOverview.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/lib/pipelineOverview.ts src/test/pipelineOverview.test.ts
git commit -m "feat: add pipeline overview helpers"
```

---

### Task 2: Pipeline Matrix Component

**Files:**
- Create: `src/components/PipelineMatrix.tsx`
- Test: `src/test/PipelineMatrix.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `src/test/PipelineMatrix.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Pipeline } from "@/lib/types";
import { PipelineMatrix } from "@/components/PipelineMatrix";

const navigateMock = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function pipeline(overrides: Partial<Pipeline>): Pipeline {
  return {
    pipelineId: "pipeline-default",
    naam: "Default pipeline",
    stages: [
      { stage_id: "stage-1", label: "Intake", display_order: 1, metadata: {} },
      { stage_id: "stage-2", label: "Controle", display_order: 2, metadata: {} },
    ],
    syncedAt: "2026-05-01T08:00:00.000Z",
    updatedAt: "2026-05-01T09:00:00.000Z",
    beschrijving: null,
    isActive: true,
    source: "hubspot",
    ...overrides,
  };
}

describe("PipelineMatrix", () => {
  it("renders pipeline rows with source, status, stage count, and preview", () => {
    render(
      <PipelineMatrix
        pipelines={[
          pipeline({ pipelineId: "sales", naam: "Sales", source: "hubspot", isActive: true }),
          pipeline({ pipelineId: "internal", naam: "Intern onboarding", source: "custom", isActive: false }),
        ]}
      />,
    );

    expect(screen.getByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("Intern onboarding")).toBeInTheDocument();
    expect(screen.getByText("HubSpot")).toBeInTheDocument();
    expect(screen.getByText("Intern proces")).toBeInTheDocument();
    expect(screen.getByText("Actief")).toBeInTheDocument();
    expect(screen.getByText("Inactief")).toBeInTheDocument();
    expect(screen.getAllByText("2 stages")).toHaveLength(2);
    expect(screen.getAllByLabelText("Stage-preview voor Sales")).toHaveLength(1);
  });

  it("navigates to the pipeline detail page when a row is clicked", async () => {
    navigateMock.mockClear();

    render(<PipelineMatrix pipelines={[pipeline({ pipelineId: "btw", naam: "BTW - Q" })]} />);

    fireEvent.click(screen.getByRole("button", { name: /open BTW - Q/i }));

    expect(navigateMock).toHaveBeenCalledWith("/pipelines/btw");
  });
});
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run:

```bash
npm test -- src/test/PipelineMatrix.test.tsx
```

Expected: FAIL because `PipelineMatrix` does not exist.

- [ ] **Step 3: Implement the matrix component**

Create `src/components/PipelineMatrix.tsx`:

```tsx
import type { ReactNode } from "react";
import { ChevronRight, Layers2 } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import type { Pipeline } from "@/lib/types";
import { PIPELINE_COLORS } from "@/components/PipelineCard";
import {
  getPipelineDateLabel,
  getPipelineDateValue,
  getPipelineSourceLabel,
  getPreviewStages,
} from "@/lib/pipelineOverview";

interface PipelineMatrixProps {
  pipelines: Pipeline[];
}

export function PipelineMatrix({ pipelines }: PipelineMatrixProps): ReactNode {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="hidden grid-cols-[minmax(220px,1.5fr)_120px_110px_95px_minmax(180px,1fr)_170px_44px] border-b border-border bg-muted/40 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
        <div>Pipeline</div>
        <div>Bron</div>
        <div>Status</div>
        <div>Stages</div>
        <div>Preview</div>
        <div>Laatste update</div>
        <div />
      </div>

      <div className="divide-y divide-border">
        {pipelines.map((pipeline, index) => (
          <PipelineMatrixRow
            key={pipeline.pipelineId}
            pipeline={pipeline}
            index={index}
          />
        ))}
      </div>
    </div>
  );
}

function PipelineMatrixRow({
  pipeline,
  index,
}: {
  pipeline: Pipeline;
  index: number;
}): ReactNode {
  const navigate = useNavigate();
  const color = PIPELINE_COLORS[index % PIPELINE_COLORS.length];
  const sourceLabel = getPipelineSourceLabel(pipeline);
  const dateLabel = getPipelineDateLabel(pipeline);
  const dateValue = getPipelineDateValue(pipeline);
  const formattedDate = format(new Date(dateValue), "d MMM yyyy, HH:mm", { locale: nl });
  const stageCount = pipeline.stages.length;

  return (
    <button
      type="button"
      onClick={() => navigate(`/pipelines/${pipeline.pipelineId}`)}
      aria-label={`Open ${pipeline.naam}`}
      className={[
        "grid w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        "lg:grid-cols-[minmax(220px,1.5fr)_120px_110px_95px_minmax(180px,1fr)_170px_44px] lg:items-center",
        pipeline.isActive ? "bg-card" : "bg-muted/20 opacity-75",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="h-10 w-1.5 shrink-0 rounded-full"
          style={{ background: color.from }}
        />
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ background: color.tint, color: color.textHex }}
        >
          <Layers2 className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-foreground">
            {pipeline.naam}
          </span>
          {pipeline.beschrijving && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground lg:hidden">
              {pipeline.beschrijving}
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2 lg:block">
        <span className="text-[11px] font-semibold text-muted-foreground lg:hidden">
          Bron
        </span>
        <span className="inline-flex rounded-full border border-border bg-background px-2 py-1 text-xs font-medium text-foreground">
          {sourceLabel}
        </span>
      </div>

      <div className="flex items-center gap-2 lg:block">
        <span className="text-[11px] font-semibold text-muted-foreground lg:hidden">
          Status
        </span>
        <span
          className={[
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold",
            pipeline.isActive
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-100 text-slate-500",
          ].join(" ")}
        >
          <span
            className={[
              "h-1.5 w-1.5 rounded-full",
              pipeline.isActive ? "bg-emerald-500" : "bg-slate-400",
            ].join(" ")}
          />
          {pipeline.isActive ? "Actief" : "Inactief"}
        </span>
      </div>

      <div className="text-sm font-medium text-foreground">
        {stageCount} stage{stageCount === 1 ? "" : "s"}
      </div>

      <StagePreview pipeline={pipeline} color={color} />

      <div className="text-xs text-muted-foreground">
        <span className="block font-medium text-foreground lg:hidden">{dateLabel}</span>
        <span className="hidden lg:block">{dateLabel}</span>
        <span>{formattedDate}</span>
      </div>

      <div className="hidden justify-end lg:flex">
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );
}

function StagePreview({
  pipeline,
  color,
}: {
  pipeline: Pipeline;
  color: (typeof PIPELINE_COLORS)[number];
}): ReactNode {
  const previewStages = getPreviewStages(pipeline, 8);

  if (previewStages.length === 0) {
    return <span className="text-xs text-muted-foreground">Geen stages</span>;
  }

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      aria-label={`Stage-preview voor ${pipeline.naam}`}
    >
      {previewStages.map((stage, stageIndex) => (
        <span
          key={stage.stage_id}
          title={stage.label}
          className="h-2 min-w-5 flex-1 rounded-full"
          style={{
            background:
              stageIndex === previewStages.length - 1
                ? "#16a34a"
                : stageIndex % 2 === 0
                  ? color.from
                  : color.to,
          }}
        />
      ))}
      {pipeline.stages.length > previewStages.length && (
        <span className="ml-1 text-[11px] font-medium text-muted-foreground">
          +{pipeline.stages.length - previewStages.length}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the component tests to verify they pass**

Run:

```bash
npm test -- src/test/PipelineMatrix.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/components/PipelineMatrix.tsx src/test/PipelineMatrix.test.tsx
git commit -m "feat: add pipeline matrix component"
```

---

### Task 3: Integrate Matrix Into Pipelines Page

**Files:**
- Modify: `src/pages/Pipelines.tsx`

- [ ] **Step 1: Update imports and page state**

In `src/pages/Pipelines.tsx`, replace the `PipelineCard` import and local `PipelineFilter` type usage.

Use these imports:

```tsx
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Layers2, Plus, RefreshCw, Search } from "lucide-react";
import { useCreateCustomPipeline, useHubSpotPipelinesSync, usePipelines } from "@/lib/queryHooks/pipelines";
import { PipelineMatrix } from "@/components/PipelineMatrix";
import { CustomPipelineDialog } from "@/components/CustomPipelineDialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import type { CustomPipelineInput } from "@/lib/storage/pipelines";
import type { PipelineFilter } from "@/lib/pipelineOverview";
import { filterPipelinesForOverview } from "@/lib/pipelineOverview";
```

Inside `Pipelines`, keep the existing mutation hooks and add search state:

```tsx
const [customDialogOpen, setCustomDialogOpen] = useState(false);
const [filter, setFilter] = useState<PipelineFilter>("all");
const [search, setSearch] = useState("");
```

- [ ] **Step 2: Replace derived filtering logic**

Replace the existing `filteredPipelines`, `activePipelines`, and `inactivePipelines` calculations with:

```tsx
const filteredPipelines = useMemo(
  () => filterPipelinesForOverview(pipelines, filter, search),
  [pipelines, filter, search],
);
```

Keep these existing summary values:

```tsx
const totalStages = pipelines.reduce((sum, p) => sum + p.stages.length, 0);
const hubspotPipelines = pipelines.filter(p => p.source === "hubspot");
const customPipelines = pipelines.filter(p => p.source === "custom");
const activePipelineCount = pipelines.filter(p => p.isActive).length;
```

- [ ] **Step 3: Add the search toolbar below tabs**

Inside the header card, after the existing tab row, add a toolbar block:

```tsx
<div className="border-t border-border bg-card px-6 py-4">
  <div className="relative max-w-md">
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    <Input
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      placeholder="Zoek pipeline..."
      className="pl-9"
    />
  </div>
</div>
```

The existing tab row should remain above this toolbar.

- [ ] **Step 4: Replace active/inactive card sections with the matrix**

Remove the two sections that render `activePipelines.map(...PipelineCard...)` and `inactivePipelines.map(...PipelineCard...)`.

Replace them with:

```tsx
{pipelines.length > 0 && filteredPipelines.length === 0 && (
  <div className="card-elevated p-10 text-center">
    <p className="text-sm text-muted-foreground">
      Geen pipelines gevonden voor deze filter of zoekopdracht.
    </p>
  </div>
)}

{filteredPipelines.length > 0 && (
  <PipelineMatrix pipelines={filteredPipelines} />
)}
```

Keep the existing `pipelines.length === 0` empty state unchanged.

- [ ] **Step 5: Run TypeScript/build checks**

Run:

```bash
npm run build
```

Expected: PASS. If TypeScript reports unused imports or missing component exports, adjust only the imports/code touched in this task.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add src/pages/Pipelines.tsx
git commit -m "feat: show pipelines as matrix overview"
```

---

### Task 4: Full Verification And Visual Check

**Files:**
- No required source changes unless verification finds a defect.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/test/pipelineOverview.test.ts src/test/PipelineMatrix.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run the broader frontend checks**

Run:

```bash
npm test
npm run build
```

Expected: PASS. If unrelated existing tests fail, record the exact failure and confirm whether it predates this work before changing anything.

- [ ] **Step 3: Start the dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, typically `http://127.0.0.1:5173/`.

- [ ] **Step 4: Manually verify desktop layout**

Open `/pipelines` in the browser and verify:

- Header stats still render.
- `Sync HubSpot` and `Intern proces` buttons still work visually and are not overlapped.
- Tabs filter rows.
- Search filters rows by name.
- Matrix rows show pipeline name, source, status, stage count, stage preview, and timestamp.
- Clicking a row opens `/pipelines/:id`.
- Inactive rows are visibly muted.

- [ ] **Step 5: Manually verify mobile layout**

Use browser responsive mode around 390px width and verify:

- Rows become stacked list items.
- Text does not overlap controls.
- Stage preview remains visible.
- Row click target remains easy to tap.
- The header buttons wrap cleanly.

- [ ] **Step 6: Commit any verification fixes**

If Step 4 or Step 5 required fixes, run:

```bash
git add src/components/PipelineMatrix.tsx src/pages/Pipelines.tsx src/test/PipelineMatrix.test.tsx src/test/pipelineOverview.test.ts
git commit -m "fix: polish pipeline matrix responsiveness"
```

If no fixes were needed, skip this commit.

---

## Self-Review

- Spec coverage: The plan implements the matrix overview, visual row accents, source/status/stage count/stage preview/timestamp columns, client-side search/filtering, clickable rows, empty/no-results behavior, and keeps the detail page unchanged.
- Scope: No backend, Supabase schema, audit, deal counts, or runtime validation work is included.
- Type consistency: `PipelineFilter`, `Pipeline`, `PipelineStage`, `pipelineId`, `naam`, `stages`, `syncedAt`, `updatedAt`, `isActive`, and `source` match the existing codebase.
- Testing: Pure helper tests cover data behavior; component tests cover rendering and navigation; final verification covers build and responsive UI.
