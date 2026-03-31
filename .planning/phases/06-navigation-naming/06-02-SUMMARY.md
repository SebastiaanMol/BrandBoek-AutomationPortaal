---
phase: 06-navigation-naming
plan: "02"
subsystem: ui-labels
tags: [naming, english, i18n, status-badges, css]
dependency_graph:
  requires: []
  provides: [STATUS_LABELS, VERIFICATIE_LABELS, english-ui-labels]
  affects: [Dashboard, AlleAutomatiseringen, Verificatie, AutomatiseringForm, NieuweAutomatiseringPage, Analyse, Badges, VerificatieBadge, index.css]
tech_stack:
  added: []
  patterns: [display-map-pattern, db-value-preservation]
key_files:
  created: []
  modified:
    - src/lib/types.ts
    - src/components/Badges.tsx
    - src/components/VerificatieBadge.tsx
    - src/index.css
    - src/pages/Dashboard.tsx
    - src/pages/AlleAutomatiseringen.tsx
    - src/pages/Verificatie.tsx
    - src/components/AutomatiseringForm.tsx
    - src/pages/NieuweAutomatiseringPage.tsx
    - src/pages/Analyse.tsx
decisions:
  - STATUS_LABELS and VERIFICATIE_LABELS added to types.ts as canonical display maps keeping DB values Dutch
  - CSS badge class selectors renamed to English (actief→active, verouderd→outdated, uitgeschakeld→disabled)
  - Tab values in Dashboard and Verificatie updated to English; DB filter comparisons left unchanged
metrics:
  duration_minutes: 45
  completed_date: "2026-03-31"
  tasks_completed: 3
  files_modified: 10
requirements_satisfied: [NAME-01, NAME-02, NAME-03]
---

# Phase 06 Plan 02: English Label Replacement Summary

**One-liner:** All Dutch UI strings replaced with English via STATUS_LABELS/VERIFICATIE_LABELS display maps across 10 files while preserving Dutch DB values.

## What Was Built

Full English label pass across the entire portal display layer:

1. **Display maps in types.ts** — `STATUS_LABELS` and `VERIFICATIE_LABELS` exported as canonical lookup tables mapping Dutch DB values to English display strings. DB values (`"Actief"`, `"Verouderd"`, `"geverifieerd"`) remain unchanged throughout.

2. **StatusBadge and VerificatieBadge** — Both components now import and use the display maps. StatusBadge renders `STATUS_LABELS[status] ?? status`; VerificatieBadge renders `VERIFICATIE_LABELS[status] ?? status`. Hardcoded Dutch labels removed from VerificatieBadge.

3. **CSS class renames** — `badge-status-actief` → `badge-status-active`, `badge-status-verouderd` → `badge-status-outdated`, `badge-status-uitgeschakeld` → `badge-status-disabled` in both `index.css` (selectors) and `Badges.tsx` (usage). Color values unchanged.

4. **Dashboard.tsx** — Metric labels (Total Recorded, Active, Outdated, Disabled), Verification Status card, Automations by Status heading, tab values (active/outdated/disabled), CTA button, empty state. DB filter comparisons preserved.

5. **AlleAutomatiseringen.tsx** — Search placeholder, filter dropdowns, results count, Download CSV, Edit/Delete buttons, Delete dialog copy (UI-SPEC copywriting contract), detail field labels (Source System, Goal, Dependencies, Systems, Flow Steps, Improvement Ideas, Flow Diagram), empty state.

6. **Verificatie.tsx** — Progress text, keyboard hint, all tab values and state references updated (verification/verified/outdated/all), Back button, done state headings, Field labels (Dependencies, Last verified, Flow Steps), Note label, action buttons (Verified/Uncertain/Outdated/Edit/Verify), EmptyState messages, toast messages.

7. **AutomatiseringForm.tsx** — All field labels (Name, Category, Goal, Primary Systems, Customer Process Phase, Flow / Steps, Dependencies, Owner, Improvement Ideas, Links, Flow Diagram (Mermaid)), placeholders, helper text, Add step button, toast messages, submit button text (Save Automation / Save Changes / Saving...).

8. **NieuweAutomatiseringPage.tsx** — Tab value `handmatig`→`manual`, display text `Handmatig`→`Manual`.

9. **Analyse.tsx** — `getScoreLabel` returns High/Medium/Low; section headings (Customer Process Timeline, Impact & Complexity Scores, Dependency Graph, Overview Charts, Bottlenecks Overview); tooltip content; filter dropdowns; cascade labels (affected, None, Unknown).

## Decisions Made

- **DB value preservation:** All comparisons against DB values (`a.status === "Actief"` etc.) left unchanged. Display-only mapping applied at render time.
- **Display map pattern:** STATUS_LABELS and VERIFICATIE_LABELS act as the single source of truth for English display strings tied to Dutch DB values. Any future DB migration would only need to update these maps.
- **Tab value consistency:** Dashboard tabs changed from `actief/verouderd/uitgeschakeld` to `active/outdated/disabled`. Verificatie tabs changed from `verificatie/geverifieerd/verouderd/alle` to `verification/verified/outdated/all`. State references updated in tandem.
- **CSS selector naming:** Renamed to English to match English tab values and avoid confusion. Color CSS custom properties (`--status-active` etc.) were already English — only the class selectors changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Updated toast messages in Verificatie.tsx**
- **Found during:** Task 3
- **Issue:** Plan specified UI string changes but toast messages in Verificatie.tsx contained Dutch strings not in plan spec (`"geverifieerd ✅"`, `"In review gezet"`, `"Als verouderd gemarkeerd"`, `"Fout bij verificatie"`, `"Fout"`)
- **Fix:** Updated to English equivalents (`"verified ✅"`, `"Marked as In Review"`, `"Marked as outdated"`, `"Verification failed"`)
- **Files modified:** `src/pages/Verificatie.tsx`
- **Commit:** 600cbf8

**2. [Rule 2 - Missing] Translated remaining Dutch strings in Analyse.tsx**
- **Found during:** Task 3
- **Issue:** Plan covered `getScoreLabel` but additional Dutch strings existed: section headings, tooltip content, filter options, cascade labels, "Geen"/"Onbekend"
- **Fix:** Applied English to all visible Dutch strings in Analyse.tsx
- **Files modified:** `src/pages/Analyse.tsx`
- **Commit:** 600cbf8

**3. [Rule 2 - Missing] Updated "Systemen" labels in Verificatie.tsx AutoListItem**
- **Found during:** Task 3
- **Issue:** Two instances of `<p className="label-uppercase mb-1">Systemen</p>` in Verificatie.tsx AutoListItem not covered in plan spec
- **Fix:** Replaced both with "Systems"
- **Files modified:** `src/pages/Verificatie.tsx`
- **Commit:** 600cbf8

## Verification Results

- `npm run build` passes without errors
- No `badge-status-actief`, `badge-status-verouderd`, or `badge-status-uitgeschakeld` in `src/`
- `STATUS_LABELS` and `VERIFICATIE_LABELS` exported from `src/lib/types.ts`
- No hardcoded Dutch labels (`"Geverifieerd"`, `"Verouderd"`, `"Nooit geverifieerd"`) in `VerificatieBadge.tsx`
- All six page/component files show English labels only

## Known Stubs

None — all display strings are wired to real data or canonical maps.

## Self-Check: PASSED

Files exist:
- src/lib/types.ts — FOUND (STATUS_LABELS and VERIFICATIE_LABELS exported)
- src/components/Badges.tsx — FOUND (badge-status-active, badge-status-outdated, badge-status-disabled)
- src/components/VerificatieBadge.tsx — FOUND (VERIFICATIE_LABELS wired)
- src/index.css — FOUND (badge-status-active, badge-status-outdated, badge-status-disabled)
- src/pages/Dashboard.tsx — FOUND (Total Recorded, Automations by Status)
- src/pages/AlleAutomatiseringen.tsx — FOUND (Search all fields, Download CSV)
- src/pages/Verificatie.tsx — FOUND (verification tab, verified/outdated tabs)
- src/components/AutomatiseringForm.tsx — FOUND (Save Automation, Add step)
- src/pages/NieuweAutomatiseringPage.tsx — FOUND (Manual tab)
- src/pages/Analyse.tsx — FOUND (High/Medium/Low from getScoreLabel)

Commits:
- a65cefd — Task 1: types.ts, Badges.tsx, VerificatieBadge.tsx, index.css
- b538992 — Task 2: Dashboard.tsx, AlleAutomatiseringen.tsx
- 600cbf8 — Task 3: Verificatie.tsx, AutomatiseringForm.tsx, NieuweAutomatiseringPage.tsx, Analyse.tsx
