# Brand Boekhouders Automation Portal

## What This Is

An internal web portal for Brand Boekhouders (a Dutch accounting firm) that documents all their automations and presents them through an interactive BPMN model. Staff can see exactly what each automation does — what triggers it, which systems are involved, what steps it takes, and how automations connect to each other. Built as the ICT artefact for a 20-week HBO-ICT graduation internship.

## Core Value

One interactive BPMN overview where every automation Brand Boekhouders uses is visible, explorable, and maintainable — so anyone on the team can understand what runs, what triggers what, and where data flows.

## Requirements

### Validated

- ✓ Automation registration (CRUD: naam, trigger, stappen, systemen, owner, status, etc.) — existing
- ✓ Dashboard with status overview (Actief / Verouderd / Uitgeschakeld) — existing
- ✓ Interactive BPMN viewer with drag and edit — existing (may not be in latest commit)
- ✓ Knowledge graph (2D force-directed, React Flow) — existing
- ✓ Verification workflow (flag automations as reviewed) — existing
- ✓ Supabase auth (single-user, protected routes) — existing
- ✓ Analysis page with charts — existing
- ✓ Mermaid diagram per automation — existing

### Active

- [ ] Interactive BPMN model is complete and production-ready as the portal centerpiece
- [ ] All Brand Boekhouders automations are mapped and placed in the BPMN
- [ ] Each automation shows exactly what it does (trigger, steps, systems, data flow)
- [ ] Automation data stays up to date (manual entry + optional HubSpot/Zapier sync)
- [ ] BPMN model clearly shows how automations connect and interact
- [ ] Portal is clean, stable, and handover-ready for Brand Boekhouders staff

### Out of Scope

- Real-time live monitoring of automation execution — complexity exceeds internship scope
- Multi-user / team collaboration features — single maintainer assumed
- Mobile app — web portal only
- Full automated sync with all external systems — manual entry is acceptable fallback
- KennisGraaf3D — already built but not prioritized for final delivery

## Context

- **Codebase:** React 18 + TypeScript + Vite + Supabase + Tailwind + shadcn/ui
- **Backend:** Supabase (Postgres DB + Edge Functions for optional sync)
- **External systems:** HubSpot, Zapier, Typeform (sync stubs exist, not fully implemented)
- **Timeline:** 20-week internship, week 4 of 20 (started ~2026-03-10, ends ~2026-07-28)
- **Note:** The committed codebase may be behind the actual current state — the interactive BPMN with drag/edit has been built but may not be fully committed
- **Language:** UI labels in Dutch, code identifiers in English

## Constraints

- **Timeline:** ~16 weeks remaining — scope must be achievable solo
- **Tech stack:** React + Supabase is fixed (already in production)
- **GDPR/AVG:** Use anonymized data during development and testing; no real client data in version control
- **Graduation requirement:** Must be a working, demonstrable ICT artefact — functional portal, not just documentation
- **Handover:** Must be maintainable by Brand Boekhouders staff after internship ends

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| React + Supabase as tech stack | Already chosen and in use | ✓ Good |
| Portal as main ICT artefact | Addresses school feedback that project was too business-focused | ✓ Good |
| BPMN as primary visualization | Supervisor-approved deliverable, industry standard for process modeling | — Pending |
| Manual data entry as primary input | Sync integrations are complex stubs; manual entry is reliable fallback | — Pending |

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
*Last updated: 2026-03-30 after initialization*
