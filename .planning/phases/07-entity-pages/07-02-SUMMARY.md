---
phase: 07-entity-pages
plan: 02
subsystem: entity-pages
tags: [systems-page, tdd, react-router, url-state, wave-1]

requires:
  - phase: 07-entity-pages
    plan: 01
    provides: Wave 0 it.todo scaffold with makeAutomatisering() factory and SYS-01/SYS-02 stubs

provides:
  - src/pages/Systems.tsx: Two-state Systems page (list + filtered detail) wired to useAutomatiseringen() and useSearchParams
  - SYS-01 and SYS-02 tests GREEN in entityPages.test.ts

affects:
  - src/App.tsx: /systems route added
  - src/components/AppLayout.tsx: Systems nav item added to "Systems & People" group

tech-stack:
  added: []
  patterns:
    - "Derive entity list client-side from useAutomatiseringen() cache — no extra Supabase query"
    - "useSearchParams for selected-entity state — URL-addressable, supports Phase 8 deep-linking"
    - "Two-state page pattern: list view when param absent, detail/filtered view when param set"
    - "Inline derivation helpers in test file (same pattern as domainLogic.test.ts)"

key-files:
  created:
    - src/pages/Systems.tsx
  modified:
    - src/App.tsx
    - src/components/AppLayout.tsx
    - src/test/entityPages.test.ts

key-decisions:
  - "Derivation uses Map built from a.systemen flatMap — never the SYSTEMEN constant — so only systems with actual automations appear"
  - "useSearchParams drives selected state (not useState) — supports Phase 8 deep-links to /systems?system=X"
  - "Detail view is read-only — no Edit/Delete buttons per UI-SPEC implementation note 7"
  - "Systems nav item added to AppLayout.tsx alongside page creation — top bar label auto-resolves"

metrics:
  duration: ~2min
  completed: 2026-03-31
  tasks: 2
  files_modified: 4
---

# Phase 07 Plan 02: Systems Page Summary

**Two-state Systems page with useSearchParams-driven list/detail views, derived systemCounts from live automation data, and SYS-01/SYS-02 tests GREEN**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-31T10:00:00Z
- **Completed:** 2026-03-31T10:02:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `src/pages/Systems.tsx` with full two-state implementation:
  - List view: unique systems sorted by automation count, SystemBadge + count badge (singular/plural)
  - Detail view: back button, sr-only h1, SystemBadge + system name header, filtered automations accordion
  - Loading state: Loader2 spinner (same pattern as AlleAutomatiseringen)
  - Empty states: "No systems found" (list) and "No automations are linked to {name}" (detail)
  - Read-only — no Edit/Delete buttons
- Added `/systems` route to `src/App.tsx`
- Added `Systems` nav item to "Systems & People" group in `src/components/AppLayout.tsx` (top bar auto-resolves)
- Replaced SYS-01 and SYS-02 `it.todo` stubs with 6 passing assertions in `src/test/entityPages.test.ts`
- Full suite: 72 passing + 6 todo (OWN stubs remain for 07-03)

## Task Commits

1. **Task 1: Implement Systems.tsx (SYS-01 + SYS-02)** - `41ad616`
2. **Task 2: Make SYS-01 and SYS-02 test stubs GREEN** - `a511e32`

## Files Created/Modified

- `src/pages/Systems.tsx` — Two-state Systems page (list + detail), 180 lines
- `src/App.tsx` — Added import and `/systems` route
- `src/components/AppLayout.tsx` — Added Server icon import and Systems nav item
- `src/test/entityPages.test.ts` — Added expect import, inline helpers, 6 real assertions for SYS-01/SYS-02

## Decisions Made

- **Derivation from live data only:** `systemCounts` built from `a.systemen` across all automations — never the `SYSTEMEN` constant — ensuring only systems with actual automations appear in the list
- **useSearchParams over useState:** URL-driven selection (`?system=X`) supports Phase 8 deep-linking from automation detail panels
- **Read-only detail view:** No Edit/Delete buttons per UI-SPEC note 7; users go to All Automations for mutations
- **Nav item added immediately:** Systems nav item added to AppLayout.tsx so top bar auto-resolves the "Systems" label via the existing `navGroups.flatMap` lookup

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. Systems.tsx derives all data from `useAutomatiseringen()` with no hardcoded or placeholder values.

## Self-Check: PASSED

- `src/pages/Systems.tsx` exists: FOUND
- `41ad616` commit exists: FOUND
- `a511e32` commit exists: FOUND
- `npx vitest run src/test/entityPages.test.ts`: 6 passed + 6 todo (exit 0)
- `npx vitest run`: 72 passed + 6 todo (exit 0, no regressions)
