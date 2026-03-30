# Phase 1: Process Canvas - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the Processen page fully functional as the graduation demo deliverable. This phase delivers a working swimlane canvas where automations are visible, draggable, and persistent. It does NOT enter real automation data (that's Phase 2) or add export capability (Phase 3).

</domain>

<decisions>
## Implementation Decisions

### Current Canvas State
- **D-01:** The canvas has not been tested against real Supabase data yet — the current implementation state is unknown.
- **D-02:** The planner should audit the current implementation against all four Phase 1 success criteria and identify gaps, rather than assuming which areas are broken. Do not preemptively fix things that may already work.
- **D-03:** The highest-risk concern raised was detail panel data (fullData not fetched, wrong field mappings), but the user walked this back — it may already be fine. Verify before touching.

### Approach
- **D-04:** Discover-and-fix approach: read the code, run it mentally against the success criteria, then plan targeted fixes only where gaps are confirmed.
- **D-05:** The canvas infrastructure (ProcessCanvas.tsx, AutomationDetailPanel.tsx, UnassignedPanel.tsx, Supabase persistence) is already built. Phase 1 work is polish, bug fixes, and gap-filling — not a rebuild.

### Claude's Discretion
- How to handle loading states, empty states, and error states — use judgment based on existing patterns in the codebase.
- Visual polish details (hover states, transitions, responsive behavior) — match existing shadcn/ui + Tailwind patterns.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 Requirements
- `.planning/REQUIREMENTS.md` §PROC-01 — Automations visible in swimlanes organized by customer phase
- `.planning/REQUIREMENTS.md` §PROC-02 — Drag automations between swimlanes; position persists after refresh
- `.planning/REQUIREMENTS.md` §PROC-03 — Automation placement and connections persist (saved to Supabase)
- `.planning/REQUIREMENTS.md` §PROC-04 — Click automation → side panel with trigger, steps, systems, owner

### Key Source Files
- `src/pages/Processen.tsx` — Orchestration page: save/reset, state management, Supabase persistence hooks
- `src/components/process/ProcessCanvas.tsx` — SVG swimlane canvas with step-drag, arrow-draw, automation attachment
- `src/components/process/AutomationDetailPanel.tsx` — Detail side panel (trigger, steps, systems, owner)
- `src/components/process/UnassignedPanel.tsx` — Panel for unassigned automations with drag-to-canvas
- `src/lib/supabaseStorage.ts` — `fetchProcessState` / `saveProcessState` — Supabase persistence layer
- `src/data/processData.ts` — `initialState`, `TEAM_ORDER`, `TEAM_CONFIG`, type definitions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProcessCanvas.tsx` — SVG canvas already handles step-drag, connection-draw, automation-dot rendering, and onDrop from UnassignedPanel. 906 lines — read carefully before planning changes.
- `AutomationDetailPanel.tsx` — accepts `automation: Automation` and `fullData?: Automatisering`. The `fullData` prop carries Supabase fields (trigger, steps, systems, owner).
- `UnassignedPanel.tsx` — shows unassigned/assigned automations; drag-to-canvas already wired via `handleDragStart`.
- shadcn/ui components available: `Card`, `Badge`, `Button`, `Dialog`, `DropdownMenu`, and more in `src/components/ui/`.

### Established Patterns
- State management: `useState<ProcessState>` in Processen.tsx with a local `update()` helper; dirty-state tracking via `isDirty`.
- Persistence: `fetchProcessState()` on mount, `saveProcessState()` on explicit save — NOT auto-save.
- Automation–canvas link: automations are represented as dots on arrows (connections between steps), not as freestanding swimlane cards.
- Dutch UI labels, English code identifiers — follow this everywhere.

### Integration Points
- Automations loaded via `useAutomatiseringen()` hook → mapped to canvas `Automation` type via `toCanvasAutomation()`.
- `process_state` Supabase table stores `steps`, `connections`, and `autoLinks` (attachment map).
- `FASE_TO_TEAM` record maps `KlantFase` (Dutch) to `TeamKey` (English internal key) for swimlane assignment.

</code_context>

<specifics>
## Specific Ideas

No specific references or "I want it like X" moments from discussion — the user hasn't tested the canvas yet and wants the planner to discover issues empirically by reading the code against the success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-process-canvas*
*Context gathered: 2026-03-30*
