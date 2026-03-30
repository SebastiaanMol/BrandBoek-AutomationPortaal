---
phase: 01-process-canvas
plan: "02"
subsystem: process-canvas
tags: [bug-fix, react-state, persistence, proc-03]
dependency_graph:
  requires: [01-01]
  provides: [PROC-03]
  affects: [src/pages/Processen.tsx]
tech_stack:
  added: []
  patterns: [useRef bridge pattern for async effect sequencing]
key_files:
  created:
    - src/test/processCanvas.test.ts
  modified:
    - src/pages/Processen.tsx
decisions:
  - "Use useRef to bridge the two load effects rather than combining them into one, preserving the independent fetch/React Query lifecycle"
metrics:
  duration: "3 minutes"
  completed: "2026-03-30"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 2
requirements:
  - PROC-03
---

# Phase 01 Plan 02: autoLinks Race Condition Fix Summary

**One-liner:** Fixed React two-effect load race in Processen.tsx using `savedLinksRef` so automation positions (fromStepId/toStepId) survive page refresh.

## What Was Done

PROC-03 had a confirmed critical bug: saved automation positions were never restored after a page refresh. The cause was a two-effect race condition:

- **Effect 1** (`fetchProcessState`) ran on mount, but `prev.automations` was still `[]` at that point — mapping autoLinks onto an empty array is a no-op.
- **Effect 2** (React Query `dbAutomations`) ran when the query resolved and replaced all automations, but `prev.automations` still had no positions, so `toCanvasAutomation(a, existing)` always received `existing = undefined`.

**Fix applied (three changes to Processen.tsx):**

1. Added `useRef` to the React import.
2. Declared `savedLinksRef` after the `useState` declarations.
3. Effect 1 now writes `savedLinksRef.current = saved.autoLinks` instead of trying to spread onto the empty automations array. Effect 2 reads `savedLinksRef.current[a.id]` as a fallback when `existing` is undefined — the `existing ?? (savedLink ? { ...savedLink } as Automation : undefined)` pattern.

Also created `src/test/processCanvas.test.ts` with 14 tests covering the PROC-03 autoLinks restoration logic and `toCanvasAutomation` field mapping.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Fix autoLinks race condition with savedLinksRef pattern | 9032a9e | src/pages/Processen.tsx, src/test/processCanvas.test.ts |

## Verification

- `grep "useRef" src/pages/Processen.tsx` matches import line
- `grep -c "savedLinksRef" src/pages/Processen.tsx` returns 3 (declaration + 2 usages)
- Old buggy `prev.automations.map(a => ({ ...a, ...(saved.autoLinks` pattern removed
- `npx vitest run src/test/processCanvas.test.ts` — 14/14 tests passed
- `npx tsc --noEmit` — exits 0, no errors

## Deviations from Plan

**1. [Rule 2 - Missing functionality] Created processCanvas.test.ts**

- **Found during:** Task 1 verification
- **Issue:** The plan's acceptance criteria required `npx vitest run src/test/processCanvas.test.ts` to exit 0, but the file did not exist in the codebase.
- **Fix:** Created the test file with 14 tests covering the PROC-03 savedLinksRef logic and `toCanvasAutomation` field mappings.
- **Files modified:** src/test/processCanvas.test.ts (created)
- **Commit:** 9032a9e (included in task commit)

## Known Stubs

None — the fix is complete and wires real data. No placeholders.

## Self-Check: PASSED

- `src/pages/Processen.tsx` exists and contains `savedLinksRef`
- `src/test/processCanvas.test.ts` exists and passes
- Commit `9032a9e` exists in git log
