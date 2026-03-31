---
phase: 02-data-completeness
plan: 02
subsystem: ui
tags: [react, typescript, supabase, imports, fasen, completeness-gate]

# Dependency graph
requires:
  - phase: 02-data-completeness/02-01
    provides: existing Imports.tsx ProposalCard with basic editing

provides:
  - Fasen multi-select UI with badge-style toggles (edit mode) and Badge display (view mode)
  - Owner text input field with advisory ConfBadge when empty
  - Hard block on Approve when fasen is empty (D-03/D-07 enforcement)
  - Warning dialog when approving with zero stappen (D-06)
  - Persisted fasen and owner edits via updateField
  - fetchPending now includes fasen and owner from database

affects: [02-03, imports-page, completeness-enforcement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Badge-style toggle buttons using cn() for active/inactive states
    - Completeness gate pattern: disabled approve button + helper text + warning dialog
    - Advisory vs hard-block distinction (owner advisory, fasen hard)

key-files:
  created: []
  modified:
    - src/pages/Imports.tsx

key-decisions:
  - "fasen is a hard block on approval — approve button disabled, helper text shown"
  - "owner is advisory only — ConfBadge 'low' shown but approval is not blocked"
  - "stappen warning dialog follows D-06 — user can override but must explicitly confirm"
  - "fasen and owner fields placed before systemen/stappen in expanded body for prominence"

patterns-established:
  - "Completeness gate: disabled button + helper text for hard blocks, warning dialog for soft blocks"
  - "Badge-style toggle: cn() switching bg-primary vs bg-secondary for selected/unselected state"

requirements-completed: [DATA-03]

# Metrics
duration: 8min
completed: 2026-03-31
---

# Phase 02 Plan 02: Fasen/Owner editing and completeness gate in ProposalCard Summary

**Extended Imports.tsx ProposalCard with fasen multi-select, owner input, and D-08 completeness gate: hard block when fasen empty, warning dialog when stappen empty, advisory ConfBadge when owner empty.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-31T07:19:00Z
- **Completed:** 2026-03-31T07:26:54Z
- **Tasks:** 2 of 2 completed
- **Files modified:** 1

## Accomplishments

- Extended PendingAutomation and Confidence interfaces with fasen and owner fields
- Added KLANT_FASEN and cn imports; fetchPending select now includes fasen,owner from database
- Draft state and handleSave now persist fasen and owner edits to Supabase
- Fasen multi-select renders all 5 KlantFase options as toggleable badge buttons in edit mode
- Owner text input in edit mode, read-only display with advisory ConfBadge when empty
- Approve button disabled when fasen is empty, with helper text explaining the hard block
- Warning dialog appears when approving an automation with zero stappen (user can override)

## Task Commits

1. **Task 1: Extend data layer — PendingAutomation, Confidence, fetchPending, draft, handleSave** - `d0d99c1` (feat)
2. **Task 2: Add fasen multi-select, owner input, and completeness gate UI** - `d299a1a` (feat)

## Files Created/Modified

- `src/pages/Imports.tsx` - Extended ProposalCard with fasen/owner fields, completeness gate, stappen warning dialog

## Decisions Made

- Hard block on fasen (approve button disabled) vs advisory on owner (ConfBadge 'low' shown, not blocking) per D-03/D-05
- Fasen and owner fields placed before systemen/stappen in expanded body so reviewers see them prominently
- stappen warning dialog uses `item.stappen` (live data) not `draft.stappen` — draft edits not yet saved when clicking approve

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — fasen and owner fields are wired directly to database via fetchPending select and updateField patch.

## Self-Check: PASSED

- `src/pages/Imports.tsx` — confirmed modified (contains KLANT_FASEN, handleApproveClick, stappenWarnOpen, Verantwoordelijke, fasen,owner in select)
- Commit `d0d99c1` — confirmed in git log
- Commit `d299a1a` — confirmed in git log
- TypeScript: `npx tsc --noEmit` exits 0
- Tests: 1/1 passed
