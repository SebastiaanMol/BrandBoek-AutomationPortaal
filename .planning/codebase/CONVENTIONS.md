# Coding Conventions

**Analysis Date:** 2026-03-30

## Naming Patterns

**Files:**
- PascalCase for React component files: `AppLayout.tsx`, `Dashboard.tsx`, `AlleAutomatiseringen.tsx`
- camelCase for utility/hook files: `hooks.ts`, `supabaseStorage.ts`, `types.ts`, `utils.ts`
- kebab-case for shadcn/ui components: `use-mobile.tsx`, `use-toast.ts`
- UI component files in `src/components/ui/`: `button.tsx`, `card.tsx`, `dialog.tsx`

**Functions:**
- camelCase for all function names: `fetchAutomatiseringen()`, `useAutomatiseringen()`, `insertAutomatisering()`
- Hook functions start with `use`: `useAutomatiseringen()`, `useSaveAutomatisering()`, `useAuth()`
- Helper functions prefixed descriptively: `getVerificatieStatus()`, `berekenComplexiteit()`, `berekenImpact()`

**Variables:**
- camelCase for all variables: `queryClient`, `isLoading`, `openId`, `searchParams`
- Boolean variables use `is`, `has`, or `can` prefix: `isMobile`, `isLoading`, `mobileOpen`
- State variables use descriptive names with hooks: `const [query, setQuery] = useState("")`

**Types:**
- PascalCase for types and interfaces: `Automatisering`, `Koppeling`, `Integration`, `AuthContextType`
- PascalCase for exported constants that represent enums: `CATEGORIEEN`, `SYSTEMEN`, `STATUSSEN`, `KLANT_FASEN`
- Use union types for constrained values: `type Status = "Actief" | "Verouderd" | "In review" | "Uitgeschakeld"`

## Code Style

**Formatting:**
- No explicit formatter configured (not using Prettier or Biome)
- 2-space indentation (inferred from ESLint default and codebase)
- Semicolons present at end of statements
- Code relies on ESLint for consistency

**Linting:**
- ESLint v9.32.0 with typescript-eslint configuration
- Config: `eslint.config.js` (ES modules format)
- Extends: `@eslint/js` recommended and `typescript-eslint` recommended configs
- Plugins used:
  - `eslint-plugin-react-hooks` (v5.2.0)
  - `eslint-plugin-react-refresh` (v0.4.20)

**ESLint Rules:**
- `react-refresh/only-export-components`: warn (allows const exports)
- `@typescript-eslint/no-unused-vars`: off (disabled)
- TypeScript strict mode disabled in compiler options
- No implicit any allowed is false (lax type checking)

## Import Organization

**Order:**
1. React and core library imports
2. External dependencies (routing, queries, UI libraries)
3. Component imports
4. Internal utility imports (`@/lib`, `@/hooks`, `@/integrations`)
5. CSS/styling imports (when present)

**Path Aliases:**
- `@/*` maps to `./src/*`
- Used consistently throughout codebase: `import { useAuth } from "@/lib/AuthContext"`
- Enables clean imports without relative `../` paths

**Example import pattern from `src/App.tsx`:**
```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import Dashboard from "./pages/Dashboard";
```

## Error Handling

**Patterns:**
- Try-catch blocks around async operations and data parsing
- Error thrown via `throw error` or `throw new Error(message)`
- Supabase errors checked with conditional: `if (error) throw error`
- User-friendly error messages extracted to variable `toFriendlyDbError()`

**Error throwing examples from `src/lib/supabaseStorage.ts`:**
```typescript
if (error) throw error;
if (kopError) throw kopError;
if (!user) throw new Error("Niet ingelogd");
```

**Toast notifications for error display:**
- `toast.error(e.message || "Default message")` pattern used in UI
- Example from `src/pages/Instellingen.tsx`: `toast.error(e.message || "Verbinding mislukt")`

**Database error mapping:**
- Helper function `toFriendlyDbError(error)` converts technical DB errors to user messages
- Checks for duplicate constraint: "Automatisering met deze naam bestaat al"

## Logging

**Framework:** `console` methods (no external logging library)

**Patterns:**
- `console.warn()` for warnings: `console.warn("Mermaid render error:", err)`
- `console.error()` for errors with context: `console.error("AI extraction error:", e)`
- Logged with descriptive prefix to aid debugging
- No structured logging or centralized error tracking configured

## Comments

**When to Comment:**
- Section headers using ASCII dividers for major function groups
- Example from `src/lib/supabaseStorage.ts`: `// --- Fetch all automatiseringen with their koppelingen ---`
- Comments use hyphens for visual separation: `// ─── Helper: call an Edge Function ─────`

**JSDoc/TSDoc:**
- Not used systematically in codebase
- Types and interfaces declared inline without documentation comments
- Self-documenting code preferred (clear naming)

## Function Design

**Size:** No enforced maximum, but most component functions under 150 lines

**Parameters:**
- Single destructured object for multiple parameters in React components
- Example: `({ children }: { children: React.ReactNode })`
- Inline type annotations on destructured props

**Return Values:**
- React components return JSX.Element
- Query/mutation hooks return typed objects from TanStack React Query
- Utilities return typed data: `Promise<Automatisering[]>`, `number`, `string`

**Example function from `src/lib/types.ts`:**
```typescript
export function berekenComplexiteit(a: Automatisering): number {
  const stappenScore = Math.min((a.stappen?.length || 0) * 10, 40);
  const systemenScore = Math.min((a.systemen?.length || 0) * 12, 36);
  const afhankelijkhedenScore = a.afhankelijkheden?.trim() ? 15 : 0;
  const koppelingenScore = Math.min((a.koppelingen?.length || 0) * 5, 15);
  return Math.min(stappenScore + systemenScore + afhankelijkhedenScore + koppelingenScore, 100);
}
```

## Module Design

**Exports:**
- Named exports preferred: `export function useAutomatiseringen()`
- Default export used for page components: `export default function Dashboard()`
- Constants exported as named: `export const CATEGORIEEN: Categorie[] = [...]`

**Barrel Files:**
- Not used. Each file imports directly from source.
- Example: `import { useAutomatiseringen } from "@/lib/hooks"` not from index

**File structure pattern:**
- `src/lib/types.ts` exports all domain types and type-related constants
- `src/lib/supabaseStorage.ts` exports all data access functions
- `src/lib/hooks.ts` exports all React hooks wrapping data operations
- Separation of concerns: types, storage, hooks, components

---

*Convention analysis: 2026-03-30*
