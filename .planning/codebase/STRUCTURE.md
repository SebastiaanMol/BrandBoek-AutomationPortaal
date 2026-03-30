# Directory Structure

## Top Level

```
automation-navigator/
├── src/                    # Application source
├── supabase/               # Backend (Supabase config + edge functions)
├── public/                 # Static assets
├── .planning/              # GSD planning artifacts
├── .env                    # Supabase URL + anon key (not committed)
├── index.html              # Vite entry HTML
├── vite.config.ts          # Vite config (path aliases, proxy)
├── tailwind.config.ts      # Tailwind config
├── tsconfig.json           # TypeScript config
└── package.json
```

## src/

```
src/
├── main.tsx                # App mount
├── App.tsx                 # Router + auth guard
├── App.css                 # Global overrides
├── index.css               # Tailwind base + CSS variables (design tokens)
├── vite-env.d.ts
│
├── pages/                  # Route-level components (one per route)
│   ├── Dashboard.tsx           /
│   ├── NieuweAutomatiseringPage.tsx  /nieuw  (active)
│   ├── NieuweAutomatisering.tsx      legacy, not routed
│   ├── AlleAutomatiseringen.tsx  /alle
│   ├── BewerkAutomatisering.tsx  /bewerk/:id
│   ├── BPMNViewer.tsx            /bpmn
│   ├── Mindmap.tsx               /mindmap
│   ├── Verificatie.tsx           /verificatie
│   ├── Analyse.tsx               /analyse
│   ├── Instellingen.tsx          /instellingen
│   ├── KennisGraaf.tsx           /kennisgraaf
│   ├── KennisGraaf3D.tsx         not routed
│   ├── AIUpload.tsx              not routed
│   ├── AuthPage.tsx              /login
│   ├── Index.tsx                 redirect
│   └── NotFound.tsx              *
│
├── components/
│   ├── AppLayout.tsx           Sidebar + content wrapper
│   ├── NavLink.tsx             Sidebar nav item
│   ├── Badges.tsx              StatusBadge, CategorieBadge, etc.
│   ├── MermaidDiagram.tsx      Mermaid renderer
│   ├── VerificatieBadge.tsx    Verification status indicator
│   ├── bpmn/
│   │   ├── BPMNNodes.tsx       Custom React Flow node types
│   │   └── buildBPMNGraph.ts   Automation → BPMN graph builder
│   ├── graph/
│   │   ├── ClusterNode.tsx     Cluster node for KennisGraaf
│   │   └── ContextMenu.tsx     Right-click menu for graph
│   └── ui/                     shadcn/ui primitives (do not edit manually)
│
├── lib/
│   ├── types.ts            Domain types + constants + computed functions
│   ├── hooks.ts            All React Query hooks (data access layer)
│   ├── supabaseStorage.ts  Supabase CRUD + sync trigger functions
│   ├── storage.ts          Seed/demo data (localStorage only)
│   ├── AuthContext.tsx     Supabase auth session + context
│   ├── domainGraph.ts      Build graph from Automatisering[]
│   ├── graphAnalysis.ts    Graph metrics (centrality, clustering)
│   ├── graphProblems.ts    Problem detection (cycles, orphans, bottlenecks)
│   ├── forceLayout.ts      Force-directed layout engine
│   ├── smartEdges.ts       Edge routing for React Flow
│   └── utils.ts            cn() utility (clsx + tailwind-merge)
│
├── hooks/
│   ├── use-mobile.tsx      Breakpoint hook
│   └── use-toast.ts        Toast hook alias
│
├── integrations/
│   └── supabase/
│       ├── client.ts       Supabase JS client (singleton)
│       └── types.ts        Auto-generated Supabase DB types
│
└── test/
    ├── setup.ts            Vitest setup (matchMedia mock, jest-dom)
    └── example.test.ts     Placeholder test
```

## supabase/

```
supabase/
├── config.toml             Supabase project config
├── migrations/             SQL migration files
└── functions/
    ├── extract-automation/ AI extraction edge function
    ├── hubspot-sync/       HubSpot integration
    ├── zapier-sync/        Zapier integration
    └── typeform-sync/      Typeform integration
```

## Naming Conventions

- **Pages:** PascalCase, Dutch names (`AlleAutomatiseringen`, `BewerkAutomatisering`)
- **Components:** PascalCase (`AppLayout`, `VerificatieBadge`)
- **Hooks:** camelCase prefixed `use` (`useAutomatiseringen`, `useSaveAutomatisering`)
- **Lib files:** camelCase (`supabaseStorage.ts`, `domainGraph.ts`)
- **Types:** PascalCase interfaces (`Automatisering`, `Integration`, `Koppeling`)
- **CSS variables:** kebab-case in `index.css` (`--status-active`, `--radius-inner`)
- **Path alias:** `@/` maps to `src/` (configured in `tsconfig.json` + `vite.config.ts`)

---
*Mapped: 2026-03-30*
