# GitLab Sync as Automation Source — Design Spec

**Date:** 2026-04-14
**Status:** Approved

---

## Goal

Replace the current manual GitLab path-per-automation approach with a full automatic sync: press "Nu synchroniseren" on the GitLab integration card → edge function scans the `app/` directory in the configured GitLab repo → creates/updates automation records from each Python file using AI-extracted metadata. GitLab becomes a proper sync source alongside HubSpot, Zapier, and Typeform.

---

## Architecture

A new Supabase Edge Function `gitlab-sync` follows the exact same pattern as `hubspot-sync`, `zapier-sync`, and `typeform-sync`. The frontend replaces the custom `GitLabCard` with the standard `IntegrationCard` component (same connect/sync/disconnect flow). The manual `gitlabFilePath` field is removed from the edit form since file discovery is now automatic.

---

## Components

### 1. Edge Function: `supabase/functions/gitlab-sync/index.ts`

**Runtime:** Deno. Uses `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` and `Deno.env.get("GEMINI_API_KEY")`.

**Flow:**
1. Read `integrations` row where `type = 'gitlab'` using service role key
2. Parse `token` field as JSON: `{ pat, projectId, branch }`
3. Call GitLab Tree API to list all files under `app/`:
   ```
   GET https://gitlab.com/api/v4/projects/{projectId}/repository/tree
       ?path=app&recursive=true&per_page=100&ref={branch}
   Authorization: Bearer {pat}
   ```
4. Filter to `.py` files only; skip infrastructure patterns (see below)
5. For each file: fetch raw content via GitLab Files API, send to Gemini for metadata extraction
6. Upsert each result into `automatiseringen` on `(source='gitlab', external_id=file_path)`
   - New records: call `generate_auto_id` RPC for ID, set `import_status = null` (auto-approved, no review queue)
   - Existing records: update naam, doel, trigger, stappen, systemen, fasen, last_synced_at
7. Deactivate (set `status = 'Inactief'`) any `source='gitlab'` records whose `external_id` is not in current scan
8. Update `integrations` row: `last_synced_at = now()`, `status = 'connected'`
9. Return `{ inserted, updated, deactivated, total }`

**Skip rules (infrastructure, not automations):**
- Any file named `__init__.py`
- Root-level `app/` files: `main.py`, `auth.py`, `constants.py`, `exceptions.py`, `logging_config.py`, `hubspot_client.py`
- Any file whose path contains `/repository/` or `/schemas/`

**Fasen mapping** (keyed on immediate parent directory name of the file):
| Directory | Fasen |
|---|---|
| `API` | `["Sales"]` |
| `clockify` | `["Onboarding"]` |
| `kvk` | `["Onboarding"]` |
| `operations` | `["Boekhouding"]` |
| `va_pipelines` | `["Boekhouding"]` |
| `properties` | `["Boekhouding"]` |
| (unknown) | `[]` |

**Gemini prompt** (gemini-2.5-flash, same model as other edge functions):
```
Je bent een technische assistent. Analyseer dit Python automatiseringsscript en geef een JSON-object terug met precies deze velden:
- naam: korte Nederlandse naam voor de automatisering (max 60 tekens)
- doel: één zin in het Nederlands — wat bereikt dit script?
- trigger: wat start deze automatisering? (bijv. "API endpoint POST /sales/leads", "webhook", "handmatig")
- stappen: array van 3-6 stappen in het Nederlands die beschrijven hoe het script werkt
- systemen: array van externe systemen die worden gebruikt (bijv. ["HubSpot", "Clockify", "KvK"])

Geef ALLEEN geldige JSON terug, geen uitleg.

Script bestandsnaam: {filename}
Script inhoud:
{content}
```

**Error handling:** Each file processed independently — one failure does not abort the sync. Failures are counted and logged to `console.warn`. The function still returns success with partial results.

**Pagination:** GitLab Tree API returns max 100 items per page. The function follows `X-Next-Page` headers until all pages are fetched.

---

### 2. Frontend: `src/pages/Instellingen.tsx`

**Change:** Replace `GitLabCard` (custom component with PAT/projectId/branch form) with `IntegrationCard` (standard component used by HubSpot/Zapier/Typeform).

The `IntegrationCard` needs a small extension: its `tokenLabel`/`tokenPlaceholder`/`tokenHint` props handle single-token integrations. GitLab needs three fields (PAT, project ID, branch). Two options:
- **Option A:** Keep a slim `GitLabCard` only for the connect form (3 fields → JSON-encoded token), but use the standard sync/disconnect buttons from `IntegrationCard` logic
- **Option B:** Extend `IntegrationCard` to accept optional extra fields

**Decision:** Keep `GitLabCard` for the connect form only (it's already written and correct). After connecting, the card shows the same sync/disconnect buttons as other integrations. The `GitLabCard` component itself is simplified to remove the custom sync loop (replaced by `invokeEdgeFunction("gitlab-sync")`).

---

### 3. `src/lib/hooks.ts`

**Change:** Replace `useGitlabSync` body with a simple `invokeEdgeFunction("gitlab-sync")` call, identical to `useHubSpotSync`.

**Before:**
```typescript
export function useGitlabSync() {
  return useMutation({
    mutationFn: async () => {
      // ... 40 lines of client-side loop fetching files and calling AI
    }
  });
}
```

**After:**
```typescript
export function useGitlabSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerGitlabSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automatiseringen"] });
      queryClient.invalidateQueries({ queryKey: ["integration", "gitlab"] });
    },
  });
}
```

---

### 4. `src/lib/supabaseStorage.ts`

**Add:** `triggerGitlabSync` function (calls `invokeEdgeFunction("gitlab-sync")`).

**Remove:** `updateGitlabData` function (no longer needed — the edge function handles all GitLab data writes directly via service role).

---

### 5. `src/components/AutomatiseringForm.tsx`

**Remove:** The "GitLab bestandspad" field and `gitlabFilePath` from form state/submit. File paths are now discovered automatically.

---

### 6. `src/lib/gitlabService.ts` and `src/lib/codeReaderService.ts`

**Remove:** Both files. The GitLab file fetching and AI description generation move entirely to the edge function. No client-side GitLab API calls remain.

---

## Data Model

No new DB columns needed. The sync reuses existing fields:

| Column | Value for GitLab records |
|---|---|
| `source` | `'gitlab'` |
| `external_id` | File path, e.g. `app/service/operations/deal_creation.py` |
| `naam` | AI-extracted |
| `doel` | AI-extracted |
| `trigger_beschrijving` | AI-extracted |
| `stappen` | AI-extracted |
| `systemen` | AI-extracted |
| `fasen` | From submap lookup table |
| `categorie` | `'Backend Script'` |
| `status` | `'Actief'` (new) or preserved (existing) |
| `import_status` | `null` (auto-approved, no review queue) |
| `last_synced_at` | Set on each sync |
| `gitlab_file_path` | Same as `external_id` (kept for reference) |

---

## What Is Not Changed

- The connect form in `GitLabCard` (PAT + project ID + branch stored as JSON in `integrations.token`) — already works correctly
- The `integrations` table schema
- How the GitLab badge and AI description are displayed on automation cards (`src/components/Badges.tsx`, `src/pages/AlleAutomatiseringen.tsx`) — those read `source` and `aiDescription` which still get populated
- The `ai_description` / `gitlab_last_commit` columns can remain in the DB but will no longer be written by this sync flow (the Gemini extraction goes into `doel` and `stappen` instead of a separate `ai_description` field)

---

## Testing

Manual acceptance test:
1. Connect GitLab integration with a valid PAT + project ID + branch
2. Press "Nu synchroniseren"
3. Verify automations appear in the list with `source = 'gitlab'`
4. Verify `naam`, `doel`, `stappen`, `systemen` are populated from Gemini
5. Verify `fasen` match the submap table
6. Remove a file from the repo, sync again → that automation gets `status = 'Inactief'`
7. Disconnect GitLab → integration removed, existing records stay in DB
