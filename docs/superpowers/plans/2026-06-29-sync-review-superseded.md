# Sync Review Superseded Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Imports show only current open sync-review work by superseding stale pending review rows when newer sync previews replace them.

**Architecture:** Add a `superseded` review status and a stable `review_key` to `source_sync_change_items`. The server preview flow computes review keys, supersedes older pending rows before inserting newer rows, and supersedes previously pending keys that no longer appear in the latest source snapshot. Imports continues to query only `pending`, so the UI naturally shows current work.

**Tech Stack:** Supabase migrations, Supabase Edge Function TypeScript, React Query storage helper, Vitest.

---

## File Structure

- Modify `supabase/functions/_shared/portal-owned-sync.ts`
  - Add `superseded` to row/item status types.
  - Add `reviewKey`/`review_key` mapping.
  - Compute review keys for change drafts.
  - Supersede old pending rows during preview.
  - Prevent apply from processing non-pending/stale rows.
- Create `supabase/migrations/20260629130000_sync_review_superseded.sql`
  - Add `review_key`.
  - Extend status check with `superseded`.
  - Backfill review keys for existing rows.
  - Repair current duplicate pending rows.
  - Add an index for pending review key lookup.
- Modify `src/lib/storage/edgeFunctions.ts`
  - Add `superseded` to status type.
  - Select/map `review_key`.
  - Keep query scoped to `status = pending`.
- Modify `src/pages/Imports.tsx`
  - Change header/panel copy from generic open rows to current open source changes.
- Modify `src/components/SyncReviewPanel.tsx`
  - Change metric/copy labels to “actueel” wording.
- Modify `src/test/portalOwnedSyncReviewApply.test.ts`
  - Extend fake Supabase query where needed.
  - Add server tests for superseding and stale apply behavior.
- Modify `src/test/syncReviewPaginationStorage.test.ts`
  - Assert `review_key` is selected and mapped.
- Add `src/test/syncReviewSupersededMigration.test.ts`
  - Assert migration adds `superseded`, `review_key`, and duplicate repair SQL.

---

### Task 1: Database Migration For Superseded Status And Review Keys

**Files:**
- Create: `supabase/migrations/20260629130000_sync_review_superseded.sql`
- Test: `src/test/syncReviewSupersededMigration.test.ts`

- [ ] **Step 1: Write the failing migration test**

Create `src/test/syncReviewSupersededMigration.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260629130000_sync_review_superseded.sql"),
  "utf8",
);

describe("sync review superseded migration", () => {
  it("adds review keys and the superseded status", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS review_key TEXT");
    expect(migration).toContain("'superseded'");
    expect(migration).toContain("source_sync_change_items_status_check");
  });

  it("backfills review keys and supersedes duplicate pending rows", () => {
    expect(migration).toContain("payload_sanitized #>> '{missingEvidence,key}'");
    expect(migration).toContain("new_value_sanitized ->> 'missing_evidence_key'");
    expect(migration).toContain("ROW_NUMBER() OVER");
    expect(migration).toContain("PARTITION BY source, external_id, change_type, review_key");
    expect(migration).toContain("status = 'superseded'");
  });

  it("supersedes new automation rows that already exist as automations", () => {
    expect(migration).toContain("change_type = 'new_automation'");
    expect(migration).toContain("public.automatiseringen");
    expect(migration).toContain("a.source = sci.source");
    expect(migration).toContain("a.external_id = sci.external_id");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npx vitest run src/test/syncReviewSupersededMigration.test.ts
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/20260629130000_sync_review_superseded.sql`:

```sql
ALTER TABLE public.source_sync_change_items
  ADD COLUMN IF NOT EXISTS review_key TEXT NOT NULL DEFAULT '';

ALTER TABLE public.source_sync_change_items
  DROP CONSTRAINT IF EXISTS source_sync_change_items_status_check;

ALTER TABLE public.source_sync_change_items
  ADD CONSTRAINT source_sync_change_items_status_check
    CHECK (status IN ('pending', 'applied', 'skipped', 'failed', 'superseded'));

UPDATE public.source_sync_change_items
SET review_key = CASE
  WHEN change_type = 'source_data_incomplete' THEN COALESCE(
    payload_sanitized #>> '{missingEvidence,key}',
    new_value_sanitized ->> 'missing_evidence_key',
    change_type
  )
  ELSE change_type
END
WHERE review_key = '';

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY source, external_id, change_type, review_key
      ORDER BY created_at DESC, id DESC
    ) AS row_number
  FROM public.source_sync_change_items
  WHERE status = 'pending'
)
UPDATE public.source_sync_change_items AS sci
SET
  status = 'superseded',
  updated_at = now(),
  skipped_at = COALESCE(sci.skipped_at, now())
FROM ranked
WHERE sci.id = ranked.id
  AND ranked.row_number > 1;

UPDATE public.source_sync_change_items AS sci
SET
  status = 'superseded',
  updated_at = now(),
  skipped_at = COALESCE(sci.skipped_at, now())
WHERE sci.status = 'pending'
  AND sci.change_type = 'new_automation'
  AND EXISTS (
    SELECT 1
    FROM public.automatiseringen AS a
    WHERE a.source = sci.source
      AND a.external_id = sci.external_id
  );

CREATE INDEX IF NOT EXISTS source_sync_change_items_pending_review_key_idx
  ON public.source_sync_change_items(source, external_id, change_type, review_key, created_at DESC)
  WHERE status = 'pending';
```

- [ ] **Step 4: Run the migration test**

Run:

```powershell
npx vitest run src/test/syncReviewSupersededMigration.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add supabase/migrations/20260629130000_sync_review_superseded.sql src/test/syncReviewSupersededMigration.test.ts
git commit -m "db: add superseded sync review status"
```

---

### Task 2: Add Review Keys And Superseding To Preview Flow

**Files:**
- Modify: `supabase/functions/_shared/portal-owned-sync.ts`
- Test: `src/test/portalOwnedSyncReviewApply.test.ts`

- [ ] **Step 1: Write failing tests for preview superseding**

Modify the import in `src/test/portalOwnedSyncReviewApply.test.ts`:

```ts
import {
  applyPortalOwnedSyncChanges,
  previewPortalOwnedSync,
} from "../../supabase/functions/_shared/portal-owned-sync";
```

Add this helper below `newAutomationReviewRow`:

```ts
function existingHubSpotAutomation(overrides: Partial<Row> = {}): Row {
  return {
    id: "AUTO-HS-1617887756",
    source: "hubspot",
    external_id: "1617887756",
    naam: "Oude workflow",
    doel: "",
    trigger_beschrijving: "",
    systemen: ["HubSpot"],
    stappen: [],
    categorie: "Data beheer",
    status: "Actief",
    endpoints: [],
    webhook_paths: [],
    import_proposal: {
      hubspot_workflow: {
        id: "1617887756",
        triggers: [],
        actions: [],
      },
    },
    ...overrides,
  };
}
```

Add these tests before the existing `describe("applyPortalOwnedSyncChanges", ...)` block or inside a new `describe("previewPortalOwnedSync superseding", ...)` block:

```ts
describe("previewPortalOwnedSync superseding", () => {
  it("marks older pending rows with the same review key superseded before inserting the new row", async () => {
    const db = new FakeSupabase({
      source_sync_runs: [{ id: "sync-2", source: "hubspot", status: "started" }],
      automatiseringen: [existingHubSpotAutomation()],
      source_sync_change_items: [{
        id: "old-change",
        sync_run_id: "sync-1",
        source: "hubspot",
        external_id: "1617887756",
        automation_id: "AUTO-HS-1617887756",
        change_type: "source_data_incomplete",
        review_key: "hubspot_triggers",
        status: "pending",
        title: "Oude workflow",
        summary: "HubSpot triggercriteria ontbreekt voor procesreisvorming.",
        impact: "",
        old_value_sanitized: null,
        new_value_sanitized: { missing_evidence_key: "hubspot_triggers" },
        payload_sanitized: { missingEvidence: { key: "hubspot_triggers" } },
        selected_by_default: true,
        created_at: "2026-06-01T09:00:00.000Z",
      }],
    });

    const result = await previewPortalOwnedSync(db as any, {
      source: "hubspot",
      syncRunId: "sync-2",
      now: "2026-06-29T10:00:00.000Z",
      payloads: [{
        external_id: "1617887756",
        source: "hubspot",
        naam: "Oude workflow",
        import_proposal: {
          hubspot_workflow: {
            id: "1617887756",
            triggers: [],
            actions: [],
          },
        },
      }],
    });

    expect(db.tables.source_sync_change_items.find((row) => row.id === "old-change")).toMatchObject({
      status: "superseded",
      skipped_at: "2026-06-29T10:00:00.000Z",
    });
    const inserted = db.tables.source_sync_change_items.filter((row) => row.sync_run_id === "sync-2");
    expect(inserted.some((row) => row.review_key === "hubspot_triggers" && row.status === "pending")).toBe(true);
    expect(result.changeItems.some((item) => item.reviewKey === "hubspot_triggers")).toBe(true);
  });

  it("keeps different source_data_incomplete evidence keys open independently", async () => {
    const db = new FakeSupabase({
      source_sync_runs: [{ id: "sync-2", source: "hubspot", status: "started" }],
      automatiseringen: [existingHubSpotAutomation()],
      source_sync_change_items: [{
        id: "old-actions",
        sync_run_id: "sync-1",
        source: "hubspot",
        external_id: "1617887756",
        automation_id: "AUTO-HS-1617887756",
        change_type: "source_data_incomplete",
        review_key: "hubspot_actions",
        status: "pending",
        title: "Oude workflow",
        summary: "HubSpot acties ontbreekt voor procesreisvorming.",
        impact: "",
        old_value_sanitized: null,
        new_value_sanitized: { missing_evidence_key: "hubspot_actions" },
        payload_sanitized: { missingEvidence: { key: "hubspot_actions" } },
        selected_by_default: true,
      }],
    });

    await previewPortalOwnedSync(db as any, {
      source: "hubspot",
      syncRunId: "sync-2",
      now: "2026-06-29T10:00:00.000Z",
      payloads: [{
        external_id: "1617887756",
        source: "hubspot",
        naam: "Oude workflow",
        import_proposal: {
          hubspot_workflow: {
            id: "1617887756",
            triggers: [],
            actions: [],
          },
        },
      }],
    });

    expect(db.tables.source_sync_change_items.find((row) => row.id === "old-actions")).toMatchObject({
      status: "superseded",
    });
    const pendingKeys = db.tables.source_sync_change_items
      .filter((row) => row.status === "pending")
      .map((row) => row.review_key);
    expect(pendingKeys).toContain("hubspot_triggers");
    expect(pendingKeys).toContain("hubspot_actions");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
npx vitest run src/test/portalOwnedSyncReviewApply.test.ts
```

Expected: FAIL because `previewPortalOwnedSync` does not return `reviewKey` and older rows are not superseded.

- [ ] **Step 3: Extend types in `portal-owned-sync.ts`**

In `SourceSyncChangeItem`, add:

```ts
  reviewKey: string;
```

In `SourceSyncChangeDraft`, replace the current type with:

```ts
type SourceSyncChangeDraft = Omit<SourceSyncChangeItem, "id" | "status" | "syncRunId" | "selectedByDefault" | "reviewKey"> & {
  syncRunId: string;
  reviewKey?: string;
  selectedByDefault?: boolean;
};
```

In `SourceSyncChangeRow`, add:

```ts
  review_key: string;
```

- [ ] **Step 4: Add review key helpers**

Add these helpers before `insertSyncChangeItem`:

```ts
function reviewKeyForDraft(draft: SourceSyncChangeDraft): string {
  if (draft.reviewKey) return draft.reviewKey;
  if (draft.changeType === "source_data_incomplete") {
    const payload = isRecord(draft.payload) ? draft.payload : {};
    const missingEvidence = isRecord(payload.missingEvidence) ? payload.missingEvidence : {};
    const newValue = isRecord(draft.newValue) ? draft.newValue : {};
    return stringValue(missingEvidence.key)
      || stringValue(newValue.missing_evidence_key)
      || draft.changeType;
  }
  return draft.changeType;
}

function reviewKeyForRow(row: SourceSyncChangeRow): string {
  if (row.review_key) return row.review_key;
  if (row.change_type === "source_data_incomplete") {
    const payload = isRecord(row.payload_sanitized) ? row.payload_sanitized : {};
    const missingEvidence = isRecord(payload.missingEvidence) ? payload.missingEvidence : {};
    const newValue = isRecord(row.new_value_sanitized) ? row.new_value_sanitized : {};
    return stringValue(missingEvidence.key)
      || stringValue(newValue.missing_evidence_key)
      || row.change_type;
  }
  return row.change_type;
}

function reviewIdentity(input: {
  source: string;
  externalId: string | null;
  changeType: string;
  reviewKey: string;
}): string {
  return `${input.source}|${input.externalId ?? ""}|${input.changeType}|${input.reviewKey}`;
}
```

- [ ] **Step 5: Store and map `review_key`**

In `insertSyncChangeItem`, compute and include `review_key`:

```ts
  const reviewKey = reviewKeyForDraft(draft);
  const data = {
    sync_run_id: draft.syncRunId,
    source: draft.source,
    external_id: draft.externalId,
    automation_id: draft.automationId,
    change_type: draft.changeType,
    review_key: reviewKey,
    status: "pending",
    title: draft.title,
    summary: draft.summary,
    impact: draft.impact,
    old_value_sanitized: sanitizeValue(draft.oldValue),
    new_value_sanitized: sanitizeValue(draft.newValue),
    payload_sanitized: sanitizeValue(draft.payload),
    selected_by_default: true,
  };
```

In `mapSyncChangeRow`, include:

```ts
    reviewKey: reviewKeyForRow(row),
```

- [ ] **Step 6: Add supersede helpers**

Add these functions before `insertSyncChangeItem`:

```ts
async function supersedePendingReviewItemsForDraft(
  db: SupabaseClientLike,
  draft: SourceSyncChangeDraft,
  now: string,
): Promise<void> {
  const { error } = await db
    .from(SOURCE_SYNC_CHANGE_ITEMS_TABLE)
    .update({
      status: "superseded",
      skipped_at: now,
      updated_at: now,
    })
    .eq("status", "pending")
    .eq("source", draft.source)
    .eq("external_id", draft.externalId)
    .eq("change_type", draft.changeType)
    .eq("review_key", reviewKeyForDraft(draft));
  throwIfSupabaseError("Oude sync-reviewregels vervangen", error);
}

async function fetchPendingReviewItemsForSource(
  db: SupabaseClientLike,
  source: PortalOwnedSyncSource,
): Promise<SourceSyncChangeRow[]> {
  const { data, error } = await db
    .from(SOURCE_SYNC_CHANGE_ITEMS_TABLE)
    .select("*")
    .eq("source", source)
    .eq("status", "pending");
  throwIfSupabaseError("Open sync-reviewregels ophalen", error);
  return (data ?? []) as SourceSyncChangeRow[];
}

async function supersedeStalePendingReviewItems(
  db: SupabaseClientLike,
  input: {
    source: PortalOwnedSyncSource;
    currentDrafts: SourceSyncChangeDraft[];
    coveredExternalIds: Set<string>;
    now: string;
  },
): Promise<void> {
  const currentKeys = new Set(input.currentDrafts.map((draft) => reviewIdentity({
    source: draft.source,
    externalId: draft.externalId,
    changeType: draft.changeType,
    reviewKey: reviewKeyForDraft(draft),
  })));
  const pendingRows = await fetchPendingReviewItemsForSource(db, input.source);
  for (const row of pendingRows) {
    if (!row.external_id || !input.coveredExternalIds.has(row.external_id)) continue;
    const key = reviewIdentity({
      source: row.source,
      externalId: row.external_id,
      changeType: row.change_type,
      reviewKey: reviewKeyForRow(row),
    });
    if (currentKeys.has(key)) continue;
    const { error } = await db
      .from(SOURCE_SYNC_CHANGE_ITEMS_TABLE)
      .update({
        status: "superseded",
        skipped_at: input.now,
        updated_at: input.now,
      })
      .eq("id", row.id);
    throwIfSupabaseError("Verdwenen sync-reviewregel vervangen", error);
  }
}
```

- [ ] **Step 7: Wire helpers into `previewPortalOwnedSync`**

Replace the insert loop in `previewPortalOwnedSync` with:

```ts
  const coveredExternalIds = new Set(
    input.payloads
      .map((payload) => String(payload.external_id ?? "").trim())
      .filter(Boolean),
  );
  await supersedeStalePendingReviewItems(db, {
    source: input.source,
    currentDrafts: drafts,
    coveredExternalIds,
    now: input.now,
  });

  const changeItems: SourceSyncChangeItem[] = [];
  for (const draft of drafts) {
    await supersedePendingReviewItemsForDraft(db, draft, input.now);
    changeItems.push(await insertSyncChangeItem(db, draft));
  }
```

- [ ] **Step 8: Run the preview/apply tests**

Run:

```powershell
npx vitest run src/test/portalOwnedSyncReviewApply.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add supabase/functions/_shared/portal-owned-sync.ts src/test/portalOwnedSyncReviewApply.test.ts
git commit -m "feat: supersede stale sync review items"
```

---

### Task 3: Make Apply Ignore Non-Pending Rows Safely

**Files:**
- Modify: `supabase/functions/_shared/portal-owned-sync.ts`
- Test: `src/test/portalOwnedSyncReviewApply.test.ts`

- [ ] **Step 1: Write the failing stale apply test**

Add this test inside `describe("applyPortalOwnedSyncChanges", ...)`:

```ts
  it("does not apply superseded review rows even when their ids are submitted", async () => {
    const db = new FakeSupabase({
      source_sync_change_items: [newAutomationReviewRow({
        status: "superseded",
        skipped_at: "2026-06-29T09:00:00.000Z",
      })],
      automatiseringen: [],
      automation_import_proposals: [],
      automation_source_findings: [],
    });

    const result = await applyPortalOwnedSyncChanges(db as any, {
      source: "zapier",
      syncRunId: "sync-1",
      selectedChangeItemIds: ["change-new-1"],
      now: "2026-06-29T10:00:00.000Z",
    });

    expect(db.tables.automatiseringen).toEqual([]);
    expect(db.tables.source_sync_change_items[0]).toMatchObject({
      status: "superseded",
    });
    expect(result).toMatchObject({
      applied: 0,
      inserted: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      total: 0,
    });
  });
```

- [ ] **Step 2: Run the stale apply test**

Run:

```powershell
npx vitest run src/test/portalOwnedSyncReviewApply.test.ts
```

Expected: PASS if `fetchPendingReviewItems` already filters `status = pending`. If it fails, update `fetchPendingReviewItems` so it keeps `.eq("status", "pending")`.

- [ ] **Step 3: Add status type coverage**

Update the status unions in `portal-owned-sync.ts`:

```ts
  status: "pending" | "applied" | "skipped" | "failed" | "superseded";
```

Apply this to both `SourceSyncChangeItem` and `SourceSyncChangeRow`.

- [ ] **Step 4: Run tests**

Run:

```powershell
npx vitest run src/test/portalOwnedSyncReviewApply.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add supabase/functions/_shared/portal-owned-sync.ts src/test/portalOwnedSyncReviewApply.test.ts
git commit -m "test: cover stale sync review apply"
```

---

### Task 4: Update Client Storage Mapping And Imports Copy

**Files:**
- Modify: `src/lib/storage/edgeFunctions.ts`
- Modify: `src/pages/Imports.tsx`
- Modify: `src/components/SyncReviewPanel.tsx`
- Test: `src/test/syncReviewPaginationStorage.test.ts`
- Test: `src/test/importsFlow.test.ts`
- Test: `src/test/syncReviewPanel.test.tsx`

- [ ] **Step 1: Update storage test for `review_key`**

In `src/test/syncReviewPaginationStorage.test.ts`, add `review_key` to the `row` object:

```ts
  review_key: "new_automation",
```

Update the select assertion:

```ts
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("review_key"), { count: "exact" });
```

Add this assertion:

```ts
    expect(result.items[0].reviewKey).toBe("new_automation");
```

- [ ] **Step 2: Run the failing storage test**

Run:

```powershell
npx vitest run src/test/syncReviewPaginationStorage.test.ts
```

Expected: FAIL because the mapper does not select/map `review_key`.

- [ ] **Step 3: Update `edgeFunctions.ts` types and mapper**

In `SyncReviewChangeItem`, add:

```ts
  reviewKey?: string | null;
```

Update status type:

```ts
  status?: "pending" | "applied" | "skipped" | "failed" | "superseded" | string;
```

Update the select string in `fetchPendingSyncReviewItems` to include `review_key`:

```ts
    .select("id,sync_run_id,source,external_id,automation_id,change_type,review_key,status,title,summary,impact,old_value_sanitized,new_value_sanitized,payload_sanitized,selected_by_default", { count: "exact" })
```

Map the field:

```ts
    reviewKey: typeof item.review_key === "string" ? item.review_key : null,
```

- [ ] **Step 4: Update Imports copy**

In `src/pages/Imports.tsx`, change:

```tsx
description="Controleer bronwijzigingen uit synchronisaties per pagina en pas alleen de geselecteerde regels toe."
```

to:

```tsx
description="Controleer actuele bronwijzigingen uit synchronisaties per pagina en pas alleen de geselecteerde regels toe."
```

Change:

```tsx
<PageHeaderMetric label="open bronwijzigingen" value={syncReviewPage.total} />
```

to:

```tsx
<PageHeaderMetric label="actuele open bronwijzigingen" value={syncReviewPage.total} />
```

- [ ] **Step 5: Update SyncReviewPanel copy**

In `src/components/SyncReviewPanel.tsx`, change:

```tsx
<MetricCard label="Totaal open" value={total} className="bg-card" />
```

to:

```tsx
<MetricCard label="Actueel open" value={total} className="bg-card" />
```

Change any helper text that says “open sync-resultaten” or equivalent historical wording to:

```tsx
Nieuwe sync-resultaten staan hier als actuele bronwijzigingen. Oudere vervangen regels verdwijnen automatisch uit deze open lijst.
```

- [ ] **Step 6: Run focused UI/storage tests**

Run:

```powershell
npx vitest run src/test/syncReviewPaginationStorage.test.ts src/test/importsFlow.test.ts src/test/syncReviewPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/lib/storage/edgeFunctions.ts src/pages/Imports.tsx src/components/SyncReviewPanel.tsx src/test/syncReviewPaginationStorage.test.ts src/test/importsFlow.test.ts src/test/syncReviewPanel.test.tsx
git commit -m "chore: show current sync review work in imports"
```

---

### Task 5: Verify End-To-End Counts And Build

**Files:**
- No planned source edits.

- [ ] **Step 1: Run all sync-review tests**

Run:

```powershell
npx vitest run src/test/portalOwnedSyncReviewApply.test.ts src/test/syncReviewPaginationStorage.test.ts src/test/syncReviewSupersededMigration.test.ts src/test/importsFlow.test.ts src/test/syncReviewPanel.test.tsx src/test/integrationSyncReviewSource.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run production build**

Run:

```powershell
npm run build
```

Expected: PASS. Vite may still warn about large chunks; that warning is not part of this change.

- [ ] **Step 3: Live read-only count before deploy**

Use the existing live read-only Supabase REST counting script pattern from the investigation and confirm:

```text
pendingReviewItemsExact = current value before migration
duplicateAutomationSourceExternalKeys = 0
duplicatePendingSourceExternalTypeKeys > 0 before migration
```

Expected: Confirms the pre-existing duplication is in review rows, not automations.

- [ ] **Step 4: Apply migration in the project’s normal Supabase deploy path**

Use the project’s normal Supabase migration/deploy mechanism. Do not run ad-hoc destructive SQL from the app shell.

Expected after migration:

```text
source_sync_change_items has review_key
status check accepts superseded
older duplicate pending rows are superseded
```

- [ ] **Step 5: Live read-only count after migration**

Run the same read-only count again.

Expected:

```text
duplicatePendingSourceExternalTypeKeys = 0
pendingNewForExistingAuto = 0
pendingReviewItemsExact is close to current unique review work, not historical accumulated rows
```

- [ ] **Step 6: Browser smoke Imports**

Open `/imports` in the live browser and confirm:

```text
Header says actuele open bronwijzigingen
Count is much lower than 1803
Pagination still shows 50 rows per page
No old sync-review dialog opens
Apply button references only selected visible rows
```

- [ ] **Step 7: Confirm no verification-only source changes remain**

Run:

```powershell
git status --short supabase/functions/_shared/portal-owned-sync.ts supabase/migrations/20260629130000_sync_review_superseded.sql src/lib/storage/edgeFunctions.ts src/pages/Imports.tsx src/components/SyncReviewPanel.tsx src/test/portalOwnedSyncReviewApply.test.ts src/test/syncReviewPaginationStorage.test.ts src/test/syncReviewSupersededMigration.test.ts src/test/importsFlow.test.ts src/test/syncReviewPanel.test.tsx
```

Expected: no output. If files are listed, return to the task that owns those files, run its focused tests again, and commit with that task's exact commit step.

---

## Self-Review

Spec coverage:

- `superseded` status: Task 1 and Task 3.
- Stable review key: Task 1 and Task 2.
- Preview supersedes old rows: Task 2.
- Existing data cleanup: Task 1 migration repair SQL.
- Apply ignores stale rows: Task 3.
- Imports only shows current pending work: Task 4.
- Tests and live verification: Task 5.

Placeholder scan:

- No placeholder markers remain.
- All commands and expected outcomes are explicit.
- Code snippets define the helper names used later in the plan.

Type consistency:

- Server uses `reviewKey` in TypeScript and `review_key` in database rows.
- Client storage exposes `reviewKey`.
- Database identity uses `source + external_id + change_type + review_key`.
