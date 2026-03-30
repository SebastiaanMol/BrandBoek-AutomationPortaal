# Phase 2: Data Completeness - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Get every Brand Boekhouders automation into the portal with accurate, complete fields. This phase covers two tracks:
1. **HubSpot import flow** — make the sync → confidence review → approve/reject pipeline work end-to-end, including assigning lifecycle phase (fasen) and owner during review.
2. **Data completeness enforcement** — ensure approved automations meet DATA-03 requirements (non-empty trigger, at least one step, at least one system, a phase assignment, and an owner).

This phase does NOT cover: manual entry of non-HubSpot automations (out of discussed scope), Zapier/Typeform sync (v2), or export (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Phase (fasen) Assignment

- **D-01:** The Python backend mapper should produce a fasen suggestion for each imported workflow. The edge function or client calls the Python backend to get a suggested `KlantFase[]` based on workflow name/category. Confidence badge shown as low/medium. **Research note:** the Python backend is not yet deployed (BACK-01 is Phase 5) — researcher should determine whether to implement fasen suggestion directly in the edge function (TypeScript, simpler) or design the edge function→backend call for when backend is available.
- **D-02:** The ProposalCard expand view (in `Imports.tsx`) must expose a `fasen` multi-select field for editing. The 5 KlantFase values are: Marketing, Sales, Onboarding, Boekhouding, Offboarding. This field is added alongside the existing editable fields (naam, doel, trigger, categorie).
- **D-03:** Approval is **blocked** (Approve button disabled) when `fasen` is empty — the reviewer must assign at least one lifecycle phase before approving.

### Owner Assignment

- **D-04:** Add a free-text `owner` input field to the ProposalCard expand view, within the existing editable field grid. Consistent with the existing editing pattern.
- **D-05:** Owner is **advisory only** — no hard block at approval. A confidence badge (⚠ invullen) should indicate when owner is empty, but the reviewer can approve without it.

### Completeness Gate at Approval

- **D-06:** Use warn-but-allow: when reviewer clicks Approve and `stappen` is empty (zero steps mapped from HubSpot), show a confirmation dialog listing the missing field(s) before proceeding.
- **D-07:** Hard block (from D-03): `fasen` empty → Approve button disabled, no dialog needed.
- **D-08:** Summary of enforcement matrix:
  - `fasen` empty → hard block (button disabled)
  - `stappen` empty → warning dialog, reviewer can override
  - `owner` empty → advisory only (confidence badge, no block or dialog)
  - `trigger_beschrijving` empty → advisory only (existing ConfBadge sufficient)
  - `systemen` empty → advisory only

### Import Flow Approach

- **D-09:** Discover-and-fix approach (carrying from Phase 1): audit whether `triggerHubSpotSync()` → edge function → `pending_approval` queue currently works with a real HubSpot token before touching it. Don't assume it's broken.
- **D-10:** `updateField()` in `Imports.tsx` already handles patching individual fields. Extend it to support `fasen` (array) and `owner` (string) — no new mutation pattern needed.

### Claude's Discretion

- Exact UI component for fasen multi-select — use existing shadcn/ui components (Checkbox list, ToggleGroup, or Badge-style toggles). Match the visual style of the existing ProposalCard field grid.
- How the warning dialog for missing `stappen` is worded — Dutch, consistent with existing toast/dialog patterns.
- Whether to show a count badge on the Imports sidebar nav item when pending_approval count > 0 (nice-to-have, Claude decides if trivial).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 2 Requirements
- `.planning/REQUIREMENTS.md` §DATA-01 — All Brand Boekhouders automations entered in portal
- `.planning/REQUIREMENTS.md` §DATA-02 — HubSpot import flow works end-to-end
- `.planning/REQUIREMENTS.md` §DATA-03 — Imported automations have correct and complete fields (trigger, steps, systems, phase, owner)

### Key Source Files
- `src/pages/Imports.tsx` — ProposalCard UI, approve/reject flow, `updateField()` mutation, `fetchPending()`. The main file to extend for fasen/owner editing and completeness gate.
- `supabase/functions/hubspot-sync/index.ts` — Edge Function: maps HubSpot workflows to `automatiseringen` with AI confidence, sets `import_status: "pending_approval"`. Currently hardcodes `owner: ""` and `fasen: []` — this is the gap to fix.
- `src/lib/supabaseStorage.ts` — `triggerHubSpotSync()` — client-side trigger for the edge function.
- `src/lib/types.ts` — `Automatisering` type, `KlantFase` union type, `KLANT_FASEN` constant array.
- `src/integrations/supabase/types.ts` — Supabase DB schema types (auto-generated).

### Backend (for fasen AI suggestion research)
- `main.py` + `mapper/` directory — Python FastAPI backend with HubSpot mapper. Researcher should assess whether fasen suggestion belongs here or in the edge function.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProposalCard` in `Imports.tsx` — existing editable field grid with `draft` state and `handleSave()`. Extend `draft` to include `fasen: string[]` and `owner: string`.
- `ConfBadge` / `Field` / `FieldLabel` components in `Imports.tsx` — reuse for fasen and owner fields.
- `KLANT_FASEN` constant in `src/lib/types.ts` — the 5 lifecycle phases, use directly.
- shadcn/ui `Dialog` — already imported and used for reject dialog; reuse for approval warning dialog.
- `updateField()` function — already handles partial updates to `automatiseringen` via Supabase.

### Established Patterns
- Inline editing: `editing` boolean state → show Input/Textarea when true, read-only text when false. Follow this for fasen and owner fields.
- Dutch labels everywhere: "Fasen" / "Verantwoordelijke" for field labels in the UI.
- Toast feedback on save/approve/reject — use `toast.success()` / `toast.error()` pattern.
- Confidence badges per field: `conf` prop on `Field` component. Set `conf="low"` for AI-suggested fasen.

### Integration Points
- `automatiseringen` table: `fasen` is `string[]` (PostgreSQL array), `owner` is `string`. Supabase client handles these types via the generated types in `src/integrations/supabase/types.ts`.
- `hubspot-sync` edge function: modify to attempt fasen suggestion; store in `fasen` field alongside existing mapping.

</code_context>

<specifics>
## Specific Ideas

- The Python backend should handle fasen AI suggestion — researcher should verify feasibility given backend deployment status (Phase 5). If backend is not accessible from Supabase Edge Functions at this point, implement a keyword-based fallback in the edge function itself.
- `fasen` hard block: simplest implementation is `disabled={approve.isPending || item.fasen?.length === 0}` on the Approve Button, plus a short helper text below.
- Warning dialog for `stappen === 0`: reuse the existing Dialog component pattern from the reject dialog. Show: "Deze automatisering heeft nog geen stappen. Wil je toch goedkeuren?"

</specifics>

<deferred>
## Deferred Ideas

- Manual entry tracking for non-HubSpot automations (Zapier, Typeform, hand-entered) — user did not select this area for discussion. DATA-01 requires all automations; if non-HubSpot automations need to be entered manually, this is covered by the existing `NieuweAutomatisering.tsx` / `NieuweAutomatiseringPage.tsx` flow (already built). No new work identified.
- Zapier and Typeform sync — v2 requirements, out of scope for this phase.
- Batch approve/reject — not discussed, not in requirements.

</deferred>

---

*Phase: 02-data-completeness*
*Context gathered: 2026-03-30*
