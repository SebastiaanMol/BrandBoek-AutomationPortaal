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
- [ ] **QUAL-02**: Legacy/dead code removed (NieuweAutomatisering.tsx, dual storage layer reconciled)
- [ ] **QUAL-03**: Core domain logic (berekenComplexiteit, berekenImpact, graphProblems) has basic test coverage

### Backend

- [ ] **BACK-01**: Python FastAPI backend is documented with clear setup instructions
- [ ] **BACK-02**: Backend can be run locally from `.env.example` without extra configuration steps

### Handover

- [ ] **HAND-01**: Portal is deployed and accessible to Brand Boekhouders staff
- [ ] **HAND-02**: Brief usage guide exists for maintaining the portal after internship ends

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
| QUAL-02 | Phase 4 | Pending |
| QUAL-03 | Phase 4 | Pending |
| BACK-01 | Phase 5 | Pending |
| BACK-02 | Phase 5 | Pending |
| HAND-01 | Phase 5 | Pending |
| HAND-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 — phase assignments updated to match ROADMAP.md*
