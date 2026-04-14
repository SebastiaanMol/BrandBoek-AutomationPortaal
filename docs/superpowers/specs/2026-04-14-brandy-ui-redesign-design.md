# Brandy UI Redesign — Design Spec

**Date:** 2026-04-14
**Status:** Approved

---

## Goal

Replace the current Brandy page layout with a modern tabbed chatbot UI. Two tabs: **Chat** (the existing conversation interface, cleaned up) and **Inzichten** (a dashboard showing the analysis results). The analyse/mind panel is removed from the Chat tab and replaced by the full Inzichten dashboard.

---

## Architecture

Single React component (`src/pages/Brandy.tsx`) refactored in-place. No new files needed — the existing state (`mind`, `messages`, `loading`, etc.) is unchanged. Layout is restructured: header → tab bar → conditional content area (Chat or Inzichten).

**State additions:**
- `activeTab: "chat" | "inzichten"` — controls which tab is shown
- Signal grouping is derived at render time from `mind.signalen` — no new state

---

## Components

### Header
Fixed at top. Brandy avatar (gradient circle, sparkle icon) + title "Brandy" + subtitle "Procesbrein van Brand Boekhouders". No changes to existing markup, just remove the mind panel that currently sits below it.

### Tab Bar
Sits below header, above content. Contains:

1. **Pill group** — gray container (`bg` approx `#f0f0f2`, `rounded-[10px]`, `p-[3px]`, `gap-[2px]`):
   - `💬 Chat` tab
   - `✦ Inzichten` tab — red badge showing total error+warning count from `mind`; badge only shown when `mind` exists and count > 0
   - Active tab: white background + soft shadow (`shadow-sm` + ring), inactive tab: transparent

2. **Analyseer button** — right-aligned (`ml-auto`), indigo, `↻ Analyseer opnieuw` (or `Analyseer` when no mind yet). Disabled + spinner during `mindLoading` or `mindFetching`. Same `handleAnalyse` handler as now.

When `activeTab === "inzichten"` and `mind` is null/fetching: switch to inzichten tab still allowed — shows empty/loading state.

### Chat Tab Content
Existing chat UI, with the mind panel section removed:
- Welcome state with suggested questions (unchanged)
- Message list with Brandy/user bubbles, diagnose banner, conclusie badge, feedback buttons (unchanged)
- Loading spinner bubble (unchanged)
- Input textarea + send button (unchanged)
- Disclaimer text (unchanged)

The `contextId`/`contextNaam` context banner (shown when navigating from an automation detail page) stays, placed below the tab bar inside the chat content area.

### Inzichten Tab Content

**1. Summary Row**
Five stat cards in a 5-column grid:
- **Errors** — count of `mind.signalen` where `ernst === "error"`, red number
- **Warnings** — count where `ernst === "warning"`, amber number
- **Suggesties** — count of `mind.suggesties` (or 0 if field absent), purple number
- **Automations OK** — `mind.automation_count - (errors + warnings)`, green number
- **Laatste analyse** — `mind.aangemaakt_op` formatted as day + month, gray; subtitle "X automations bekeken"

When `mind` is null: all cards show `—`.

**2. Brandy Narrative**
Purple gradient box (`from-[#f5f3ff] to-[#ede9fe]`, purple border). Left: small ✦ avatar (gradient circle). Right: `mind.samenvatting` text (existing field) + timestamp `mind.aangemaakt_op` as "Brandy's samenvatting · DD maand YYYY".

When `mind` is null: placeholder italic text "Brandy heeft nog geen analyse uitgevoerd."

**3. Category Grid**
2×2 grid. Four fixed categories derived from `mind.signalen` grouped by `categorie` field:

| Category key | Label | Icon | Color scheme |
|---|---|---|---|
| `status` | Status | 🔄 | amber |
| `kwaliteit` | Kwaliteit | 📋 | blue |
| `structuur` | Structuur | 🔗 | green |
| `verificatie` | Verificatie | ✓ | purple |

Each category card:
- Header: colored icon square + title + count badge (e.g. "2 signalen")
- Signal rows: ernst dot (red for error, amber for warning, blue/indigo for info) + signal name + description (truncated) + hover "→ Brandy" link
- "→ Brandy" onClick: switch to Chat tab, pre-fill input with a question about that signal, submit

When a category has zero signals: render the card with an empty state ("Geen signalen").

**Category grouping logic:**
```typescript
const CATEGORIES = ["status", "kwaliteit", "structuur", "verificatie"] as const;
const byCategory = CATEGORIES.map(cat => ({
  cat,
  signalen: mind?.signalen.filter(s => s.categorie === cat) ?? [],
}));
```

This requires `categorie` field on `Signaal` type. The existing `detectSignalen` in `src/lib/signalen.ts` and the `Signaal` type in `src/lib/signalen.ts` will need `categorie` added (see Data section below).

**4. Suggesties Section**
Full-width section below the grid. Header: 💡 icon + "Suggesties voor nieuwe automations" + green count badge.

Two-column card grid. Each card: title, description body, tags (pill chips). Rendered from `mind.suggesties[]` (new field — see Data section).

When `mind.suggesties` is absent or empty: hide the section entirely.

---

## Data Changes

### `BrandyMind` type (`src/lib/brandy.ts`)
Add two optional fields:
```typescript
export interface BrandyMind {
  aangemaakt_op: string;
  automation_count: number;
  samenvatting: string;
  prioriteiten: string[];
  signalen: Signaal[];
  suggesties?: BrandySuggestie[];  // NEW — optional for backward compat
}

export interface BrandySuggestie {
  titel: string;
  body: string;
  tags: string[];
}
```

### `Signaal` type (`src/lib/signalen.ts`)
Add `categorie` field:
```typescript
export interface Signaal {
  id: string;
  naam: string;
  bericht: string;
  ernst: "error" | "warning" | "info";
  automationId: string;
  categorie: "status" | "kwaliteit" | "structuur" | "verificatie";  // NEW
}
```

Update `detectSignalen` to populate `categorie` on each signal.

### Edge function (`supabase/functions/brandy-analyse/index.ts`)
Update the Gemini prompt to include `suggesties` in the structured output, and parse/return it in the response. The edge function should return the full `BrandyMind` including `suggesties`.

---

## Signal → Category Mapping

In `detectSignalen`, assign `categorie` based on the check type:

| Check type | Category |
|---|---|
| Automation is disabled but has active trigger | `status` |
| Automation not modified in >90 days | `status` |
| Missing `doel` field | `kwaliteit` |
| High complexity score + no stappen | `kwaliteit` |
| Broken link to non-existent automation | `structuur` |
| No eigenaar set | `verificatie` |
| Not verified in >30 days | `verificatie` |

---

## "→ Brandy" Deep Link Behavior

Clicking a signal row in the Inzichten tab:
1. Switch `activeTab` to `"chat"`
2. Call `handleSubmit(vraag)` with a pre-built question, e.g. `"Wat moet ik doen met ${sig.naam}? (${sig.bericht})"`

---

## Styling Notes

- Pill tab group: Tailwind equivalent of `bg-[#f0f0f2] rounded-[10px] p-[3px] flex gap-[2px]`
- Active tab: `bg-white shadow-sm ring-1 ring-black/5 rounded-lg font-semibold text-foreground`
- Inactive tab: `text-muted-foreground hover:text-foreground/70`
- Category icon squares: `w-7 h-7 rounded-md flex items-center justify-content-center text-sm`
- Summary cards: existing `bg-card border border-border rounded-xl p-3.5` pattern
- Ernst dots: `w-2 h-2 rounded-full` — red/amber/indigo per ernst

---

## Out of Scope

- Chat history sidebar (not implemented — no conversation history stored)
- Collapsible categories
- Filter/sort on signals
- Export of the dashboard
- Real-time badge updates (badge is recalculated on mind change only)
