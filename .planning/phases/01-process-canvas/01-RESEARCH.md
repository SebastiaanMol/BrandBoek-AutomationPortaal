# Phase 1: Process Canvas - Research

**Researched:** 2026-03-30
**Domain:** SVG swimlane canvas, Supabase persistence, React state, shadcn/ui, Vitest
**Confidence:** HIGH — this phase is primarily a code audit + targeted fix exercise; all findings come from direct source-code reading, not external docs.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** The canvas has not been tested against real Supabase data yet — the current implementation state is unknown.
- **D-02:** The planner should audit the current implementation against all four Phase 1 success criteria and identify gaps, rather than assuming which areas are broken. Do not preemptively fix things that may already work.
- **D-03:** The highest-risk concern raised was detail panel data (`fullData` not fetched, wrong field mappings), but the user walked this back — it may already be fine. Verify before touching.
- **D-04:** Discover-and-fix approach: read the code, run it mentally against the success criteria, then plan targeted fixes only where gaps are confirmed.
- **D-05:** The canvas infrastructure (`ProcessCanvas.tsx`, `AutomationDetailPanel.tsx`, `UnassignedPanel.tsx`, Supabase persistence) is already built. Phase 1 work is polish, bug fixes, and gap-filling — not a rebuild.

### Claude's Discretion

- How to handle loading states, empty states, and error states — use judgment based on existing patterns in the codebase.
- Visual polish details (hover states, transitions, responsive behavior) — match existing shadcn/ui + Tailwind patterns.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. Export (PNG/PDF) is Phase 3, not Phase 1.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROC-01 | User can view all automations loaded into the swimlane canvas, organized by customer phase | Automations load from Supabase via `useAutomatiseringen()` → `toCanvasAutomation()` → `state.automations`. The canvas displays them as SVG dots on connection arrows. See Gap Analysis §PROC-01. |
| PROC-02 | User can drag automations between swimlanes and reposition them on the canvas | Drag-and-drop is implemented via HTML5 `dragstart`/`drop` on SVG arrow hit-areas. See Gap Analysis §PROC-02. |
| PROC-03 | Automation placement and connections persist across sessions (saved to Supabase) | `saveProcessState()` / `fetchProcessState()` exist and use the `process_state` table with explicit save only. See Gap Analysis §PROC-03. |
| PROC-04 | User can click an automation to see full details in the side panel (trigger, steps, systems, owner) | `AutomationDetailPanel` receives `automation` + `fullData?: Automatisering`. `fullData` is supplied from `dbAutomations?.find(a => a.id === selectedAuto?.id)`. See Gap Analysis §PROC-04. |
</phase_requirements>

---

## Summary

Phase 1 is a brownfield polish-and-fix phase. The swimlane canvas infrastructure is complete and architecturally sound: SVG rendering (`ProcessCanvas.tsx`, 906 lines), automation detail panel (`AutomationDetailPanel.tsx`), unassigned panel with drag (`UnassignedPanel.tsx`), and Supabase persistence (`supabaseStorage.ts`) are all in place. The orchestration page (`Processen.tsx`) wires them together with React state, dirty-tracking, explicit save/reset, and two-phase data loading (canvas state from `process_state` table, then live automations from `automatiseringen` table).

The code audit against the four success criteria reveals that the core paths are correctly wired in most cases. The risks are concentrated in two areas: (1) the two-effect load sequence has a race where `autoLinks` restoration is silently dropped when `dbAutomations` arrives, and (2) the `Section` component in `AutomationDetailPanel` uses a non-conforming `text-[10px]` class instead of the canonical `.label-uppercase` utility. The loading state, empty state, and UI copy are almost fully aligned with the UI-SPEC but have minor gaps.

**Primary recommendation:** Plan a structured audit wave (read code → identify confirmed gaps) followed by a targeted fix wave. Do not rebuild any component. Gaps are small and surgical. The largest risk is the autoLinks race in `Processen.tsx`; the largest polish gap is the Section label typography in `AutomationDetailPanel.tsx`.

---

## Gap Analysis Against Success Criteria

### PROC-01: Automations visible in swimlanes by customer phase

**What the code does:**
- `useAutomatiseringen()` (React Query) fetches all `Automatisering` from Supabase on mount.
- A second `useEffect` maps results through `toCanvasAutomation()` and calls `setState`.
- `toCanvasAutomation()` assigns `team` via `FASE_TO_TEAM[a.fasen?.[0]] ?? "management"` — uses only the first phase.
- Canvas renders automations as SVG dots only when they have both `fromStepId` AND `toStepId` (i.e., are attached to a connection arrow).
- Unattached automations show in `UnassignedPanel`, not on the canvas itself.

**Confirmed gaps / risks:**

1. **Swimlane assignment uses only `fasen[0]`** (MEDIUM risk): If an automation has no `fasen` array or an empty array, `team` defaults to `"management"`. This is a silent mis-assignment. Need to verify real data has `fasen` populated before deciding if this matters.

2. **Automations are NOT visible as swimlane cards** — they are dots on arrows. PROC-01 says "organized by customer phase"; the unassigned panel groups them, and attached ones sit on arrows in the correct swimlane. The CONTEXT.md clarifies this model is intentional. Verify the UI-SPEC confirms this interpretation — it does (see UI-SPEC "Automation–canvas link" note).

3. **No empty-state for unassigned panel** when all automations are assigned: the current code shows `"Alle automations zijn gekoppeld."` which matches UI-SPEC. No gap here.

**Status:** PROC-01 is functionally implemented. Risk is data-quality (fasen empty) which is a runtime concern not a code bug.

---

### PROC-02: Drag automations between swimlanes; position persists after refresh

**What the code does:**
- `UnassignedPanel` sets `e.dataTransfer.setData("automationId", auto.id)` on drag start.
- `ProcessCanvas` connection arrows have `onDrop` handlers that read `automationId` from dataTransfer and call `onAttachAutomation(autoId, conn.fromStepId, conn.toStepId)`.
- `onAttachAutomation` calls `handleAttach` in `Processen.tsx`, which updates `state.automations[].fromStepId` and `toStepId` and sets `isDirty = true`.
- The canvas position of a dot is determined by which connection it sits on (not by x/y coordinates), so "position" is the `fromStepId`/`toStepId` pair.

**Confirmed gaps / risks:**

1. **`conn.fromStepId` passed to `onAttachAutomation` is `string | undefined`** (LOW risk): The `Connection` type has `fromStepId?: string`. In the canvas drop handler at line 641: `onAttachAutomation(autoId, conn.fromStepId, conn.toStepId)`. TypeScript would allow `undefined` here but the function signature in `Processen.tsx` accepts `string`. If a branch connection (which has `fromAutomationId` instead of `fromStepId`) is dropped on, `fromStepId` will be `undefined`. However: the drop target is the invisible wide-path overlay rendered only for `stepConnections` (filtered to `!!c.fromStepId && !c.fromAutomationId`), so branch connections don't have drop overlays. Risk is theoretical.

2. **"Position persists after refresh"** requires explicit save — the user must click "Opslaan". No auto-save exists. The UI-SPEC and CONTEXT confirm this is intentional. But if the user drags and navigates away without saving, they lose position. This is by design per the persistence interaction contract.

3. **PROC-02 says "drag automations between swimlanes"** — the drag model is from UnassignedPanel onto arrows, not between swimlane areas. You cannot drag a dot from one arrow to another. "Between swimlanes" is somewhat misleading given the model. Confirm with user if re-attaching (detach then re-drag) is considered sufficient.

**Status:** PROC-02 is implemented. The save-required flow is intentional. Re-attachment requires detach + re-drag (no direct dot-to-arrow drag).

---

### PROC-03: Automation placement and connections persist (saved to Supabase)

**What the code does:**
- `fetchProcessState()` on mount: reads `process_state` table row `id="main"`, returns `{steps, connections, autoLinks}`.
- First `useEffect` restores canvas state: merges `saved.steps`, `saved.connections`, and maps `saved.autoLinks` onto existing automations.
- `saveProcessState()` on explicit save: upserts `process_state` row with current steps, connections, and autoLinks map.

**Confirmed gaps / confirmed risks:**

1. **autoLinks race condition** (HIGH risk): The first `useEffect` (load canvas state) runs when the component mounts. It restores autoLinks like this:

   ```ts
   automations: prev.automations.map(a => ({
     ...a,
     ...(saved.autoLinks[a.id] ?? {}),
   })),
   ```

   But at this point, `prev.automations` is still `[]` (the initialState), because `dbAutomations` hasn't arrived yet. So the spread over an empty array produces an empty array — **autoLinks restoration is a no-op**.

   Then the second `useEffect` (dbAutomations) fires when React Query resolves, and it replaces automations entirely:

   ```ts
   automations: dbAutomations.map(a => {
     const existing = prev.automations.find(x => x.id === a.id);
     return toCanvasAutomation(a, existing);
   })
   ```

   It calls `toCanvasAutomation(a, existing)` where `existing` comes from `prev.automations` — but by this point, `prev.automations` has been set to the result of the first effect (empty array or zeros). So `existing` is always `undefined`, and `existing?.fromStepId` is always `undefined`. **Result: saved autoLinks are never restored after a page refresh.**

   This is the confirmed critical bug for PROC-03. The saved positions are stored correctly in Supabase, but they are never read back on load.

2. **Fix approach (confirmed pattern):** Store the fetched saved state in a ref that survives across re-renders, then apply it in the dbAutomations effect when both pieces of data are available. Alternatively: move autoLinks restoration into the dbAutomations effect after merging.

3. **Steps and connections restore correctly** — their persistence is not affected by the race because they don't depend on `dbAutomations`.

4. **`process_state` table uses `supabase as any`** (LOW risk): The `db = supabase as any` cast is used because `process_state` is likely not in the generated Supabase types. This works at runtime but loses type safety. Not a blocker for Phase 1.

**Status:** PROC-03 HAS A CONFIRMED BUG. Steps + connections persist correctly. AutoLinks (automation attachment positions) do NOT restore on refresh. This is the primary fix target.

---

### PROC-04: Click automation → side panel with trigger, steps, systems, owner

**What the code does:**
- `handleAutoClick` in `Processen.tsx` sets `selectedAuto` to the clicked `Automation`.
- `AutomationDetailPanel` receives `automation={selectedAuto}` and `fullData={dbAutomations?.find(a => a.id === selectedAuto?.id)}`.
- `fullData` is a full `Automatisering` with all fields including `trigger`, `stappen`, `systemen`, `owner`.
- The panel renders `trigger`, `systemen`, `stappen`, and `owner` conditionally (only when `fullData?.[field]` is truthy).

**Confirmed gaps:**

1. **Typography non-conformance** (LOW, cosmetic): The `Section` component in `AutomationDetailPanel.tsx` line 27 uses `text-[10px]` for section label text:

   ```tsx
   <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
   ```

   The UI-SPEC mandates `.label-uppercase` (11px, font-bold, uppercase, tracking-widest) for all section labels. Two deviations: `text-[10px]` should be `text-[11px]` (or `.label-uppercase`), and `mb-1.5` (6px) should eventually be `mb-2` (8px). The UI-SPEC explicitly calls out this mb-1.5 issue and defers it. The font size (10px vs 11px) should be fixed.

2. **`fullData` is `undefined` when no automations in DB** (LOW): When `dbAutomations` is `null` or empty, panel fields are conditionally hidden — the panel still renders the automation's `name`, `tool`, `goal`, and `team` from the canvas `Automation` object. This is acceptable degraded behavior.

3. **Trigger field mapping** (CONFIRMED OK): `supabaseStorage.ts` maps `r.trigger_beschrijving → trigger` in the `Automatisering` type. `AutomationDetailPanel` renders `fullData?.trigger`. Field mapping is correct.

4. **Steps field mapping** (CONFIRMED OK): `stappen` is mapped as `r.stappen || []`. Panel renders `fullData?.stappen`.

5. **Owner field mapping** (CONFIRMED OK): `r.owner → owner`. Panel renders `fullData?.owner`.

6. **Systems field mapping** (CONFIRMED OK): `r.systemen || [] → systemen`. Panel renders `fullData?.systemen`.

**Status:** PROC-04 is functionally correct. The only fix needed is the Section label typography (`text-[10px]` → `.label-uppercase` class).

---

## Architecture Patterns

### Established Project Structure

```
src/
├── components/process/   # Canvas, panels, dialogs — all 906-line SVG canvas is here
├── data/processData.ts   # Types, initialState, TEAM_CONFIG, TEAM_ORDER
├── lib/
│   ├── hooks.ts          # React Query hooks (useAutomatiseringen etc.)
│   ├── supabaseStorage.ts # All Supabase calls (includes fetchProcessState/saveProcessState)
│   └── types.ts          # Domain types (Automatisering, KlantFase, etc.)
└── pages/Processen.tsx   # Orchestration: state, effects, event handlers
```

### Pattern 1: Two-phase Data Loading

**What:** Canvas state (steps, connections, autoLinks) loads from `process_state` table first, then live automation data loads from `automatiseringen` table via React Query. The two sources are merged in state.

**The bug:** These two effects are independent — the autoLinks from effect 1 need to survive until effect 2 arrives and merges them. Current code loses them.

**Fix pattern (HIGH confidence):** Use a `savedLinksRef = useRef<Record<string, ...>>({})` that is written in effect 1 and consumed in effect 2:

```typescript
// Source: direct code analysis (confirmed pattern from codebase)
const savedLinksRef = useRef<Record<string, { fromStepId: string; toStepId: string }>>({});

// Effect 1 (load canvas state):
savedLinksRef.current = saved.autoLinks;
// Do NOT try to merge autoLinks here — automations array is empty

// Effect 2 (db automations arrive):
automations: dbAutomations.map(a => {
  const existing = prev.automations.find(x => x.id === a.id);
  const savedLink = savedLinksRef.current[a.id];
  return toCanvasAutomation(a, { ...existing, ...savedLink });
})
```

### Pattern 2: Explicit Save (No Auto-save)

`isDirty` tracks changes. Save button becomes enabled. User must click "Opslaan" to persist. This is the established and intentional pattern — do not change it.

### Pattern 3: Section Label Typography

All section headers in panels use `.label-uppercase` utility class (defined in `src/index.css`):

```css
.label-uppercase {
  @apply text-[11px] font-bold uppercase tracking-widest text-muted-foreground;
}
```

Usage in TSX:
```tsx
<p className="label-uppercase mb-2">{label}</p>
```

The `Section` component in `AutomationDetailPanel.tsx` currently deviates from this pattern and must be corrected.

### Anti-Patterns to Avoid

- **Do not use `mb-1.5`** in new code — non-4px-grid value. Use `mb-2` (8px) instead.
- **Do not auto-save** — persistence is intentionally explicit (save button only).
- **Do not add inline hex colors** — use CSS variables or TEAM_CONFIG constants.
- **Do not rebuild components** — this is a polish/fix phase. Surgical edits only.
- **Do not install new packages** for Phase 1 — all needed libraries are already installed.
- **Do not use `--legacy-peer-deps` skip** when running npm commands — always include it.

---

## Standard Stack

### Core (All Already Installed)

| Library | Version | Purpose |
|---------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | via Vite | Type safety |
| Tailwind CSS | via config | Utility styling |
| shadcn/ui | default preset, slate base | Component library |
| Radix UI | via shadcn | Headless primitives |
| @tanstack/react-query | 5.83.0 | Server state, caching |
| @supabase/supabase-js | 2.99.2 | Supabase client |
| lucide-react | 0.462.0 | Icons |
| sonner | via shadcn | Toast notifications |
| Vitest | via vitest.config.ts | Unit testing |
| @testing-library/jest-dom | via setup.ts | DOM assertions |

No new packages are needed for Phase 1.

**Installation note:** Always use `npm install --legacy-peer-deps` due to lovable-tagger peer dependency conflict with Vite 8.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Toast notifications | Custom toast component | `sonner` (already in use via `toast.success/error/info`) |
| Confirmation dialogs | Custom modal | `AlertDialog` from shadcn/ui (already in use) |
| Loading skeletons | Custom shimmer | `Skeleton` from shadcn/ui (available, not yet used in canvas loading) |
| Scroll containers | Custom scroll | `ScrollArea` from shadcn/ui |
| Icon components | SVG inline code | `lucide-react` (already in use) |

---

## Common Pitfalls

### Pitfall 1: autoLinks Race Condition

**What goes wrong:** Drag-and-save positions don't restore after page refresh. The canvas appears empty (all automations in unassigned panel) even though they were previously attached.

**Why it happens:** The two `useEffect` hooks that load data (canvas state and dbAutomations) run independently. The autoLinks restoration in effect 1 operates on an empty `prev.automations` array. Effect 2 then overwrites with fresh data, ignoring the links.

**How to avoid:** Store `saved.autoLinks` in a ref and apply it inside effect 2 when dbAutomations arrive. See Architecture Pattern 1.

**Warning signs:** After save + refresh, all automations reappear in UnassignedPanel instead of as dots on arrows.

---

### Pitfall 2: `Section` Component Typography Drift

**What goes wrong:** New panel sections added without using `.label-uppercase` introduce visual inconsistency (10px instead of 11px labels).

**Why it happens:** The `Section` component currently hardcodes `text-[10px]` rather than using the CSS utility.

**How to avoid:** Change `Section` to use `className="label-uppercase mb-2"` (fixes both font size and spacing in one edit).

---

### Pitfall 3: TypeScript Casting in Persistence Layer

**What goes wrong:** `supabase as any` in `supabaseStorage.ts` silences type errors on the `process_state` table.

**Why it happens:** The `process_state` table is not in the generated Supabase TypeScript types (in `src/integrations/supabase/`).

**How to avoid:** Phase 1 should NOT attempt to add process_state to the generated types — that requires regenerating Supabase types, which is out of scope. The `as any` cast is acceptable for now.

---

### Pitfall 4: Loading State Mismatch

**What goes wrong:** The canvas shows a text spinner but the UI-SPEC specifies a `Skeleton` component or centered spinner pattern.

**Current code:** `Processen.tsx` line 475-477 shows a `<div>` with plain text "Proceskaart laden…" and hides the canvas wrapper with `hidden` class. The UI-SPEC says "Full-canvas skeleton or centered spinner; no empty-state text shown."

**How to avoid:** Replace the text loading indicator with a `Skeleton` component for the canvas area, or confirm the text spinner is acceptable per the "Claude's Discretion" zone.

---

### Pitfall 5: `clientToSvg` Y-axis Coordinate Bug

**What goes wrong:** The `clientToSvg` function in `ProcessCanvas.tsx` (line 369-376) applies horizontal scaling but NOT vertical scaling:

```typescript
x: (clientX - r.left) * (svgWidth / r.width),
y:  clientY - r.top,   // ← no vertical scale factor
```

The SVG width is computed and may differ from rendered width (the container scrolls horizontally), but the container height matches SVG height exactly (the outer div has `style={{ height: effectiveSvgHeight }}`), so vertical scaling is 1:1. This is intentional — the container is set to exactly the SVG height. Not a bug, but requires awareness when modifying layout.

---

## Code Examples

### Confirmed Fix: autoLinks ref pattern

```typescript
// In Processen.tsx — add ref before effects
// Source: direct analysis of race condition in existing effects
const savedLinksRef = useRef<Record<string, { fromStepId: string; toStepId: string }>>({});

// Effect 1: store links in ref, do NOT merge into automations yet
useEffect(() => {
  fetchProcessState()
    .then(saved => {
      if (saved) {
        savedLinksRef.current = saved.autoLinks;
        setState(prev => ({
          ...prev,
          steps:       saved.steps       as ProcessState["steps"],
          connections: saved.connections as ProcessState["connections"],
          // autoLinks applied in dbAutomations effect
        }));
        setSaved(s => ({
          ...s,
          steps:       saved.steps       as ProcessState["steps"],
          connections: saved.connections as ProcessState["connections"],
        }));
      }
    })
    .catch(err => console.error("Laden proceskaart mislukt:", err))
    .finally(() => setLoading(false));
}, []);

// Effect 2: merge db automations WITH saved links
useEffect(() => {
  if (!dbAutomations) return;
  setState(prev => ({
    ...prev,
    automations: dbAutomations.map(a => {
      const existing  = prev.automations.find(x => x.id === a.id);
      const savedLink = savedLinksRef.current[a.id];
      return toCanvasAutomation(a, existing ?? (savedLink ? { ...savedLink } as Automation : undefined));
    }),
  }));
}, [dbAutomations]);
```

### Confirmed Fix: Section label typography

```typescript
// In AutomationDetailPanel.tsx — replace current Section component
// Source: .label-uppercase defined in src/index.css, mb-2 per UI-SPEC spacing contract
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-uppercase mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}
```

### Loading State Pattern (Claude's Discretion)

```tsx
// Option A: text spinner (current, acceptable per Claude's Discretion)
{loading ? (
  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
    Proceskaart laden…
  </div>
) : null}

// Option B: Skeleton (UI-SPEC preferred, shadcn/ui available)
import { Skeleton } from "@/components/ui/skeleton";
{loading ? (
  <div className="p-4 space-y-3">
    <Skeleton className="h-[110px] w-full" />
    <Skeleton className="h-[110px] w-full" />
    <Skeleton className="h-[110px] w-full" />
  </div>
) : null}
```

---

## Environment Availability

Step 2.6: SKIPPED — Phase 1 is purely a code/config change phase. All external dependencies (Supabase, npm packages) are already installed and running. No new external tools are introduced.

---

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/jest-dom |
| Config file | `vitest.config.ts` (project root) |
| Setup file | `src/test/setup.ts` |
| Quick run command | `npx vitest run src/test/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROC-01 | Automations appear in state with correct team assignment from fasen[0] | unit | `npx vitest run src/test/processCanvas.test.ts` | Wave 0 gap |
| PROC-02 | Drag-drop correctly sets fromStepId/toStepId on automation | unit | `npx vitest run src/test/processCanvas.test.ts` | Wave 0 gap |
| PROC-03 | autoLinks restoration: saved links survive dbAutomations effect | unit | `npx vitest run src/test/processCanvas.test.ts` | Wave 0 gap |
| PROC-04 | fullData fields map correctly from Automatisering to detail panel | unit | `npx vitest run src/test/processCanvas.test.ts` | Wave 0 gap |

**Note:** PROC-02 (drag-and-drop) and the full save-restore loop (PROC-03) require browser interaction that cannot be automated without Playwright. The unit tests should cover the pure-logic paths: `toCanvasAutomation()`, `handleAttach()` state transitions, and the autoLinks merge logic. End-to-end visual/interaction verification is manual-only.

### Sampling Rate

- **Per task commit:** `npx vitest run src/test/processCanvas.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/test/processCanvas.test.ts` — unit tests covering PROC-01 through PROC-04 logic paths
  - `toCanvasAutomation()` team assignment with and without fasen
  - autoLinks merge logic (the ref pattern fix)
  - `handleAttach` / `handleDetach` state transitions
  - `fetchAutomatiseringen` field mappings (trigger, stappen, systemen, owner)

*(Existing infrastructure: `vitest.config.ts`, `src/test/setup.ts`, and `src/test/example.test.ts` already exist — only the new test file is needed)*

---

## Project Constraints (from CLAUDE.md memory)

CLAUDE.md does not exist at the project root. Constraints are sourced from `project_standards.md` memory file:

- **Language split:** UI labels in Dutch, code identifiers in English. Enforce throughout Phase 1 edits.
- **Data access:** Use React Query hooks from `src/lib/hooks.ts`. Do not call `supabaseStorage.ts` directly from React components (exception: `fetchProcessState`/`saveProcessState` called from `Processen.tsx` — this is existing pattern, acceptable).
- **Styling:** Tailwind + `cn()` utility. No inline style unless dynamic data-driven values (colors from TEAM_CONFIG, dimensions from SVG constants are the established exceptions).
- **shadcn/ui:** Install via `npx shadcn@latest add <component>`. Never edit files in `src/components/ui/` manually. No new components needed for Phase 1.
- **npm install:** Always use `--legacy-peer-deps`.
- **No auto-generated koppelingen:** Not relevant to Phase 1, but worth noting as a global invariant.

---

## Sources

### Primary (HIGH confidence)

- Direct source reading: `src/pages/Processen.tsx` — full 583 lines read
- Direct source reading: `src/components/process/ProcessCanvas.tsx` — full 906 lines read
- Direct source reading: `src/components/process/AutomationDetailPanel.tsx` — full 260 lines read
- Direct source reading: `src/components/process/UnassignedPanel.tsx` — full 132 lines read
- Direct source reading: `src/lib/supabaseStorage.ts` — full 300 lines read
- Direct source reading: `src/data/processData.ts` — full 107 lines read
- Direct source reading: `src/lib/hooks.ts` — full 119 lines read
- Direct source reading: `src/lib/types.ts` — full 130 lines read
- Direct source reading: `src/index.css` — `.label-uppercase` utility confirmed at line 140-142
- Direct source reading: `vitest.config.ts`, `src/test/setup.ts`, `src/test/example.test.ts` — test infrastructure confirmed
- Phase planning docs: `01-CONTEXT.md`, `01-UI-SPEC.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`

### Secondary (MEDIUM confidence)

None required — all findings are from direct code analysis.

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**

- Gap analysis (PROC-01 to PROC-04): HIGH — findings are from direct code reading, not inference
- autoLinks race condition: HIGH — confirmed by tracing both effects line-by-line
- Section typography issue: HIGH — confirmed against `.label-uppercase` in `src/index.css`
- Test infrastructure: HIGH — `vitest.config.ts` and setup files read directly

**Research date:** 2026-03-30
**Valid until:** This research is based on the current codebase snapshot. It remains valid until any of the six key source files are modified.
