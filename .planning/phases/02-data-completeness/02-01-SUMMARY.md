---
phase: 02-data-completeness
plan: 01
subsystem: hubspot-sync
tags: [inference, fasen, edge-function, tests, tdd]
dependency_graph:
  requires: []
  provides: [inferFasen-logic, importsFlow-test-scaffold]
  affects: [automatiseringen.fasen, hubspot-sync-insert-path]
tech_stack:
  added: []
  patterns: [pure-logic-duplication-for-testability, keyword-regex-inference]
key_files:
  created:
    - src/test/importsFlow.test.ts
  modified:
    - supabase/functions/hubspot-sync/index.ts
decisions:
  - Duplicated inferFasen in test file (same pattern as processCanvas.test.ts) — Deno edge function cannot be imported into Vitest directly
  - inferFasen uses regex-based keyword matching ordered by KlantFase priority (Onboarding first to match "welkom/intake")
metrics:
  duration_seconds: 121
  completed_date: "2026-03-31"
  tasks_completed: 1
  files_changed: 2
---

# Phase 02 Plan 01: inferFasen Edge Function and Test Scaffold Summary

## One-liner

Keyword-based fasen inference added to HubSpot sync edge function — new imports now arrive with AI-suggested KlantFase values based on workflow name patterns, with 16-test Vitest scaffold validating the logic.

## What Was Built

### inferFasen function (supabase/functions/hubspot-sync/index.ts)

A pure function placed before `mapWorkflow` that scans a workflow's `name` field against Dutch/English keyword regexes and returns matching `KlantFase` string values. Supports multi-phase results (e.g., "Onboarding sales flow" returns `["Onboarding", "Sales"]`).

### mapWorkflow integration

- `inferredFasen = inferFasen(wf)` called after `beschrijvingInSimpeleTaal`
- `fasen` key added to the `confidence` object: `"medium"` when inferred, `"low"` when no keyword match
- `fasen: inferredFasen` added to the return object

### Insert path update

Changed `fasen: []` (hardcoded empty) to `fasen: mapped.fasen` so new HubSpot imports arrive with inferred phase suggestions.

### Update path preserved

The update path (existing records) does NOT include `fasen` — a D-09 comment was added to document this is intentional, preserving reviewer-assigned fasen values.

### Test scaffold (src/test/importsFlow.test.ts)

16 Vitest tests covering:
- **inferFasen** (10 tests): single-phase matches, multi-phase, no match, empty name, missing name
- **Approve block logic** (3 tests): blocks when fasen is `[]` or `undefined`, passes when non-empty
- **handleSave patch shape** (3 tests): patch includes `fasen` and `owner` keys, uses `trigger_beschrijving` column name

All 16 tests pass.

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| `src/test/importsFlow.test.ts` exists with `describe("inferFasen"` | PASS |
| `src/test/importsFlow.test.ts` contains `describe("Approve block logic"` | PASS |
| `src/test/importsFlow.test.ts` contains `describe("handleSave patch shape"` | PASS |
| `supabase/functions/hubspot-sync/index.ts` contains `function inferFasen(wf` | PASS |
| Edge function contains `fasen: inferredFasen.length > 0 ? "medium" : "low"` | PASS |
| Insert path contains `fasen: mapped.fasen` (not `fasen: []`) | PASS |
| Update path does NOT contain `fasen:` in update object | PASS |
| `npm run test` exits 0 with all importsFlow tests passing | PASS (16/16) |

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | `28040d2` | feat(02-01): add inferFasen to edge function and test scaffold |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. The `inferFasen` function is fully wired into the insert path. The test helpers (`isApproveBlocked`, `buildSavePatch`) are pure test utilities that document contracts for future UI wiring — they are not rendering stubs.

## Self-Check: PASSED

- `src/test/importsFlow.test.ts` — FOUND
- `supabase/functions/hubspot-sync/index.ts` (modified) — FOUND
- Commit `28040d2` — FOUND
