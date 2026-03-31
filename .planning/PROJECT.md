# Brand Boekhouders Automation Portal

## What This Is

An internal web portal for Brand Boekhouders (a Dutch accounting firm) that documents all their automations and presents them as an interactive swimlane process map. Staff can see exactly what each automation does — what triggers it, which systems are involved, what steps it takes, and how automations connect across customer lifecycle phases. Built as the ICT artefact for a 20-week HBO-ICT graduation internship.

## Core Value

One interactive process overview where every automation Brand Boekhouders uses is visible, explorable, and maintainable — organized by customer phase (Marketing → Sales → Onboarding → Boekhouding → Offboarding).

## Current Milestone: v1.1 Unified Portal Structure

**Goal:** Transform the portal from a collection of loosely related pages into one cohesive, hierarchically organized system where everything has a fixed place, consistent naming, and explicit cross-links.

**Target features:**
- Grouped sidebar navigation with named sections (Overview / Automations / Systems & People / Analysis)
- Systems page: dedicated entity page listing all systems with linked automations count and drill-in view
- Owners page: dedicated entity page listing all owners with their automations
- Cross-links in automation detail: linked process, system(s), owner, and related automations — all clickable
- Naming consistency: all labels in English, page h1 matches nav label, form fields consistent, status labels consistent
- Remove dead pages: Mindmap, Kennisgraaf, BPMN Viewer, Proceskaart

## Requirements

### Validated

- ✓ Automation registration CRUD (naam, trigger, stappen, systemen, owner, status, fasen, etc.)
- ✓ Dashboard with status overview (Actief / Verouderd / Uitgeschakeld)
- ✓ Interactive swimlane process canvas with drag/edit (Processen page, ProcessCanvas.tsx)
- ✓ Automation detail panel with full info + step viewer
- ✓ BPMN viewer v2 (BPMNViewer.tsx, 739 lines)
- ✓ Knowledge graph (2D force-directed, React Flow) with clustering + problem detection
- ✓ Verification workflow (flag automations as reviewed, with date + person)
- ✓ Analysis page with charts
- ✓ Mermaid diagram per automation
- ✓ Supabase auth (protected routes)
- ✓ Imports page — HubSpot sync + AI confidence review flow
- ✓ Python FastAPI backend (HubSpot connector + plain-language mapper)
- ✓ AI evaluation edge function (evaluate-automation)
- ✓ Process state persistence (Supabase process_state table)
- ✓ Proceskaart page (process map overview)

### Active

- [ ] All Brand Boekhouders automations are entered and accurately mapped in the portal
- [x] Process canvas is fully polished as the primary demo deliverable *(Validated in Phase 1: Process Canvas)*
- [x] Export of process map as PNG or PDF *(Validated in Phase 3: Export)*
- [x] Portal is stable with no broken pages, clean navigation *(Validated in Phase 4: Portal Quality)*
- [x] Basic test coverage for critical domain logic *(Validated in Phase 4: Portal Quality)*
- [ ] Portal is one cohesive system with consistent naming, grouped navigation, and entity pages for Systems and Owners
- [ ] Python backend is documented and deployable
- [ ] Handover documentation for Brand Boekhouders staff

### Out of Scope

- Real-time live monitoring of automation execution — exceeds internship scope
- Multi-user collaboration — single maintainer assumed
- Mobile app — web portal only
- KennisGraaf3D — built but not prioritized for final delivery
- Full sync for all external systems (Zapier, Typeform) — HubSpot is primary

## Context

- **Codebase:** React 18 + TypeScript + Vite + Supabase + Tailwind + shadcn/ui (frontend)
- **Backend:** Python FastAPI + Supabase (for HubSpot mapping and AI evaluation)
- **External systems:** HubSpot (primary sync), Zapier, Typeform (stubs)
- **Timeline:** 20-week internship, week 4 of 20 (~2026-03-10 → ~2026-07-28)
- **Language:** UI labels in Dutch, code identifiers in English
- **GDPR/AVG:** Use anonymized data during development; no real client data in version control

## Constraints

- **Timeline:** ~16 weeks remaining — scope must be achievable solo
- **Tech stack:** React + Supabase + Python FastAPI is fixed
- **Graduation requirement:** Must be a working, demonstrable ICT artefact
- **Handover:** Must be maintainable by Brand Boekhouders staff after internship ends
- **GDPR:** Anonymized test data only; real client names/data must stay out of git

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React + Supabase as tech stack | Already chosen and in use | ✓ Good |
| Portal as main ICT artefact | Addresses school feedback that project was too business-focused | ✓ Good |
| Swimlane canvas as primary visualization | Organizes automations by KlantFase — matches Brand Boekhouders workflow | ✓ Good |
| Python FastAPI backend for HubSpot | Complex mapping logic (836-line mapper) better suited to Python than Edge Functions | — Pending |
| Manual entry + HubSpot import as data strategy | Reliable; Zapier/Typeform sync is lower priority | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-31 — Milestone v1.1 (Unified Portal Structure) started*
