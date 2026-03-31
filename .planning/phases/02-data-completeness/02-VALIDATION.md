---
phase: 2
slug: data-completeness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already configured via vite) |
| **Config file** | `vite.config.ts` (or `vitest.config.ts` if added in Wave 0) |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | DATA-02 | manual | n/a — HubSpot token required | n/a | ⬜ pending |
| 02-01-02 | 01 | 1 | DATA-02 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | DATA-03 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 2 | DATA-03 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 2 | DATA-03 | unit | `npm run test -- --run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/pages/__tests__/Imports.test.tsx` — stubs for DATA-02, DATA-03
- [ ] vitest + @testing-library/react installed if not already present

*Check `package.json` for existing vitest dependency before installing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| HubSpot sync triggers correctly and produces pending_approval records | DATA-02 | Requires live HubSpot token and real API call | Click "HubSpot synchroniseren" in Imports page; verify pending items appear |
| Approve button disabled when fasen is empty | DATA-03 | UI state validation | Open a pending automation with empty fasen; confirm button is disabled |
| Warning dialog appears when stappen is empty | DATA-03 | User interaction flow | Open a pending automation with empty stappen; click Approve; confirm dialog appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
