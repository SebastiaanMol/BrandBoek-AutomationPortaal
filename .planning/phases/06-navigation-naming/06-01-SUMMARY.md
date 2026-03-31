---
phase: 06-navigation-naming
plan: "01"
subsystem: navigation
tags: [sidebar, navigation, routing, cleanup, naming]
dependency_graph:
  requires: []
  provides: [grouped-sidebar, dead-pages-removed]
  affects: [AppLayout.tsx, App.tsx]
tech_stack:
  added: []
  patterns: [navGroups array, group header rendering]
key_files:
  created: []
  modified:
    - src/components/AppLayout.tsx
    - src/App.tsx
  deleted:
    - src/pages/Mindmap.tsx
    - src/pages/KennisGraaf.tsx
    - src/pages/KennisGraaf3D.tsx
    - src/pages/BPMNViewer.tsx
    - src/pages/Proceskaart.tsx
decisions:
  - navGroups flatMap pattern used in top bar span to search across all grouped items
  - First group header (Overview) uses pt-0 to sit flush below brand header separator
  - bottomNavItems title updated to English (Settings) matching NAME-01 audit
metrics:
  duration_minutes: 8
  completed_date: "2026-03-31"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 7
---

# Phase 6 Plan 01: Sidebar Grouping and Dead Page Removal Summary

**One-liner:** Replaced flat navItems array with navGroups (4 named sections) in AppLayout, removed 5 dead page files and 4 dead routes from App.tsx, updated all Dutch UI labels to English.

## What Was Built

- **AppLayout.tsx:** Sidebar now renders four named group headers (Overview, Automations, Systems & People, Analysis) by mapping over a `navGroups` array. Each group header uses `text-[10px] font-semibold uppercase tracking-widest` styling. Nav item padding changed from `px-5 py-2.5` to `px-4 py-2`. Brand header updated to "Automation Portal", sign-out button to "Sign out", top bar fallback to "Portal". Dead paths `/mindmap`, `/kennisgraaf`, `/bpmn` removed from main className conditional (only `/processen` remains full-bleed).

- **App.tsx:** Removed imports and routes for BPMNViewer, Mindmap, KennisGraaf, and Proceskaart. Loading spinner text updated from "Laden..." to "Loading...".

- **Deleted files:** Mindmap.tsx, KennisGraaf.tsx, KennisGraaf3D.tsx, BPMNViewer.tsx, Proceskaart.tsx — all removed from disk and git history.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | bf5fca9 | feat(06-01): replace flat navItems with grouped navGroups in AppLayout |
| Task 2 | e2c00e7 | feat(06-01): remove dead routes and page files from App.tsx |

## Verification

- `npm run build` completed successfully with no TypeScript errors
- `grep "navGroups" src/components/AppLayout.tsx` returns matches (array defined and used)
- `grep "navItems" src/components/AppLayout.tsx` returns no matches
- `grep "Systems & People" src/components/AppLayout.tsx` returns match
- `grep "Automation Portal" src/components/AppLayout.tsx` returns match
- `grep "Sign out" src/components/AppLayout.tsx` returns match
- `grep "mindmap\|kennisgraaf\|bpmn" src/components/AppLayout.tsx` returns no matches
- All 5 dead page files confirmed deleted from disk

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- **Systems & People group** (`src/components/AppLayout.tsx`, line 37–39): `items: []` — intentional placeholder for the Systems and Owners pages to be built in Phase 7 (Entity Pages). The group header renders but has no nav items. This is by design per the plan (NAV-01 requires the header to exist; the pages are Phase 7 scope).

## Self-Check: PASSED

- `src/components/AppLayout.tsx` exists and contains navGroups
- `src/App.tsx` exists with no dead imports
- Dead page files confirmed absent from disk
- Commits bf5fca9 and e2c00e7 confirmed in git log
