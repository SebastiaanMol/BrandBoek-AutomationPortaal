# Codebase Concerns
_Last updated: 2026-03-30_

## Tech Debt

### Duplicated Pure Logic Between Source and Tests

- **Issue:** `toCanvasAutomation`, `FASE_TO_TEAM`, `applyAttach`, `applyDetach`, and `mergeAutoLinks` are copy-pasted verbatim from `src/pages/Processen.tsx` into `src/test/processCanvas.test.ts`. The test file includes an explicit "Keep in sync" warning at line 22.
- **Files:** `src/pages/Processen.tsx` (lines 33–51), `src/test/processCanvas.test.ts` (lines 24–119)
- **Impact:** Any change to these functions in `Processen.tsx` silently breaks test validity without a TypeScript/lint error. The duplication also means the test cannot catch regressions introduced by real imports.
- **Fix approach:** Extract pure functions into `src/lib/processCanvas.ts`, export them, import in both `Processen.tsx` and the test file. This is documented as deferred beyond Phase 1.

### localStorage Storage Layer Is Orphaned

- **Issue:** `src/lib/storage.ts` implements a full localStorage-based CRUD layer (`getAutomatiseringen`, `saveAutomatisering`, `updateAutomatisering`, `generateId`, `exportToCSV`) with seed data. No file in `src/` imports from `src/lib/storage`.
- **Files:** `src/lib/storage.ts`
- **Impact:** Dead code of ~139 lines. The actual data layer is `src/lib/supabaseStorage.ts` (called via `src/lib/hooks.ts`). The localStorage layer can cause confusion about where to add new storage logic.
- **Fix approach:** Delete `src/lib/storage.ts`. The seed data in it is no longer needed since data lives in Supabase.

### Commented-Out Navigation Items Remain in Source

- **Issue:** Four nav entries are commented out in `src/components/AppLayout.tsx` (lines 26–29): Mindmap (`/mindmap`), Kennisgraaf (`/kennisgraaf`), BPMN Viewer (`/bpmn`), and Proceskaart (`/proceskaart`). The corresponding routes and page files still exist and are imported in `App.tsx`.
- **Files:** `src/components/AppLayout.tsx` (lines 26–29), `src/App.tsx` (lines 14–19), `src/pages/Mindmap.tsx`, `src/pages/KennisGraaf.tsx`, `src/pages/KennisGraaf3D.tsx`, `src/pages/BPMNViewer.tsx`, `src/pages/Proceskaart.tsx`
- **Impact:** These pages are reachable by direct URL but hidden from navigation. `KennisGraaf.tsx` is 1,625 lines; `KennisGraaf3D.tsx` is 471 lines. These are bundled into the production build even if unused.
- **Fix approach:** Decide whether these features are intended to be active. If not, remove routes from `App.tsx` and delete the page files. If they are kept for later, leave them but document their status explicitly.

### `supabase as any` Type Bypass in Multiple Files

- **Issue:** The `process_state` table was added to the database via migration (`supabase/migrations/20260325120000_process_state.sql`) but was NOT regenerated into `src/integrations/supabase/types.ts`. This forces casts of `supabase as any` to query the table without TypeScript errors.
- **Files:**
  - `src/lib/supabaseStorage.ts` (lines 254–255): `const db = supabase as any;` used for `fetchProcessState` and `saveProcessState`
  - `src/components/process/BranchEditorDialog.tsx` (line 63): `(supabase as any).from(...)`
  - `src/pages/Imports.tsx` (lines 58, 68, 80, 88): `(supabase as any).from(...)` for `import_status`, `import_proposal`, `branches`, `approved_by` columns
- **Impact:** No TypeScript type safety on these DB queries. Typos in column names or wrong field types fail silently at runtime. The `Imports.tsx` file also queries columns (`import_status`, `import_proposal`, `branches`, `approved_by`) that are absent from `types.ts`, suggesting the generated types are significantly out of date.
- **Fix approach:** Run `supabase gen types typescript` to regenerate `src/integrations/supabase/types.ts` from the current database schema. Remove all `as any` casts once types are current.

### jsPDF Loaded from CDN at Runtime

- **Issue:** The PDF export function in `src/pages/Processen.tsx` loads jsPDF from `cdnjs.cloudflare.com` via a dynamically injected `<script>` tag at the moment the user clicks "Export PDF". There is no npm dependency; it is not part of the build.
- **Files:** `src/pages/Processen.tsx` (lines 229–237)
- **Impact:** Export fails if the CDN is unavailable or blocked. The `window.jspdf` property is typed as `any`. There is no integrity hash on the script tag (no subresource integrity).
- **Fix approach:** Add `jspdf` as a proper npm dependency and import it statically, or use dynamic `import()` for code splitting.

### `exportToCSV` Defined in Two Files

- **Issue:** The identical `exportToCSV` function is defined in both `src/lib/storage.ts` (line 131) and `src/lib/supabaseStorage.ts` (line 292). The version in `storage.ts` is dead code, but both implementations are byte-for-byte identical.
- **Files:** `src/lib/storage.ts` (line 131), `src/lib/supabaseStorage.ts` (line 292)
- **Impact:** Resolved by deleting `storage.ts` (see above). No action needed on `supabaseStorage.ts`.
- **Fix approach:** Delete `storage.ts`. The live version in `supabaseStorage.ts` is the one called by `src/pages/AlleAutomatiseringen.tsx`.

## Security Considerations

### RLS Policy on `process_state` Is Fully Open

- **Risk:** The migration `supabase/migrations/20260325120000_process_state.sql` creates a Row Level Security policy on `process_state` with `USING (true) WITH CHECK (true)` — any authenticated or unauthenticated user can read and write the single shared canvas state.
- **Files:** `supabase/migrations/20260325120000_process_state.sql`
- **Current mitigation:** None. The table uses a hardcoded single-row key `"main"`, making it effectively a globally shared mutable resource.
- **Recommendation:** If multi-user access is ever added, restrict the policy to authenticated users at minimum. For now, document that this is a single-tenant shortcut.

### Integration Tokens Stored in Supabase Without Encryption

- **Risk:** HubSpot, Zapier, and Typeform API tokens are stored as plain text in the `integrations` table (`token` column). The `saveIntegration` function in `src/lib/supabaseStorage.ts` writes them directly.
- **Files:** `src/lib/supabaseStorage.ts` (line 196), `supabase/migrations/20260323120000_hubspot_integration.sql`
- **Current mitigation:** Row Level Security restricts access to the token owner's `user_id`.
- **Recommendation:** Consider Supabase Vault for secrets storage if the threat model requires it.

## Performance Bottlenecks

### `fetchAutomatiseringen` Makes Two Sequential Network Requests

- **Problem:** `fetchAutomatiseringen` in `src/lib/supabaseStorage.ts` first fetches all rows from `automatiseringen`, then fetches all rows from `koppelingen` in a second sequential call. Both calls use `select("*")` with no pagination.
- **Files:** `src/lib/supabaseStorage.ts` (lines 20–62)
- **Cause:** Supabase JS client does not support join queries with the same simplicity as a SQL join on the client side. The two-query approach was chosen for simplicity.
- **Improvement path:** Use a Supabase view that joins the two tables, or use `supabase.from("automatiseringen").select("*, koppelingen(*)")` with the foreign key relationship. For large datasets, add pagination.

### `KennisGraaf.tsx` Is 1,625 Lines

- **Problem:** `src/pages/KennisGraaf.tsx` is a 1,625-line monolithic component combining force-graph rendering, 3D canvas, filtering, and UI state. It is unconditionally imported in `App.tsx` even though its nav link is commented out.
- **Files:** `src/pages/KennisGraaf.tsx`, `src/App.tsx`
- **Cause:** The component was never broken up as it grew.
- **Improvement path:** If this feature is kept, split into sub-components and use `React.lazy()` for code splitting. If it is removed, delete the file and its route.

## Fragile Areas

### `mergeAutoLinks` Race Condition Between Two `useEffect` Calls

- **Files:** `src/pages/Processen.tsx` (lines 63–97)
- **Why fragile:** Canvas load uses two sequential effects. The first (`fetchProcessState`) stores saved links in `savedLinksRef.current`. The second (`dbAutomations` effect) reads from that ref to merge links. If `dbAutomations` resolves before `fetchProcessState` completes (a real possibility), `savedLinksRef.current` will be empty and all automation-to-step links will be lost on load. This is the known bug that PROC-03 tests document.
- **Safe modification:** Do not change the order or dependency arrays of these effects without running the PROC-03 tests. Any fix must ensure `savedLinksRef.current` is populated before the automations effect runs.
- **Test coverage:** PROC-03 in `src/test/processCanvas.test.ts` covers the merge logic in isolation. The race itself is not covered by any automated test.

### Single-Row `process_state` Table (No Versioning)

- **Files:** `src/lib/supabaseStorage.ts` (lines 246–289), `supabase/migrations/20260325120000_process_state.sql`
- **Why fragile:** The entire canvas state (steps, connections, autoLinks) is stored as a single JSON blob in one row keyed by `"main"`. A failed partial save (e.g., network drop mid-upsert) could leave the canvas in an inconsistent state with no rollback.
- **Safe modification:** The `saveProcessState` function in `supabaseStorage.ts` is the only write path. Do not split writes across multiple calls without wrapping in a transaction.
- **Test coverage:** None.

### `generateId` in `storage.ts` Has a Collision Risk

- **Files:** `src/lib/storage.ts` (lines 125–129)
- **Why fragile:** `generateId` is dead code (no callers), but the live `generateNextId` in `supabaseStorage.ts` falls back to `count + 1` if the `generate_auto_id` RPC fails (line 163–166). A concurrent insert between the count query and the insert will produce a duplicate ID.
- **Safe modification:** This only matters if the RPC is unavailable. The Supabase RPC (`generate_auto_id`) is the correct path and should always be available in production.

## Test Coverage Gaps

### No Tests for Supabase Storage Layer

- **What's not tested:** `fetchAutomatiseringen`, `insertAutomatisering`, `updateAutomatisering`, `deleteAutomatisering`, `fetchProcessState`, `saveProcessState`, `verifieerAutomatisering`, `generateNextId` in `src/lib/supabaseStorage.ts`
- **Files:** `src/lib/supabaseStorage.ts` (all 300 lines)
- **Risk:** Breakage in the DB column mapping (e.g., `trigger_beschrijving` → `trigger`) would only surface at runtime. The PROC-04 test documents the mapping contract but does not test the actual fetch.
- **Priority:** High

### No Tests for React Hooks

- **What's not tested:** All hooks in `src/lib/hooks.ts` — `useAutomatiseringen`, `useSaveAutomatisering`, `useUpdateAutomatisering`, etc.
- **Files:** `src/lib/hooks.ts`
- **Risk:** Query key mismatches or cache invalidation bugs are invisible.
- **Priority:** Medium

### No Tests for Component Rendering

- **What's not tested:** All components under `src/components/` and all pages under `src/pages/`
- **Risk:** UI regressions, especially in `ProcessCanvas.tsx` (933 lines) and `AIUpload.tsx` (758 lines), are caught only manually.
- **Priority:** Medium

### No Tests for `evaluateAutomation.ts` or Graph Analysis Utilities

- **What's not tested:** `src/lib/evaluateAutomation.ts`, `src/lib/graphAnalysis.ts`, `src/lib/graphProblems.ts`, `src/lib/domainGraph.ts`
- **Files:** Listed above
- **Risk:** These are pure functions that would be straightforward to unit test; lack of tests means scoring/analysis regressions go undetected.
- **Priority:** Low

## Missing Critical Features

### No Error Boundary in App

- **Problem:** No React error boundary wraps any route or subtree in `App.tsx`. An unhandled render error in any page component will crash the entire app with a blank white screen.
- **Files:** `src/App.tsx`
- **Blocks:** Nothing currently, but any future component error becomes a full app crash.

### No Loading/Error State for `fetchProcessState` Failure

- **Problem:** In `src/pages/Processen.tsx` (line 81), a `fetchProcessState` failure is caught and logged to `console.error` but the UI shows no error message. The canvas silently loads with default empty state.
- **Files:** `src/pages/Processen.tsx` (lines 63–83)
- **Risk:** Users cannot distinguish between "no saved state" and "load failed". Any canvas edits saved after a silent load failure will overwrite a previous saved state.

---

*Concerns audit: 2026-03-30*
