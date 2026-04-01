---
phase: 06-navigation-naming
plan: "03"
subsystem: ui
tags: [react, accessibility, navigation, heading, sr-only]

# Dependency graph
requires:
  - phase: 06-01
    provides: Grouped sidebar with English nav labels (NAV-01)
  - phase: 06-02
    provides: All UI strings replaced with English (NAME-01)
provides:
  - Every routed page has exactly one <h1> whose text matches the sidebar nav label
  - Accessibility landmark for screen readers on all pages
  - NAV-02 contract fulfilled: sidebar label == page h1
affects: [07-entity-pages, 08-cross-linking]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sr-only h1 pattern for full-bleed or card-driven pages without visible page title"
    - "Visible h1 with text-xl font-semibold tracking-tight text-foreground for pages with content headers"

key-files:
  created: []
  modified:
    - src/pages/Dashboard.tsx
    - src/pages/AlleAutomatiseringen.tsx
    - src/pages/Processen.tsx
    - src/pages/Analyse.tsx
    - src/pages/Imports.tsx
    - src/pages/NieuweAutomatiseringPage.tsx
    - src/pages/Verificatie.tsx

key-decisions:
  - "Dashboard, AlleAutomatiseringen, Processen, Analyse, Verificatie use sr-only h1 — page identity communicated via content/metrics rather than visible title"
  - "Imports and NieuweAutomatiseringPage use visible h1 — content benefits from an explicit page title"
  - "h1 text is byte-identical to sidebar nav label per NAV-02 contract"

patterns-established:
  - "sr-only h1 pattern: use when page has a strong visual identity (metrics, canvas, progress bar) that replaces a visible title"
  - "Visible h1 pattern: class='text-xl font-semibold tracking-tight text-foreground', placed at top of content area"

requirements-completed: [NAV-02]

# Metrics
duration: ~10min
completed: 2026-03-31
---

# Phase 06 Plan 03: Page h1 Elements Summary

**sr-only and visible h1 elements added to all 7 routed pages, completing NAV-02: sidebar label == page h1 for every destination**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-03-31T21:50:00Z
- **Completed:** 2026-03-31T22:00:00Z
- **Tasks:** 2 (1 auto + 1 human-verify)
- **Files modified:** 7

## Accomplishments

- Added `<h1 className="sr-only">` to Dashboard, AlleAutomatiseringen, Processen, Analyse, and Verificatie pages
- Added visible `<h1>` to Imports and NieuweAutomatiseringPage where a page title improves usability
- Human verifier approved all Phase 6 checks: sidebar grouping, dead pages removed, English labels, and h1 correspondence

## Task Commits

Each task was committed atomically:

1. **Task 1: Add h1 elements to all pages missing one** - `29c7d26` (feat)
2. **Task 2: Checkpoint — Human verification** - approved by user (no code change)

## Files Created/Modified

- `src/pages/Dashboard.tsx` - Added `<h1 className="sr-only">Dashboard</h1>` as first child of return JSX
- `src/pages/AlleAutomatiseringen.tsx` - Added `<h1 className="sr-only">All Automations</h1>`
- `src/pages/Processen.tsx` - Added `<h1 className="sr-only">Processes</h1>` wrapped in Fragment
- `src/pages/Analyse.tsx` - Added `<h1 className="sr-only">Analysis</h1>`
- `src/pages/Verificatie.tsx` - Added `<h1 className="sr-only">Verification</h1>`
- `src/pages/Imports.tsx` - Added visible `<h1>Imports</h1>`
- `src/pages/NieuweAutomatiseringPage.tsx` - Added visible `<h1>New Automation</h1>` above Tabs

## Decisions Made

- Used sr-only for Dashboard, AlleAutomatiseringen, Processen, Analyse, Verificatie — these pages have strong visual identities (metric cards, canvas, progress bar) that make a visible heading redundant; sr-only satisfies accessibility without altering design.
- Used visible h1 for Imports and NieuweAutomatiseringPage — these pages benefit from an explicit title to orient the user.
- h1 text values match NAV-02 table exactly (byte-identical to sidebar labels).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all pages render real data; no placeholder content introduced.

## Next Phase Readiness

Phase 6 (Navigation & Naming) is fully complete:
- NAV-01: Grouped sidebar with 4 named groups
- NAV-02: Every routed page has an h1 matching its sidebar label
- NAV-03: Dead pages (/mindmap, /kennisgraaf, /bpmn, /proceskaart) removed
- NAME-01: All UI strings in English

Phase 7 (Entity Pages) can proceed — Systems and Owners pages with drill-in navigation.

---
*Phase: 06-navigation-naming*
*Completed: 2026-03-31*
