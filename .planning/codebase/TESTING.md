# Testing Patterns
_Last updated: 2026-03-30_

## Test Framework

**Runner:**
- Vitest 4.x
- Config: `vitest.config.ts`
- Environment: jsdom (browser-like DOM)
- Globals enabled: `true` (no need to import `describe`/`it`/`expect` in tests)

**Assertion Library:**
- `@testing-library/jest-dom` 6.x — DOM matchers (`toBeInTheDocument`, etc.)
- Vitest built-ins (`expect`, `toBe`, `toHaveLength`, etc.)

**Run Commands:**
```bash
npm run test          # Run all tests once (vitest run)
npm run test:watch    # Watch mode (vitest)
# Coverage: no coverage script defined — run manually with:
npx vitest run --coverage
```

## Test File Organization

**Location:**
- All test files live in `src/test/` — NOT co-located with source files.
- No `*.test.ts` files exist alongside components or pages.

**Naming:**
- `src/test/processCanvas.test.ts` — 32 unit tests for process-canvas logic
- `src/test/example.test.ts` — placeholder scaffolding test (1 trivial assertion)
- `src/test/setup.ts` — global test setup file

**Structure:**
```
src/
  test/
    setup.ts               # Global setup: jest-dom + matchMedia stub
    example.test.ts        # Placeholder (single `expect(true).toBe(true)`)
    processCanvas.test.ts  # 32 unit tests for Phase 1 logic
```

**Glob pattern (from `vitest.config.ts`):**
```
src/**/*.{test,spec}.{ts,tsx}
```
Tests anywhere under `src/` are discovered, not only `src/test/`.

## Global Setup

`src/test/setup.ts` runs before every test suite via `setupFiles: ["./src/test/setup.ts"]`:

```typescript
import "@testing-library/jest-dom";

// jsdom does not implement matchMedia — stub it to prevent runtime errors
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
```

## Path Alias

Tests resolve `@/` to `src/` via:
```typescript
// vitest.config.ts
resolve: { alias: { "@": path.resolve(__dirname, "./src") } }
```

## Test Structure

**Suite organization (`processCanvas.test.ts`):**
```typescript
import { describe, it, expect } from "vitest";
import type { Automation, TeamKey, ProcessState } from "@/data/processData";
import type { Automatisering, KlantFase, Systeem } from "@/lib/types";

// Pure logic duplicated from Processen.tsx for testability (no React side effects)
const FASE_TO_TEAM: Record<KlantFase, TeamKey> = { ... };
function toCanvasAutomation(...) { ... }

// Factory helpers
function makeAutomatisering(overrides: Partial<Automatisering> = {}): Automatisering { ... }
function makeProcessState(automations: Automation[] = []): ProcessState { ... }

describe("PROC-01: toCanvasAutomation – team assignment and field mapping", () => {
  it("maps fasen=['Marketing'] to team='marketing'", () => {
    const a = makeAutomatisering({ fasen: ["Marketing"] });
    expect(toCanvasAutomation(a).team).toBe("marketing");
  });
});
```

**The four test groups in `processCanvas.test.ts`:**

| Suite | Tests | Scope |
|---|---|---|
| `PROC-01` | 16 | `toCanvasAutomation`: team assignment, field mapping (tool, goal, id, name) |
| `PROC-02` | 5 | `applyAttach`/`applyDetach`: pure state transition logic |
| `PROC-03` | 4 | `mergeAutoLinks`: ref-pattern merge fix (Plan 02 target) |
| `PROC-04` | 7 | `Automatisering` field type assertions (trigger, stappen, systemen, owner) |

**PROC-03 status:** These tests validate the *intended* fixed behavior of the autoLinks merge. They are expected to pass only after Plan 02 applies the ref-pattern fix to `src/pages/Processen.tsx`.

## Fixtures and Factories

**Test data is produced by inline factory functions (no shared fixtures directory):**

```typescript
// src/test/processCanvas.test.ts lines 46–75

function makeAutomatisering(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "auto-1", naam: "Test Automation", categorie: "HubSpot Workflow",
    doel: "Test goal", trigger: "Form submitted",
    systemen: [], stappen: [], afhankelijkheden: "", owner: "Jan",
    status: "Actief", verbeterideeën: "", mermaidDiagram: "",
    koppelingen: [], fasen: [], createdAt: "2026-01-01T00:00:00Z",
    laatstGeverifieerd: null, geverifieerdDoor: "",
    ...overrides,
  };
}

function makeProcessState(automations: Automation[] = []): ProcessState {
  return { steps: [], connections: [], automations };
}
```

## Mocking

**Framework:** None — no `vi.mock`, `vi.fn`, or MSW in any current test.

**Approach:** Pure logic is duplicated from React components directly into the test file, eliminating the need to mock Supabase, React Query, or toast. The test header at line 11–14 documents this explicitly:
> "toCanvasAutomation and FASE_TO_TEAM are NOT exported from Processen.tsx (React component side effects prevent direct import). The pure logic is duplicated here for testability — this is intentional."

**What is not tested (no mock infrastructure exists for these):**
- Supabase network calls in `src/lib/supabaseStorage.ts`
- React Query mutations/queries in `src/lib/hooks.ts`
- React component rendering (no `@testing-library/react` usage yet)
- Toast notifications

## Coverage

**Requirements:** None enforced — no coverage threshold configured, no `--coverage` in any npm script.

**View Coverage manually:**
```bash
npx vitest run --coverage
```

## Test Types

**Unit Tests:**
- 32 tests in `src/test/processCanvas.test.ts` covering pure transformation and state logic
- 1 placeholder test in `src/test/example.test.ts`

**Integration Tests:** None written.

**Component Tests (React Testing Library):**
- `@testing-library/react` 16.x is installed as a devDependency
- Zero component tests written

**E2E Tests:**
- `@playwright/test` is installed and `playwright.config.ts` is present
- Config: `createLovableConfig({})` — delegates entirely to lovable-agent defaults
- `playwright-fixture.ts` is present at project root
- No custom E2E test files found — only framework scaffolding

## Known Constraint: Logic Duplication

`toCanvasAutomation`, `FASE_TO_TEAM`, `applyAttach`, `applyDetach`, and `mergeAutoLinks` are duplicated verbatim from `src/pages/Processen.tsx` into `src/test/processCanvas.test.ts`. The test file includes a "Keep in sync with Processen.tsx" warning at line 22. Extracting this logic to a shared `src/lib/processCanvas.ts` module is deferred; until that refactor happens, any change to these functions in `Processen.tsx` requires a manual update in the test file.

---

*Testing analysis: 2026-03-30*
