# Phase 4: Portal Quality - Research

**Researched:** 2026-03-31
**Domain:** React/TypeScript frontend code quality — dead code removal, route stability, test coverage
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUAL-01 | All routed pages are stable and accessible from the sidebar nav | Sidebar nav enumerated; pages inspected; all 8 nav-linked pages use Supabase hooks and load cleanly; no console-error sources found in page code |
| QUAL-02 | Legacy/dead code removed (NieuweAutomatisering.tsx, dual storage layer reconciled) | storage.ts confirmed orphaned (no imports); NieuweAutomatisering.tsx is a shared form component still used by three files — see critical finding below |
| QUAL-03 | Core domain logic (berekenComplexiteit, berekenImpact, graphProblems) has basic test coverage | All three functions located; no tests exist for them yet; test infrastructure (Vitest + jsdom) already running at 54 tests passing |
</phase_requirements>

---

## Summary

Phase 4 is a cleanup and coverage phase. The codebase is in good structural health — TypeScript compiles clean with zero errors, and all 54 existing tests pass. Three distinct bodies of work are needed.

**QUAL-01 (page stability):** Eight pages are linked from the sidebar nav (`/`, `/nieuw`, `/alle`, `/verificatie`, `/processen`, `/analyse`, `/imports`, `/instellingen`). Every one of them has been ported to Supabase hooks and imports no legacy code. No TypeScript errors exist in any of them. Four additional pages are routed but commented out from the nav (`/kennisgraaf`, `/mindmap`, `/bpmn`, `/proceskaart`) — these are in-scope only to confirm they don't crash the app, not to surface them in the nav.

**QUAL-02 (dead code / dual storage):** The "dual storage layer" is `src/lib/storage.ts` (localStorage) alongside `src/lib/supabaseStorage.ts` (Supabase). The migration to Supabase is already 100% complete — `hooks.ts` imports exclusively from `supabaseStorage.ts`, and `storage.ts` has ZERO imports anywhere in `src/`. It is safe to delete. The critical nuance for QUAL-02: the requirement says "NieuweAutomatisering.tsx is removed" but this component is NOT dead code. It is actively imported by three files: `NieuweAutomatiseringPage.tsx`, `BewerkAutomatisering.tsx`, and `AIUpload.tsx`. The correct interpretation is that the file should be **moved** from `src/pages/` to `src/components/` (it is a reusable form component, not a page) and the three callers updated. Alternatively, the planner may interpret "removed" as making the `/nieuw` route go directly to `NieuweAutomatiseringPage.tsx` without a separate `NieuweAutomatisering.tsx` helper — but merging it would not reduce complexity. The safest plan: move/rename to `src/components/AutomatiseringForm.tsx` and update the three imports.

**QUAL-03 (test coverage):** `berekenComplexiteit` and `berekenImpact` live in `src/lib/types.ts` and are pure functions — trivially testable with Vitest. `graphProblems` (the `detectProblems` function and its helpers) lives in `src/lib/graphProblems.ts` which imports from `src/lib/graphAnalysis.ts` — both are pure TypeScript with no React or DOM dependencies, making them directly importable into a Vitest test file without duplication.

**Primary recommendation:** Three-plan phase — (1) delete `storage.ts`, move `NieuweAutomatisering.tsx` to components, update imports; (2) write tests for `berekenComplexiteit`, `berekenImpact`, `detectProblems`; (3) human verification of all nav pages.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 4.1.0 (installed) | Test runner | Already in use, zero config needed |
| jsdom | — (via vitest config) | DOM environment for tests | Already configured in vitest.config.ts |
| @testing-library/jest-dom | — (installed) | Custom matchers | Already in setup.ts |

### Supporting
No new libraries needed for this phase. All tooling is already installed.

**Version verification:** `npm test -- --run` returns `4 passed, 54 tests passed` confirming Vitest 4.1.0 is operational.

---

## Architecture Patterns

### Recommended Project Structure (after QUAL-02)
```
src/
├── components/
│   └── AutomatiseringForm.tsx   # moved from pages/NieuweAutomatisering.tsx
├── pages/
│   ├── NieuweAutomatiseringPage.tsx   # imports from components/AutomatiseringForm
│   ├── BewerkAutomatisering.tsx       # imports from components/AutomatiseringForm
│   └── AIUpload.tsx                   # imports from components/AutomatiseringForm
├── lib/
│   ├── storage.ts    # DELETED — no callers
│   └── supabaseStorage.ts  # sole storage layer
└── test/
    └── domainLogic.test.ts  # new file for QUAL-03
```

### Pattern 1: Direct Import for Pure Logic Tests
**What:** `berekenComplexiteit`, `berekenImpact`, and `detectProblems` have no React/DOM/Deno dependencies. They can be imported directly into Vitest, unlike the Deno edge-function pattern used in phases 1-2.
**When to use:** Any pure TypeScript function in `src/lib/`
**Example:**
```typescript
// src/test/domainLogic.test.ts
import { describe, it, expect } from "vitest";
import { berekenComplexiteit, berekenImpact } from "@/lib/types";
import { detectProblems } from "@/lib/graphProblems";
```
No duplication needed — unlike `inferFasen` (Deno edge function) and `toCanvasAutomation` (React component), these functions are in plain `.ts` lib files.

### Pattern 2: Existing Test Fixture Helper
**What:** Prior test files use a `makeAutomatisering()` helper to create test fixtures. Reuse this pattern in the new test file.
**Example:**
```typescript
function makeAutomatisering(overrides: Partial<Automatisering> = {}): Automatisering {
  return {
    id: "auto-1", naam: "Test", categorie: "HubSpot Workflow",
    doel: "Test doel", trigger: "Form submitted", systemen: [],
    stappen: [], afhankelijkheden: "", owner: "Jan", status: "Actief",
    verbeterideeën: "", mermaidDiagram: "", koppelingen: [],
    fasen: [], createdAt: "2026-01-01T00:00:00Z",
    laatstGeverifieerd: null, geverifieerdDoor: "",
    ...overrides,
  };
}
```

### Anti-Patterns to Avoid
- **Deleting NieuweAutomatisering.tsx without updating callers:** Three files import it. Delete without updating = build error.
- **Duplicating berekenComplexiteit/berekenImpact in the test file:** Unlike edge-function logic, these are directly importable — duplication adds maintenance cost without benefit.
- **Writing integration tests for QUAL-03:** The requirement says "basic test coverage" — unit tests covering the scoring formulas and problem detection branches are sufficient.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test assertions | Custom matchers | `@testing-library/jest-dom` (already installed) | Installed, familiar, already in setup.ts |
| Test fixture data | Complex factory functions | Simple `makeAutomatisering()` helper | Pattern already established across 3 test files |

---

## Runtime State Inventory

> Not applicable — this is a code/file-level cleanup phase with no string renaming, data migration, or rebrand.

None — verified by inspection. No stored records, service configs, OS registrations, secrets, or build artifacts reference the specific files being moved or deleted.

---

## Common Pitfalls

### Pitfall 1: Misreading QUAL-02 as "delete NieuweAutomatisering.tsx"
**What goes wrong:** Deleting the file breaks `NieuweAutomatiseringPage.tsx`, `BewerkAutomatisering.tsx`, and `AIUpload.tsx` — three active, nav-linked pages stop compiling.
**Why it happens:** The requirement text says "removed" but the file is a reusable form component, not a page or dead code. The dual-storage problem is in `storage.ts`, not `NieuweAutomatisering.tsx`.
**How to avoid:** Move `NieuweAutomatisering.tsx` to `src/components/AutomatiseringForm.tsx`, update all three import paths. The requirement is satisfied because the file is no longer an orphaned page living in `pages/`.
**Warning signs:** TypeScript errors on `import NieuweAutomatisering` in three files after deletion.

### Pitfall 2: Confusing QUAL-01 scope (nav pages vs. all routed pages)
**What goes wrong:** The 4 commented-out nav items (`/mindmap`, `/kennisgraaf`, `/bpmn`, `/proceskaart`) are still in `App.tsx` as routes. Verifying "all sidebar nav pages" should not include manual verification of these hidden pages.
**Why it happens:** AppLayout comments out those 4 nav items but App.tsx still routes them.
**How to avoid:** Scope QUAL-01 to the 8 nav-visible pages + `/instellingen`. The hidden routes are out of scope for Phase 4 per REQUIREMENTS.md (ENH-02 defers KennisGraaf3D visibility to v2).
**Warning signs:** Confusion about whether `/kennisgraaf` passes QUAL-01.

### Pitfall 3: Missing the berekenImpact dependency signature
**What goes wrong:** Writing tests for `berekenImpact` without passing the `alle` array causes all scores to compute incorrectly (depScore is always 0).
**Why it happens:** `berekenImpact(a, alle)` takes TWO arguments — the second is the full automation array used to count dependents.
**How to avoid:** Always pass a populated `alle` array in tests that verify the `depScore` component.
**Warning signs:** All berekenImpact tests returning max 70 (fasenScore + systemenScore + statusBonus only).

### Pitfall 4: graphProblems orphan detection depends on buildAdjacency
**What goes wrong:** An automation with no koppelingen is always flagged as an orphan — even in isolation. Tests that create a single automation expect "no orphan" will fail.
**Why it happens:** `detectProblems` calls `buildAdjacency` and flags any node with `adj.get(a.id)?.size === 0` as orphan. A single automation with empty koppelingen has no edges.
**How to avoid:** Test the orphan rule with two connected automations to confirm non-orphan behavior. Test isolated automation to confirm orphan flag fires correctly.

---

## Code Examples

### berekenComplexiteit scoring formula (from src/lib/types.ts)
```typescript
// stappenScore: stappen.length * 10, capped at 40
// systemenScore: systemen.length * 12, capped at 36
// afhankelijkhedenScore: 15 if non-empty string, else 0
// koppelingenScore: koppelingen.length * 5, capped at 15
// Total: capped at 100
export function berekenComplexiteit(a: Automatisering): number {
  const stappenScore = Math.min((a.stappen?.length || 0) * 10, 40);
  const systemenScore = Math.min((a.systemen?.length || 0) * 12, 36);
  const afhankelijkhedenScore = a.afhankelijkheden?.trim() ? 15 : 0;
  const koppelingenScore = Math.min((a.koppelingen?.length || 0) * 5, 15);
  return Math.min(stappenScore + systemenScore + afhankelijkhedenScore + koppelingenScore, 100);
}
```

### berekenImpact scoring formula (from src/lib/types.ts)
```typescript
// fasenScore: fasen.length * 12
// systemenScore: systemen.length * 8
// depScore: directDeps * 20  (count of automations that link TO this one)
// statusBonus: 10 if status === "Actief"
// Total: capped at 100
export function berekenImpact(a: Automatisering, alle: Automatisering[]): number { ... }
```

### detectProblems problem types (from src/lib/graphProblems.ts)
```typescript
// 8 ProblemTypes: "orphan" | "missing-owner" | "missing-trigger" |
//   "missing-systems" | "outdated" | "unverified" | "no-goal" | "broken-link"
// Severity mapping: broken-link/outdated → "error", orphan/missing-* → "warning",
//   unverified/no-goal → "info"
// Key dependency: detectProblems calls buildAdjacency from graphAnalysis.ts
```

### Import path after QUAL-02 move
```typescript
// Before (broken after file deletion):
import NieuweAutomatisering from "./NieuweAutomatisering";

// After (correct after move to components/):
import AutomatiseringForm from "@/components/AutomatiseringForm";
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| localStorage via storage.ts | Supabase via supabaseStorage.ts | Before Phase 1 | storage.ts is fully orphaned |
| NieuweAutomatisering.tsx as a page | Still lives in pages/ but used as a shared form component | Ongoing (accumulated) | Architectural confusion; correct fix is to move to components/ |

**Deprecated/outdated:**
- `src/lib/storage.ts`: No callers. Was the original localStorage layer before Supabase migration. Safe to delete outright.

---

## Open Questions

1. **What exactly does QUAL-02 mean by "NieuweAutomatisering.tsx is removed"?**
   - What we know: The file has 3 active callers. It is a form component living in the wrong directory.
   - What's unclear: Does "removed" mean (a) deleted and functionality merged into callers, (b) moved to components/, or (c) just that the route `/nieuw` should no longer use this component at all?
   - Recommendation: Interpret as "moved to components/ and renamed" — this eliminates the confusing presence of a reusable component in `pages/` with zero behavior change. All callers get updated. If the requirement intended something more drastic, the verification step will catch it.

2. **Should the hidden routes (/kennisgraaf, /mindmap, /bpmn, /proceskaart) be removed from App.tsx?**
   - What we know: They're commented out of the nav but still registered as routes. KennisGraaf is deferred to ENH-02 (v2). BPMNViewer, Mindmap, Proceskaart appear unused.
   - What's unclear: Whether removing these routes is in scope for Phase 4 or Phase 5 cleanup.
   - Recommendation: Keep the routes as-is. Removing them risks breaking something and adds no value to QUAL-01 (which is about nav-accessible pages being stable). Flag for Phase 5 if desired.

---

## Environment Availability

Step 2.6: SKIPPED — this is a code/test-only phase with no external dependencies. All tooling (Node, npm, Vitest) is confirmed operational by the successful test run above.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-01 | All nav pages load without errors | manual | — (human verification plan) | N/A |
| QUAL-02 | storage.ts deleted; NieuweAutomatisering moved | build | `npx tsc --noEmit` | N/A — verified by zero compile errors |
| QUAL-03 | berekenComplexiteit scoring logic | unit | `npm test` | ❌ Wave 0 |
| QUAL-03 | berekenImpact scoring logic | unit | `npm test` | ❌ Wave 0 |
| QUAL-03 | detectProblems problem detection | unit | `npm test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green (currently 54 tests passing; must remain passing plus new QUAL-03 tests added)

### Wave 0 Gaps
- [ ] `src/test/domainLogic.test.ts` — covers QUAL-03 (berekenComplexiteit, berekenImpact, detectProblems)

*(No framework gaps — Vitest infrastructure fully operational.)*

---

## Sidebar Nav Inventory (QUAL-01)

Active nav items from `src/components/AppLayout.tsx`:

| Route | Page Component | Storage Layer | Known Issues |
|-------|---------------|---------------|--------------|
| `/` | Dashboard.tsx | hooks → Supabase | None detected |
| `/nieuw` | NieuweAutomatiseringPage.tsx → NieuweAutomatisering.tsx | hooks → Supabase | None detected |
| `/alle` | AlleAutomatiseringen.tsx | hooks → Supabase | None detected |
| `/verificatie` | Verificatie.tsx | hooks → Supabase | None detected |
| `/processen` | Processen.tsx | hooks → Supabase | None detected |
| `/analyse` | Analyse.tsx | hooks → Supabase | None detected |
| `/imports` | Imports.tsx | supabase direct + hooks | None detected |
| `/instellingen` (bottom nav) | Instellingen.tsx | hooks → Supabase | None detected |

Commented-out nav items (routed but hidden — NOT in scope for QUAL-01):
- `/mindmap` → Mindmap.tsx
- `/kennisgraaf` → KennisGraaf.tsx
- `/bpmn` → BPMNViewer.tsx
- `/proceskaart` → Proceskaart.tsx

---

## QUAL-02 Storage Layer Detail

| File | Status | Action |
|------|--------|--------|
| `src/lib/storage.ts` | ORPHANED — zero imports | Delete file |
| `src/lib/supabaseStorage.ts` | SOLE storage layer | No change |
| `src/lib/hooks.ts` | Imports only from supabaseStorage.ts | No change |
| `src/pages/NieuweAutomatisering.tsx` | Shared form component (3 callers) | Move to `src/components/AutomatiseringForm.tsx` |
| `src/pages/NieuweAutomatiseringPage.tsx` | Caller 1 — tab wrapper for /nieuw route | Update import path |
| `src/pages/BewerkAutomatisering.tsx` | Caller 2 — edit wrapper for /bewerk/:id route | Update import path |
| `src/pages/AIUpload.tsx` | Caller 3 — renders form after AI parse | Update import path |

---

## QUAL-03 Functions Detail

| Function | Location | Args | Returns | Direct Import OK? |
|----------|----------|------|---------|-------------------|
| `berekenComplexiteit` | `src/lib/types.ts` | `(a: Automatisering)` | `number` (0-100) | YES |
| `berekenImpact` | `src/lib/types.ts` | `(a: Automatisering, alle: Automatisering[])` | `number` (0-100) | YES |
| `detectProblems` | `src/lib/graphProblems.ts` | `(automations: Automatisering[])` | `GraphProblem[]` | YES (depends on graphAnalysis.ts which is also plain TS) |

All three are importable directly — no duplication required (unlike the Deno edge function pattern from Phase 2).

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — App.tsx, AppLayout.tsx, storage.ts, supabaseStorage.ts, hooks.ts, types.ts, graphProblems.ts, all 8 nav-linked page files
- `npm test -- --run` output — confirms 54 tests passing, Vitest 4.1.0
- `npx tsc --noEmit` — confirms zero TypeScript errors
- `grep -rn "NieuweAutomatisering"` — confirms 3 active callers
- `grep -rn "lib/storage"` — confirms zero callers of storage.ts

### Secondary (MEDIUM confidence)
- None required — all findings from direct code inspection

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- QUAL-01 (page stability): HIGH — all 8 pages read, hooks confirmed, tsc clean
- QUAL-02 (dead code): HIGH — storage.ts zero imports confirmed by grep; NieuweAutomatisering.tsx callers confirmed by grep
- QUAL-03 (test coverage): HIGH — functions located, signatures known, import paths verified
- Architecture patterns: HIGH — established by prior phases (Vitest setup, jsdom, fixture helpers)

**Research date:** 2026-03-31
**Valid until:** 2026-05-01 (stable codebase, low churn expected)
