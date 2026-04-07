# Phase 8: Cross-Linking — Validation Strategy

**Phase:** 08-cross-linking
**Framework:** Vitest 4.1.0
**Baseline:** 78 tests across 6 files, all passing

---

## Test File

`src/test/crossLinking.test.ts`

---

## Requirement → Test Map

| Req ID | Behavior | Test Type | Assertion |
|--------|----------|-----------|-----------|
| LINK-01 | Link to `/processen` present in panel | `it.todo` stub | DOM render (React Testing Library — heavier than project pattern) |
| LINK-02 | Each system in `fullData.systemen` becomes a link to `/systems?system=X` | `it.todo` stub | DOM render |
| LINK-03 | Owner becomes a link to `/owners?owner=X` | `it.todo` stub | DOM render |
| LINK-04 | `deriveRelated` returns automations sharing a fase | full assertion | Pure logic, no DOM |
| LINK-04 | `deriveRelated` returns automations sharing a system | full assertion | Pure logic, no DOM |
| LINK-04 | `deriveRelated` excludes the current automation (self) | full assertion | Pure logic, no DOM |
| LINK-04 | `deriveRelated` returns empty array when nothing shares fase/system | full assertion | Pure logic, no DOM |
| LINK-04 | `deriveRelated` handles `fullData` with empty fasen and systemen | full assertion | Pure logic, no DOM |

---

## Pattern: DOM tests as it.todo stubs

LINK-01, LINK-02, LINK-03 require rendering `AutomationDetailPanel` in jsdom with React Testing Library. The project's established pattern (Phase 04 domainLogic.test.ts, Phase 07 entityPages.test.ts) is to extract pure logic and test that in isolation, using `it.todo` stubs for tests that would require heavier infrastructure. This keeps the Wave 0 scaffold non-blocking (zero failing tests) so Wave 1 can execute immediately.

Wave 1 does not need to make the DOM stubs green — the pure `deriveRelated` assertions are sufficient automated coverage. The DOM link presence is verified in Wave 2 (human smoke test).

---

## Test Factory

Reuse `makeAutomatisering` pattern from `entityPages.test.ts` — copy inline in `crossLinking.test.ts` (same established pattern: no shared fixture file, derivation functions inlined in test file).

---

## Run Commands

| When | Command |
|------|---------|
| Quick (during implementation) | `npx vitest run src/test/crossLinking.test.ts` |
| Per-task check | `npm run test -- --run` |
| Phase gate | `npm run test -- --run` (all 78+ tests green) |
