---
phase: 7
slug: entity-pages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-02
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vite.config.ts |
| **Quick run command** | `npx vitest run src/test/entityPages.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/test/entityPages.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 0 | SYS-01, SYS-02, OWN-01, OWN-02 | unit | `npx vitest run src/test/entityPages.test.ts` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 1 | SYS-01, SYS-02 | unit | `npx vitest run src/test/entityPages.test.ts` | ✅ | ⬜ pending |
| 07-03-01 | 03 | 1 | OWN-01, OWN-02 | unit | `npx vitest run src/test/entityPages.test.ts` | ✅ | ⬜ pending |
| 07-04-01 | 04 | 2 | SYS-01, SYS-02, OWN-01, OWN-02 | manual | human smoke test | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/test/entityPages.test.ts` — stubs for SYS-01, SYS-02, OWN-01, OWN-02 (systemCounts derivation, ownerCounts derivation, filter logic)

*Wave 0 creates the test scaffold; Wave 1 makes them pass.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Click system name → filtered automation list | SYS-02 | UI interaction / React Router navigation | Open Systems page, click a system, confirm list shows only matching automations |
| Click owner name → filtered automation list | OWN-02 | UI interaction / React Router navigation | Open Owners page, click an owner, confirm list shows only their automations |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
