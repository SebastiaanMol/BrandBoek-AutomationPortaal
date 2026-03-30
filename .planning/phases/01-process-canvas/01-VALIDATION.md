---
phase: 1
slug: process-canvas
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + @testing-library/jest-dom |
| **Config file** | `vitest.config.ts` (project root) |
| **Quick run command** | `npx vitest run src/test/processCanvas.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/test/processCanvas.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 0 | PROC-01, PROC-02, PROC-03, PROC-04 | unit | `npx vitest run src/test/processCanvas.test.ts` | ❌ W0 | ⬜ pending |
| 1-02-01 | 02 | 1 | PROC-03 | unit | `npx vitest run src/test/processCanvas.test.ts` | ❌ W0 | ⬜ pending |
| 1-03-01 | 03 | 1 | PROC-04 | unit | `npx vitest run src/test/processCanvas.test.ts` | ❌ W0 | ⬜ pending |
| 1-04-01 | 04 | 2 | PROC-01, PROC-02, PROC-03, PROC-04 | manual | Browser: open Processen page, verify all criteria | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/test/processCanvas.test.ts` — unit tests covering PROC-01 through PROC-04 logic paths:
  - `toCanvasAutomation()` team assignment with and without `fasen`
  - autoLinks merge logic (the ref pattern fix for PROC-03)
  - `handleAttach` / `handleDetach` state transitions (PROC-02)
  - Field mappings: `trigger`, `stappen`, `systemen`, `owner` from `Automatisering` (PROC-04)

*(Existing infrastructure: `vitest.config.ts`, `src/test/setup.ts`, and `src/test/example.test.ts` already exist — only the new test file is needed)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag automation from UnassignedPanel onto arrow, dot appears on canvas | PROC-02 | Requires browser HTML5 drag events | Open Processen, drag automation from panel to an arrow, confirm dot appears |
| Save + page refresh restores attached automations | PROC-03 | Requires Supabase I/O + browser refresh | Attach automations, click Opslaan, refresh page, confirm dots still on arrows |
| Click dot → detail panel opens with trigger/steps/systems/owner | PROC-04 | Requires visual verification of panel fields | Click any automation dot, confirm all 4 fields render in side panel |
| All 5 swimlanes render on Processen page without console errors | PROC-01, PROC-04 | Full rendering requires browser | Open Processen, check DevTools console for errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
