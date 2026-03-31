---
phase: 3
slug: export
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vite.config.ts |
| **Quick run command** | `npx vitest run src/test/exportFlow.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/test/exportFlow.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | PROC-05 | unit | `npx vitest run src/test/exportFlow.test.ts` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | PROC-05 | unit | `npx vitest run src/test/exportFlow.test.ts` | ✅ | ⬜ pending |
| 03-03-01 | 03 | 2 | PROC-05 | manual | human visual check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/test/exportFlow.test.ts` — stubs for PROC-05 (export function existence, jsPDF npm import, PNG trigger)

*Wave 0 creates the test scaffold; Wave 1 makes them pass.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PNG output is legible at normal zoom | PROC-05 | Visual quality check | Click Export → PNG, open file, confirm swimlane labels readable |
| PDF output shows correct layout | PROC-05 | Visual quality check | Click Export → PDF, open file, confirm swimlane layout matches canvas |
| CSS variable fills render correctly in export | PROC-05 | Pixel rendering | Check swimlane header backgrounds have correct colours in exported file |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
