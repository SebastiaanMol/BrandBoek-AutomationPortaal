# Automation Navigator - ChatGPT Context Pack

Generated for follow-up analysis. Do not include secrets or `.env` values when sharing this file.

## Executive Summary

Automation Navigator is an internal Brand Boekhouders portal for understanding, governing and improving automations around HubSpot-driven business processes.

The portal is not the primary runtime engine. HubSpot is the operational process engine: deals, deal stages, properties and associations represent live business process state. The portal is an observability, documentation, review and governance layer around that runtime.

Important correction: `gitlabtest/` is a read-only analysis source. It is used to understand external FastAPI/GitLab worker code and infer runtime semantics. Do not modify `gitlabtest/` as if it is the live backend.

## Tech Stack

- Frontend: React 18, TypeScript, Vite, React Router, TanStack Query
- UI: Tailwind CSS, shadcn/Radix primitives, lucide-react
- Data: Supabase Postgres + Supabase JS
- Backend integration: Supabase Edge Functions
- AI: Gemini/OpenAI-compatible calls in edge functions for enrichment, flow naming/description, Brandy, pipeline descriptions
- Tests: Vitest

Important npm scripts:

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run runtime:seed
npm run runtime:analyze
```

## Documentation Rule

Every meaningful change to the portal, flow logic, analysis pipeline, Supabase integration, scripts, runtime metadata, or documentation must be documented in:

```text
docs/automation-navigator-wijzigingen.md
```

Use this structure for every entry:

```text
1. Wat is aangepast?
2. Waarom is het aangepast?
3. Welke bestanden zijn geraakt?
4. Wat is het effect voor de gebruiker?
5. Wat is getest?
6. Welke open punten blijven over?
```

This rule was added on May 8, 2026 and was applied retroactively to the recent flow, suggestion page, GitLab automation, HubSpot automation, audit, and reset work.

## Current Navigation / Pages

Routes are defined in `src/App.tsx`.

- `/` - Dashboard
- `/alle` - Automations overview, with tabs for all/new automations
- `/imports` - Import/review page
- `/systems` - Systems
- `/owners` - Owners
- `/processen` - Process canvas per pipeline
- `/flows` - Procesreis page with confirmed process journeys and concept process journeys
- `/flows/suggesties/:id` - Concept process journey detail
- `/flows/:id` - Confirmed process journey detail
- `/pipelines` - HubSpot/custom pipeline overview
- `/pipelines/:id` - Pipeline detail
- `/runtime` - Runtime Explorer
- `/analyse` - Analysis
- `/brandy` - Brandy AI assistant
- `/instellingen` - Settings/integrations

Sidebar groups:

- Overview: Dashboard
- Automations: Automations, Imports
- Systems & People: Systems, Owners
- Analysis: Processes, Procesreis, Blob, Pipelines, Runtime, Analysis
- Brandy: Brandy

## Important Source Areas

### Active Portal Code

- `src/pages/` - Main screens
- `src/components/flows/` - Flow canvas/detail components
- `src/components/process/` - Process canvas/editor/view/staging
- `src/lib/storage/` - Supabase data access layer
- `src/lib/types.ts` - Central domain types
- `src/lib/detectFlows.ts` - Flow grouping logic
- `src/lib/flowSuggestionGroups.ts` - Suggestion grouping logic
- `src/lib/runtimeGraphTraversal.ts` - Runtime graph traversal helpers
- `src/lib/runtimeObservability.ts` - Runtime graph models/helpers
- `src/lib/runtimeTelemetry.ts` - Runtime telemetry/correlation logic
- `src/lib/storage/runtimeObservability.ts` - Runtime graph Supabase queries
- `src/lib/storage/runtimeTelemetry.ts` - Runtime event/trace Supabase queries

### Supabase Edge Functions

Current functions include:

- `hubspot-sync`
- `hubspot-pipelines`
- `gitlab-sync`
- `runtime-telemetry`
- `detect-flow-links`
- `describe-flow`
- `describe-pipeline`
- `enrich-automation`
- `evaluate-automation`
- `extract-automation`
- `name-flow`
- `brandy-ask`
- `brandy-analyse`
- `brandy-feedback`
- `typeform-sync`
- `zapier-sync`

### Supabase Migrations

Important areas:

- Automations/import/source tagging
- `automation_links`
- enrichment columns
- `pipelines`
- `flows`
- process state / parked steps / lanes
- custom pipeline source handling
- rejected imports retained until removed at source
- HubSpot workflow usage/run data
- runtime observability schema
- runtime telemetry correlation schema

Recent runtime migrations:

- `20260507120000_runtime_observability.sql`
- `20260507150000_runtime_telemetry_correlation.sql`

## Runtime Model

The runtime mental model is:

```text
HubSpot = operational state engine
HubSpot workflows = routers / orchestration actors
HubSpot properties = runtime signals / events
HubSpot deal stages = state machine states
HubSpot associations = relational process graph
FastAPI/GitLab endpoints = transition workers
External systems = enrichment / side-effect systems
Portal = runtime observability + governance layer
```

Common propagation pattern:

```text
event
-> HubSpot state change
-> HubSpot workflow enrollment
-> backend worker computation
-> derived HubSpot state write
-> downstream workflow
```

Core workflow graphs:

- Sales
- BTW
- JR
- IB
- VPB
- VA
- Debtor/payment
- Bank connection
- Assignment propagation

Critical orchestration signals/hubs include:

- `dealstage`
- `pipeline`
- `machtiging_actief`
- `bankkoppeling_status`
- `jaarrekeningen_klaar_om_ib_te_maken`
- `hs_priority`
- owner/controller assignment fields
- year/quarter fields

## Runtime Observability

The portal now has a Runtime Explorer at `/runtime`.

Runtime artifacts live under:

- `docs/runtime-orchestration/worker-profiles.json`
- `docs/runtime-orchestration/runtime-propagation-graph.json`
- `docs/runtime-orchestration/runtime-static-analysis.json`
- `docs/runtime-orchestration/runtime-signal-ownership.json`
- `docs/runtime-orchestration/runtime-dependency-map.json`
- `docs/runtime-orchestration/orchestration-hotspots.json`
- `docs/runtime-orchestration/workflow-runtime-summaries.json`
- `docs/runtime-orchestration/inferred-vs-observed-diff.json`

Generation scripts:

- `scripts/analyze-api-endpoint-flows.mjs`
- `scripts/generate-runtime-analysis-artifacts.mjs`
- `scripts/seed-runtime-observability.mjs`

`npm run runtime:analyze` currently produced:

- 149 statically analyzed functions
- 214 runtime signals
- 453 dependency edges
- 28 worker hotspots

Observed edge comparison may be empty if Supabase env is unavailable to the script.

Important: the analyzer reads `gitlabtest/` as read-only input and generates portal metadata/artifacts only.

## Procesreis / Flow System

The menu item is now called `Procesreis`.

Definition:

- A `procesreis` is the understandable journey of work through the business runtime.
- A `flow` is the persisted/confirmed version of a process journey.
- A concept process journey is an inferred route that still needs review.

The core process journey pattern is:

```text
Startsignal
-> HubSpot automation
-> GitLab/backend automation
-> HubSpot state write
-> emitted signal
-> downstream process/workflow
```

The page should not feel like an automation list. It should explain what starts something, what changes, and what can happen next.

Sources of links:

- Manual `automation.koppelingen`
- Confirmed `automation_links`
- AI/webhook suggestions before confirmation

Process journey lifecycle:

```text
HubSpot/GitLab automation metadata
-> endpoint/webhook match and AI suggestions
-> user reviews candidate links
-> user selects/accepts suggestions within a candidate
-> accepted process journey is persisted as a confirmed flow
-> detail page renders the process journey in business language
```

Important behavior:

- Concept process journeys are not official until accepted.
- Confirmed process journeys use confirmed `automation_links`.
- Manual flows using only `koppelingen` should still render through fallback logic.
- User requested stable lists: selecting a link should not make candidate lists jump.
- User requested flow suggestions to be more visually clear with `1, 2, 3` style step ordering and clear `from automation -> to automation` relationships.

- The `/flows` page uses two table modes: confirmed `Procesreizen` are shown as a calm official process journey table, while `Conceptprocesreizen` are shown as a review table with certainty/status indicators.

- Process journey detail pages no longer show the ReactFlow/canvas node map; the readable runtime/process chain is now the primary representation.
- Confirmed process journey detail pages should use the full automation source, including legacy GitLab records, so GitLab workers do not disappear from a saved process journey.
- `Bewijs per overgang` should always be explicit: show confirmed/inferred evidence when available, and show a clear empty state when no transition evidence exists.
- GitLab worker details on process journey pages should use business language first. SDK calls, `Client.crm`, `basic_api`, `HubSpotAPIError`, and endpoint/POST wording should not appear in the main explanation. Endpoint and file path belong in the GitLab location/details block only.

## Process Canvas

Process canvas areas:

- `Processen.tsx`
- `ProcessenView.tsx`
- `ProcessenEditor.tsx`
- `ProcessCanvas.tsx`
- `StepDialog.tsx`
- `StepStagingPanel.tsx`

Implemented/desired ideas:

- Per-pipeline process canvases
- View/edit tabs
- Step staging area for HubSpot drift/manual parked steps
- BPMN vocabulary: start/end/task/decision plus added elements like terminate/send/receive/AND gateway
- XOR gateway visual fix: BPMN-standard X marker

## Pipeline System

Pipelines are synced from HubSpot and can also be custom/internal.

Key model:

- HubSpot pipelines have `source = "hubspot"`
- Custom/internal pipelines have `source = "custom"`
- HubSpot and custom are never merged even if names match
- Custom pipelines can be created/edited/deleted from portal
- HubSpot pipelines are sync-owned/read-only except active/inactive UI state

Pipeline pages:

- `/pipelines` overview
- `/pipelines/:id` detail

Important UX history:

- Filter buttons were refined to avoid overlap and make selected state clearer.
- Sync HubSpot and Intern proces buttons were styled/aligned.
- Source badges were added.

## Automations / Imports / Cleanup

Automation overview was consolidated:

- `All automations` and `New automations` became one menu item/page with tabs.
- Automation list has separate source/status columns.
- Source label should not be duplicated under labels.
- Status column should be logically positioned near the automation identity/metadata.
- HubSpot workflow steps are normalized before display: exact duplicate HubSpot steps caused by branch paths are collapsed into one step with a path count, e.g. `Stel 'property' in (3 paden)`. This keeps the automation source data readable before it feeds procesreis suggestions.

Import/review page:

- HubSpot approvals and other-source approvals are separated with tabs.
- Page got a header like Pipelines/Analysis.
- Rejected HubSpot automations should not be hard-deleted from HubSpot by the portal.
- Rejected/cleanup candidates should remain as a governance list until actually removed at the source and then disappear after sync.

Cleanup advice:

- Automations can be recommended for review/removal.
- “Doel is leeg” should not be a high-confidence removal reason if the automation ran recently.
- Run-data unavailable can count as a signal for aging/uncertainty, but not as proof.
- Active/recently-run automations should not be high removal candidates.
- Portal is read-only toward HubSpot deletion; “definitief verwijderen” should not imply deleting from HubSpot.

## GitLab / `gitlabtest` Context

`gitlabtest/` is imported/reference material only.

Purpose:

- understand FastAPI endpoints
- infer backend worker semantics
- extract endpoint paths
- infer read/write properties
- infer runtime propagation
- enrich portal metadata

Do not:

- add telemetry to `gitlabtest`
- modify workers
- add decorators
- build production runtime logic there

Current direction:

- GitLab sync should treat each FastAPI `@router.post` endpoint as its own automation/worker, not one huge file-level automation.
- The analysis should follow the path from API endpoint to service/repository calls.
- The portal should show where a GitLab-derived automation is located:
  - file path
  - endpoint path
  - handler/function
  - relevant service calls
  - business logic summary

## Brandy

Brandy is the AI assistant inside the portal.

Planned/implemented themes:

- signal engine (`signalen.ts`)
- Brandy mind table
- Gemini-powered analysis
- diagnose behavior with one targeted follow-up question
- Chat/Inzichten tab redesign
- feedback loop

## Major Plans / Specs Summary

Plans and specs live in:

- `docs/superpowers/plans/`
- `docs/superpowers/specs/`

Major initiatives:

- Brandy signal engine and diagnose assistant
- GitLab sync as automation source
- import source tagging
- portal settings
- AI enrichment/review dashboard
- HubSpot-GitLab endpoint matching
- HubSpot pipeline stages sync
- persisted flows and flow detail pages
- AI flow step descriptions
- portal UI migration
- pipeline overview/detail UX
- process canvas pipeline tabs
- process step staging area
- BPMN elements and gateway visuals
- flow suggestions and flow suggestion staging
- codebase cleanup

Important cleanup note:

`docs/superpowers/plans/2026-04-30-codebase-cleanup.md` states that `gitlabtest/` is reference material from a separate project and should not be part of lint/TypeScript/test surface.

## Current Working Tree Note

There are many uncommitted changes in active portal/runtime-observability files. Treat the worktree as dirty and do not revert unrelated changes.

Areas currently changed/untracked include:

- runtime observability docs and scripts
- Runtime Explorer page and runtime libs
- runtime telemetry Supabase function/migrations
- flow/automation UI files
- GitLab sync function
- package.json

`gitlabtest/` was checked after the latest correction and should remain clean/read-only.

## Test Surface

Tests in `src/test/` include:

- BPMN/process canvas tests
- custom pipelines tests
- detectFlows tests
- flow suggestion tests
- import flow tests
- process drift/state tests
- runtime graph traversal tests
- runtime telemetry tests
- signal engine tests
- system metadata tests

Recently verified in prior work:

```bash
npx tsc --noEmit
npm run test -- --run src/test/runtimeTelemetry.test.ts src/test/runtimeGraphTraversal.test.ts
npm run build
```

The build currently succeeds but emits the known Vite warning about large chunks.

## Open Design Questions / Next Useful Work

1. Connect runtime analysis artifacts more directly into the Runtime Explorer UI.
2. Improve observed vs inferred runtime comparison once real observed telemetry is available.
3. Make flow suggestion detail more visual and easier to understand as ordered propagation chains.
4. Improve GitLab automation metadata so every endpoint automation has:
   - endpoint
   - handler
   - file path
   - service call chain
   - business-readable logic summary
5. Keep cleanup/removal governance read-only toward HubSpot.
6. Continue strengthening code quality around DRY/SOLID/KISS without large risky rewrites.

## Suggested Prompt For ChatGPT

Use this prompt with the context above:

```text
You are helping analyze and improve an internal Automation Navigator portal.

Important mental model:
- HubSpot is the live operational state engine.
- HubSpot workflows route process state.
- HubSpot properties are runtime signals/events.
- Deal stages are state machine states.
- Associations are the relational process graph.
- FastAPI/GitLab endpoint metadata is analysis input, not the live backend.
- The portal is an observability/governance layer.

Task:
Review the supplied context and propose the next highest-value improvements.

Focus on:
1. Runtime graph accuracy
2. Flow suggestion UX
3. GitLab endpoint metadata quality
4. Cleanup/removal governance
5. Code quality and maintainability

Constraints:
- Do not modify `gitlabtest`; treat it as read-only analysis input.
- Prefer small, safe iterations.
- Keep HubSpot deletion read-only from the portal.
- Explain changes in terms of runtime observability and business process clarity.
```
