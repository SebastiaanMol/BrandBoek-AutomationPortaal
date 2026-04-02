---
phase: 07-entity-pages
plan: 03
subsystem: entity-pages
tags: [owners, entity-page, tdd, wave-1, search-params]

requires:
  - phase: 07-entity-pages
    plan: 01
    provides: Wave 0 it.todo scaffold with OWN-01 and OWN-02 stubs in entityPages.test.ts

provides:
  - src/pages/Owners.tsx — two-state Owners page (list view + filtered detail view)
  - OWN-01 and OWN-02 tests GREEN in entityPages.test.ts (deriveOwnerCounts + filterByOwner)

affects:
  - 07-04 (Nav + routing — needs Owners.tsx to exist as a route target)
  - Phase 08 cross-links (deep-link support via ?owner= URL param)

tech-stack:
  added: []
  patterns:
    - "Two-state entity page: useSearchParams drives ?owner= URL state (null=list, string=detail)"
    - "ownerCounts derivation: Map<string, number> with if (a.owner?.trim()) empty-string guard"
    - "filterByOwner: exact string match a.owner === selected"
    - "Read-only accordion: AnimatePresence + framer-motion, no Edit/Delete buttons"

key-files:
  created:
    - src/pages/Owners.tsx
  modified:
    - src/test/entityPages.test.ts

key-decisions:
  - "Used useSearchParams (not useState) for selected-owner state — enables Phase 8 deep-link navigation to ?owner=X"
  - "Empty owner guard uses if (a.owner?.trim()) to exclude blank entries from the owners list (Pitfall 1 from RESEARCH.md)"
  - "OWN test helpers (deriveOwnerCounts, filterByOwner) are inline in test file — same pattern as domainLogic.test.ts (no import from page component)"
  - "SYS it.todo stubs left untouched — they are 07-02 scope"

metrics:
  duration: ~12min
  started: "2026-04-02T08:00:15Z"
  completed: "2026-04-02T08:02:37Z"
  tasks: 2
  files_modified: 2
---

# Phase 07 Plan 03: Owners Page Summary

**Owners page (OWN-01 + OWN-02) with two-state list+detail view driven by ?owner= URL param and empty-string owner guard**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-02T08:00:15Z
- **Completed:** 2026-04-02T08:02:37Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `src/pages/Owners.tsx` with two-state page:
  - **List view** (`?owner=` absent): unique owners sorted by automation count, Users icon, count badge, empty state heading
  - **Detail view** (`?owner=Jan`): filtered automations accordion, sr-only h1, "← Back to Owners" button, empty state with owner name
- ownerCounts derivation guards empty owner strings with `if (a.owner?.trim())` — Pitfall 1 from RESEARCH.md
- `useSearchParams` drives URL state with key `"owner"` for Phase 8 deep-link support
- No Edit/Delete buttons — read-only page
- Replaced 4 `it.todo` stubs in "ownerCounts derivation" describe block with passing assertions
- Replaced 2 `it.todo` stubs in "owner filter" describe block with passing assertions
- Added `deriveOwnerCounts()` and `filterByOwner()` inline helpers to entityPages.test.ts
- Full vitest suite: 72 passing, 6 todo (remaining SYS stubs await plan 07-02)

## Task Commits

1. **Task 1: Implement Owners.tsx** — `4857fa4`
2. **Task 2: Make OWN-01/OWN-02 test stubs GREEN** — `edead35`

## Files Created/Modified

- `src/pages/Owners.tsx` — 156 lines, two-state Owners entity page
- `src/test/entityPages.test.ts` — Added 6 real assertions for OWN-01 + OWN-02, added 2 helper functions

## Decisions Made

- Used `useSearchParams` (not `useState`) so Phase 8 can deep-link to `/owners?owner=X` directly.
- Empty owner guard `if (a.owner?.trim())` is critical: the `owner` field is not required to be non-empty in the DB schema.
- Test helpers (`deriveOwnerCounts`, `filterByOwner`) are inline in the test file — same decision as Phase 01/02 (no import from component file to avoid React side effects).
- SYS describe block stubs were left as `it.todo` — they are plan 07-02 scope.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None — Owners.tsx is fully wired. Data comes from `useAutomatiseringen()` hook.

## Next Phase Readiness

- Plan 07-04 can now add the Owners route to App.tsx and nav item to AppLayout.tsx — Owners.tsx exists as the target
- Phase 08 cross-links can navigate to `/owners?owner=X` for deep-link support

---
*Phase: 07-entity-pages*
*Completed: 2026-04-02*
