# Sync Review Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a preview-first review popup for HubSpot, Zapier, Typeform and GitLab automation syncs so users can choose which discovered changes are applied.

**Architecture:** Source sync Edge Functions will support `preview` and `apply` modes. Preview writes persistent `source_sync_change_items` rows and returns them to the UI; apply receives selected item IDs and mutates only those selected changes using the existing portal-owned sync rules. The frontend opens a shared `SyncReviewDialog` after preview and sends selected items back to the same source sync function.

**Tech Stack:** Supabase Edge Functions, Supabase Postgres migrations, React, TanStack Query, shadcn/Radix dialog and checkbox components, Vitest, Playwright browser smoke checks.

---

## File Structure

- Create: `supabase/migrations/20260601093000_source_sync_change_items.sql`
  - Adds persistent sync-review change item storage.
- Modify: `supabase/functions/_shared/portal-owned-sync.ts`
  - Adds preview/apply helpers and keeps `recordPortalOwnedSync` as the apply-all compatibility path.
- Modify: `supabase/functions/hubspot-sync/index.ts`
  - Parses `preview` and `apply` requests.
- Modify: `supabase/functions/zapier-sync/index.ts`
  - Parses `preview`, `apply`, API sync and JSON-export sync requests.
- Modify: `supabase/functions/typeform-sync/index.ts`
  - Parses `preview` and `apply` requests.
- Modify: `supabase/functions/gitlab-sync/index.ts`
  - Parses `preview`, `apply`, existing sync and backfill requests.
- Modify: `src/lib/storage/edgeFunctions.ts`
  - Adds sync-review result types and apply helpers.
- Modify: `src/lib/queryHooks/integrations.ts`
  - Adds apply mutation and returns preview-capable sync results.
- Create: `src/components/SyncReviewDialog.tsx`
  - Shared popup/list UI.
- Modify: `src/pages/Instellingen.tsx`
  - Opens the review dialog from integration sync cards.
- Modify: `src/pages/Imports.tsx`
  - Uses the same review dialog for HubSpot/GitLab sync buttons.
- Create/modify tests:
  - `src/test/sourceSyncReviewMigration.test.ts`
  - `src/test/portalOwnedSyncReviewSource.test.ts`
  - `src/test/syncReviewDialog.test.tsx`
  - `src/test/integrationSyncReviewSource.test.tsx`

---

### Task 1: Migration For Sync Review Items

**Files:**
- Create: `supabase/migrations/20260601093000_source_sync_change_items.sql`
- Test: `src/test/sourceSyncReviewMigration.test.ts`

- [ ] **Step 1: Write the failing migration test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260601093000_source_sync_change_items.sql"),
  "utf8",
);

describe("source sync change items migration", () => {
  it("creates persistent review items linked to source sync runs", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.source_sync_change_items");
    expect(migration).toContain("sync_run_id UUID NOT NULL REFERENCES public.source_sync_runs(id)");
    expect(migration).toContain("status TEXT NOT NULL DEFAULT 'pending'");
    expect(migration).toContain("selected_by_default BOOLEAN NOT NULL DEFAULT true");
    expect(migration).toContain("payload_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb");
  });

  it("allows only the review change types and statuses used by the UI", () => {
    expect(migration).toContain("'new_automation'");
    expect(migration).toContain("'metadata_changed'");
    expect(migration).toContain("'route_changed'");
    expect(migration).toContain("'source_data_incomplete'");
    expect(migration).toContain("'source_missing'");
    expect(migration).toContain("'pending'");
    expect(migration).toContain("'applied'");
    expect(migration).toContain("'skipped'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/sourceSyncReviewMigration.test.ts`

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add the migration**

```sql
CREATE TABLE IF NOT EXISTS public.source_sync_change_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id UUID NOT NULL REFERENCES public.source_sync_runs(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  external_id TEXT,
  automation_id TEXT REFERENCES public.automatiseringen(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  impact TEXT NOT NULL DEFAULT '',
  old_value_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_value_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_sanitized JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_by_default BOOLEAN NOT NULL DEFAULT true,
  applied_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  error_message_sanitized TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT source_sync_change_items_type_check
    CHECK (change_type IN ('new_automation', 'metadata_changed', 'route_changed', 'source_data_incomplete', 'source_missing')),
  CONSTRAINT source_sync_change_items_status_check
    CHECK (status IN ('pending', 'applied', 'skipped', 'failed'))
);

CREATE INDEX IF NOT EXISTS source_sync_change_items_run_idx
  ON public.source_sync_change_items(sync_run_id, status);

CREATE INDEX IF NOT EXISTS source_sync_change_items_source_idx
  ON public.source_sync_change_items(source, external_id);

ALTER TABLE public.source_sync_change_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read source sync change items"
  ON public.source_sync_change_items FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 4: Run migration test to verify it passes**

Run: `npm run test -- src/test/sourceSyncReviewMigration.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260601093000_source_sync_change_items.sql src/test/sourceSyncReviewMigration.test.ts
git commit -m "feat: add sync review item storage"
```

---

### Task 2: Backend Preview And Apply Helpers

**Files:**
- Modify: `supabase/functions/_shared/portal-owned-sync.ts`
- Test: `src/test/portalOwnedSyncReviewSource.test.ts`

- [ ] **Step 1: Write failing source tests for preview/apply helpers**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/portal-owned-sync.ts"),
  "utf8",
);

describe("portal-owned sync review helpers", () => {
  it("exposes preview and apply helpers while preserving apply-all compatibility", () => {
    expect(source).toContain("SOURCE_SYNC_CHANGE_ITEMS_TABLE");
    expect(source).toContain("previewPortalOwnedSync");
    expect(source).toContain("applyPortalOwnedSyncChanges");
    expect(source).toContain("recordPortalOwnedSync");
  });

  it("preview mode writes change items without updating existing automations directly", () => {
    expect(source).toContain("insertSyncChangeItem");
    expect(source).toContain("buildSyncChangeItems");
    expect(source).toContain("selected_by_default: true");
    expect(source).toContain("payload_sanitized");
  });

  it("apply mode only applies selected pending items and marks unselected items skipped", () => {
    expect(source).toContain("selectedChangeItemIds");
    expect(source).toContain("markUnselectedReviewItemsSkipped");
    expect(source).toContain("status: \"applied\"");
    expect(source).toContain("status: \"skipped\"");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/portalOwnedSyncReviewSource.test.ts`

Expected: FAIL because helper functions and constants are missing.

- [ ] **Step 3: Add helper types and constants**

Add to `portal-owned-sync.ts`:

```ts
export const SOURCE_SYNC_CHANGE_ITEMS_TABLE = "source_sync_change_items";

export type SourceSyncChangeType =
  | "new_automation"
  | "metadata_changed"
  | "route_changed"
  | "source_data_incomplete"
  | "source_missing";

export type SourceSyncChangeItem = {
  id: string;
  syncRunId: string;
  source: PortalOwnedSyncSource;
  externalId: string | null;
  automationId: string | null;
  changeType: SourceSyncChangeType;
  status: "pending" | "applied" | "skipped" | "failed";
  title: string;
  summary: string;
  impact: string;
  oldValue: unknown;
  newValue: unknown;
  payload: unknown;
  selectedByDefault: boolean;
};

export type PortalOwnedSyncPreviewResult = PortalOwnedSyncResult & {
  mode: "preview";
  changeItems: SourceSyncChangeItem[];
};

export type PortalOwnedSyncApplyResult = PortalOwnedSyncResult & {
  mode: "apply";
  applied: number;
  skipped: number;
  failed: number;
};
```

- [ ] **Step 4: Implement preview/apply helpers**

Implement:

```ts
export async function previewPortalOwnedSync(db, input): Promise<PortalOwnedSyncPreviewResult> {
  const changeItems = await buildSyncChangeItems(db, input);
  const insertedRows = [];
  for (const item of changeItems) insertedRows.push(await insertSyncChangeItem(db, item));
  await finishSourceSyncRun(db, input.syncRunId, {
    status: "success",
    finishedAt: input.now,
    itemsSeen: input.payloads.length,
  });
  return summarizePreview(input, insertedRows);
}

export async function applyPortalOwnedSyncChanges(db, input): Promise<PortalOwnedSyncApplyResult> {
  const rows = await fetchPendingReviewItems(db, input.syncRunId);
  const selected = new Set(input.selectedChangeItemIds);
  await markUnselectedReviewItemsSkipped(db, rows, selected, input.now);
  for (const row of rows.filter((item) => selected.has(item.id))) {
    await applyReviewItem(db, row, input.now);
  }
  return summarizeApply(input, rows, selected);
}
```

Keep `recordPortalOwnedSync` as an apply-all path by making it reuse preview/apply internally or by leaving its current direct behavior intact for compatibility. Source sync UI must use preview/apply.

- [ ] **Step 5: Run helper test**

Run: `npm run test -- src/test/portalOwnedSyncReviewSource.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/portal-owned-sync.ts src/test/portalOwnedSyncReviewSource.test.ts
git commit -m "feat: add portal-owned sync review helpers"
```

---

### Task 3: Edge Function Modes

**Files:**
- Modify: `supabase/functions/hubspot-sync/index.ts`
- Modify: `supabase/functions/zapier-sync/index.ts`
- Modify: `supabase/functions/typeform-sync/index.ts`
- Modify: `supabase/functions/gitlab-sync/index.ts`
- Modify tests that read Edge Function source.

- [ ] **Step 1: Write failing source tests**

Add assertions to existing source tests:

```ts
expect(source).toContain("previewPortalOwnedSync");
expect(source).toContain("applyPortalOwnedSyncChanges");
expect(source).toContain('mode === "apply"');
expect(source).toContain('mode === "preview"');
```

Use the relevant source test files:

- `src/test/zapierJsonImportEdgeSource.test.ts`
- `src/test/typeformSyncSource.test.ts`
- new or existing HubSpot/GitLab source tests.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test -- src/test/zapierJsonImportEdgeSource.test.ts src/test/typeformSyncSource.test.ts`

Expected: FAIL because the edge functions do not use preview/apply yet.

- [ ] **Step 3: Add request parsing**

For each sync function:

```ts
type SyncReviewRequest =
  | { mode: "preview" }
  | { mode: "apply"; syncRunId: string; selectedChangeItemIds: string[] };

async function parseSyncReviewRequest(req: Request): Promise<SyncReviewRequest> {
  if (req.method !== "POST") return { mode: "preview" };
  const body = await req.json().catch(() => ({}));
  if (body?.mode === "apply") {
    return {
      mode: "apply",
      syncRunId: String(body.syncRunId ?? ""),
      selectedChangeItemIds: Array.isArray(body.selectedChangeItemIds)
        ? body.selectedChangeItemIds.map(String)
        : [],
    };
  }
  return { mode: "preview" };
}
```

Zapier must preserve `json_export`; GitLab must preserve `backfill`.

- [ ] **Step 4: Handle apply before reading source tokens**

At the top of each handler after creating `db`:

```ts
if (request.mode === "apply") {
  const result = await applyPortalOwnedSyncChanges(db, {
    source: "hubspot",
    syncRunId: request.syncRunId,
    selectedChangeItemIds: request.selectedChangeItemIds,
    now: new Date().toISOString(),
  });
  return jsonResponse({ success: true, ...result });
}
```

Use the correct source in each function.

- [ ] **Step 5: Use preview after payload discovery**

Replace UI sync paths from:

```ts
const result = await recordPortalOwnedSync(db, { source, payloads, syncRunId, now });
```

to:

```ts
const result = await previewPortalOwnedSync(db, { source, payloads, syncRunId, now });
```

Keep backfill apply behavior unchanged unless request mode is `preview`.

- [ ] **Step 6: Run source tests**

Run: `npm run test -- src/test/zapierJsonImportEdgeSource.test.ts src/test/typeformSyncSource.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/hubspot-sync/index.ts supabase/functions/zapier-sync/index.ts supabase/functions/typeform-sync/index.ts supabase/functions/gitlab-sync/index.ts src/test
git commit -m "feat: add sync preview and apply modes"
```

---

### Task 4: Frontend API And Dialog

**Files:**
- Modify: `src/lib/storage/edgeFunctions.ts`
- Modify: `src/lib/queryHooks/integrations.ts`
- Create: `src/components/SyncReviewDialog.tsx`
- Test: `src/test/syncReviewDialog.test.tsx`

- [ ] **Step 1: Write failing dialog test**

```tsx
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SyncReviewDialog } from "@/components/SyncReviewDialog";

const items = [
  {
    id: "change-1",
    changeType: "route_changed",
    title: "Create new deal",
    source: "hubspot",
    summary: "Webhookpad gewijzigd",
    impact: "Procesreis-bewijs wordt sterker",
    selectedByDefault: true,
  },
  {
    id: "change-2",
    changeType: "new_automation",
    title: "Trustoo Leads - Utrecht",
    source: "zapier",
    summary: "Nieuwe Zapier automation gevonden",
    impact: "Komt als importvoorstel in de catalogus",
    selectedByDefault: true,
  },
];

describe("SyncReviewDialog", () => {
  it("shows all changes selected by default and applies only selected ids", () => {
    const onApply = vi.fn();
    render(<SyncReviewDialog open source="hubspot" items={items as any} isApplying={false} onOpenChange={() => {}} onApply={onApply} />);

    expect(screen.getByText("Bronwijzigingen controleren")).toBeInTheDocument();
    expect(screen.getByText("Create new deal")).toBeInTheDocument();
    expect(screen.getByText("Trustoo Leads - Utrecht")).toBeInTheDocument();

    const trustooRow = screen.getByText("Trustoo Leads - Utrecht").closest("[data-sync-review-row]");
    fireEvent.click(within(trustooRow as HTMLElement).getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /wijzigingen toepassen/i }));

    expect(onApply).toHaveBeenCalledWith(["change-1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/test/syncReviewDialog.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Add frontend types and apply helper**

In `edgeFunctions.ts`, add:

```ts
export type SyncReviewChangeItem = {
  id: string;
  syncRunId?: string;
  source: string;
  externalId?: string | null;
  automationId?: string | null;
  changeType: string;
  status?: string;
  title: string;
  summary: string;
  impact: string;
  selectedByDefault: boolean;
};

export type SyncPreviewResult = SyncResult & {
  mode?: "preview";
  changeItems?: SyncReviewChangeItem[];
};

export async function applySourceSyncReview(
  source: "hubspot" | "zapier" | "typeform" | "gitlab",
  syncRunId: string,
  selectedChangeItemIds: string[],
): Promise<SyncResult> {
  return invokeEdgeFunction(`${source}-sync`, {
    mode: "apply",
    syncRunId,
    selectedChangeItemIds,
  });
}
```

- [ ] **Step 4: Create `SyncReviewDialog`**

Implement the approved popup layout:

- header with source badge and counts;
- filter chips;
- list rows with checkbox, automation, change type, summary, impact;
- sticky footer with cancel and apply;
- default selected IDs from `selectedByDefault`.

- [ ] **Step 5: Run dialog test**

Run: `npm run test -- src/test/syncReviewDialog.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/edgeFunctions.ts src/lib/queryHooks/integrations.ts src/components/SyncReviewDialog.tsx src/test/syncReviewDialog.test.tsx
git commit -m "feat: add sync review dialog"
```

---

### Task 5: Wire Dialog Into Sync Buttons

**Files:**
- Modify: `src/pages/Instellingen.tsx`
- Modify: `src/pages/Imports.tsx`
- Test: `src/test/integrationSyncReviewSource.test.tsx`

- [ ] **Step 1: Write failing source-level UI test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const instellingen = readFileSync(resolve(process.cwd(), "src/pages/Instellingen.tsx"), "utf8");
const imports = readFileSync(resolve(process.cwd(), "src/pages/Imports.tsx"), "utf8");

describe("sync review UI wiring", () => {
  it("opens SyncReviewDialog from integration sync cards", () => {
    expect(instellingen).toContain("SyncReviewDialog");
    expect(instellingen).toContain("changeItems");
    expect(instellingen).toContain("applySourceSyncReview");
  });

  it("uses the same review flow from the imports page sync buttons", () => {
    expect(imports).toContain("SyncReviewDialog");
    expect(imports).toContain("changeItems");
    expect(imports).toContain("applySourceSyncReview");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test -- src/test/integrationSyncReviewSource.test.tsx`

Expected: FAIL because wiring is not present.

- [ ] **Step 3: Wire settings page**

In `IntegrationCard`:

- hold `reviewState`;
- after `syncMutation.mutateAsync()`, open dialog when `result.changeItems?.length`;
- call `applySourceSyncReview(type, result.syncRunId, selectedIds)`;
- show toast after apply;
- invalidate existing queries through mutation success or query client.

- [ ] **Step 4: Wire imports page**

Use the same pattern for HubSpot and GitLab sync buttons on `Imports.tsx`.

- [ ] **Step 5: Run wiring test**

Run: `npm run test -- src/test/integrationSyncReviewSource.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Instellingen.tsx src/pages/Imports.tsx src/test/integrationSyncReviewSource.test.tsx
git commit -m "feat: require review before applying source syncs"
```

---

### Task 6: Full Verification And Browser Smoke

**Files:**
- Modify/create: `tmp/smoke-sync-review.cjs` if needed.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm run test -- src/test/sourceSyncReviewMigration.test.ts src/test/portalOwnedSyncReviewSource.test.ts src/test/syncReviewDialog.test.tsx src/test/integrationSyncReviewSource.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run: `npm run test`

Expected: PASS. Existing todo tests may remain todo.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 4: Run lint**

Run: `npm run lint`

Expected: exit 0. Existing warnings may remain if there are no errors.

- [ ] **Step 5: Browser smoke**

Use the already open browser. Check:

- Settings page can open external systems tab.
- Clicking a source sync opens the review popup when preview items are returned.
- All rows are checked by default.
- Unchecking a row changes the apply count.
- Dialog has no desktop/mobile overflow.

- [ ] **Step 6: Final commit if needed**

```bash
git status --short
git add <only files changed by this feature>
git commit -m "test: verify sync review flow"
```

---

## Self-Review

- Spec coverage: The plan covers preview-first sync, four automation sources, persistent change items, default checked list UI, selective apply, sanitizing, tests and browser checks.
- Out of scope honored: HubSpot pipelines are not modified. Process journey rebuild is not part of this plan.
- Type consistency: Frontend `SyncReviewChangeItem` mirrors backend `SourceSyncChangeItem`. Backend modes are `preview` and `apply` across all four sync functions.
- No placeholders: All tasks include file paths, concrete assertions and commands.
