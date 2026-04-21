# Flows — Design Spec

**Date:** 2026-04-21
**Status:** Approved

## Overview

A **Flow** is a named, persisted group of directly-linked automations treated as a single combined entity. The system auto-detects candidate flows by traversing `koppelingen` and confirmed `automation_links`. Users confirm proposals, edit an AI-generated name and description, and save. Each Flow has its own detail page showing a step-by-step breakdown of its constituent automations.

---

## Data Model

### New table: `flows`

```sql
CREATE TABLE flows (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  naam           TEXT NOT NULL,
  beschrijving   TEXT,
  systemen       TEXT[],     -- union of all constituent automation systems, stored for display
  automation_ids TEXT[],     -- ordered by link direction (start → end), topological sort
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
```

`automation_ids` is a flat array of automation IDs in topological order. Branch structure is not stored — it is derived at render time by inspecting each automation's outgoing `koppelingen`.

---

## Detection Algorithm

Implemented as a pure function in `src/lib/detectFlows.ts`. No network calls — operates on the already-loaded automations array plus confirmed automation_links.

**Steps:**
1. Build a directed graph from two sources:
   - `koppelingen` on each automation (`bron_id → doel_id`)
   - Confirmed `automation_links` (`source_id → target_id`, `confirmed = true`)
2. Find weakly connected components (groups ignoring direction) using union-find or DFS.
3. Discard any component with fewer than 2 automations.
4. Topological sort within each component to determine step order.
5. Return each component as a candidate `{ automationIds: string[] }`.

The function is pure and has no side effects, making it straightforward to unit test.

---

## AI Naming

A new Supabase Edge Function **`name-flow`** receives the automation objects in the proposed group (naam, doel, trigger, categorie, systemen) and returns:

```json
{ "naam": "Onboarding Flow", "beschrijving": "..." }
```

Claude generates a concise Dutch name and a 1–2 sentence description. The same pattern as the existing `enrich-automation` function.

Called when the user clicks "Bevestig" on a proposal, before the confirmation dialog opens. If the call fails, the dialog opens with empty fields plus a "Probeer opnieuw" button.

---

## Pages & Components

### Routes

| Route | Component | Purpose |
|---|---|---|
| `/flows` | `src/pages/Flows.tsx` | Overview: proposals + saved flows |
| `/flows/:id` | `src/pages/FlowDetail.tsx` | Detail view for one flow |

### New files

| File | Type | Purpose |
|---|---|---|
| `src/pages/Flows.tsx` | Page (default export) | Overview page |
| `src/pages/FlowDetail.tsx` | Page (default export) | Detail page |
| `src/components/FlowCard.tsx` | Component (named export) | Card in overview list |
| `src/components/FlowConfirmDialog.tsx` | Component (named export) | Proposal confirmation + AI naming |
| `src/lib/detectFlows.ts` | Utility | Pure graph traversal function |

### Hooks (added to `src/lib/hooks.ts`)

- `useFlows()` — fetch all saved flows
- `useCreateFlow()` — save a confirmed flow, invalidates `["flows"]`
- `useUpdateFlow()` — save name/beschrijving edits, invalidates `["flows"]`
- `useDeleteFlow()` — delete a flow, invalidates `["flows"]`

### Storage functions (added to `src/lib/supabaseStorage.ts`)

- `fetchFlows()`, `insertFlow()`, `updateFlow()`, `deleteFlow()`

---

## Page Structure

### `/flows` — Overview

**Header:** "Flows" title + "Detecteer flows" button (re-runs detection on click).

**Voorstellen section** (detected but not yet confirmed):
- Shown at the top, collapsible after first visit
- Each proposal shows: list of automation names in order, with a "Bevestig" button
- "Bevestig" triggers the AI naming call, then opens `FlowConfirmDialog`

**Flows section** (confirmed):
- Grid/list of `FlowCard` components
- Each card shows: naam, beschrijving preview, number of automations, systemen badges
- "Update beschikbaar" badge when detection finds the saved flow's automations are a subset of a larger detected group

**Empty state (no flows, no proposals):**
> "Geen flows gevonden. Voeg koppelingen toe aan je automatiseringen om flows te detecteren."

### `/flows/:id` — Detail

**Header block:**
- Naam (editable inline)
- Beschrijving (editable inline)
- Systemen badges (derived, read-only)
- "Opslaan" button (only visible when unsaved changes exist)

**Step list:**
- Numbered steps in `automation_ids` order
- Each step: automation ID, naam, categorie badge, trigger text, "↗ open" link to `/alle?open=<id>`
- Branch detection: if a step's automation has multiple outgoing links, render its targets as indented sub-steps
- Missing automation: renders "AUTO-XXX — niet meer beschikbaar" with a remove button

**Footer:**
- "Flow verwijderen" button (with confirmation)

### `FlowConfirmDialog`

- Shows proposed automations in step order
- Pre-filled naam + beschrijving from AI (both editable)
- "Probeer opnieuw" button if AI call failed
- "Opslaan als Flow" + "Annuleren"

---

## Edge Cases

| Situation | Behaviour |
|---|---|
| Branching flow (one automation → two targets) | Stored as flat topological list; detail page renders branches as indented sub-steps by checking live koppelingen |
| Saved flow is subset of a larger detected group | "Update beschikbaar" badge on flow card; clicking opens confirmation dialog pre-filled with existing name/beschrijving and expanded automation list |
| Automation deleted while referenced in a flow | Step renders as "niet meer beschikbaar" with a remove button; flow is not auto-deleted |
| AI naming fails | Dialog opens with empty fields + "Probeer opnieuw" button |
| No flows detected | Empty state message with guidance to add koppelingen |
| Single automation with no links | Never proposed as a flow |

---

## Navigation

New sidebar entry: **Flows**, positioned between "Alle Automatiseringen" and "Processen".

---

## Out of Scope

- Merging two saved flows into one
- Flows across automation_links that are not yet confirmed
- Automatic re-detection on every link change (detection is manual via button)
- Flow versioning or history
