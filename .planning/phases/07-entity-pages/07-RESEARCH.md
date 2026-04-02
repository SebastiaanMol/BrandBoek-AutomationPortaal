# Phase 7: Entity Pages - Research

**Researched:** 2026-03-31
**Domain:** React Router v6 · Derived data from Supabase · shadcn/ui list + detail UI
**Confidence:** HIGH

---

## Summary

Phase 7 adds two pages — Systems and Owners — to the "Systems & People" sidebar group that Phase 6 left empty. Neither Systems nor Owners is a database table; both are derived by aggregating the `automatisering` records already in the React Query cache. Systems come from flattening the `systemen: Systeem[]` array across all automations; Owners come from collecting unique `owner: string` values. No new Supabase queries are required.

Each entity page has two visual states: a list view (all unique entities with automation counts) and a filtered view (automations for the selected entity). The cleanest approach, matching the existing codebase's URL-driven state, is to use a URL search param (`?system=HubSpot` or `?owner=Jan`) rather than component-local state — this supports deep-linking from Phase 8 cross-links for free.

The implementation is additive: two new page files, two new routes in App.tsx, and two new nav items in AppLayout.tsx's `navGroups` array. The existing `useAutomatiseringen()` hook and its React Query cache supply all data; no new hooks or Supabase queries are needed.

**Primary recommendation:** Derive Systems and Owners from `useAutomatiseringen()` client-side. Use `useSearchParams` for selected-entity state so Phase 8 can navigate to `?system=X` or `?owner=Y` directly.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SYS-01 | User can view a Systems page listing all unique systems with their automation count | Derive from `useAutomatiseringen()` — `flatMap(a => a.systemen)` then `Map` for counts |
| SYS-02 | User can click a system to see all automations linked to that system | Filter `all` where `a.systemen.includes(selected)` — use `useSearchParams` for `?system=X` |
| OWN-01 | User can view an Owners page listing all unique owners with their automation count | Derive from `useAutomatiseringen()` — group by `a.owner` field |
| OWN-02 | User can click an owner to see all automations they own | Filter `all` where `a.owner === selected` — use `useSearchParams` for `?owner=X` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-router-dom | ^6.30.1 | Route registration + `useSearchParams` for entity selection state | Already installed; v6 is project standard |
| @tanstack/react-query | ^5.83.0 | Data fetch via `useAutomatiseringen()` | All pages already use this; cache is shared |
| lucide-react | ^0.462.0 | Page icons (e.g. `Server`, `Users`) | Already used in AppLayout nav items |
| shadcn/ui (Radix) | installed | Badge, layout primitives | Project-wide component library |
| framer-motion | 11.18.0 | Animate list/accordion transitions | Already used in AlleAutomatiseringen |

### No New Installations Required
All required libraries are already in `package.json`. No `npm install` step needed for this phase.

---

## Architecture Patterns

### Recommended File Structure
```
src/
├── pages/
│   ├── Systems.tsx          # NEW — SYS-01 + SYS-02
│   └── Owners.tsx           # NEW — OWN-01 + OWN-02
src/
├── App.tsx                  # ADD two routes
├── components/
│   └── AppLayout.tsx        # ADD two nav items to "Systems & People" group
```

### Pattern 1: Derive Entity List from Cached Automations

Both pages follow identical derivation logic — the only difference is `a.systemen` (array) vs `a.owner` (string).

**Systems derivation:**
```typescript
// Source: project pattern — same approach as AlleAutomatiseringen client-side filter
const all = data || [];

const systemCounts = new Map<string, number>();
for (const a of all) {
  for (const s of a.systemen) {
    systemCounts.set(s, (systemCounts.get(s) ?? 0) + 1);
  }
}
// Sort descending by count
const systems = [...systemCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => ({ name, count }));
```

**Owners derivation:**
```typescript
const ownerCounts = new Map<string, number>();
for (const a of all) {
  if (a.owner?.trim()) {
    ownerCounts.set(a.owner, (ownerCounts.get(a.owner) ?? 0) + 1);
  }
}
const owners = [...ownerCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => ({ name, count }));
```

### Pattern 2: URL Search Param for Selected Entity

`useSearchParams` makes the selection URL-addressable — Phase 8 can navigate to `/systems?system=HubSpot` to deep-link.

```typescript
// Source: project pattern — AlleAutomatiseringen uses useSearchParams for ?open=
import { useSearchParams } from "react-router-dom";

const [searchParams, setSearchParams] = useSearchParams();
const selected = searchParams.get("system"); // null = show list

function selectSystem(name: string) {
  setSearchParams({ system: name });
}
function clearSelection() {
  setSearchParams({});
}
```

### Pattern 3: Two-State Page (list vs. filtered)

```typescript
// When no system selected: show entity list
if (!selected) {
  return <SystemsList systems={systems} onSelect={selectSystem} />;
}

// When system selected: show filtered automations + back button
const filtered = all.filter(a => a.systemen.includes(selected as Systeem));
return <SystemDetail name={selected} automations={filtered} onBack={clearSelection} />;
```

### Pattern 4: Route Registration (App.tsx)

Add to the `ProtectedRoutes` component's `<Routes>` block:
```typescript
import Systems from "./pages/Systems";
import Owners from "./pages/Owners";

// inside <Routes>:
<Route path="/systems" element={<Systems />} />
<Route path="/owners" element={<Owners />} />
```

### Pattern 5: Nav Items (AppLayout.tsx)

Add to the `"Systems & People"` group's `items` array — currently empty:
```typescript
import { Server, Users } from "lucide-react";

{
  title: "Systems & People",
  items: [
    { title: "Systems", url: "/systems", icon: Server },
    { title: "Owners", url: "/owners", icon: Users },
  ],
},
```

Both page titles must use English h1 text matching the nav label exactly, per NAV-02 (established in Phase 6). The h1 can be `sr-only` if the page has a full-bleed metric header (established Phase 6 pattern), or visible if not — for these list pages, a visible h1 is appropriate.

### Anti-Patterns to Avoid
- **Fetching systems/owners from Supabase separately:** Systems and Owners are not DB tables. Don't query Supabase for them. Derive from the cached `automatisering` records.
- **Component-local useState for selection:** Using `useState` instead of `useSearchParams` breaks Phase 8 deep-linking. Use `useSearchParams`.
- **Hard-coding SYSTEMEN constant as the list:** `SYSTEMEN` is the enum of known system types but real data may include "Anders" heavily or have zero automations for some systems. Derive counts from actual data; only show systems with at least one automation.
- **Separate route per entity (e.g. `/systems/HubSpot`):** Dynamic segments require more routing complexity and don't simplify Phase 8 linking. A single page with a search param is sufficient and consistent with the `?open=` pattern already in use.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Data fetch + caching | Custom fetch + useState | `useAutomatiseringen()` hook | Already tested, invalidates on mutations, handles loading/error |
| System badge rendering | Custom inline span | `SystemBadge` from `@/components/Badges` | Consistent badge CSS classes, already maps all system types |
| Status badge rendering | Custom span | `StatusBadge` from `@/components/Badges` | Uses STATUS_LABELS for English display |
| Accordion expand for automation rows | Custom show/hide | `framer-motion AnimatePresence` (same as AlleAutomatiseringen) | Consistent animation, already in bundle |
| Loading state | Spinner from scratch | `Loader2` from lucide-react (same pattern) | One-liner, already used everywhere |

**Key insight:** This phase is entirely additive composition — every building block (data hook, badges, layout, animation) already exists. The only net-new code is the derivation logic and page structure.

---

## Common Pitfalls

### Pitfall 1: Automations with Empty Owner Field
**What goes wrong:** `a.owner` can be an empty string `""` for automations without an assigned owner. Including it in the Owners list produces a blank entry with a count.
**Why it happens:** The `owner` field is not required to be non-empty in the DB schema.
**How to avoid:** Guard with `if (a.owner?.trim())` before adding to the Map.
**Warning signs:** An empty row appearing at the top/bottom of the Owners list.

### Pitfall 2: Duplicate System Names with Different Cases
**What goes wrong:** If any automation has a system stored as `"hubspot"` vs `"HubSpot"`, they appear as two separate entries.
**Why it happens:** The `Systeem` type enforces casing but older or manually entered records might not match.
**How to avoid:** The `SYSTEMEN` constant and TypeScript typing make this unlikely in this project. No normalization needed, but worth a comment in the derivation.

### Pitfall 3: NAV-02 h1 Text Mismatch
**What goes wrong:** The h1 text inside the page doesn't exactly match the nav label in AppLayout, violating NAV-02.
**Why it happens:** Developer uses slightly different label text ("All Systems" vs "Systems").
**How to avoid:** Nav label is `"Systems"` → h1 must be `"Systems"`. Nav label is `"Owners"` → h1 must be `"Owners"`. Match character-for-character.

### Pitfall 4: Top Bar Label Shows "Portal" for New Routes
**What goes wrong:** AppLayout's top bar uses `navGroups.flatMap(g => g.items).find(n => n.url === location.pathname)?.title` to render the current page label. If the new routes are not added to `navGroups`, the top bar shows "Portal" fallback.
**Why it happens:** The nav items array is the single source of truth for the top bar label lookup.
**How to avoid:** Add nav items to AppLayout BEFORE or ALONGSIDE adding routes to App.tsx.

### Pitfall 5: `useSearchParams` Resets on Navigation
**What goes wrong:** Navigating away and back loses the selected entity state.
**Why it happens:** Search params are part of the URL, so navigating away clears them.
**How to avoid:** This is expected and correct behavior — it's a feature, not a bug. The list view is the default state when the page loads fresh.

---

## Code Examples

### Systems Page Skeleton (verified against project patterns)
```typescript
// src/pages/Systems.tsx
import { useSearchParams } from "react-router-dom";
import { useAutomatiseringen } from "@/lib/hooks";
import { Systeem } from "@/lib/types";
import { SystemBadge } from "@/components/Badges";
import { Loader2 } from "lucide-react";

export default function Systems() {
  const { data, isLoading } = useAutomatiseringen();
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = searchParams.get("system");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const all = data || [];

  if (!selected) {
    // Build counts map
    const systemCounts = new Map<string, number>();
    for (const a of all) {
      for (const s of a.systemen) {
        systemCounts.set(s, (systemCounts.get(s) ?? 0) + 1);
      }
    }
    const systems = [...systemCounts.entries()]
      .sort((a, b) => b[1] - a[1]);

    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Systems</h1>
        {/* list rows */}
      </div>
    );
  }

  // Detail view
  const filtered = all.filter(a => a.systemen.includes(selected as Systeem));
  return (
    <div className="space-y-4">
      <button onClick={() => setSearchParams({})}>← Back to Systems</button>
      <h1 className="text-xl font-semibold">Systems</h1>
      {/* automation rows — same card pattern as AlleAutomatiseringen */}
    </div>
  );
}
```

### Owners Page Skeleton
```typescript
// src/pages/Owners.tsx — same structure as Systems.tsx
// Key difference: ownerCounts groups by a.owner (string) not a.systemen (array)
// Filter: all.filter(a => a.owner === selected)
// Search param key: "owner" not "system"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| React Router v5 `useHistory` | React Router v6 `useNavigate` + `useSearchParams` | v6.0 (2021) | `useSearchParams` handles URL state; no history.push needed |
| Separate fetch per entity page | Shared React Query cache via single query key | Phase 1 pattern | Zero extra network requests for derived pages |

---

## Open Questions

1. **Should the automation detail expand inline on entity pages or navigate to /alle?**
   - What we know: AlleAutomatiseringen uses an inline accordion pattern. Phase 8 will add cross-links from the detail panel.
   - What's unclear: Should entity pages show a full inline detail panel or just navigate to `/alle?open=X`?
   - Recommendation: Use the inline accordion pattern (same as AlleAutomatiseringen) for visual consistency and to avoid navigation friction. Phase 8 can then add links from within that panel.

2. **Icon choices for Systems and Owners nav items**
   - What we know: lucide-react is installed; project uses it for all nav icons.
   - What's unclear: No official icon prescription exists for these pages.
   - Recommendation: `Server` for Systems (represents infrastructure/tools), `Users` for Owners (represents people). Both are available in lucide-react ^0.462.0.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 7 is purely frontend code/config changes. No external CLI tools, databases, or services beyond what the existing project already uses.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.0 |
| Config file | vite.config.ts (or vitest.config.ts) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SYS-01 | `systemCounts` derivation from automations data produces correct unique system names and counts | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| SYS-02 | Filtering automations by system name returns only automations containing that system | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| OWN-01 | `ownerCounts` derivation produces correct unique owner names and counts, skipping empty owners | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |
| OWN-02 | Filtering automations by owner name returns only matching automations | unit | `npm test -- --reporter=verbose` | ❌ Wave 0 |

**Note:** SYS-02 and OWN-02 page rendering (click interaction → filtered view) is UI behavior best verified by human smoke test. The derivation and filter logic is pure and fully unit-testable.

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/test/entityPages.test.ts` — covers SYS-01, SYS-02, OWN-01, OWN-02 derivation logic

---

## Sources

### Primary (HIGH confidence)
- Project codebase — `src/lib/types.ts`, `src/lib/hooks.ts`, `src/pages/AlleAutomatiseringen.tsx`, `src/components/AppLayout.tsx`, `src/App.tsx` (read directly)
- `package.json` — confirmed versions of all listed packages

### Secondary (MEDIUM confidence)
- React Router v6 `useSearchParams` API — consistent with established project use of `useSearchParams` in `AlleAutomatiseringen.tsx` (line 3, `const [searchParams] = useSearchParams()`)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in package.json
- Architecture: HIGH — patterns traced directly from existing project code
- Pitfalls: HIGH — derived from reading actual codebase (owner field, NAV-02 constraint, top bar lookup)
- Test map: HIGH — Vitest confirmed in package.json, test directory exists

**Research date:** 2026-03-31
**Valid until:** 2026-05-31 (stable stack)
