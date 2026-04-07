# Requirements: Brand Boekhouders Automation Portal

**Defined:** 2026-03-30
**Core Value:** One interactive process overview where every automation Brand Boekhouders uses is visible, organized by customer phase, and explorable by any team member.

## v1 Requirements

### Process Canvas

- [x] **PROC-01**: User can view all automations loaded into the swimlane canvas, organized by customer phase
- [x] **PROC-02**: User can drag automations between swimlanes and reposition them on the canvas
- [x] **PROC-03**: Automation placement and connections persist across sessions (saved to Supabase)
- [x] **PROC-04**: User can click an automation to see full details in the side panel (trigger, steps, systems, owner)
- [x] **PROC-05**: Process map can be exported as PNG or PDF

### Data & Imports

- [x] **DATA-01**: All Brand Boekhouders automations are entered in the portal (manually or via HubSpot import)
- [x] **DATA-02**: HubSpot import flow works end-to-end (sync → confidence review → approve/reject → save to DB)
- [x] **DATA-03**: Imported automations have correct and complete fields (trigger, steps, systems, phase, owner)

### Portal Quality

- [ ] **QUAL-01**: All routed pages are stable and accessible from the sidebar nav
- [x] **QUAL-02**: Legacy/dead code removed (NieuweAutomatisering.tsx, dual storage layer reconciled)
- [x] **QUAL-03**: Core domain logic (berekenComplexiteit, berekenImpact, graphProblems) has basic test coverage

### Backend

- [ ] **BACK-01**: Python FastAPI backend is documented with clear setup instructions
- [ ] **BACK-02**: Backend can be run locally from `.env.example` without extra configuration steps

### Handover

- [ ] **HAND-01**: Portal is deployed and accessible to Brand Boekhouders staff
- [ ] **HAND-02**: Brief usage guide exists for maintaining the portal after internship ends

## v1.1 Requirements

### Navigation & Structure

- [x] **NAV-01**: Sidebar is organized into named sections with group headers (Overview / Automations / Systems & People / Analysis)
- [x] **NAV-02**: Every sidebar nav label exactly matches the h1 heading on its destination page
- [x] **NAV-03**: Dead pages are removed from the codebase (Mindmap, Kennisgraaf, BPMN Viewer, Proceskaart)

### Systems

- [x] **SYS-01**: User can view a Systems page listing all unique systems with their automation count
- [x] **SYS-02**: User can click a system to see all automations linked to that system

### Owners

- [x] **OWN-01**: User can view an Owners page listing all unique owners with their automation count
- [x] **OWN-02**: User can click an owner to see all automations they own

### Cross-Linking

- [x] **LINK-01**: Automation detail view shows a clickable link to the process canvas (navigates to Processes page)
- [x] **LINK-02**: Automation detail view shows each system as a clickable badge that navigates to the Systems page filtered to that system
- [x] **LINK-03**: Automation detail view shows the owner as a clickable link that navigates to the Owners page filtered to that person
- [x] **LINK-04**: Automation detail view shows related automations (same phase or sharing a system)

### Naming Consistency

- [x] **NAME-01**: All UI labels, nav items, and page titles use English (no Dutch labels in the interface)
- [x] **NAME-02**: Form field labels are consistent across all pages that reference the same concept (e.g. Name, Trigger, Steps, Systems always the same term)
- [x] **NAME-03**: Status labels (Active, Outdated, Disabled) are consistent across all pages that display automation status

## v1.2 Requirements

### Signal Detection (Brandy Signaalengine)

- [ ] **BSIG-01**: The signal engine detects automations with status "Outdated" and returns them as signals with severity and category
- [ ] **BSIG-02**: The signal engine detects automations with no owner assigned and returns them as signals
- [ ] **BSIG-03**: The signal engine detects automations with high complexity but zero or one step and returns them as signals
- [ ] **BSIG-04**: The signal engine detects automations that are disabled but referenced by other active automations and returns them as signals

### Dashboard Signals (Brandy Dashboard)

- [ ] **BDASH-01**: User can see a dashboard widget listing the top 3 highest-priority signals, each showing signal type and affected automation name
- [ ] **BDASH-02**: User can click a signal in the dashboard widget and navigate directly to the relevant automation or page

### Automation List Signals (Brandy List)

- [ ] **BLIST-01**: User can see a signal indicator badge on automation rows in All Automations where one or more signals exist
- [ ] **BLIST-02**: User can hover or click the signal badge on an automation row to read the signal description

### Brandy Analyse Page

- [ ] **BPAGE-01**: When the user opens the Brandy page, an analysis of all current signals runs automatically without requiring a manual trigger
- [ ] **BPAGE-02**: User can click any signal (from dashboard, list, or Brandy page) and arrive in a Brandy chat session with the affected automation's context pre-loaded and an opening analysis message ready

## v2 Requirements

### Enhancements (deferred)

- **ENH-01**: Zapier and Typeform sync implemented end-to-end
- **ENH-02**: KennisGraaf3D accessible from sidebar nav
- **ENH-03**: AI Upload page (AIUpload.tsx) connected to backend and routed
- **ENH-04**: Role-based access control (multiple staff members)
- **ENH-05**: Bulk operations (bulk status update, bulk delete)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time automation execution monitoring | High complexity, exceeds internship scope |
| Multi-user collaboration / live editing | Single maintainer assumed for internship period |
| Mobile app | Web portal only |
| Full sync for Zapier / Typeform | HubSpot is primary; others are lower ROI |
| Audit logging | Not requested by Brand Boekhouders |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PROC-01 | Phase 1 | Complete |
| PROC-02 | Phase 1 | Complete |
| PROC-03 | Phase 1 | Complete |
| PROC-04 | Phase 1 | Complete |
| DATA-01 | Phase 2 | Complete |
| DATA-02 | Phase 2 | Complete |
| DATA-03 | Phase 2 | Complete |
| PROC-05 | Phase 3 | Complete |
| QUAL-01 | Phase 4 | Pending |
| QUAL-02 | Phase 4 | Complete |
| QUAL-03 | Phase 4 | Complete |
| BACK-01 | Phase 5 | Pending |
| BACK-02 | Phase 5 | Pending |
| HAND-01 | Phase 5 | Pending |
| HAND-02 | Phase 5 | Pending |
| NAV-01 | Phase 6 | Complete |
| NAV-02 | Phase 6 | Complete |
| NAV-03 | Phase 6 | Complete |
| SYS-01 | Phase 7 | Complete |
| SYS-02 | Phase 7 | Complete |
| OWN-01 | Phase 7 | Complete |
| OWN-02 | Phase 7 | Complete |
| LINK-01 | Phase 8 | Complete |
| LINK-02 | Phase 8 | Complete |
| LINK-03 | Phase 8 | Complete |
| LINK-04 | Phase 8 | Complete |
| NAME-01 | Phase 6 | Complete |
| NAME-02 | Phase 6 | Complete |
| NAME-03 | Phase 6 | Complete |
| BSIG-01 | Phase 9 | Pending |
| BSIG-02 | Phase 9 | Pending |
| BSIG-03 | Phase 9 | Pending |
| BSIG-04 | Phase 9 | Pending |
| BDASH-01 | Phase 10 | Pending |
| BDASH-02 | Phase 10 | Pending |
| BLIST-01 | Phase 10 | Pending |
| BLIST-02 | Phase 10 | Pending |
| BPAGE-01 | Phase 11 | Pending |
| BPAGE-02 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 15 total, 15 mapped ✓
- v1.1 requirements: 13 total, 13 mapped ✓
- v1.2 requirements: 10 total, 10 mapped ✓

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-04-07 — v1.2 requirements added (Brandy Proactieve Analyse)*
