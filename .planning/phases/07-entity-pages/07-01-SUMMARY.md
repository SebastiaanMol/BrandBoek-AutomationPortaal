---
phase: 07-entity-pages
plan: 01
subsystem: testing
tags: [vitest, unit-test, tdd, wave-0, entity-pages]

requires:
  - phase: 06-navigation-naming
    provides: sidebar nav structure with Systems & People group ready for entity page routes

provides:
  - Wave 0 it.todo test scaffold for all four entity page requirement IDs (SYS-01, SYS-02, OWN-01, OWN-02)
  - makeAutomatisering() factory available in entityPages.test.ts for Wave 1 assertions

affects:
  - 07-02 (Systems page — will replace SYS-01 and SYS-02 stubs with passing assertions)
  - 07-03 (Owners page — will replace OWN-01 and OWN-02 stubs with passing assertions)

tech-stack:
  added: []
  patterns:
    - "it.todo stubs for Wave 0 scaffold — same pattern as Phase 04 portal-quality plan 01"
    - "makeAutomatisering() factory copied verbatim from domainLogic.test.ts for test reuse"

key-files:
  created:
    - src/test/entityPages.test.ts
  modified: []

key-decisions:
  - "Used it.todo stubs (not failing assertions) for Wave 0 scaffold so Wave 1 agents (07-02, 07-03) are not blocked by red test output — same decision as Phase 04"

patterns-established:
  - "Wave 0 test scaffold: header comment references which plans make tests GREEN; all tests are it.todo only"

requirements-completed: [SYS-01, SYS-02, OWN-01, OWN-02]

duration: 5min
completed: 2026-03-31
---

# Phase 07 Plan 01: Entity Pages Test Scaffold Summary

**Wave 0 it.todo scaffold with 12 stubs across 4 describe blocks covering SYS-01, SYS-02, OWN-01, OWN-02 derivation and filter logic**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-31T09:57:00Z
- **Completed:** 2026-03-31T09:57:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `src/test/entityPages.test.ts` with 12 `it.todo` stubs across 4 describe blocks
- All stubs map to requirement IDs: SYS-01 (systemCounts derivation), SYS-02 (system filter), OWN-01 (ownerCounts derivation), OWN-02 (owner filter)
- `npx vitest run src/test/entityPages.test.ts` exits 0 with all 12 tests shown as todo

## Task Commits

Each task was committed atomically:

1. **Task 1: Create entityPages.test.ts stub scaffold** - `c5692e6` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/test/entityPages.test.ts` — Wave 0 test scaffold with 4 describe blocks and 12 it.todo stubs

## Decisions Made

Used `it.todo` stubs (not failing assertions) for Wave 0 scaffold so Wave 1 agents (plans 07-02 and 07-03) are not blocked by red test output. This matches the established Phase 04 decision.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 0 scaffold complete; Wave 1 agents (07-02 Systems page, 07-03 Owners page) can now run in parallel without red test output
- Test file exists at `src/test/entityPages.test.ts` with all four describe blocks ready to receive passing assertions

---
*Phase: 07-entity-pages*
*Completed: 2026-03-31*
