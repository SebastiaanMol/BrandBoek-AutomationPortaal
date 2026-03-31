---
phase: 03-export
plan: 01
subsystem: testing
tags: [vitest, jspdf, export, pdf, svg, canvas]

# Dependency graph
requires:
  - phase: 01-process-canvas
    provides: ProcessCanvas SVG rendered with selector ".process-canvas-wrap svg"; Processen.tsx export logic
provides:
  - Wave 0 test scaffold for PROC-05 export pipeline (src/test/exportFlow.test.ts)
  - 4 immediately-passing pure-logic unit tests for SVG selector, dimension extraction, canvas scaling, PDF sizing
  - 1 intentionally-red jsPDF importability test that turns green after Wave 1 npm install
affects: [03-export, 03-02, 03-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import with @vite-ignore and variable specifier to bypass Vite static analysis for intentionally-missing packages"
    - "Wave 0 test scaffold pattern: pure-logic tests pass immediately; npm-dependency test is intentionally red until Wave 1"

key-files:
  created:
    - src/test/exportFlow.test.ts
  modified: []

key-decisions:
  - "Use dynamic import with @vite-ignore + variable specifier for the jsPDF test — static top-level import causes Vite build-time suite crash; dynamic import degrades gracefully to a runtime test failure (correct Wave 0 behavior)"

patterns-established:
  - "Wave 0 test scaffold: pure helpers duplicated in test file; npm-dependency tests use @vite-ignore dynamic import to stay red without crashing suite"

requirements-completed: [PROC-05]

# Metrics
duration: 2min
completed: 2026-03-31
---

# Phase 3 Plan 01: Export Pipeline Test Scaffold Summary

**Wave 0 test scaffold for PROC-05 export pipeline: 4 pure-logic tests pass immediately, 1 jsPDF importability test intentionally red until Wave 1 installs the npm package**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-31T10:04:26Z
- **Completed:** 2026-03-31T10:06:30Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Created `src/test/exportFlow.test.ts` with 5 tests covering PROC-05 export pipeline logic
- Tests 1, 2, 4, 5 pass immediately (SVG_SELECTOR constant, svgDimensions with getAttribute/viewBox fallback, canvasDimensions 2x scaling, pdfDimensions halving)
- Test 3 is intentionally red with "Cannot find package 'jspdf'" — correct Wave 0 state, turns green in Wave 1

## Task Commits

1. **Task 1: Create exportFlow.test.ts scaffold** - `ef90c53` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/test/exportFlow.test.ts` - Wave 0 test scaffold for PROC-05 export pipeline; 5 tests, 4 green, 1 intentionally red

## Decisions Made

- Used `@vite-ignore` with a variable import specifier for the jsPDF test: a static top-level `import { jsPDF } from "jspdf"` causes Vite's build-time import analysis to crash the entire suite before any tests run. A dynamic `import(pkg)` with `@vite-ignore` degrades to a runtime failure, which is the correct "red test" behavior the plan requires.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced static import with @vite-ignore dynamic import for jsPDF test**
- **Found during:** Task 1 (Create exportFlow.test.ts scaffold)
- **Issue:** A static `import { jsPDF } from "jspdf"` at module top-level causes Vite's `vite:import-analysis` plugin to fail the entire file at transform time — no tests run at all. The plan's acceptance criteria requires "4 pass, 1 red" but static import produces "0 tests, suite crash".
- **Fix:** Changed to `const pkg = "jspdf"; const mod = await import(/* @vite-ignore */ pkg)` which bypasses Vite's static analysis and degrades to a runtime test failure only on Test 3.
- **Files modified:** src/test/exportFlow.test.ts
- **Verification:** `npx vitest run src/test/exportFlow.test.ts` shows 4 passed, 1 failed (jsPDF) as required
- **Committed in:** ef90c53

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in plan's assumed import form)
**Impact on plan:** Necessary for the acceptance criteria to be achievable. The @vite-ignore approach achieves identical Wave 0 intent: test is red, other tests are green.

## Issues Encountered

None beyond the jsPDF static import incompatibility with Vite (handled as deviation above).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 0 test scaffold complete. Plan 03-02 (Wave 1) can now install jspdf npm package and switch Processen.tsx from CDN to npm import.
- Running `npx vitest run src/test/exportFlow.test.ts` after Wave 1 should show 5/5 passing.
- No blockers.

---
*Phase: 03-export*
*Completed: 2026-03-31*
