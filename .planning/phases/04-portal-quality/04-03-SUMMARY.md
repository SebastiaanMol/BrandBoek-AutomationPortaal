---
phase: 04-portal-quality
plan: "03"
subsystem: testing
tags: [tests, domain-logic, tdd, green-phase]
dependency_graph:
  requires: [04-01]
  provides: [QUAL-03]
  affects: []
tech_stack:
  added: []
  patterns: [vitest, tdd-green-phase, makeAutomatisering-helper]
key_files:
  created:
    - src/test/domainLogic.test.ts
  modified: []
decisions:
  - "No architectural changes needed — all tests written against existing exported functions"
metrics:
  duration_minutes: 8
  completed_date: "2026-03-31"
  tasks_completed: 2
  files_changed: 1
---

# Phase 04 Plan 03: Domain Logic Test Coverage (GREEN Phase) Summary

**One-liner:** Replace 11 it.todo stubs with 12 real passing assertions covering berekenComplexiteit scoring formulas, berekenImpact dep/status logic, and detectProblems problem detection branches.

## What Was Built

`src/test/domainLogic.test.ts` — complete GREEN-phase implementation replacing the RED scaffold from Plan 04-01.

### berekenComplexiteit (5 tests)
- Empty automation → 0
- 4 stappen → stappenScore 40 (cap boundary)
- 5 stappen → still 40 (cap enforcement verified)
- Non-empty afhankelijkheden → 15
- Combined: 1 stap + 1 systeem + afhankelijkheden + 1 koppeling → 42

### berekenImpact (3 tests)
- 2 fasen + Actief status → 34 (fasenScore 24 + statusBonus 10)
- depScore: two-automation scenario where autoB.koppelingen[0].doelId = autoA.id → 30 (statusBonus 10 + depScore 20)
- Verouderd status → 0 (no statusBonus)

### detectProblems (4 tests)
- owner="" → includes missing-owner problem
- trigger="" → includes missing-trigger problem
- Single automation, empty koppelingen → flagged as orphan
- Two connected automations (B links to A via koppelingen) → zero orphan problems

## Test Results

- `npx vitest run src/test/domainLogic.test.ts`: 12/12 passed
- `npx vitest run`: 13/13 passed (example.test.ts + domainLogic.test.ts)
- `npx tsc --noEmit`: 0 errors

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- File exists: src/test/domainLogic.test.ts — FOUND
- Commit e3a512b — FOUND
- 0 it.todo stubs remaining
- 12 real it() tests passing
