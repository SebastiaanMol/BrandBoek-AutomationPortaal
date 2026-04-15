# Import Source Tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every imported automation always has its source platform ("HubSpot", "Zapier", or "GitLab") as the first item in its `systemen` array, and backfill existing records.

**Architecture:** Add "GitLab" to the `Systeem` type, then update each of the three edge functions to prepend their own name to the `systemen` array using `Array.from(new Set([source, ...existing]))`. A SQL migration backfills existing records based on the `source` column.

**Tech Stack:** TypeScript, Supabase Edge Functions (Deno), PostgreSQL (JSONB array operations)

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `src/lib/types.ts` | Add `"GitLab"` to `Systeem` type (line 14) and `SYSTEMEN` array (line 99) |
| Modify | `supabase/functions/hubspot-sync/index.ts` | Prepend `"HubSpot"` after `extractSystemen()` call (~line 400) |
| Modify | `supabase/functions/zapier-sync/index.ts` | Replace fallback pattern with always-prepend (lines 70, 81) |
| Modify | `supabase/functions/gitlab-sync/index.ts` | Prepend `"GitLab"` after Gemini parse, before update/insert (lines 302, 318) |
| Create | `supabase/migrations/20260415130000_backfill_source_tags.sql` | Backfill existing records |

---

## Task 1: Add "GitLab" to Systeem type

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update `Systeem` type on line 14**

Find this line in `src/lib/types.ts`:
```typescript
export type Systeem = "HubSpot" | "Zapier" | "Typeform" | "SharePoint" | "WeFact" | "Docufy" | "Backend" | "E-mail" | "API" | "Anders";
```

Replace with:
```typescript
export type Systeem = "HubSpot" | "Zapier" | "Typeform" | "SharePoint" | "WeFact" | "Docufy" | "Backend" | "E-mail" | "API" | "GitLab" | "Anders";
```

- [ ] **Step 2: Update `SYSTEMEN` constant on line 99**

Find this line in `src/lib/types.ts`:
```typescript
export const SYSTEMEN: Systeem[] = ["HubSpot", "Zapier", "Typeform", "SharePoint", "WeFact", "Docufy", "Backend", "E-mail", "API", "Anders"];
```

Replace with:
```typescript
export const SYSTEMEN: Systeem[] = ["HubSpot", "Zapier", "Typeform", "SharePoint", "WeFact", "Docufy", "Backend", "E-mail", "API", "GitLab", "Anders"];
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add GitLab to Systeem type and SYSTEMEN constant"
```

---

## Task 2: HubSpot sync — guarantee "HubSpot" in systemen

**Files:**
- Modify: `supabase/functions/hubspot-sync/index.ts`

- [ ] **Step 1: Find and update the systemen assignment (~line 400)**

In `supabase/functions/hubspot-sync/index.ts`, find this line (around line 400, inside the workflow mapping logic):
```typescript
const systemen  = extractSystemen(actions);
```

Replace with:
```typescript
const systemen = Array.from(new Set(["HubSpot", ...extractSystemen(actions)]));
```

This guarantees "HubSpot" is always first. If `extractSystemen` also returns "HubSpot" (unlikely but possible), `Set` deduplicates it automatically.

- [ ] **Step 2: Verify no other changes needed**

Run this to confirm `systemen` is only assigned once in this file:
```bash
grep -n "const systemen" supabase/functions/hubspot-sync/index.ts
```

Expected: exactly one match (the line you just changed).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/hubspot-sync/index.ts
git commit -m "feat: always prepend HubSpot to systemen in hubspot-sync"
```

---

## Task 3: Zapier sync — always prepend "Zapier"

**Files:**
- Modify: `supabase/functions/zapier-sync/index.ts`

- [ ] **Step 1: Replace the extraction + fallback pattern (lines 70 and 81)**

Find line 70 in `supabase/functions/zapier-sync/index.ts`:
```typescript
const systemen = [...new Set((zap.steps || []).map((s: any) => s.app?.name).filter(Boolean))] as string[];
```

Replace with:
```typescript
const rawSystemen = [...new Set((zap.steps || []).map((s: any) => s.app?.name).filter(Boolean))] as string[];
const systemen = Array.from(new Set(["Zapier", ...rawSystemen]));
```

- [ ] **Step 2: Remove the fallback in the upsert (line ~81)**

Find the line in the upsert object that looks like:
```typescript
systemen: systemen.length ? systemen : ["Zapier"],
```

Replace with:
```typescript
systemen: systemen,
```

The fallback is no longer needed because `systemen` always contains at least `"Zapier"` after Step 1.

- [ ] **Step 3: Verify no other systemen assignments remain**

```bash
grep -n "systemen" supabase/functions/zapier-sync/index.ts
```

Expected: the two lines you changed, plus any upsert references — none should have the old fallback pattern anymore.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/zapier-sync/index.ts
git commit -m "feat: always prepend Zapier to systemen in zapier-sync"
```

---

## Task 4: GitLab sync — guarantee "GitLab" in systemen

**Files:**
- Modify: `supabase/functions/gitlab-sync/index.ts`

- [ ] **Step 1: Add the systemen variable after Gemini parse (around line 291)**

In `supabase/functions/gitlab-sync/index.ts`, find this line (around line 291):
```typescript
const metadata = await extractMetadata(filename, content, GEMINI_API_KEY);
```

Add a new line immediately after it:
```typescript
const metadata = await extractMetadata(filename, content, GEMINI_API_KEY);
const systemen = Array.from(new Set(["GitLab", ...(metadata.systemen ?? [])]));
```

- [ ] **Step 2: Replace `metadata.systemen` in the UPDATE block (around line 302)**

Find inside the `.update({...})` call:
```typescript
systemen:             metadata.systemen,
```

Replace with:
```typescript
systemen:             systemen,
```

- [ ] **Step 3: Replace `metadata.systemen` in the INSERT block (around line 318)**

Find inside the `.insert({...})` call:
```typescript
systemen:             metadata.systemen,
```

Replace with:
```typescript
systemen:             systemen,
```

- [ ] **Step 4: Verify both occurrences are replaced**

```bash
grep -n "metadata.systemen" supabase/functions/gitlab-sync/index.ts
```

Expected: no matches (all replaced with `systemen`).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/gitlab-sync/index.ts
git commit -m "feat: always prepend GitLab to systemen in gitlab-sync"
```

---

## Task 5: Backfill migration

**Files:**
- Create: `supabase/migrations/20260415130000_backfill_source_tags.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260415130000_backfill_source_tags.sql
-- Backfill: voeg source tag toe als eerste item aan bestaande imports
-- Idempotent: records die de tag al hebben worden niet aangeraakt

UPDATE automatiseringen
SET systemen = (to_jsonb(ARRAY['HubSpot']) || systemen::jsonb)
WHERE source = 'hubspot'
  AND NOT (systemen::jsonb @> '["HubSpot"]'::jsonb);

UPDATE automatiseringen
SET systemen = (to_jsonb(ARRAY['Zapier']) || systemen::jsonb)
WHERE source = 'zapier'
  AND NOT (systemen::jsonb @> '["Zapier"]'::jsonb);

UPDATE automatiseringen
SET systemen = (to_jsonb(ARRAY['GitLab']) || systemen::jsonb)
WHERE source = 'gitlab'
  AND NOT (systemen::jsonb @> '["GitLab"]'::jsonb);
```

- [ ] **Step 2: Push the migration to the hosted project**

```bash
npx supabase db push --linked
```

Expected: `Applying migration 20260415130000_backfill_source_tags.sql...` with no errors.

- [ ] **Step 3: Verify the backfill ran correctly**

In the Supabase SQL editor (https://supabase.com/dashboard/project/icvrrpxtycwgaxcajwdf/editor), run:

```sql
-- Check HubSpot records have the tag
SELECT id, naam, systemen
FROM automatiseringen
WHERE source = 'hubspot'
LIMIT 5;

-- Check no source='hubspot' record is missing the tag
SELECT COUNT(*)
FROM automatiseringen
WHERE source = 'hubspot'
  AND NOT (systemen::jsonb @> '["HubSpot"]'::jsonb);
```

Expected for second query: `0` (all HubSpot records have the tag).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260415130000_backfill_source_tags.sql
git commit -m "feat: backfill source tags into systemen for existing imports"
```

---

## Task 6: Deploy edge functions

**Files:** (no code changes — just deployment)

- [ ] **Step 1: Deploy all three updated edge functions**

```bash
npx supabase functions deploy hubspot-sync --project-ref icvrrpxtycwgaxcajwdf --no-verify-jwt
npx supabase functions deploy zapier-sync --project-ref icvrrpxtycwgaxcajwdf --no-verify-jwt
npx supabase functions deploy gitlab-sync --project-ref icvrrpxtycwgaxcajwdf --no-verify-jwt
```

Expected: `Deployed Function hubspot-sync` (same for the others) with no errors.

- [ ] **Step 2: Trigger a test sync for each connected integration**

If HubSpot is connected: go to Instellingen → Externe systemen → HubSpot → klik "Sync". Check a newly synced automation — `systemen` must contain `"HubSpot"`.

If Zapier is connected: same for Zapier — check that `"Zapier"` is first in `systemen`.

If GitLab is connected: same for GitLab — check that `"GitLab"` is first in `systemen`.

Verify in Supabase SQL editor:
```sql
SELECT id, naam, systemen, source
FROM automatiseringen
WHERE source IS NOT NULL
ORDER BY last_synced_at DESC
LIMIT 10;
```

Expected: every row with `source = 'hubspot'` has `systemen[0] = 'HubSpot'`, etc.
