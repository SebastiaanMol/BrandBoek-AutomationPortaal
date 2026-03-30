# Technology Stack

**Analysis Date:** 2026-03-30

## Languages

**Primary:**
- TypeScript 5.8.3 - React component development, hooks, utilities
- JavaScript (ES6+ Module) - Configuration files, bundling

**Secondary:**
- SQL - Supabase migrations and database logic
- HTML/CSS - Template and styling

## Runtime

**Environment:**
- Node.js (Latest LTS implied) - Development and build tooling
- Web Browser - React application execution

**Package Manager:**
- npm (with package-lock.json) - Primary dependency manager
- bun.lock - Alternative lock file present

## Frameworks

**Core:**
- React 18.3.1 - UI component library
- React Router DOM 6.30.1 - Client-side routing
- Vite 8.0.0 - Development server and build tool
- TypeScript 5.8.3 - Type checking and compilation

**Data & State:**
- TanStack React Query 5.83.0 - Server state management and caching
- Supabase 2.99.2 - Backend as a service (PostgreSQL database, Auth, Edge Functions)

**UI Components:**
- shadcn/ui (via Radix UI) - Component library foundation
- Tailwind CSS 3.4.17 - Utility-first styling
- Framer Motion 11.18.0 - Animation library
- Mermaid 11.13.0 - Diagram generation (BPMN, flowcharts)

**Visualization:**
- React Flow (@xyflow/react) 12.10.1 - Node-graph visualization
- Recharts 2.15.4 - Chart and graph components
- Dagre (@dagrejs/dagre) 2.0.4 - Graph layout and visualization
- Three.js 0.183.2 - 3D rendering
- React Force Graph 3D (react-force-graph-3d) 1.29.1 - 3D force-directed graph visualization

**Forms & Input:**
- React Hook Form 7.61.1 - Form state management
- Zod 3.25.76 - TypeScript-first schema validation
- @hookform/resolvers 3.10.0 - Form validation resolvers

**UI Utilities:**
- Radix UI (20+ component packages) - Headless UI component library
- Class Variance Authority 0.7.1 - CSS class composition
- CLSX 2.1.1 - Conditional CSS classes
- Tailwind Merge 2.6.0 - Merge Tailwind CSS classes
- Lucide React 0.462.0 - Icon library
- cmdk 1.1.1 - Command menu component

**Carousel:**
- Embla Carousel (embla-carousel-react) 8.6.0 - Touch-enabled carousel

**Notifications:**
- Sonner 1.7.4 - Toast notifications
- Vaul 0.9.9 - Dialog/drawer drawer component

**Theming:**
- next-themes 0.3.0 - Dark/light mode theming
- Date-fns 3.6.0 - Date manipulation and formatting

**Other:**
- Canvas Confetti 1.9.4 - Celebratory confetti animation
- React Day Picker 8.10.1 - Date picker component
- React Resizable Panels 2.1.9 - Resizable panel layout
- Input OTP 1.4.2 - One-time password input

## Testing

**Framework:**
- Vitest 4.1.0 - Unit and component testing
- Playwright 1.57.0 - E2E testing
- Testing Library React 16.0.0 - Component testing utilities
- Testing Library Jest DOM 6.6.0 - Custom matchers for DOM

**Environment:**
- jsdom 20.0.3 - DOM simulation for tests

## Build & Dev Tools

**Development:**
- @vitejs/plugin-react 6.0.0 - React Fast Refresh integration
- lovable-tagger 1.1.13 - Component tagging utility

**Linting & Code Quality:**
- ESLint 9.32.0 - JavaScript/TypeScript linting
- @eslint/js 9.32.0 - ESLint base rules
- typescript-eslint 8.38.0 - TypeScript ESLint rules
- eslint-plugin-react-hooks 5.2.0 - React Hooks linting
- eslint-plugin-react-refresh 0.4.20 - Fast Refresh rules

**Styling & CSS:**
- Tailwind CSS 3.4.17 - Utility-first CSS framework
- @tailwindcss/typography 0.5.16 - Typography plugin
- PostCSS 8.5.6 - CSS preprocessing
- Autoprefixer 10.4.21 - Vendor prefix automation

**Type Definitions:**
- @types/react 18.3.23 - React type definitions
- @types/react-dom 18.3.7 - React DOM type definitions
- @types/node 22.16.5 - Node.js type definitions
- @types/three 0.183.1 - Three.js type definitions

**Other Tools:**
- Globals 15.15.0 - Global variable definitions for ESLint

## Configuration

**Environment:**
- Variables loaded via Vite's `import.meta.env` (VITE_* prefix)
- Critical vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- `.env` file present (contains environment configuration)

**Build:**
- `vite.config.ts` - Vite configuration with React plugin, path aliases, dev server settings
- `tsconfig.json` - TypeScript compiler options with path aliases (`@/*` → `./src/*`)
- `tailwind.config.ts` - Tailwind CSS theme extensions and color customization
- `postcss.config.js` - PostCSS configuration for Tailwind
- `vitest.config.ts` - Vitest test runner configuration (jsdom environment)
- `eslint.config.js` - ESLint rules for TS/TSX files
- `components.json` - shadcn/ui configuration

**Development Server:**
- Host: `::` (IPv6 localhost)
- Port: 8080
- HMR disabled (overlay: false)
- Proxy routes configured for external APIs (see INTEGRATIONS.md)

## Platform Requirements

**Development:**
- Node.js (recent version)
- npm or bun package manager
- TypeScript knowledge required
- Modern browser with ES2020+ support

**Production:**
- Static file hosting (SPA deployment)
- Supabase project for database and authentication
- External API tokens (HubSpot, Zapier, Typeform)
- Edge Function support (Supabase Deno runtime)

---

*Stack analysis: 2026-03-30*
