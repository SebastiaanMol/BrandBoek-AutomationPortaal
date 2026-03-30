# Testing

## Framework

- **Vitest** — unit test runner (configured in `package.json` via `"test": "vitest run"`)
- **@testing-library/react** — component testing utilities
- **@testing-library/jest-dom** — DOM matchers
- **jsdom** — DOM environment for tests
- **@playwright/test** — E2E test runner (configured, not yet used)

## Test Structure

```
src/test/
├── setup.ts            Global setup (jest-dom import, matchMedia mock)
└── example.test.ts     Single placeholder test (always passes)
```

## Running Tests

```bash
npm test           # vitest run (single pass)
npm run test:watch # vitest (watch mode)
```

## Configuration

Vitest is configured inline in `package.json` scripts. Setup file: `src/test/setup.ts`.

`playwright.config.ts` and `playwright-fixture.ts` exist at root but contain no test specs.

## Current Coverage

**Minimal.** Only one test exists: `src/test/example.test.ts` — a trivial `expect(true).toBe(true)`.

### No tests for:
- Domain logic: `src/lib/types.ts` (`berekenComplexiteit`, `berekenImpact`, `getVerificatieStatus`)
- Graph analysis: `src/lib/graphAnalysis.ts`, `src/lib/graphProblems.ts`, `src/lib/domainGraph.ts`
- Storage functions: `src/lib/supabaseStorage.ts`
- Authentication: `src/lib/AuthContext.tsx`
- React Query hooks: `src/lib/hooks.ts`
- Any page component
- Any BPMN builder logic: `src/components/bpmn/buildBPMNGraph.ts`
- AI extraction

## Mocking Patterns

Only `window.matchMedia` is mocked in setup (required for Tailwind breakpoint hooks in jsdom).

No Supabase mock exists. Any test touching `supabaseStorage.ts` would need to mock `src/integrations/supabase/client.ts`.

## Recommended Test Priorities

1. **`src/lib/types.ts`** — pure functions, zero deps, easy wins
   - `berekenComplexiteit()`, `berekenImpact()`, `getVerificatieStatus()`
2. **`src/lib/graphProblems.ts`** — critical domain logic, pure functions
3. **`src/lib/domainGraph.ts`** — graph builder
4. **`src/lib/supabaseStorage.ts`** — mock Supabase client
5. **E2E flows** — auth → create automation → view in graph

---
*Mapped: 2026-03-30*
