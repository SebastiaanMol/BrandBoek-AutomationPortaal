# Roadmap: Brand Boekhouders Automation Portal

## Overview

The portal infrastructure is built. What remains is making it complete, correct, and handover-ready. Phase 1 finalizes the swimlane canvas as the primary graduation deliverable. Phase 2 fills it with real automation data. Phase 3 adds the export capability for handover documentation. Phase 4 stabilizes the portal and adds test coverage. Phase 5 documents the backend, deploys to production, and leaves Brand Boekhouders staff with a maintainable system.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Process Canvas** - Swimlane canvas is fully functional as the primary demo deliverable
- [ ] **Phase 2: Data Completeness** - All Brand Boekhouders automations entered, import flow validated end-to-end
- [ ] **Phase 3: Export** - Process map can be exported as PNG or PDF for handover documentation
- [ ] **Phase 4: Portal Quality** - All pages stable, dead code removed, critical logic has test coverage
- [ ] **Phase 5: Backend & Handover** - Backend documented and deployable, portal live, usage guide written

## Phase Details

### Phase 1: Process Canvas
**Goal**: The swimlane canvas works as the primary demo deliverable — automations are visible, draggable, and persistent
**Depends on**: Nothing (first phase)
**Requirements**: PROC-01, PROC-02, PROC-03, PROC-04
**Success Criteria** (what must be TRUE):
  1. User can open the Processen page and see all automations arranged in swimlanes by customer phase
  2. User can drag an automation to a different swimlane and its new position is still there after a page refresh
  3. User can click an automation node to open the side panel and read its trigger, steps, systems, and owner
  4. Canvas renders without errors and matches the expected swimlane layout for all five customer phases
**Plans**: TBD
**UI hint**: yes

### Phase 2: Data Completeness
**Goal**: Every Brand Boekhouders automation is entered in the portal with accurate, complete fields
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. All known Brand Boekhouders automations appear on the canvas with no placeholder or missing entries
  2. User can trigger a HubSpot import, review AI confidence scores, and approve or reject automations — all within the portal
  3. Every approved automation has a non-empty trigger, at least one step, at least one system, a phase assignment, and an owner
**Plans**: TBD

### Phase 3: Export
**Goal**: The process map can be exported as a file for use in handover documentation
**Depends on**: Phase 2
**Requirements**: PROC-05
**Success Criteria** (what must be TRUE):
  1. User can click an export button on the process map page and download a PNG or PDF of the current canvas
  2. The exported file shows the swimlane layout with automation names legible at normal zoom
**Plans**: TBD
**UI hint**: yes

### Phase 4: Portal Quality
**Goal**: The portal is stable, clean, and trustworthy enough to hand over
**Depends on**: Phase 3
**Requirements**: QUAL-01, QUAL-02, QUAL-03
**Success Criteria** (what must be TRUE):
  1. Every page reachable from the sidebar nav loads without console errors or broken UI
  2. NieuweAutomatisering.tsx is removed and the dual storage layer is resolved — no duplicate data paths remain
  3. Running the test suite produces passing tests for berekenComplexiteit, berekenImpact, and graphProblems
**Plans**: TBD

### Phase 5: Backend & Handover
**Goal**: The Python backend is documented and deployable, the portal is live, and staff can maintain it without help
**Depends on**: Phase 4
**Requirements**: BACK-01, BACK-02, HAND-01, HAND-02
**Success Criteria** (what must be TRUE):
  1. A developer can clone the repo, copy `.env.example`, run the backend locally, and reach the FastAPI docs page — with no undocumented steps
  2. The portal is deployed to a URL accessible to Brand Boekhouders staff without VPN or special configuration
  3. A staff member unfamiliar with the codebase can follow the usage guide to add a new automation and update the canvas
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Process Canvas | 0/? | Not started | - |
| 2. Data Completeness | 0/? | Not started | - |
| 3. Export | 0/? | Not started | - |
| 4. Portal Quality | 0/? | Not started | - |
| 5. Backend & Handover | 0/? | Not started | - |
