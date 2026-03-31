# Roadmap: Brand Boekhouders Automation Portal

## Overview

The portal infrastructure is built. What remains is making it complete, correct, and handover-ready. Phase 1 finalizes the swimlane canvas as the primary graduation deliverable. Phase 2 fills it with real automation data. Phase 3 adds the export capability for handover documentation. Phase 4 stabilizes the portal and adds test coverage. Phase 5 documents the backend, deploys to production, and leaves Brand Boekhouders staff with a maintainable system.

Milestone v1.1 (Phases 6–8) transforms the portal into a cohesive, hierarchically organized system: grouped navigation, dedicated entity pages for Systems and Owners, wired-up cross-links in the automation detail panel, and consistent English naming throughout.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Process Canvas** - Swimlane canvas is fully functional as the primary demo deliverable
- [ ] **Phase 2: Data Completeness** - All Brand Boekhouders automations entered, import flow validated end-to-end
- [ ] **Phase 3: Export** - Process map can be exported as PNG or PDF for handover documentation
- [ ] **Phase 4: Portal Quality** - All pages stable, dead code removed, critical logic has test coverage
- [ ] **Phase 5: Backend & Handover** - Backend documented and deployable, portal live, usage guide written
- [ ] **Phase 6: Navigation & Naming** - Sidebar grouped into named sections, dead pages removed, all labels in English
- [ ] **Phase 7: Entity Pages** - Dedicated Systems and Owners pages with drill-in views
- [ ] **Phase 8: Cross-Linking** - Automation detail panel wired to process canvas, Systems, Owners, and related automations

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
**Plans**: 4 plans
Plans:
- [x] 01-01-PLAN.md — Wave 0: Unit test scaffold for PROC-01 through PROC-04 logic paths
- [x] 01-02-PLAN.md — Wave 1: Fix autoLinks race condition (PROC-03 persistence bug)
- [x] 01-03-PLAN.md — Wave 1: Fix Section label typography in AutomationDetailPanel (PROC-04 polish)
- [x] 01-04-PLAN.md — Wave 2: Human verification of all four PROC success criteria
**UI hint**: yes

### Phase 2: Data Completeness
**Goal**: Every Brand Boekhouders automation is entered in the portal with accurate, complete fields
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03
**Success Criteria** (what must be TRUE):
  1. All known Brand Boekhouders automations appear on the canvas with no placeholder or missing entries
  2. User can trigger a HubSpot import, review AI confidence scores, and approve or reject automations — all within the portal
  3. Every approved automation has a non-empty trigger, at least one step, at least one system, a phase assignment, and an owner
**Plans**: 3 plans
Plans:
- [x] 02-01-PLAN.md — Wave 1: inferFasen() in edge function + test scaffold (DATA-01, DATA-02)
- [x] 02-02-PLAN.md — Wave 1: ProposalCard fasen/owner fields and completeness gate (DATA-03)
- [ ] 02-03-PLAN.md — Wave 2: Human verification of full import-review-approve flow (DATA-01, DATA-02, DATA-03)

### Phase 3: Export
**Goal**: The process map can be exported as a file for use in handover documentation
**Depends on**: Phase 2
**Requirements**: PROC-05
**Success Criteria** (what must be TRUE):
  1. User can click an export button on the process map page and download a PNG or PDF of the current canvas
  2. The exported file shows the swimlane layout with automation names legible at normal zoom
**Plans**: 3 plans
Plans:
- [x] 03-01-PLAN.md — Wave 0: Test scaffold for export pipeline logic (exportFlow.test.ts)
- [x] 03-02-PLAN.md — Wave 1: Install jspdf npm package + replace CDN injection in Processen.tsx
- [ ] 03-03-PLAN.md — Wave 2: Human visual verification of PNG and PDF export quality
**UI hint**: yes

### Phase 4: Portal Quality
**Goal**: The portal is stable, clean, and trustworthy enough to hand over
**Depends on**: Phase 3
**Requirements**: QUAL-01, QUAL-02, QUAL-03
**Success Criteria** (what must be TRUE):
  1. Every page reachable from the sidebar nav loads without console errors or broken UI
  2. NieuweAutomatisering.tsx is removed and the dual storage layer is resolved — no duplicate data paths remain
  3. Running the test suite produces passing tests for berekenComplexiteit, berekenImpact, and graphProblems
**Plans**: 4 plans
Plans:
- [x] 04-01-PLAN.md — Wave 0: Failing test scaffold for domain logic (domainLogic.test.ts)
- [x] 04-02-PLAN.md — Wave 1: Delete storage.ts + move NieuweAutomatisering to components/AutomatiseringForm
- [x] 04-03-PLAN.md — Wave 1: Implement passing tests for berekenComplexiteit, berekenImpact, detectProblems
- [ ] 04-04-PLAN.md — Wave 2: Human verification of all 8 sidebar nav pages

### Phase 5: Backend & Handover
**Goal**: The Python backend is documented and deployable, the portal is live, and staff can maintain it without help
**Depends on**: Phase 4
**Requirements**: BACK-01, BACK-02, HAND-01, HAND-02
**Success Criteria** (what must be TRUE):
  1. A developer can clone the repo, copy `.env.example`, run the backend locally, and reach the FastAPI docs page — with no undocumented steps
  2. The portal is deployed to a URL accessible to Brand Boekhouders staff without VPN or special configuration
  3. A staff member unfamiliar with the codebase can follow the usage guide to add a new automation and update the canvas
**Plans**: TBD

### Phase 6: Navigation & Naming
**Goal**: The sidebar is organized into named sections, dead pages are removed, and every label in the interface uses consistent English
**Depends on**: Phase 4
**Requirements**: NAV-01, NAV-02, NAV-03, NAME-01, NAME-02, NAME-03
**Success Criteria** (what must be TRUE):
  1. User sees the sidebar grouped under named headers (Overview, Automations, Systems & People, Analysis) with no ungrouped items
  2. Every nav label in the sidebar exactly matches the h1 on the page it links to
  3. No route or sidebar link leads to Mindmap, Kennisgraaf, BPMN Viewer, or Proceskaart
  4. All visible labels, form fields, and status values across the portal use English (no Dutch text in the UI)
**Plans**: 3 plans
Plans:
- [ ] 06-01-PLAN.md — Wave 1: Sidebar grouped nav (NAV-01) + dead page removal (NAV-03)
- [ ] 06-02-PLAN.md — Wave 1: English labels across all pages (NAME-01, NAME-02, NAME-03) — parallel
- [ ] 06-03-PLAN.md — Wave 2: Page h1 compliance (NAV-02) + human verification
**UI hint**: yes

### Phase 7: Entity Pages
**Goal**: Users can browse all systems and owners in the portal and drill into the automations associated with each
**Depends on**: Phase 6
**Requirements**: SYS-01, SYS-02, OWN-01, OWN-02
**Success Criteria** (what must be TRUE):
  1. User can navigate to a Systems page and see every unique system with the count of automations that use it
  2. User can click a system name and see only the automations linked to that system
  3. User can navigate to an Owners page and see every unique owner with the count of automations they own
  4. User can click an owner name and see only the automations that person owns
**Plans**: TBD
**UI hint**: yes

### Phase 8: Cross-Linking
**Goal**: The automation detail panel is fully wired — every related entity (process canvas, systems, owner, related automations) is one click away
**Depends on**: Phase 7
**Requirements**: LINK-01, LINK-02, LINK-03, LINK-04
**Success Criteria** (what must be TRUE):
  1. User can click a link in the automation detail panel and land on the Processes page with that automation visible on the canvas
  2. Each system shown in the detail panel is a clickable badge that opens the Systems page filtered to that system
  3. The owner shown in the detail panel is a clickable link that opens the Owners page filtered to that person
  4. The detail panel lists related automations (same phase or sharing a system) and each is clickable
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Process Canvas | 4/4 | Complete | 2026-03-30 |
| 2. Data Completeness | 0/3 | Not started | - |
| 3. Export | 2/3 | In Progress | - |
| 4. Portal Quality | 3/4 | In Progress | - |
| 5. Backend & Handover | 0/? | Not started | - |
| 6. Navigation & Naming | 0/? | Not started | - |
| 7. Entity Pages | 0/? | Not started | - |
| 8. Cross-Linking | 0/? | Not started | - |
