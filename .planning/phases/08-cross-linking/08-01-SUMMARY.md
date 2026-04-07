---
phase: 08-cross-linking
plan: "01"
subsystem: test
tags: [vitest, pure-logic, cross-linking, wave-0]
dependency_graph:
  requires: []
  provides: [crossLinking.test.ts scaffold]
  affects: [src/test/crossLinking.test.ts]
tech_stack:
  added: []
  patterns: [inline pure-function extraction, makeAutomatisering factory, it.todo stubs]
key_files:
  created:
    - src/test/crossLinking.test.ts
  modified: []
decisions:
  - Inline deriveRelated in the test file (same pattern as deriveSystemCounts in entityPages.test.ts) — no shared fixture file
  - DOM-level LINK-01/02/03 tests are it.todo stubs to keep Wave 0 non-blocking
metrics:
  duration: ~5 minutes
  completed: 2026-04-02
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Phase 8 Plan 01: crossLinking.test.ts Wave 0 Scaffold Summary

Wave 0 test scaffold for Phase 8 cross-linking: `deriveRelated` pure function tested with 7 full assertions, 3 it.todo stubs for DOM-level link presence (LINK-01, LINK-02, LINK-03).

## What Was Built

`src/test/crossLinking.test.ts` — 107 lines following the exact pattern of `entityPages.test.ts`:

- `makeAutomatisering` factory copied inline (same established convention)
- `deriveRelated(all, current)` inline pure function (mirrors the logic that `AutomationDetailPanel.tsx` will use in Wave 1)
- 7 full assertions in `describe("deriveRelated")` covering all edge cases
- 3 `it.todo` stubs for DOM rendering tests (LINK-01, LINK-02, LINK-03)

## Test Results

| Suite | Tests | Outcome |
|-------|-------|---------|
| crossLinking.test.ts (isolated) | 7 pass, 3 todo | Exit 0 |
| Full suite (7 files) | 85 pass, 3 todo | Exit 0 |

Pre-existing baseline was 78 tests. Added 7 new passing assertions. No regressions.

## deriveRelated Logic Tested

```typescript
function deriveRelated(all: Automatisering[], current: Automatisering): Automatisering[] {
  return all.filter(a => {
    if (a.id === current.id) return false;
    const sharedFase = a.fasen?.some(f => current.fasen?.includes(f));
    const sharedSystem = a.systemen?.some(s => current.systemen?.includes(s));
    return sharedFase || sharedSystem;
  });
}
```

Cases covered:
- Empty all array → length 0
- Shared fase → included
- Shared system → included
- Self in all array → excluded
- No shared fase or system → excluded
- Sharing BOTH fase and system → appears exactly once (no duplicate)
- Current has empty fasen/systemen → length 0

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 2e0f140 | test(08-01): add crossLinking.test.ts Wave 0 scaffold |

## Self-Check

- [x] `src/test/crossLinking.test.ts` exists
- [x] `npx vitest run src/test/crossLinking.test.ts` exits 0 (7 pass, 3 todo)
- [x] `npm run test -- --run` exits 0 (85 pass, 3 todo, 7 files)
- [x] commit `2e0f140` exists in git log
- [x] 7 full assertions on deriveRelated (all listed cases covered)
- [x] 3 it.todo stubs for LINK-01, LINK-02, LINK-03

## Self-Check: PASSED
