---
phase: 08-cross-linking
plan: "02"
subsystem: AutomationDetailPanel
tags: [cross-linking, react-router-dom, navigation, related-automations]
dependency_graph:
  requires:
    - 08-01 (crossLinking.test.ts scaffold)
    - 07-02 (Systems.tsx with ?system= param)
    - 07-03 (Owners.tsx with ?owner= param)
  provides:
    - AutomationDetailPanel with LINK-01 through LINK-04
  affects:
    - src/components/process/AutomationDetailPanel.tsx
tech_stack:
  added: []
  patterns:
    - Link from react-router-dom for internal navigation (not <a> tags)
    - useAutomatiseringen hook called before early return (rules of hooks)
    - encodeURIComponent on all URL param values
    - In-memory filter with .slice(0, 5) cap for related automations
key_files:
  modified:
    - src/components/process/AutomationDetailPanel.tsx
decisions:
  - "Hook call (useAutomatiseringen) placed before early return to satisfy React rules of hooks — hook cannot be called after conditional return"
  - "relatedAutomations derived inline in component matching deriveRelated shape in crossLinking.test.ts exactly — no extraction to separate module"
  - "LINK-01 uses simple /processen with no query param — automation is visible on canvas by definition; no highlight mechanism required"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-02"
  tasks_completed: 2
  files_modified: 1
---

# Phase 8 Plan 02: Cross-Link AutomationDetailPanel Summary

AutomationDetailPanel becomes a navigation hub with four React Router links: View on canvas, clickable system badges to /systems, clickable owner to /owners, and a Related section showing up to 5 automations sharing a fase or system each linking to /alle?open={id}.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | LINK-01, LINK-02, LINK-03 — canvas link, system badges, owner link | 9d21928 | AutomationDetailPanel.tsx |
| 2 | LINK-04 — Related automations section | 9d21928 | AutomationDetailPanel.tsx |

Both tasks were implemented in a single commit since all changes were in the same file and interdependent.

## What Was Built

### LINK-01: View on canvas
Added a `<Link to="/processen">` with ExternalLink icon immediately after the body scroll area opens. Guarded with `{fullData && ...}` — absent when fullData is undefined.

### LINK-02: System badge links
Each system in `fullData.systemen` is now wrapped in `<Link to={/systems?system=${encodeURIComponent(s)}}>`. The existing outer guard `{fullData?.systemen && fullData.systemen.length > 0 && ...}` was preserved. Badge gets `cursor-pointer hover:opacity-80 transition-opacity` for visual affordance.

### LINK-03: Owner link
The owner text is wrapped in `<Link to={/owners?owner=${encodeURIComponent(fullData.owner)}}>` inside the existing Beheer section. The existing `{fullData.owner && ...}` guard was preserved.

### LINK-04: Related automations
`useAutomatiseringen()` hook is called at the top of the component (before the early return to satisfy rules of hooks). `relatedAutomations` is derived inline:
- Filter predicate: shared fase OR shared system
- Self excluded: `a.id === fullData.id` check
- Cap: `.slice(0, 5)`
- When `fullData` is undefined: evaluates to `[]`

The "Related" section renders only when `relatedAutomations.length > 0`. Each row is a `<Link to={/alle?open=${rel.id}}>` with an ArrowRight icon and the automation name.

## Verification

- `npx vitest run`: 85 tests passed, 3 todo stubs (DOM-level link presence tests, Wave 0 design)
- `npx tsc --noEmit`: exits 0, no type errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Hook moved before early return**

- **Found during:** Task 2 implementation review
- **Issue:** The plan showed `useAutomatiseringen()` called after the existing `if (!automation) return null` guard. Calling a React hook after a conditional return violates the rules of hooks and causes a runtime error.
- **Fix:** Moved `const { data: allAutomations } = useAutomatiseringen()` to the top of the component body, before the early return guard.
- **Files modified:** src/components/process/AutomationDetailPanel.tsx
- **Commit:** 9d21928

## Known Stubs

None — all cross-links are fully wired. The three `it.todo` entries in crossLinking.test.ts are for DOM-level link presence tests which are a Wave 0 design decision (pure logic tested inline, DOM tests deferred to Wave 2 smoke test per 08-RESEARCH.md).

## Self-Check: PASSED
