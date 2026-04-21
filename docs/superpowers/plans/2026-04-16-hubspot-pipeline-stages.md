# HubSpot Pipeline Stages Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fetch all HubSpot deal pipelines + stages, store them in Supabase, link HubSpot automations to their trigger stage, and show a horizontal stage flow in the automation detail panel.

**Architecture:** A new `hubspot-pipelines` edge function fetches `GET /crm/v3/pipelines/deals` and upserts into a new `pipelines` table. The existing `hubspot-sync` function is extended to extract `pipeline_id` + `stage_id` from each workflow's trigger conditions (`triggerSets`/`segmentCriteria`) and write them back to `automatiseringen`. The detail panel reads the stored IDs and renders a horizontal stage flow by looking up stage labels from the pipelines table.

**Tech Stack:** Deno/TypeScript (Supabase edge functions), PostgreSQL, React + TanStack Query, Tailwind CSS

---

### Task 1: Database migration + TypeScript types

**Files:**
- Create: `supabase/migrations/20260417000000_pipelines_table.sql`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260417000000_pipelines_table.sql`:

```sql
-- Pipelines tabel voor HubSpot deal pipelines
CREATE TABLE IF NOT EXISTS pipelines (
  pipeline_id  TEXT PRIMARY KEY,
  naam         TEXT NOT NULL,
  stages       JSONB NOT NULL DEFAULT '[]',
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pipeline + stage koppeling op automatiseringen
ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS pipeline_id TEXT,
  ADD COLUMN IF NOT EXISTS stage_id    TEXT;
```

- [ ] **Step 2: Apply the migration locally**

```bash
npx supabase db push
```

Expected: migration runs cleanly, `pipelines` table created, two columns added to `automatiseringen`.

- [ ] **Step 3: Add types to `src/lib/types.ts`**

After the `AutomationBranch` interface (line 33), add:

```ts
// ── Pipeline stages ──────────────────────────────────────────────────────────

export interface PipelineStage {
  stage_id:      string;
  label:         string;
  display_order: number;
  metadata:      Record<string, string>;
}

export interface Pipeline {
  pipelineId: string;
  naam:       string;
  stages:     PipelineStage[];
  syncedAt:   string;
}
```

- [ ] **Step 4: Add `pipelineId` and `stageId` fields to `Automatisering` interface**

In the `Automatisering` interface (currently ends at line 63), after the `aiDescriptionUpdatedAt` field, add:

```ts
  pipelineId?:            string;
  stageId?:               string;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260417000000_pipelines_table.sql src/lib/types.ts
git commit -m "feat(pipelines): add pipelines table migration and Pipeline/PipelineStage types"
```

---

### Task 2: `hubspot-pipelines` edge function

**Files:**
- Create: `supabase/functions/hubspot-pipelines/index.ts`
- Modify: `supabase/config.toml`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/hubspot-pipelines/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Read HubSpot integration
    const { data: integration, error: intError } = await db
      .from("integrations")
      .select("*")
      .eq("type", "hubspot")
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(
        JSON.stringify({ error: "Geen HubSpot-integratie gevonden. Sla eerst een token op via Instellingen." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = integration.token as string;

    // Fetch all deal pipelines from HubSpot
    const res = await fetch(
      "https://api.hubapi.com/crm/v3/pipelines/deals?includeInactive=false",
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HubSpot Pipelines API fout (${res.status}): ${body.slice(0, 200)}`);
    }

    const body = await res.json();
    const pipelines: any[] = body.results ?? [];
    const now = new Date().toISOString();
    let upserted = 0;

    for (const pipeline of pipelines) {
      const stages = [...(pipeline.stages ?? [])]
        .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((s: any) => ({
          stage_id:      s.id,
          label:         s.label,
          display_order: s.displayOrder ?? 0,
          metadata:      s.metadata ?? {},
        }));

      const { error } = await db.from("pipelines").upsert(
        {
          pipeline_id: pipeline.id,
          naam:        pipeline.label,
          stages,
          synced_at:   now,
        },
        { onConflict: "pipeline_id" },
      );

      if (error) throw error;
      upserted++;
    }

    return new Response(
      JSON.stringify({ success: true, upserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("hubspot-pipelines error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Onbekende fout" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 2: Register function in `supabase/config.toml`**

Add after the existing `[functions.enrich-automation]` block:

```toml
[functions.hubspot-pipelines]
verify_jwt = true
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/hubspot-pipelines/index.ts supabase/config.toml
git commit -m "feat(pipelines): add hubspot-pipelines edge function"
```

---

### Task 3: Extract pipeline/stage in `hubspot-sync`

**Files:**
- Modify: `supabase/functions/hubspot-sync/index.ts`

The `raw_payload` on each automation is the full HubSpot workflow object. Pipeline/stage trigger conditions appear in `triggerSets[].filters[]` and `segmentCriteria[][]` as filters with `propertyName` of `dealstage`/`hs_pipeline_stage` (stage) or `pipeline`/`hs_pipeline` (pipeline).

- [ ] **Step 1: Add `extractPipelineStage` helper**

In `hubspot-sync/index.ts`, add this function before the `mapWorkflow` function (around line 130, after the `WORKFLOW_TYPE_TRIGGER_MAP` block):

```ts
// ── Pipeline + stage extraction from trigger conditions ───────────────────────
function extractPipelineStage(wf: any): { pipelineId: string | null; stageId: string | null } {
  const PIPELINE_PROPS = new Set(["pipeline", "hs_pipeline"]);
  const STAGE_PROPS    = new Set(["dealstage", "hs_pipeline_stage"]);

  let pipelineId: string | null = null;
  let stageId:    string | null = null;

  function checkFilter(f: any) {
    const prop = (f.property ?? f.propertyName ?? "").toLowerCase();
    const val  = String(f.value ?? f.propertyValue ?? "");
    if (!val) return;
    if (PIPELINE_PROPS.has(prop)) pipelineId = val;
    if (STAGE_PROPS.has(prop))    stageId    = val;
  }

  for (const sources of [wf.triggerSets ?? [], wf.reEnrollmentTriggerSets ?? []]) {
    for (const ts of sources) {
      for (const f of ts.filters ?? []) checkFilter(f);
    }
  }
  for (const group of wf.segmentCriteria ?? []) {
    const filters = Array.isArray(group) ? group : [group];
    for (const f of filters) checkFilter(f);
  }

  return { pipelineId, stageId };
}
```

- [ ] **Step 2: Include pipeline_id/stage_id in the upsert (existing workflow update)**

Locate the `.update({` block for existing workflows (around the line that has `naam: wf.name`). Add `pipeline_id` and `stage_id` to the update payload:

```ts
// after: const { pipelineId, stageId } = extractPipelineStage(wf);  ← add this line before the update
const { pipelineId, stageId } = extractPipelineStage(wf);
// existing update block gets two new fields:
pipeline_id: pipelineId,
stage_id:    stageId,
```

The existing update call looks like:
```ts
.update({
  naam:                 wf.name,
  status:               wf.enabled ? "Actief" : "Uitgeschakeld",
  trigger_beschrijving: mapped.trigger,
  systemen:             mapped.systemen,
  stappen:              mapped.stappen,
  categorie:            mapped.categorie,
  webhook_paths:        mapped.webhookPaths,
  import_proposal:      { ...mapped },
  raw_payload:          wf,
  last_synced_at:       now,
})
```

Change to:

```ts
const { pipelineId, stageId } = extractPipelineStage(wf);
// ... then in the update:
.update({
  naam:                 wf.name,
  status:               wf.enabled ? "Actief" : "Uitgeschakeld",
  trigger_beschrijving: mapped.trigger,
  systemen:             mapped.systemen,
  stappen:              mapped.stappen,
  categorie:            mapped.categorie,
  webhook_paths:        mapped.webhookPaths,
  import_proposal:      { ...mapped },
  raw_payload:          wf,
  last_synced_at:       now,
  pipeline_id:          pipelineId,
  stage_id:             stageId,
})
```

- [ ] **Step 3: Include pipeline_id/stage_id in the insert (new workflow)**

Locate the `.insert({` block for new workflows. Add the same two fields. The insert currently ends with `last_synced_at: now`. Add after it:

```ts
pipeline_id:     pipelineId,
stage_id:        stageId,
```

Note: the `pipelineId`/`stageId` variables from step 2 are scoped to the loop iteration — make sure the `extractPipelineStage(wf)` call is done before the if/else branch (it applies to both update and insert paths).

- [ ] **Step 4: Fire-and-forget hubspot-pipelines sync at the end**

After the enrichment fire-and-forget block (Step 4.x in the function), add a call to sync pipelines:

```ts
// Step X: Trigger pipeline sync (fire-and-forget)
{
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  fetch(`${supabaseUrl}/functions/v1/hubspot-pipelines`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}` },
  }).catch((e) => console.warn("hubspot-pipelines fout:", e));
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/hubspot-sync/index.ts
git commit -m "feat(pipelines): extract pipeline_id/stage_id from hubspot trigger conditions"
```

---

### Task 4: Frontend data layer

**Files:**
- Modify: `src/lib/supabaseStorage.ts`
- Modify: `src/lib/hooks.ts`

- [ ] **Step 1: Add `fetchPipelines` and `triggerHubSpotPipelinesSync` to supabaseStorage.ts**

In the import at line 2, add `Pipeline`, `PipelineStage` to the import from `"./types"`:

```ts
import { Automatisering, Integration, Koppeling, KlantFase, Systeem, Categorie, Status, PortalSettings, getPortalSettings, Pipeline, PipelineStage } from "./types";
```

At the end of `supabaseStorage.ts`, add:

```ts
// ─── Pipelines ────────────────────────────────────────────────────────────────

export async function fetchPipelines(): Promise<Pipeline[]> {
  const { data, error } = await (supabase as any)
    .from("pipelines")
    .select("*")
    .order("naam", { ascending: true });
  if (error) throw error;
  return (data || []).map((r: any) => ({
    pipelineId: r.pipeline_id,
    naam:       r.naam,
    stages:     (r.stages as PipelineStage[]) || [],
    syncedAt:   r.synced_at,
  }));
}

export async function triggerHubSpotPipelinesSync(): Promise<{ upserted: number }> {
  const { data, error } = await supabase.functions.invoke("hubspot-pipelines");
  if (error) {
    const context = (error as any)?.context;
    if (context && typeof context.error === "string") throw new Error(context.error);
    throw new Error(error.message);
  }
  return data as { upserted: number };
}
```

- [ ] **Step 2: Map `pipelineId`/`stageId` in `fetchAutomatiseringen`**

In the `.map((r) => ({` block inside `fetchAutomatiseringen` (around line 68, after `aiDescriptionUpdatedAt`), add:

```ts
    pipelineId:            r.pipeline_id ?? undefined,
    stageId:               r.stage_id ?? undefined,
```

- [ ] **Step 3: Add `usePipelines` and `useHubSpotPipelinesSync` hooks to `hooks.ts`**

First update the import at line 2 of `hooks.ts`. The current import references `triggerHubSpotSync, triggerZapierSync, ...`. Add `fetchPipelines, triggerHubSpotPipelinesSync` to the import list.

Then add at the end of `hooks.ts`:

```ts
export function usePipelines() {
  return useQuery({
    queryKey: ["pipelines"],
    queryFn:  fetchPipelines,
    refetchOnWindowFocus: false,
  });
}

export function useHubSpotPipelinesSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerHubSpotPipelinesSync,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabaseStorage.ts src/lib/hooks.ts
git commit -m "feat(pipelines): add fetchPipelines, triggerHubSpotPipelinesSync, usePipelines hook"
```

---

### Task 5: Horizontal stage flow in `AutomationDetailPanel`

**Files:**
- Modify: `src/components/process/AutomationDetailPanel.tsx`

- [ ] **Step 1: Add imports**

At the top of the file, add `Fragment` to the React import and add `usePipelines` to the hooks import:

After the existing imports, add:
```ts
import { Fragment } from "react";
import { usePipelines } from "@/lib/hooks";
```

- [ ] **Step 2: Call `usePipelines` inside the component**

After the existing `const { data: allAutomations } = useAutomatiseringen();` line (line 46), add:

```ts
  const { data: pipelines } = usePipelines();

  const pipeline = (fullData?.pipelineId && pipelines)
    ? pipelines.find((p) => p.pipelineId === fullData.pipelineId)
    : undefined;
```

- [ ] **Step 3: Add the stage flow section**

Add a new `<Section>` block in the body, after the `{/* Trigger */}` section (after line 141). Insert:

```tsx
        {/* Pipeline stages */}
        {pipeline && pipeline.stages.length > 0 && (
          <Section label="Pipeline stages">
            <div className="flex items-center gap-1 flex-nowrap overflow-x-auto pb-1">
              {[...pipeline.stages]
                .sort((a, b) => a.display_order - b.display_order)
                .map((stage, i, arr) => {
                  const isActive = stage.stage_id === fullData?.stageId;
                  return (
                    <Fragment key={stage.stage_id}>
                      <div
                        className={`shrink-0 rounded px-2 py-1 text-[10px] font-medium border transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary border-primary/40"
                            : "bg-secondary text-muted-foreground border-border"
                        }`}
                      >
                        {isActive && <span className="mr-0.5">▶</span>}
                        {stage.label}
                      </div>
                      {i < arr.length - 1 && (
                        <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                    </Fragment>
                  );
                })}
            </div>
          </Section>
        )}
```

- [ ] **Step 4: Verify in browser**

Start the dev server:
```bash
npm run dev
```

1. Navigate to Alle Automatiseringen
2. Open a HubSpot workflow that triggers on a deal stage change
3. Open the detail panel
4. Verify: if `pipeline_id` and `stage_id` are populated, the horizontal flow renders with the trigger stage highlighted
5. Verify: if neither field is set (GitLab, Zapier automations), the section is not shown

- [ ] **Step 5: Commit**

```bash
git add src/components/process/AutomationDetailPanel.tsx
git commit -m "feat(pipelines): add horizontal pipeline stage flow to automation detail panel"
```

---

## Self-Review

**Spec coverage:**
- ✅ `hubspot-pipelines` edge function fetches `GET /crm/v3/pipelines/deals` (Task 2)
- ✅ `pipelines` table: `pipeline_id`, `naam`, `stages` JSONB, `synced_at` (Task 1)
- ✅ Stages include `stage_id`, `label`, `display_order`, `metadata` (Tasks 1 + 2)
- ✅ `pipeline_id` + `stage_id` extracted from `raw_payload` trigger conditions in `hubspot-sync` (Task 3)
- ✅ Written back to `automatiseringen.pipeline_id` + `stage_id` (Task 3)
- ✅ Horizontal stage flow in detail panel (Task 5)
- ✅ Trigger stage highlighted (Task 5)

**Placeholder scan:** None found.

**Type consistency:**
- `PipelineStage.stage_id` → matches DB column `stage_id` in JSONB → matches `stage.stage_id` in panel render
- `Pipeline.pipelineId` (camelCase) → mapped from `r.pipeline_id` (snake_case) in `fetchPipelines`
- `Automatisering.pipelineId` → mapped from `r.pipeline_id` in `fetchAutomatiseringen`
- Panel: `fullData?.pipelineId` / `fullData?.stageId` → correct camelCase fields on `Automatisering`

**Edge cases covered:**
- No pipeline match → section hidden (guard on `pipeline && pipeline.stages.length > 0`)
- No `stage_id` set → all stages render without highlight (no crash)
- Stage sort: always by `display_order` (not insertion order)
