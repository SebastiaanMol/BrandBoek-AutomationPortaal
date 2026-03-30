# Phase 2: Data Completeness - Research

**Researched:** 2026-03-31
**Domain:** React / TypeScript — ProposalCard UI extension, Supabase Edge Function (Deno/TypeScript), completeness gate logic
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Fasen suggestion belongs in the edge function (TypeScript, keyword-based). Python backend is not deployed (BACK-01 is Phase 5); do NOT design an edge-function-to-backend call. Implement keyword-based fasen inference in `hubspot-sync/index.ts`.
- **D-02:** ProposalCard expand view (`Imports.tsx`) must add a `fasen` multi-select field alongside existing editable fields. Five KlantFase values: Marketing, Sales, Onboarding, Boekhouding, Offboarding.
- **D-03:** Approve button is hard-blocked when `fasen` is empty (button disabled).
- **D-04:** Add a free-text `owner` input field to the ProposalCard expand view, consistent with existing editing pattern.
- **D-05:** Owner is advisory only — no hard block. Show `⚠ invullen` ConfBadge when owner is empty; reviewer can approve without it.
- **D-06:** When `stappen` is empty, show a confirmation dialog before approving (warn-but-allow).
- **D-07:** Hard block from D-03: `fasen` empty → Approve button disabled.
- **D-08:** Enforcement matrix: `fasen` empty → hard block; `stappen` empty → warning dialog; `owner` empty → advisory ConfBadge; `trigger_beschrijving` empty → existing ConfBadge; `systemen` empty → advisory.
- **D-09:** Audit first — verify `triggerHubSpotSync()` → edge function → `pending_approval` queue works with a real HubSpot token before modifying the flow.
- **D-10:** `updateField()` in `Imports.tsx` already handles patching. Extend it to support `fasen` (array) and `owner` (string) — no new mutation pattern.

### Claude's Discretion

- Exact UI component for fasen multi-select — use existing shadcn/ui components (Checkbox list, ToggleGroup, or Badge-style toggles). Match ProposalCard field grid visual style.
- Wording of the warning dialog for missing `stappen` — Dutch, consistent with existing toast/dialog patterns.
- Whether to show a count badge on the Imports sidebar nav item when pending_approval count > 0 (nice-to-have, decide if trivial).

### Deferred Ideas (OUT OF SCOPE)

- Manual entry tracking for non-HubSpot automations — existing `NieuweAutomatiseringPage.tsx` covers this; no new work.
- Zapier and Typeform sync — v2 requirements.
- Batch approve/reject — not in requirements.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | All Brand Boekhouders automations are entered in the portal (manually or via HubSpot import) | HubSpot sync pipeline is functional end-to-end (see Architecture §Import Pipeline). Manual entry path already exists via NieuweAutomatiseringPage.tsx. No new work for non-HubSpot manual entry. |
| DATA-02 | HubSpot import flow works end-to-end (sync → confidence review → approve/reject → save to DB) | Full pipeline is already wired: `triggerHubSpotSync()` → `hubspot-sync` edge function → `automatiseringen` with `import_status: "pending_approval"` → `Imports.tsx` ProposalCard approve/reject. The gap is the missing `fasen` and `owner` fields. D-09 audit gates on this. |
| DATA-03 | Imported automations have correct and complete fields (trigger, steps, systems, phase, owner) | Requires: (a) fasen keyword inference in edge function, (b) fasen + owner editable in ProposalCard, (c) completeness gate at approval per D-08 enforcement matrix. All patterns identified. |
</phase_requirements>

---

## Summary

Phase 2 is an extension of existing code, not greenfield. The HubSpot sync pipeline already runs end-to-end: `triggerHubSpotSync()` → `hubspot-sync` Supabase Edge Function → `automatiseringen` table with `import_status: "pending_approval"` → `Imports.tsx` ProposalCard review UI. The Phase 1 work confirmed the edge function deploys and the UI renders proposals.

The two gaps are: (1) the edge function hardcodes `fasen: []` and `owner: ""` on insert — the edge function must be extended with keyword-based fasen inference from the workflow name/category; (2) the `ProposalCard` component does not expose `fasen` or `owner` as editable fields, and the approve action has no completeness gate.

**Critical finding — schema drift:** The `import_status`, `import_proposal`, `branches`, `approved_by`, `rejection_reason`, and `raw_payload` columns that the edge function reads and writes are NOT present in any migration file and are NOT in the auto-generated `src/integrations/supabase/types.ts`. The code works because `Imports.tsx` uses `(supabase as any)` to bypass type checking. This is the established project pattern for import-related columns. No Supabase migration is needed in Phase 2 — `fasen` and `owner` columns already exist in the base schema.

**Primary recommendation:** Implement three focused changes: (1) add `inferFasen(wf)` function in `hubspot-sync/index.ts`; (2) extend `ProposalCard` `draft` state, `handleSave()`, and the field grid to include `fasen` multi-select and `owner` text input; (3) add fasen-empty hard block and stappen-empty warning dialog to the Approve button.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React + TypeScript | 18 / 5 | UI components | Project baseline |
| @tanstack/react-query | 5 | Server state, mutations | Already used in Imports.tsx (`useMutation`, `useQuery`, `useQueryClient`) |
| shadcn/ui (Dialog, Badge, Button, Input) | latest | UI primitives | Project standard; Dialog already imported in Imports.tsx |
| sonner (toast) | latest | Feedback toasts | Already used: `toast.success()` / `toast.error()` |
| Supabase JS client | 2 | DB access | Project baseline |
| Deno (Edge Function runtime) | 1.x | Edge function host | hubspot-sync runs on Deno via Supabase |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | latest | Icons (CheckCircle2, XCircle, etc.) | Icon additions to new fields |
| @/components/ui/badge | — | Badge-style fasen toggle | Candidate for fasen multi-select if ToggleGroup is overkill |

**No new dependencies required.** All needed components are already installed.

**Installation:**
```bash
# No new packages needed — all components already present.
# If shadcn component is needed: npx shadcn@latest add toggle-group --legacy-peer-deps
```

---

## Architecture Patterns

### Recommended Project Structure

No structural changes needed. All work is confined to:
```
src/pages/Imports.tsx                   # ProposalCard UI extensions
supabase/functions/hubspot-sync/index.ts # inferFasen() + edge function insert patch
```

### Pattern 1: ProposalCard Draft State Extension

**What:** Extend `draft` state to include `fasen: string[]` and `owner: string`. Follow the existing inline-editing pattern already used for `naam`, `doel`, `trigger`, `categorie`.

**When to use:** Adding `fasen` and `owner` as editable fields.

**Existing pattern (reference — DO NOT copy verbatim):**
```typescript
// Source: src/pages/Imports.tsx, lines 214-218
const [draft, setDraft] = useState({
  naam: item.naam,
  doel: item.doel,
  trigger,
  categorie: item.categorie,
  // ADD: fasen: item.fasen ?? [],
  // ADD: owner: item.owner ?? "",
});
```

The `PendingAutomation` interface must also be extended to include `fasen: string[]` and `owner: string` so that `item.fasen` and `item.owner` are available in ProposalCard.

### Pattern 2: updateField() Extension

**What:** `updateField()` already does `supabase.update(patch).eq("id", id)`. No changes needed to the function itself — just call it with `fasen` and `owner` in the patch object when saving.

**Current handleSave (reference):**
```typescript
// Source: src/pages/Imports.tsx, lines 235-252
await updateField(item.id, {
  naam: draft.naam,
  doel: draft.doel,
  trigger_beschrijving: draft.trigger,
  categorie: draft.categorie,
  // ADD: fasen: draft.fasen,
  // ADD: owner: draft.owner,
});
```

### Pattern 3: Fasen Multi-Select

**What:** The `KLANT_FASEN` constant (`["Marketing", "Sales", "Onboarding", "Boekhouding", "Offboarding"]`) is the source of truth for the 5 options. Render as toggleable badges — click to add/remove from `draft.fasen`.

**Recommended implementation (Badge-style toggles):**
```typescript
// No new shadcn component needed — use existing Badge + conditional styling
{KLANT_FASEN.map(fase => (
  <button
    key={fase}
    type="button"
    onClick={() => setDraft(d => ({
      ...d,
      fasen: d.fasen.includes(fase)
        ? d.fasen.filter(f => f !== fase)
        : [...d.fasen, fase],
    }))}
    className={cn(
      "text-xs px-2 py-0.5 rounded-full border transition-colors",
      draft.fasen.includes(fase)
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-secondary text-muted-foreground border-border hover:border-primary/50",
    )}
  >
    {fase}
  </button>
))}
```

The read-only display (when not editing) should render the same badge style as `systemen` — using `<Badge variant="secondary">`.

### Pattern 4: Hard Block on Approve

**What:** Disable the Approve button when `fasen` is empty. Add a short helper text beneath the button.

**Implementation:**
```typescript
// Source pattern from CONTEXT.md §specifics
disabled={approve.isPending || (item.fasen?.length === 0 && draft.fasen.length === 0)}
```

Important nuance: the block must check the CURRENT saved value (`item.fasen`) not just draft, because the reviewer may not have expanded/edited the card. The saved value on the DB row is what matters for blocking. Draft `fasen` is only relevant after a save. Use `item.fasen?.length === 0` — this is what is in the DB.

After a save, `qc.invalidateQueries({ queryKey: ["pending"] })` re-fetches, so `item` reflects the updated value.

### Pattern 5: Stappen Warning Dialog

**What:** Reuse the existing `Dialog` component (already imported) for a confirmation dialog when approving with zero `stappen`.

**Logic:**
```typescript
// Instead of calling approve.mutate() directly:
function handleApproveClick() {
  if (item.stappen?.length === 0) {
    setStappenWarnOpen(true);
    return;
  }
  approve.mutate();
}
```

Dialog content (Dutch):
```
Title: "Geen stappen gevonden"
Body: "Deze automatisering heeft nog geen stappen. Wil je toch goedkeuren?"
Buttons: "Annuleren" | "Toch goedkeuren"
```

### Pattern 6: Keyword-Based Fasen Inference in Edge Function

**What:** Add `inferFasen(wf: any): string[]` to `hubspot-sync/index.ts`. Uses workflow name and inferred category to map to `KlantFase[]`. Called in `mapWorkflow()`. Stored in `fasen` field on insert (currently hardcoded to `[]`).

**Keyword mapping approach:**
```typescript
// Suggested keyword rules for inferFasen(wf)
const NAAM = (wf.name ?? "").toLowerCase();
const fasen: string[] = [];

if (/onboarding|welkom|welcome|intake|aanmeld/i.test(NAAM)) fasen.push("Onboarding");
if (/marketing|nieuwsbrief|newsletter|lead|campagne|campaign/i.test(NAAM)) fasen.push("Marketing");
if (/sales|offerte|quote|deal|pipeline/i.test(NAAM)) fasen.push("Sales");
if (/boekhoud|factuur|invoice|betaling|payment|wefact/i.test(NAAM)) fasen.push("Boekhouding");
if (/offboard|opzegg|churn|verloop|exit/i.test(NAAM)) fasen.push("Offboarding");

return fasen; // empty array = low confidence → reviewer must assign
```

Confidence for `fasen` in `import_proposal.confidence`:
- `fasen.length > 0` → `"medium"` (keyword match, not verified)
- `fasen.length === 0` → `"low"` (reviewer must fill)

The edge function's existing `mapWorkflow()` function returns a confidence object — add a `fasen` key to it. The `ProposalCard` can then pass `conf={conf.fasen}` to the `Field` component for the fasen field.

### Anti-Patterns to Avoid

- **Calling the Python backend for fasen suggestion:** Backend is not deployed (BACK-01 = Phase 5). Do not design an HTTP call to `localhost:8000` or any backend URL from the edge function. Use keyword inference in TypeScript only.
- **Using `(supabase as any)` for new fields that ARE in the schema:** `fasen` and `owner` are in the auto-generated types — use typed Supabase client for these. Only use `as any` for the import-related columns that are not in `types.ts` (the established pattern).
- **Checking `draft.fasen` for the hard block:** The hard block must check `item.fasen` (the DB-persisted value), not the draft. Draft is unsaved state.
- **Adding ToggleGroup shadcn component without legacy-peer-deps flag:** If toggling to a shadcn component, always: `npx shadcn@latest add toggle-group --legacy-peer-deps`.
- **Manually editing `src/components/ui/` files:** Project rule — never edit shadcn component files directly.
- **Adding `fetchPending()` select without including `fasen` and `owner`:** Currently the select query at line 60 does NOT include `fasen` or `owner`. Must add them so ProposalCard receives the current values.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dialog for confirmation | Custom modal | shadcn `Dialog` (already imported in Imports.tsx line 9) | Already present, established project pattern |
| Toast feedback | Custom notification | `toast.success()` / `toast.error()` from `sonner` | Already used throughout Imports.tsx |
| Array field update via Supabase | Custom REST call | `updateField(id, { fasen: [...] })` | `updateField()` already handles any patch object; Supabase JS handles array types |
| Fasen type safety | New type | `KlantFase[]` from `src/lib/types.ts`, `KLANT_FASEN` constant | Both already defined and correct |

**Key insight:** Every infrastructure piece is already present. This phase is 100% extension work — no new architecture, no new dependencies.

---

## Critical Finding: Schema Drift

The `automatiseringen` table in the live Supabase database has columns that are NOT reflected in the migration files or the auto-generated `types.ts`:

| Column | Status | Notes |
|--------|--------|-------|
| `import_status` | In DB, not in migrations/types | Edge function writes it; Imports.tsx reads it via `as any` |
| `import_proposal` | In DB, not in migrations/types | JSONB column storing confidence + proposal data |
| `branches` | In DB, not in migrations/types | JSONB; edge function writes it |
| `approved_by` | In DB, not in migrations/types | Written by approveAutomation() |
| `approved_at` | In DB, not in migrations/types | Written by approveAutomation() |
| `rejection_reason` | In DB, not in migrations/types | Written by rejectAutomation() |
| `raw_payload` | In DB, not in migrations/types | Written by edge function |
| `import_source` | In DB, not in migrations/types | Read by fetchPending() |
| `fasen` | In DB **and** in migrations/types | Safe to use typed |
| `owner` | In DB **and** in migrations/types | Safe to use typed |

**Action for planner:** No migration is needed for Phase 2. `fasen` and `owner` already exist. The plan should use typed Supabase calls for `fasen`/`owner`. For all `import_*` columns continue using `(supabase as any)` per the established pattern.

The `fetchPending()` query on line 60 of `Imports.tsx` currently selects:
```
id,naam,status,doel,trigger_beschrijving,systemen,stappen,branches,categorie,
import_source,import_status,import_proposal,created_at
```
It is **missing `fasen` and `owner`**. These must be added to the select string so `ProposalCard` can read the current values.

---

## Common Pitfalls

### Pitfall 1: Hard Block Fires Before Review
**What goes wrong:** If the hard block checks `draft.fasen.length === 0` instead of `item.fasen?.length === 0`, the button will always be disabled for a card that hasn't been edited yet (even if fasen was set in a previous session).
**Why it happens:** `draft` is initialised from `item` in `useState` — but `item.fasen` is only available if `fasen` is included in `fetchPending()`'s select list. If the select is missing `fasen`, `item.fasen` will be `undefined`, making the hard block fire even for automations that have fasen set.
**How to avoid:** (1) Add `fasen` to the `fetchPending()` select string. (2) Check `item.fasen?.length === 0` in the disabled condition.

### Pitfall 2: Draft Fasen Initialisation Mismatch
**What goes wrong:** `PendingAutomation` interface doesn't include `fasen` or `owner`, so `item.fasen` is typed as `undefined`. TypeScript errors appear when reading `draft.fasen`.
**Why it happens:** The interface was defined before Phase 2 and matches only the original select columns.
**How to avoid:** Extend the `PendingAutomation` interface at the top of `Imports.tsx` to include `fasen: string[]` and `owner: string`.

### Pitfall 3: Edge Function Fasen Not Persisted on Update
**What goes wrong:** The edge function's `UPDATE` branch (for existing workflows, line 554–561) does not write `fasen`. So re-syncing a workflow after Phase 2 would overwrite the reviewer-assigned `fasen` back to `[]`.
**Why it happens:** The update patch doesn't include `fasen` — the insert branch is where fasen inference runs.
**How to avoid:** The update branch should NOT overwrite `fasen` if a value already exists (reviewer may have set it). The recommended approach: only include `fasen: mapped.fasen` in the INSERT path; in the UPDATE path, skip `fasen` (preserve the existing value). This matches the existing pattern for `doel` (which is also skipped on update per the comment on line 549: "Only skip doel if it was already manually filled in").

### Pitfall 4: ConfBadge Missing on Fasen Field
**What goes wrong:** If the confidence key for `fasen` is not added to the `Confidence` interface or is not set in `mapWorkflow()`, the `Field` component's `conf` prop is `undefined` and no badge renders.
**Why it happens:** `Confidence` interface at the top of `Imports.tsx` defines each field explicitly.
**How to avoid:** Add `fasen?: string` to the `Confidence` interface. Set `fasen` in `mapWorkflow()` confidence object based on whether keyword inference produced a result.

### Pitfall 5: Deno ESM Import Errors in Edge Function
**What goes wrong:** Adding a new utility function that imports something not available via `esm.sh` or Deno standard library causes a deploy error.
**Why it happens:** Deno edge functions cannot use npm packages directly — only via `https://esm.sh/`.
**How to avoid:** The `inferFasen()` function should be pure TypeScript with no imports. All logic is string matching — no external dependencies needed.

---

## Code Examples

### Extend fetchPending select to include fasen and owner
```typescript
// Source: src/pages/Imports.tsx — fetchPending() function
// Current line 60, add fasen and owner to the select string:
.select("id,naam,status,doel,trigger_beschrijving,systemen,stappen,branches,categorie,import_source,import_status,import_proposal,created_at,fasen,owner")
```

### Extend PendingAutomation interface
```typescript
// Source: src/pages/Imports.tsx — PendingAutomation interface
interface PendingAutomation {
  // ... existing fields ...
  fasen: string[];    // ADD
  owner: string;      // ADD
}
```

### Extend draft state in ProposalCard
```typescript
// Source: src/pages/Imports.tsx — ProposalCard component
const [draft, setDraft] = useState({
  naam: item.naam,
  doel: item.doel,
  trigger,
  categorie: item.categorie,
  fasen: item.fasen ?? [],      // ADD
  owner: item.owner ?? "",       // ADD
});
```

### Extended handleSave
```typescript
// Source: src/pages/Imports.tsx — handleSave()
await updateField(item.id, {
  naam:                 draft.naam,
  doel:                 draft.doel,
  trigger_beschrijving: draft.trigger,
  categorie:            draft.categorie,
  fasen:                draft.fasen,    // ADD
  owner:                draft.owner,    // ADD
});
```

### inferFasen in edge function
```typescript
// Source: supabase/functions/hubspot-sync/index.ts — add near mapWorkflow()
function inferFasen(wf: any): string[] {
  const naam = (wf.name ?? "").toLowerCase();
  const fasen: string[] = [];
  if (/onboarding|welkom|welcome|intake|aanmeld/.test(naam)) fasen.push("Onboarding");
  if (/marketing|nieuwsbrief|newsletter|lead|campagne|campaign/.test(naam)) fasen.push("Marketing");
  if (/sales|offerte|quote|deal|pipeline/.test(naam)) fasen.push("Sales");
  if (/boekhoud|factuur|invoice|betaling|payment|wefact/.test(naam)) fasen.push("Boekhouding");
  if (/offboard|opzegg|churn|verloop|exit/.test(naam)) fasen.push("Offboarding");
  return fasen;
}
```

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond the existing project stack — Supabase Edge Functions and Vite dev server are already operational from Phase 1).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (confirmed in `vitest.config.ts`) |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |
| Setup file | `src/test/setup.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DATA-02 | `triggerHubSpotSync()` returns `{ inserted, updated, deactivated, total }` shape | unit (pure logic / type check) | `npm run test -- --reporter=verbose src/test/importsFlow.test.ts` | ❌ Wave 0 |
| DATA-03 | `inferFasen()` maps workflow name keywords to correct KlantFase values | unit | `npm run test -- --reporter=verbose src/test/importsFlow.test.ts` | ❌ Wave 0 |
| DATA-03 | Approve button disabled when `item.fasen` is empty | unit (ProposalCard state logic) | `npm run test -- --reporter=verbose src/test/importsFlow.test.ts` | ❌ Wave 0 |
| DATA-03 | Approve button enabled when `item.fasen` has at least one value | unit | `npm run test -- --reporter=verbose src/test/importsFlow.test.ts` | ❌ Wave 0 |
| DATA-03 | handleSave patch includes `fasen` and `owner` fields | unit | `npm run test -- --reporter=verbose src/test/importsFlow.test.ts` | ❌ Wave 0 |

**Manual-only items:**
- Actual HubSpot sync with live token (requires network + HubSpot account)
- UI rendering of fasen multi-select and owner field (requires browser)
- Warning dialog appearance when stappen is empty (requires browser interaction)

### Sampling Rate

- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/test/importsFlow.test.ts` — covers DATA-02 (sync result shape), DATA-03 (inferFasen, approve block logic, handleSave patch)
- [ ] No additional framework install needed — Vitest already installed and configured

---

## Open Questions

1. **Does the `hubspot-sync` edge function currently deploy and run successfully with a real HubSpot token?**
   - What we know: The code is syntactically complete and was written in Phase 1. The trigger call and error handling look correct.
   - What's unclear: Whether anyone has tested it with a real token against Brand Boekhouders' HubSpot account since Phase 1 deployment.
   - Recommendation: D-09 audit task should be the first task in Wave 1. Run `triggerHubSpotSync()` from the browser console or Imports page and inspect the Supabase Edge Function logs. Only proceed with modification if the audit confirms the flow works.

2. **How many HubSpot workflows does Brand Boekhouders have, and how many will match keyword inference?**
   - What we know: The edge function batches 5 at a time to avoid rate limiting; the batch loop is already implemented.
   - What's unclear: Total workflow count and whether workflow names are in Dutch or English (affects keyword regex).
   - Recommendation: The plan should include a verify task where the developer reviews the first sync results in the Imports page and checks whether inferred fasen values are sensible. Keyword rules can be tuned after seeing real workflow names.

3. **Is the `import_proposal.confidence` object stored as a column or within `import_proposal` JSONB?**
   - What we know: The edge function stores `import_proposal: { ...mapped }` where `mapped` includes a `confidence` sub-object. `Imports.tsx` reads `item.import_proposal?.confidence`.
   - What's unclear: Whether adding `fasen` to `confidence` in the edge function will propagate to existing rows or only new ones.
   - Recommendation: Adding `fasen` to confidence is additive. Existing rows will have `confidence.fasen` as `undefined` — the `ConfBadge` already handles `undefined` gracefully (renders the "⚠ invullen" state). No data migration needed.

---

## Sources

### Primary (HIGH confidence)

- Direct code inspection: `src/pages/Imports.tsx` — full ProposalCard implementation, mutation patterns, Dialog usage
- Direct code inspection: `supabase/functions/hubspot-sync/index.ts` — edge function, `mapWorkflow()`, insert/update branches
- Direct code inspection: `src/lib/types.ts` — `KlantFase`, `KLANT_FASEN`, `Automatisering` interface
- Direct code inspection: `src/lib/supabaseStorage.ts` — `triggerHubSpotSync()`, `updateAutomatisering()`
- Direct code inspection: `src/integrations/supabase/types.ts` — confirmed `fasen: string[]` and `owner: string` in DB schema
- Direct code inspection: `supabase/migrations/*.sql` — confirmed `fasen` and `owner` in base schema; confirmed `import_status` and related columns are NOT in migrations
- Direct code inspection: `vitest.config.ts` — test framework and config

### Secondary (MEDIUM confidence)

- `.claude/memory/project_standards.md` — project coding standards (shadcn install command, `--legacy-peer-deps` rule, data access patterns)

### Tertiary (LOW confidence)

- None — all findings are from direct code inspection.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all components inspected in source, no new dependencies
- Architecture: HIGH — existing patterns directly observed in ProposalCard and edge function
- Pitfalls: HIGH — derived from actual gaps in code (missing columns in select, missing interface fields, update branch not writing fasen)
- Schema findings: HIGH — migration files inspected, types.ts inspected, gaps confirmed

**Research date:** 2026-03-31
**Valid until:** 2026-04-30 (stable codebase, no fast-moving external dependencies)
