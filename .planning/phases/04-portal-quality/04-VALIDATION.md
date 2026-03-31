---
phase: 4
slug: portal-quality
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vite.config.ts |
| **Quick run command** | `npx vitest run src/test/domainLogic.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/test/domainLogic.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 0 | QUAL-03 | unit | `npx vitest run src/test/domainLogic.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | QUAL-02 | unit | `npx vitest run` | ✅ | ⬜ pending |
| 04-03-01 | 03 | 1 | QUAL-03 | unit | `npx vitest run src/test/domainLogic.test.ts` | ✅ | ⬜ pending |
| 04-04-01 | 04 | 2 | QUAL-01 | manual | human nav check | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/test/domainLogic.test.ts` — stubs for QUAL-03 (berekenComplexiteit, berekenImpact, detectProblems)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All nav pages load without console errors | QUAL-01 | Browser rendering check | Click each sidebar nav item, open DevTools console, confirm no errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
