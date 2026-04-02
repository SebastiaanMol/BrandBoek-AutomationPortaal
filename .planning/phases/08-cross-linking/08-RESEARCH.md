# Phase 8: Cross-Linking — Research

**Researched:** 2026-04-02
**Domain:** React Router navigation, inline detail panel enhancement, derived data filtering
**Confidence:** HIGH

---

## Summary

Phase 8 wires the automation detail panel — currently read-only — to the three entity pages that now exist (Processes, Systems, Owners) and adds a related automations list. All four links are simple React Router navigations using URLs that already exist and accept query params that are already implemented. No new pages, no new data fetching, no new dependencies are required.

The panel lives in `src/components/process/AutomationDetailPanel.tsx`. It receives a `fullData: Automatisering` prop from `Processen.tsx` containing all fields needed for LINK-02, LINK-03, and LINK-04. The panel currently renders systems as plain `<Badge>` elements and the owner as plain text; both need to become clickable. LINK-04 requires the full automation list which is NOT currently passed to the panel — the planner must thread `useAutomatiseringen()` data down or call the hook directly inside the panel.

The detail panel also exists in read-only form inside `Systems.tsx` and `Owners.tsx` (inline accordion, not the same component). Those inline accordions need the same link treatment for consistency, but the requirements specify only the automation detail panel in the process canvas, so the inline accordions in Systems/Owners are out of scope unless LINK-01 through LINK-04 language is interpreted broadly.

**Primary recommendation:** Enhance `AutomationDetailPanel.tsx` for LINK-01, LINK-02, LINK-03. For LINK-04, call `useAutomatiseringen()` directly inside the panel and derive related automations there — this avoids prop-drilling a second list through `Processen.tsx`.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LINK-01 | Automation detail view shows a clickable link to the process canvas (navigates to Processes page) | Route `/processen` confirmed in AppLayout. No query param needed — user lands on canvas and the automation is already visible (it lives there). Use `<Link to="/processen">` or `useNavigate`. |
| LINK-02 | Automation detail view shows each system as a clickable badge that navigates to the Systems page filtered to that system | `/systems?system=X` URL pattern confirmed in Systems.tsx. Replace plain `<Badge>` wrappers with `<Link to={/systems?system=${s}}>` wrapping the existing badge content. |
| LINK-03 | Automation detail view shows the owner as a clickable link that navigates to the Owners page filtered to that person | `/owners?owner=X` URL pattern confirmed in Owners.tsx. Wrap the existing owner text in `<Link to={/owners?owner=${fullData.owner}}>`. |
| LINK-04 | Automation detail view shows related automations (same phase or sharing a system) | Derivation uses `useAutomatiseringen()` hook (already used throughout codebase). Filter by shared `fasen` OR shared `systemen`, exclude self. Render as clickable list rows that expand the clicked automation (need a navigation strategy). |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-router-dom | Already installed | `Link` component and `useNavigate` hook for navigation | Project-wide routing; already used in `AlleAutomatiseringen.tsx` (`useNavigate`) and `AppLayout.tsx` (`Link`) |
| @/lib/hooks `useAutomatiseringen` | Internal | Data source for LINK-04 related automations derivation | Established project hook; STATE.md decision: "must use useAutomatiseringen() hook, no new queries" |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | Already installed | `ExternalLink`, `ArrowRight`, `Link2` icons for link affordances | Use for visual cue that a badge/text is a navigation target |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Where the Panel Lives

`src/components/process/AutomationDetailPanel.tsx` — a standalone React component. It is rendered by `Processen.tsx` when a canvas automation is selected:

```
Processen.tsx
  └─ AutomationDetailPanel
       props: automation (canvas Automation), fullData (Automatisering | undefined),
              steps, branchConnections, onClose, onDetach
```

`fullData` is `dbAutomations?.find(a => a.id === selectedAuto?.id)` — the full `Automatisering` record from Supabase. It carries:
- `fullData.systemen: Systeem[]` — needed for LINK-02 (system badges)
- `fullData.owner: string` — needed for LINK-03 (owner link)
- `fullData.fasen: KlantFase[]` — needed for LINK-04 (related automations by phase)
- `fullData.id` — needed for LINK-04 (exclude self from related list)

### Recommended Project Structure

No file moves. Changes concentrated in:

```
src/components/process/
  AutomationDetailPanel.tsx    ← primary change file (LINK-01, 02, 03, 04)
src/test/
  crossLinking.test.ts         ← new Wave 0 test scaffold
```

### Pattern 1: Navigation Using `Link` (LINK-01, LINK-02, LINK-03)

`Link` from `react-router-dom` is preferred over `useNavigate` for static destination links because it renders an `<a>` tag (correct semantics, Cmd+click opens in new tab).

```tsx
// Source: react-router-dom v6 docs + AlleAutomatiseringen.tsx existing usage
import { Link } from "react-router-dom";

// LINK-01: navigate to process canvas
<Link
  to="/processen"
  className="text-xs text-primary flex items-center gap-1 hover:underline"
>
  <ExternalLink className="h-3 w-3" />
  View on canvas
</Link>

// LINK-02: system badge becomes a link
// Replace existing: <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
// With:
<Link key={s} to={`/systems?system=${encodeURIComponent(s)}`}>
  <Badge variant="secondary" className="text-xs cursor-pointer hover:opacity-80 transition-opacity">
    {s}
  </Badge>
</Link>

// LINK-03: owner becomes a link
<Link
  to={`/owners?owner=${encodeURIComponent(fullData.owner)}`}
  className="font-medium text-foreground hover:underline text-primary"
>
  {fullData.owner}
</Link>
```

**Why `encodeURIComponent`:** Owner names and system names may contain spaces (e.g., "Brand Boekhouders"). Without encoding, the URL becomes malformed. Systems.tsx reads `searchParams.get("system")` — `URLSearchParams` automatically decodes, so encoding/decoding roundtrips correctly.

### Pattern 2: LINK-04 — Related Automations Derivation

Call `useAutomatiseringen()` directly inside `AutomationDetailPanel.tsx`. This hook is idempotent (React Query caches), so calling it in both `Processen.tsx` and the panel costs nothing — same cached data is returned.

```tsx
// Inside AutomationDetailPanel — no new API call, React Query cache hit
import { useAutomatiseringen } from "@/lib/hooks";

const { data: allAutomations } = useAutomatiseringen();

const related = (allAutomations ?? []).filter(a => {
  if (a.id === fullData?.id) return false;                          // exclude self
  const sharedFase = a.fasen?.some(f => fullData?.fasen?.includes(f));
  const sharedSystem = a.systemen?.some(s => fullData?.systemen?.includes(s));
  return sharedFase || sharedSystem;
});
```

**Rendering strategy for LINK-04 clickable rows:** Each related automation is a `<Link to="/alle">` that navigates to All Automations, OR a `<button onClick={() => navigate("/alle")}` with the automation name. The success criterion says "each is clickable" — navigating to All Automations (which has `?open=ID` deep-link support via `searchParams.get("open")` in `AlleAutomatiseringen.tsx`) is the cleanest approach.

Looking at `AlleAutomatiseringen.tsx` line 21: `const [openId, setOpenId] = useState<string | null>(searchParams.get("open") || null);` — it already reads `?open=ID` from the URL to auto-expand an automation. This means:

```tsx
// Navigate to All Automations with the related automation pre-expanded
<Link to={`/alle?open=${relatedAuto.id}`}>
  {relatedAuto.naam}
</Link>
```

This satisfies "each is clickable" and the user lands directly on the right automation detail. No canvas link is needed for related automations — the requirement says clickable, not "shows on canvas."

### Pattern 3: LINK-01 — Does it Need a Query Param?

The success criterion for LINK-01 is: "User can click a link in the automation detail panel and land on the Processes page with that automation visible on the canvas."

The canvas already shows ALL automations — if the automation is assigned to a step it is visible; if unassigned it is in the UnassignedPanel. There is no current "highlight" mechanism for a specific automation on the canvas. The requirement says "visible on the canvas" not "highlighted/selected." Therefore:

- **Simple case:** `<Link to="/processen">` with label "View on canvas" is sufficient. The automation is visible on the canvas by definition (it exists there).
- **Enhanced case (optional):** Pass `?id=X` and read it in `Processen.tsx` to auto-select `selectedAuto` on load. This is defensible but not required by the stated success criterion.

**Recommendation:** Implement the simple case — `<Link to="/processen">`. Do not add query-param auto-selection unless the planner decides to include it as an enhancement. Keep this phase focused.

### Anti-Patterns to Avoid

- **Using `useNavigate` instead of `Link` for navigable links:** `Link` produces proper `<a>` tags; `useNavigate` requires `onClick` and loses keyboard/accessibility semantics. Use `Link` for LINK-01, 02, 03. The only exception is if the badge/element must be a `<button>` for other reasons.
- **Wrapping `<Link>` inside a `<button>` or vice versa:** This creates invalid HTML (`<a>` inside `<button>`). Use one or the other. For system badges in the panel, the Badge is currently a `<span>`-based component — wrapping it in `<Link>` is valid.
- **Not encoding URL params:** System names and owner names with spaces will break URL parsing without `encodeURIComponent`.
- **Calling a new Supabase query for related automations:** The requirement explicitly states "must use useAutomatiseringen() hook, no new queries." React Query caching makes the extra hook call free.
- **Related automations list growing unbounded:** If an automation shares a phase with 30 others, showing all 30 is noisy. Consider capping at 5 with a "See all" link, or sorting by shared systems first. Document this in the plan.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL-based navigation to filtered page | Custom state management | `<Link to="/systems?system=X">` | Systems.tsx already reads `searchParams.get("system")` — it's built |
| Auto-expanding a related automation | New panel state/route | `?open=ID` param in `/alle` | AlleAutomatiseringen.tsx already reads `searchParams.get("open")` |
| Related automations query | Supabase `.from("automatiseringen").select(...)` | `useAutomatiseringen()` + in-memory filter | React Query cache, established project pattern |
| URL encoding | Custom encoder | `encodeURIComponent(name)` | Native browser API, handles all edge cases |

---

## Common Pitfalls

### Pitfall 1: `<Link>` inside `<Badge>` nesting invalid HTML

**What goes wrong:** `Badge` renders a `<div>` or `<span>`. If you put a `<Link>` (renders `<a>`) inside it AND the Badge itself has interactive styling, screen readers and browsers may mis-parse the DOM.

**Why it happens:** Developers wrap the Badge in a Link thinking it's straightforward, but the Badge component may add its own `onClick` or role attributes.

**How to avoid:** Wrap the Badge element with `<Link>` at the outermost level. Do not nest `<Link>` inside a `<button>`. Check the rendered output in browser devtools: `<a href="..."><span class="badge">HubSpot</span></a>` is valid; `<button><a href="...">HubSpot</a></button>` is not.

**Warning signs:** TypeScript error "anchor element not allowed inside interactive element" or React DOM warning about invalid nesting.

### Pitfall 2: `encodeURIComponent` Mismatch

**What goes wrong:** A system named "E-mail" is navigated to as `/systems?system=E-mail` (no encoding needed), but a system with a future space would break. More importantly, if the panel encodes but the target page does not decode, the filter match fails.

**Why it happens:** `URLSearchParams.get()` automatically URL-decodes the value. `encodeURIComponent` + `searchParams.get()` roundtrips correctly. The pitfall is using `window.location.search` raw parsing instead of `searchParams.get()`.

**How to avoid:** Both Systems.tsx and Owners.tsx already use `searchParams.get("system")` / `searchParams.get("owner")` — these decode automatically. Use `encodeURIComponent` on the writing side always.

**Warning signs:** Filter shows 0 results after navigation even though the system/owner exists.

### Pitfall 3: `fullData` May Be `undefined`

**What goes wrong:** `AutomationDetailPanel` receives `fullData?: Automatisering` (optional prop). If the canvas is loaded before Supabase data arrives, `fullData` is `undefined`. All LINK-02, 03, 04 code must guard against this.

**Why it happens:** `Processen.tsx` passes `fullData={dbAutomations?.find(a => a.id === selectedAuto?.id)}`. If `dbAutomations` is still loading, this evaluates to `undefined`.

**How to avoid:** All existing panel sections already guard with `{fullData?.systemen && ...}`. Follow the same pattern for new cross-link sections. Do not render link sections if `fullData` is undefined — return nothing or a loading indicator.

**Warning signs:** TypeError: cannot read properties of undefined reading `systemen`.

### Pitfall 4: Related Automations Includes the Current Automation

**What goes wrong:** The "same phase" filter matches the automation itself, showing it in the related list.

**Why it happens:** The current automation shares all its own fasen and systemen with itself.

**How to avoid:** Always filter `a.id !== fullData?.id` first in the related list derivation. This is documented in the code example above.

### Pitfall 5: SystemBadge vs Plain Badge in the Panel

**What goes wrong:** The panel's "Systemen" section (line 121-128 of AutomationDetailPanel.tsx) currently renders `<Badge variant="secondary" className="text-xs">{s}</Badge>` — NOT `SystemBadge` from `@/components/Badges`. If LINK-02 is implemented by converting these to links but a later refactor switches to `SystemBadge`, link behavior may be lost.

**Why it happens:** The detail panel was built independently from the list pages and used inline Badge instead of SystemBadge for simplicity.

**How to avoid:** For LINK-02, wrap the existing plain Badge (or optionally switch to SystemBadge for visual consistency with Systems.tsx). The planner should decide: keep plain Badge-in-Link, or switch to SystemBadge-in-Link. Both work. Note that `SystemBadge` from `@/components/Badges` accepts `systeem: Systeem | string` — it can be dropped in.

---

## Code Examples

Verified patterns from project source:

### Existing `?open=ID` deep-link in AlleAutomatiseringen.tsx

```tsx
// Source: src/pages/AlleAutomatiseringen.tsx line 21
const [openId, setOpenId] = useState<string | null>(searchParams.get("open") || null);
```

This already works. `?open=auto-123` will auto-expand that automation row on page load.

### useNavigate already in AlleAutomatiseringen.tsx

```tsx
// Source: src/pages/AlleAutomatiseringen.tsx line 2
import { useSearchParams, useNavigate } from "react-router-dom";
// ...
const navigate = useNavigate();
// Used for:
onClick={() => navigate(`/bewerk/${a.id}`)}
```

`Link` and `useNavigate` are both available in the project. For cross-link navigation, `Link` is preferred (no click handler needed, proper `<a>` semantics).

### Systems.tsx URL param pattern (confirmed)

```tsx
// Source: src/pages/Systems.tsx line 15
const selected = searchParams.get("system");
// Detail view activated when selected is truthy
// Deep-link: /systems?system=HubSpot → shows filtered view
```

### Owners.tsx URL param pattern (confirmed)

```tsx
// Source: src/pages/Owners.tsx line 15
const selected = searchParams.get("owner");
// Deep-link: /owners?owner=Jan → shows filtered view
```

### Route for Processes page (confirmed)

```tsx
// Source: src/components/AppLayout.tsx — navGroups
{ title: "Processes", url: "/processen", icon: GitBranch }
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- --run` |
| Full suite command | `npm run test -- --run` |

Current baseline: 78 tests across 6 files, all passing.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LINK-01 | Link to `/processen` is present in panel when fullData provided | unit | `npm run test -- --run src/test/crossLinking.test.ts` | ❌ Wave 0 |
| LINK-02 | Each system in `fullData.systemen` becomes a link to `/systems?system=X` | unit | `npm run test -- --run src/test/crossLinking.test.ts` | ❌ Wave 0 |
| LINK-03 | Owner becomes a link to `/owners?owner=X` | unit | `npm run test -- --run src/test/crossLinking.test.ts` | ❌ Wave 0 |
| LINK-04 | Related automations derived: same fase OR shared system, excluding self | unit | `npm run test -- --run src/test/crossLinking.test.ts` | ❌ Wave 0 |
| LINK-04 | Related automations list is empty when no automations share fase/system | unit | `npm run test -- --run src/test/crossLinking.test.ts` | ❌ Wave 0 |
| LINK-04 | Self is never included in related automations | unit | `npm run test -- --run src/test/crossLinking.test.ts` | ❌ Wave 0 |

**Note on test approach:** `AutomationDetailPanel.tsx` is a React component requiring `jsdom` + React Testing Library to render. The established project pattern (entityPages.test.ts, domainLogic.test.ts) is to extract pure logic functions and test those in isolation. For Phase 8, extract the `deriveRelated(all, current)` function and test it inline — same pattern as `deriveSystemCounts` and `deriveOwnerCounts` in entityPages.test.ts. URL construction (`/systems?system=X`) can also be tested as pure string logic.

LINK-01, LINK-02, LINK-03 link presence (DOM rendering) requires React Testing Library component tests. These are possible but heavier. Given project precedent uses pure-logic extraction, the Wave 0 scaffold should use `it.todo` stubs for the DOM-level tests and full assertions only for the pure `deriveRelated` logic.

### Sampling Rate

- **Per task commit:** `npm run test -- --run`
- **Per wave merge:** `npm run test -- --run`
- **Phase gate:** Full suite green (78+ tests) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/test/crossLinking.test.ts` — covers LINK-01 through LINK-04 derivation logic
  - Pure: `deriveRelated(all, current)` — full assertions
  - DOM (LINK-01, 02, 03 link presence) — `it.todo` stubs
- [ ] No new framework or fixture files needed — reuse `makeAutomatisering` pattern from entityPages.test.ts

---

## Environment Availability

Step 2.6: SKIPPED — Phase 8 is pure UI code changes (React component edits + test file). No external services, CLIs, or runtimes beyond the existing dev environment are needed.

---

## Sources

### Primary (HIGH confidence)

- Direct source read: `src/components/process/AutomationDetailPanel.tsx` — full component structure, props interface, existing sections
- Direct source read: `src/pages/AlleAutomatiseringen.tsx` — `?open=ID` deep-link pattern (line 21), `useNavigate` usage
- Direct source read: `src/pages/Systems.tsx` — `?system=X` URL param pattern confirmed
- Direct source read: `src/pages/Owners.tsx` — `?owner=X` URL param pattern confirmed
- Direct source read: `src/components/AppLayout.tsx` — `/processen` route URL confirmed, `Link` usage pattern
- Direct source read: `src/lib/types.ts` — `Automatisering` interface: `systemen`, `owner`, `fasen`, `id` fields confirmed
- Direct source read: `src/test/entityPages.test.ts` — established test pattern (inline derivation, makeAutomatisering factory)
- Direct source read: `vitest.config.ts` — test runner configuration

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` decisions block — "must use useAutomatiseringen() hook, no new queries" and "useSearchParams drives selected state for Phase 8 deep-link support" (decisions recorded from Phase 7 planning)

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries already in project, confirmed in source files
- Architecture: HIGH — panel component read directly, URL patterns confirmed in target pages
- Pitfalls: HIGH — derived from direct code inspection (fullData optional guard, Badge nesting, URL encoding)
- LINK-04 strategy: HIGH — `?open=ID` deep-link confirmed in AlleAutomatiseringen.tsx source

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable codebase, internal patterns only)
