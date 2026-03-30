# Architecture

## Pattern

**Single-page application (SPA)** — React + React Router v6 with client-side routing. Authentication guards all routes via a `ProtectedRoutes` wrapper. No SSR.

## Layers

```
┌─────────────────────────────────────────┐
│               Pages (UI)                │
│  src/pages/*.tsx                        │
│  Route-level components, compose views  │
├─────────────────────────────────────────┤
│           Components (UI)               │
│  src/components/*.tsx                   │
│  Shared UI — badges, layout, graph      │
│  src/components/ui/ — shadcn primitives │
├─────────────────────────────────────────┤
│          Hooks / React Query            │
│  src/lib/hooks.ts                       │
│  All data fetching & mutations via TanQ │
├─────────────────────────────────────────┤
│         Storage / Data Access           │
│  src/lib/supabaseStorage.ts             │
│  Direct Supabase calls (prod data)      │
│  src/lib/storage.ts                     │
│  Seed/demo data (localStorage fallback) │
├─────────────────────────────────────────┤
│         Supabase (Backend)              │
│  supabase/functions/                    │
│  Edge functions: extract, sync adapters │
└─────────────────────────────────────────┘
```

## Entry Points

- `src/main.tsx` — mounts React app
- `src/App.tsx` — router setup, auth guard, `QueryClientProvider`
- `src/lib/AuthContext.tsx` — Supabase session management, wraps entire app

## Authentication Flow

1. `AuthProvider` (wraps `BrowserRouter`) establishes Supabase session
2. `ProtectedRoutes` checks `useAuth()` — redirects to `/login` if no user
3. `AuthRoute` at `/login` redirects authenticated users to `/`

## Data Flow

```
Component
  → useAutomatiseringen() / useSaveAutomatisering() / etc.  (hooks.ts)
    → fetchAutomatiseringen() / insertAutomatisering() / etc. (supabaseStorage.ts)
      → Supabase JS client (integrations/supabase/client.ts)
        → Supabase DB (automatiseringen table)
```

React Query is the only data cache. No Redux or Zustand. Cache key: `["automatiseringen"]`.

## Domain Graph

`src/lib/domainGraph.ts` — builds node/edge graph from `Automatisering[]`. Uses `@dagrejs/dagre` for layout.

`src/lib/graphAnalysis.ts` + `src/lib/graphProblems.ts` — analyze the graph for circular deps, orphan nodes, bottlenecks.

`src/lib/forceLayout.ts` + `src/lib/smartEdges.ts` — physics layout and edge routing for KennisGraaf.

## Visualization Pages

- `src/pages/KennisGraaf.tsx` — 2D force-directed graph (`@xyflow/react`)
- `src/pages/KennisGraaf3D.tsx` — 3D graph (`three.js` + `react-force-graph-3d`) — not in nav
- `src/pages/BPMNViewer.tsx` — BPMN process flow (`src/components/bpmn/`)
- `src/pages/Mindmap.tsx` — Mermaid-based mindmap
- `src/pages/Analyse.tsx` — Analytics charts (`recharts`)

## Supabase Edge Functions

Located in `supabase/functions/`:
- `extract-automation/` — AI extraction from text/CSV
- `hubspot-sync/` — HubSpot workflow sync
- `zapier-sync/` — Zapier zap sync
- `typeform-sync/` — Typeform form sync

## Key Abstractions

- `Automatisering` interface (`src/lib/types.ts`) — central domain model
- `Integration` interface — external tool connection + token
- `Koppeling` — explicit link between automations (user-defined only)
- `KlantFase` — customer lifecycle phase tag

---
*Mapped: 2026-03-30*
