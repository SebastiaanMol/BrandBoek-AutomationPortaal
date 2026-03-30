# Architecture
_Last updated: 2026-03-30_

## Pattern Overview

**Overall:** Feature-page architecture with a centralized data layer

The app is a single-page React application. Each route maps to a page component that owns its own query and local UI state. A shared data layer (`src/lib/`) handles all Supabase access. There is no global state manager (no Redux, no Zustand) — server state lives in React Query, UI state lives in page-level `useState`.

**Key Characteristics:**
- Pages are the unit of feature ownership — they orchestrate child components via props and callbacks
- React Query (`["automatiseringen"]` key) is the shared server-state cache for automation records
- `src/lib/supabaseStorage.ts` is the exclusive database access module; pages never call `supabase` directly (one exception: `BranchEditorDialog.tsx` has an inline write)
- `src/lib/hooks.ts` wraps every storage function in a `useQuery`/`useMutation` hook
- `src/lib/AuthContext.tsx` provides auth state via React context; every protected page sits under `ProtectedRoutes` in `src/App.tsx`

---

## Layers

**Routing / Shell:**
- Purpose: Bootstrap providers, declare routes, guard auth, render layout
- Location: `src/App.tsx`, `src/components/AppLayout.tsx`
- Contains: `QueryClientProvider`, `BrowserRouter`, `AuthProvider`, `ProtectedRoutes` guard, `AppLayout` sidebar/header shell
- Depends on: `src/lib/AuthContext.tsx`, all page components
- Used by: `src/main.tsx`

**Pages:**
- Purpose: Feature orchestration — own `ProcessState`, filter state, selected item state
- Location: `src/pages/`
- Active routes: `/` Dashboard, `/alle` AlleAutomatiseringen, `/processen` Processen, `/verificatie` Verificatie, `/analyse` Analyse, `/imports` Imports, `/nieuw` NieuweAutomatiseringPage, `/bewerk/:id` BewerkAutomatisering, `/kennisgraaf` KennisGraaf, `/instellingen` Instellingen
- Commented-out routes (disabled in nav): `/mindmap`, `/bpmn`, `/proceskaart`
- Depends on: hooks from `src/lib/hooks.ts`, child components

**Process Canvas sub-feature (within `/processen`):**
- Purpose: SVG-based swimlane diagram for the client journey with drag-and-drop interaction
- Location: `src/components/process/`
- Components: `ProcessCanvas.tsx` (SVG renderer + interaction), `UnassignedPanel.tsx` (right-side automation list), `AutomationDetailPanel.tsx` (right-side detail panel), `StepDialog.tsx` (modal for add/edit step), `BranchEditorDialog.tsx` (modal for automation branch paths)
- Depends on: `src/data/processData.ts` for types and static config

**Shared Components:**
- Purpose: Reusable display elements used across multiple pages
- Location: `src/components/`
- Files: `AppLayout.tsx` (shell), `Badges.tsx` (StatusBadge, CategorieBadge, SystemBadge), `VerificatieBadge.tsx`, `MermaidDiagram.tsx`, `NavLink.tsx`, `AutomationSwimlaneBoard.tsx`

**UI Primitives:**
- Purpose: Headless Radix-based component library (shadcn/ui)
- Location: `src/components/ui/`
- Pattern: All components follow shadcn/ui conventions — `cn()` utility, `variant` prop, forwarded refs. Never modified directly.

**Hooks:**
- Purpose: React Query wrappers for every database operation
- Location: `src/lib/hooks.ts`
- Exports: `useAutomatiseringen`, `useSaveAutomatisering`, `useUpdateAutomatisering`, `useDeleteAutomatisering`, `useVerifieerAutomatisering`, `useNextId`, `useIntegration`, `useSaveIntegration`, `useDeleteIntegration`, `useHubSpotSync`, `useZapierSync`, `useTypeformSync`
- All mutations call `queryClient.invalidateQueries({ queryKey: ["automatiseringen"] })` on success

**Storage / Database Access:**
- Purpose: All Supabase calls — CRUD for automations, integrations, process state, edge function invocations
- Location: `src/lib/supabaseStorage.ts`
- Tables accessed: `automatiseringen`, `koppelingen`, `integrations`, `process_state`
- Edge functions invoked: `hubspot-sync`, `zapier-sync`, `typeform-sync`

**Domain Types:**
- Purpose: TypeScript interfaces and computed utility functions for domain objects
- Location: `src/lib/types.ts`, `src/data/processData.ts`, `src/types/bpmn.ts`
- Key types in `src/lib/types.ts`: `Automatisering`, `Integration`, `KlantFase`, `Systeem`, `Status`, `Categorie`, `Koppeling`, `AutomationBranch`
- Key types in `src/data/processData.ts`: `ProcessStep`, `Automation` (canvas representation), `Connection`, `ProcessState`, `TeamKey`
- Note: `Automatisering` (DB record from `src/lib/types.ts`) and `Automation` (canvas node from `src/data/processData.ts`) are distinct types. `Processen.tsx` maps between them with the local `toCanvasAutomation()` function.

**Auth:**
- Purpose: Supabase auth session management
- Location: `src/lib/AuthContext.tsx`
- Provides: `session`, `user`, `loading`, `signOut` via `useAuth()` hook
- Supabase client: `src/integrations/supabase/client.ts` — single shared instance with `persistSession: true`

**Graph / Analysis Utilities:**
- Purpose: Graph algorithms for KennisGraaf and Analyse pages
- Location: `src/lib/graphAnalysis.ts`, `src/lib/forceLayout.ts`, `src/lib/smartEdges.ts`, `src/lib/domainGraph.ts`
- Used by: `src/pages/KennisGraaf.tsx`, `src/pages/Analyse.tsx`

---

## Data Flow

**Primary automation data flow (read):**

1. Page mounts → `useAutomatiseringen()` fires → `fetchAutomatiseringen()` in `src/lib/supabaseStorage.ts`
2. Supabase returns rows from `automatiseringen` + `koppelingen` tables
3. Storage function joins koppelingen by `bron_id` and assembles `Automatisering[]`
4. React Query caches result under key `["automatiseringen"]`
5. Page receives `data: Automatisering[]` and renders

**Primary automation data flow (write):**

1. User action in page → mutation hook called (e.g. `useSaveAutomatisering()`)
2. Hook calls storage function in `src/lib/supabaseStorage.ts` → Supabase write
3. On success: `queryClient.invalidateQueries(["automatiseringen"])` → refetch triggers
4. Page re-renders with fresh data

**Process canvas data flow:**

1. `Processen.tsx` mounts → `fetchProcessState()` loads `process_state` table row (`id = "main"`)
2. Returned `steps`, `connections` written to `state` (React `useState`)
3. Returned `autoLinks` written to `savedLinksRef.current` (`useRef` — not state, avoids stale closure in the following effect)
4. `useAutomatiseringen()` fires concurrently; when it resolves, a `useEffect` on `dbAutomations` merges DB automations with saved link data from `savedLinksRef.current`
5. All canvas mutations call local `update()` helper which wraps `setState` and sets `isDirty = true`
6. On Save: `saveProcessState()` writes `{ steps, connections, autoLinks }` to `process_state` table
7. `ProcessCanvas` receives `steps`, `connections`, `automations` as props; emits mutations via 8 typed callbacks

**`savedLinksRef` pattern (introduced in Phase 1):**

`savedLinksRef = useRef<Record<string, {fromStepId, toStepId}>>({})` breaks an async ordering race: `fetchProcessState` and `useAutomatiseringen` resolve independently. The ref stores `autoLinks` from the DB load so they are available when the automations effect fires — without making `autoLinks` part of React state (which would cause unwanted re-renders and stale closure issues in the merging effect).

**Authentication flow:**

1. App loads → `AuthProvider` calls `supabase.auth.getSession()` and subscribes to `onAuthStateChange`
2. `loading = true` until session resolves
3. `ProtectedRoutes` in `src/App.tsx` redirects to `/login` if `!user`
4. `AuthRoute` redirects to `/` if user is already logged in

---

## Component Hierarchy: Processen Page

```
Processen (src/pages/Processen.tsx)
  ProcessState (useState: steps, connections, automations)
  ├── ProcessCanvas (src/components/process/ProcessCanvas.tsx)
  │     Internal SVG sub-components (not exported):
  │     ├── StepBox         — task step rectangle
  │     ├── EventCircle     — start/end circle
  │     └── AutomationDot   — yellow ⚡ dot on connection
  ├── UnassignedPanel (src/components/process/UnassignedPanel.tsx)
  │     Shown when no automation is selected
  ├── AutomationDetailPanel (src/components/process/AutomationDetailPanel.tsx)
  │     Shown when automation is selected (replaces UnassignedPanel)
  ├── StepDialog (src/components/process/StepDialog.tsx)
  │     Modal: add / edit / delete ProcessStep
  └── BranchEditorDialog (src/components/process/BranchEditorDialog.tsx)
        Modal: edit AutomationBranch[] for an automation
```

---

## Key Abstractions

**`ProcessState` (canvas state object):**
- Purpose: Single immutable snapshot for the entire process canvas
- Defined in: `src/data/processData.ts`
- Shape: `{ steps: ProcessStep[], connections: Connection[], automations: Automation[] }`
- Pattern: All mutations use the `update(fn: ProcessState => ProcessState)` helper in `Processen.tsx`; never mutated directly

**`ProcessCanvas` (SVG swimlane component):**
- Purpose: Renders the full client journey as an SVG with 5 swimlanes, drag-and-drop, draw-to-connect
- Location: `src/components/process/ProcessCanvas.tsx`
- Layout computed with `useMemo`: `colX` (column x-positions via `computeColX`), `laneStarts` (lane y-positions via `buildLaneStarts`), `autoDotPositions` (dot positions per connection)
- Interaction state (all `useState` inside the component): `drawing` (port drag for new connections), `dragging` (step move), `drawingBranch` (automation branch draw), `hoveredConn`, `newStepDrag`
- Fully controlled — all mutations bubble up via props callbacks

**`TEAM_CONFIG` (team visual config):**
- Purpose: Maps each `TeamKey` to display label and HSL color tokens (`bg`, `stroke`, `text`, `dot`)
- Location: `src/data/processData.ts`
- Used by: `ProcessCanvas.tsx`, `UnassignedPanel.tsx`, `AutomationDetailPanel.tsx`, `StepDialog.tsx`
- Teams: `marketing`, `sales`, `onboarding`, `boekhouding`, `management`

**`FASE_TO_TEAM` mapping:**
- Purpose: Maps `KlantFase` values from `Automatisering.fasen[0]` to `TeamKey` for canvas placement
- Location: Defined inline in `src/pages/Processen.tsx` (not exported); duplicated in `src/test/processCanvas.test.ts` for testability
- Note: Not extracted to a shared module — deferred refactor, see CONCERNS.md

**`Section` helper component:**
- Purpose: Labeled content section with `.label-uppercase` styling
- Location: Defined inline in `src/components/process/AutomationDetailPanel.tsx`
- Uses: `className="label-uppercase"` CSS utility class for section headings

---

## Entry Points

**Browser entry:**
- Location: `src/main.tsx`
- Triggers: Vite serves `index.html`, bootstraps React into `#root`
- Responsibilities: Mount `<App />`

**App shell:**
- Location: `src/App.tsx`
- Responsibilities: Wrap providers (QueryClient, TooltipProvider, Toaster, BrowserRouter, AuthProvider), declare all routes, guard auth

**Supabase Edge Functions:**
- Location: `supabase/functions/`
- Functions: `hubspot-sync`, `zapier-sync`, `typeform-sync`, `extract-automation`, `evaluate-automation`
- Invoked via: `supabase.functions.invoke(name)` in `src/lib/supabaseStorage.ts`

---

## Error Handling

**Strategy:** Toast-based user feedback for all user-triggered operations; `console.error` for background/non-interactive failures

**Patterns:**
- Storage functions throw `Error` objects; `toFriendlyDbError()` in `src/lib/supabaseStorage.ts` translates Postgres `23505` duplicate-key errors to readable Dutch messages
- Page mutation handlers use `try/catch` and call `toast.error()` on failure
- `fetchProcessState` failure is caught in `.catch(err => console.error(...))` — canvas falls back silently to `initialState`
- React Query has no global error handler configured; pages check `isLoading` / `data` shape

---

## Cross-Cutting Concerns

**Logging:** `console.error()` for unexpected failures; no structured logging library
**Validation:** Inline field-level guards (e.g. `if (!label.trim()) return`); no schema validation library
**Authentication:** `useAuth()` hook from `src/lib/AuthContext.tsx`; `ProtectedRoutes` wrapper in `src/App.tsx`; Supabase session persisted in `localStorage`
**Toasts:** `sonner` library; `toast.success()`, `toast.error()`, `toast.info()` called directly in page handlers
**CSS utilities:** `cn()` from `src/lib/utils.ts` (clsx + tailwind-merge); used throughout all UI components
