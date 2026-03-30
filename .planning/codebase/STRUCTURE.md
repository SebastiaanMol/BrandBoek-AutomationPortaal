# Codebase Structure
_Last updated: 2026-03-30_

## Directory Layout

```
automation-navigator/
├── src/
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Providers, router, route declarations
│   ├── App.css                     # App-level CSS (minimal)
│   ├── index.css                   # Tailwind base + CSS variable tokens
│   ├── vite-env.d.ts               # Vite env type shims
│   │
│   ├── pages/                      # One file per route — feature pages
│   │   ├── Dashboard.tsx           # / — status metrics overview
│   │   ├── AlleAutomatiseringen.tsx # /alle — filtered automation list
│   │   ├── NieuweAutomatiseringPage.tsx  # /nieuw — create form
│   │   ├── BewerkAutomatisering.tsx # /bewerk/:id — edit form
│   │   ├── Processen.tsx           # /processen — process canvas page (Phase 1)
│   │   ├── Verificatie.tsx         # /verificatie — verification workflow
│   │   ├── Analyse.tsx             # /analyse — charts and scores
│   │   ├── Imports.tsx             # /imports — HubSpot/Zapier import review
│   │   ├── KennisGraaf.tsx         # /kennisgraaf — ReactFlow graph (partially disabled)
│   │   ├── KennisGraaf3D.tsx       # lazy-loaded 3D variant of kennisgraaf
│   │   ├── Instellingen.tsx        # /instellingen — integration tokens
│   │   ├── AuthPage.tsx            # /login
│   │   ├── NotFound.tsx            # 404 fallback
│   │   │
│   │   # Disabled (commented out in AppLayout nav):
│   │   ├── Mindmap.tsx             # /mindmap
│   │   ├── BPMNViewer.tsx          # /bpmn
│   │   ├── Proceskaart.tsx         # /proceskaart
│   │   ├── AIUpload.tsx            # no active route
│   │   └── NieuweAutomatisering.tsx # superseded by NieuweAutomatiseringPage.tsx
│   │
│   ├── components/
│   │   ├── AppLayout.tsx           # Sidebar + header shell (wraps all protected pages)
│   │   ├── Badges.tsx              # StatusBadge, CategorieBadge, SystemBadge
│   │   ├── VerificatieBadge.tsx    # Verification status display
│   │   ├── MermaidDiagram.tsx      # Renders mermaid_diagram field
│   │   ├── NavLink.tsx             # Reusable sidebar link
│   │   ├── AutomationSwimlaneBoard.tsx  # Kanban-style board component
│   │   │
│   │   ├── process/                # Process canvas sub-feature
│   │   │   ├── ProcessCanvas.tsx   # SVG swimlane renderer + all drag/draw interaction
│   │   │   ├── UnassignedPanel.tsx # Right panel: draggable automation list
│   │   │   ├── AutomationDetailPanel.tsx  # Right panel: selected automation detail
│   │   │   ├── StepDialog.tsx      # Modal: add/edit/delete ProcessStep
│   │   │   └── BranchEditorDialog.tsx  # Modal: edit automation branch paths
│   │   │
│   │   ├── bpmn/                   # BPMN viewer components (inactive page)
│   │   │   ├── BPMNNodes.tsx
│   │   │   └── buildBPMNGraph.ts
│   │   │
│   │   ├── graph/                  # ReactFlow graph sub-components
│   │   │   ├── ClusterNode.tsx
│   │   │   └── ContextMenu.tsx
│   │   │
│   │   └── ui/                     # shadcn/ui primitives (never edit directly)
│   │       ├── button.tsx
│   │       ├── dialog.tsx
│   │       ├── badge.tsx
│   │       ├── select.tsx
│   │       ├── input.tsx
│   │       ├── textarea.tsx
│   │       ├── alert-dialog.tsx
│   │       ├── tabs.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── tooltip.tsx
│   │       ├── progress.tsx
│   │       └── ... (40+ additional shadcn components)
│   │
│   ├── lib/                        # Shared logic — data access, types, utilities
│   │   ├── supabaseStorage.ts      # ALL Supabase calls (CRUD + edge function invocations)
│   │   ├── hooks.ts                # React Query hooks wrapping supabaseStorage
│   │   ├── types.ts                # Domain types: Automatisering, Integration, KlantFase, etc.
│   │   ├── AuthContext.tsx         # Auth provider + useAuth() hook
│   │   ├── utils.ts                # cn() utility (clsx + tailwind-merge)
│   │   ├── graphAnalysis.ts        # Graph algorithms: centrality, BFS, orphans, etc.
│   │   ├── forceLayout.ts          # Force-directed layout for KennisGraaf
│   │   ├── smartEdges.ts           # Edge routing logic for Analyse
│   │   ├── domainGraph.ts          # Domain graph construction
│   │   ├── evaluateAutomation.ts   # Automation evaluation helpers
│   │   ├── bpmnApi.ts              # BPMN API helpers (inactive)
│   │   └── storage.ts              # Legacy localStorage seed data (NOT used in production)
│   │
│   ├── data/
│   │   └── processData.ts          # ProcessStep, Automation, Connection types + TEAM_CONFIG + initialState
│   │
│   ├── hooks/
│   │   ├── useBpmnGraph.ts         # BPMN-specific graph hook
│   │   ├── use-mobile.tsx          # Mobile breakpoint hook
│   │   └── use-toast.ts            # Toast hook (shadcn)
│   │
│   ├── integrations/
│   │   └── supabase/
│   │       ├── client.ts           # Supabase JS client singleton (auto-generated)
│   │       └── types.ts            # Database type definitions (auto-generated)
│   │
│   ├── types/
│   │   └── bpmn.ts                 # BPMN-specific TypeScript types
│   │
│   └── test/
│       ├── processCanvas.test.ts   # 32 unit tests for canvas logic (Vitest)
│       ├── example.test.ts         # Placeholder test
│       └── setup.ts                # Vitest setup file
│
├── backend/                        # Python FastAPI backend (separate process)
│   ├── main.py                     # FastAPI entry point
│   ├── requirements.txt
│   ├── connectors/
│   │   ├── base.py
│   │   └── hubspot.py
│   └── mapper/
│       └── hubspot_mapper.py
│
├── supabase/
│   ├── functions/                  # Deno edge functions
│   │   ├── hubspot-sync/           # Sync HubSpot workflows → automatiseringen
│   │   ├── zapier-sync/            # Sync Zapier zaps
│   │   ├── typeform-sync/          # Sync Typeform
│   │   ├── extract-automation/     # AI extraction
│   │   └── evaluate-automation/    # AI evaluation
│   └── migrations/                 # SQL migration files (6 total)
│       ├── 20260317*.sql           # Initial schema (automatiseringen, koppelingen, etc.)
│       ├── 20260323120000_hubspot_integration.sql  # integrations table
│       └── 20260325120000_process_state.sql        # process_state table
│
├── public/
│   └── docs/                       # Static docs served publicly
│
├── .planning/                      # GSD planning documents
│   ├── PROJECT.md
│   ├── REQUIREMENTS.md
│   ├── ROADMAP.md
│   ├── STATE.md
│   ├── config.json
│   ├── codebase/                   # Codebase analysis docs (this file)
│   └── phases/                     # Phase plan files
│
├── index.html                      # Vite HTML entry
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vite.config.ts
├── tailwind.config.ts
└── components.json                 # shadcn/ui config
```

---

## Directory Purposes

**`src/pages/`:**
- Purpose: One file per route. Each page owns its local UI state and calls hooks from `src/lib/hooks.ts`.
- Key active files: `Processen.tsx` (most complex — full process canvas orchestration), `AlleAutomatiseringen.tsx` (list + filter), `Verificatie.tsx` (verification workflow), `Analyse.tsx` (charts), `Imports.tsx` (import review UI)
- Files not actively linked in nav: `Mindmap.tsx`, `BPMNViewer.tsx`, `Proceskaart.tsx`, `AIUpload.tsx`, `NieuweAutomatisering.tsx`

**`src/components/process/`:**
- Purpose: All UI for the `/processen` feature. ProcessCanvas is large (~600 lines) because it contains the SVG layout engine, 3 internal sub-components, and all interaction state.
- Do not put non-canvas components here.

**`src/lib/`:**
- Purpose: All shared logic. The single most important file is `supabaseStorage.ts` — it is the only place that should call the Supabase client for data reads/writes.
- `types.ts` and `processData.ts` together define all domain types. `types.ts` = DB-facing types. `processData.ts` = canvas-facing types.

**`src/components/ui/`:**
- Purpose: shadcn/ui component library. Auto-generated. Do not edit.
- To add a new component: run `npx shadcn@latest add <component>` — it will be placed here.

**`src/data/`:**
- Purpose: Static data and processData types. Currently only `processData.ts`.
- `initialState` in `processData.ts` is the hardcoded fallback canvas state when no DB state exists.

**`src/integrations/supabase/`:**
- Purpose: Auto-generated Supabase client and type definitions. Do not edit `client.ts` or `types.ts` by hand.

**`supabase/migrations/`:**
- Purpose: Ordered SQL migration files applied by Supabase CLI. The `process_state` table was added in Phase 1 (`20260325120000_process_state.sql`).

**`backend/`:**
- Purpose: Python FastAPI backend for HubSpot data processing. Separate from the Vite frontend. Runs independently.

---

## Key File Locations

**Entry Points:**
- `src/main.tsx`: React mount
- `src/App.tsx`: All routes, all providers

**Configuration:**
- `vite.config.ts`: Build config, path alias `@` → `src/`
- `tailwind.config.ts`: Tailwind theme (CSS variables for colors)
- `tsconfig.app.json`: TypeScript config for `src/`
- `components.json`: shadcn/ui configuration

**Core Logic:**
- `src/lib/supabaseStorage.ts`: All database reads and writes
- `src/lib/hooks.ts`: All React Query hooks
- `src/lib/types.ts`: `Automatisering`, `Integration`, all enums
- `src/data/processData.ts`: `ProcessStep`, `Automation`, `Connection`, `TEAM_CONFIG`, `initialState`
- `src/lib/AuthContext.tsx`: Auth provider and `useAuth()` hook

**Process Canvas:**
- `src/pages/Processen.tsx`: Canvas page, state owner
- `src/components/process/ProcessCanvas.tsx`: SVG renderer
- `src/components/process/AutomationDetailPanel.tsx`: Detail panel
- `src/components/process/UnassignedPanel.tsx`: Sidebar list

**Testing:**
- `src/test/processCanvas.test.ts`: 32 unit tests for canvas logic
- `src/test/setup.ts`: Vitest setup

---

## Naming Conventions

**Files:**
- Pages: PascalCase Dutch names matching the route concept: `AlleAutomatiseringen.tsx`, `Processen.tsx`, `Verificatie.tsx`
- Components: PascalCase descriptive: `AutomationDetailPanel.tsx`, `UnassignedPanel.tsx`
- Lib modules: camelCase: `supabaseStorage.ts`, `graphAnalysis.ts`, `forceLayout.ts`
- shadcn/ui: kebab-case: `alert-dialog.tsx`, `dropdown-menu.tsx`

**Directories:**
- Feature component dirs: lowercase: `process/`, `bpmn/`, `graph/`, `ui/`
- Top-level: lowercase: `pages/`, `components/`, `lib/`, `data/`, `hooks/`

---

## Where to Add New Code

**New page/route:**
- Create: `src/pages/MyPage.tsx`
- Register route: `src/App.tsx` (add `<Route path="/myroute" element={<MyPage />} />` inside `ProtectedRoutes`)
- Add to nav: `src/components/AppLayout.tsx` (add to `navItems` array)
- Tests: `src/test/myPage.test.ts`

**New component for the process canvas:**
- Create: `src/components/process/MyComponent.tsx`
- Import types from: `src/data/processData.ts`
- Pass data/callbacks via props (no direct Supabase calls)

**New reusable display component:**
- Create: `src/components/MyComponent.tsx`
- Import types from: `src/lib/types.ts`

**New database operation:**
- Add function to: `src/lib/supabaseStorage.ts`
- Add React Query hook to: `src/lib/hooks.ts`
- Never call `supabase` directly from pages or components

**New domain type:**
- Automation/DB-related: add to `src/lib/types.ts`
- Canvas/process-related: add to `src/data/processData.ts`

**New Supabase table:**
- Create migration: `supabase/migrations/YYYYMMDD_description.sql`
- Regenerate types: `supabase gen types typescript` → overwrites `src/integrations/supabase/types.ts`

**New shadcn/ui component:**
- Run: `npx shadcn@latest add <component-name>`
- Output goes to: `src/components/ui/`

**Utilities:**
- General helpers: `src/lib/utils.ts`
- Graph/analysis helpers: `src/lib/graphAnalysis.ts`

---

## Special Directories

**`.planning/`:**
- Purpose: GSD planning and codebase analysis documents
- Generated: No
- Committed: Yes

**`node_modules/`:**
- Generated: Yes
- Committed: No

**`.claude/worktrees/`:**
- Purpose: Git worktrees created by Claude Code agent sessions
- Generated: Yes
- Committed: No (should be in `.gitignore`)

**`supabase/migrations/`:**
- Purpose: Applied in sequence by Supabase CLI
- Generated: Partially (manually authored SQL)
- Committed: Yes

**`src/integrations/supabase/`:**
- Purpose: Auto-generated by Supabase CLI (`supabase gen types`)
- Generated: Yes (`client.ts` and `types.ts`)
- Committed: Yes (needed at build time)
