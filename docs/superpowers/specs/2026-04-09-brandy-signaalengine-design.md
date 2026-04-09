# Design: Brandy Signaalengine (Phase 9)

**Date:** 2026-04-09
**Milestone:** v1.2 — Brandy Proactieve Analyse
**Requirements:** BSIG-01, BSIG-02, BSIG-03, BSIG-04

---

## Overview

Phase 9 builds the foundation of Brandy's "mind": a signal detection engine that identifies issues across all automations, and an AI-powered analysis layer that stores Brandy's understanding of both the automation landscape and the Brand Boekhouders business as a whole.

This phase replaces `graphProblems.ts` with a clean, unified `signalen.ts` module, adds a new `brandy-analyse` edge function, adds a `brandy_mind` Supabase table, and integrates a mind panel into the existing Brandy page.

---

## Architecture

```
Frontend                         Supabase
─────────────────────────────    ────────────────────────
signalen.ts (pure TS)       →   brandy-analyse (edge fn)
  detectSignalen()               │  Gemini 2.5 Flash
                                 │  (signals + slim automations
                                 │   + static business context)
                                 ↓
Brandy.tsx                  ←   brandy_mind (table)
  mind panel (read)              latest row: samenvatting +
  "Analyseer" button             prioriteiten + signalen
  chat (unchanged)
```

---

## Section 1: Signal Detection Module

**File:** `src/lib/signalen.ts`
**Replaces:** `src/lib/graphProblems.ts` (deleted)

### Types

```typescript
export type SignaalType =
  | "outdated"
  | "uitgeschakeld-actief"
  | "missing-owner"
  | "missing-trigger"
  | "missing-systems"
  | "no-goal"
  | "hoge-complexiteit"
  | "broken-link"
  | "orphan"
  | "unverified"

export type Ernst = "error" | "warning" | "info"

export type SignaalCategorie = "status" | "kwaliteit" | "structuur" | "verificatie"

export interface Signaal {
  id: string               // `${automationId}-${type}`
  automationId: string
  naam: string
  type: SignaalType
  ernst: Ernst
  categorie: SignaalCategorie
  bericht: string
  suggestie: string
}
```

### Signal rules

| Type | Categorie | Ernst | Condition |
|---|---|---|---|
| `outdated` | status | error | `status === "Verouderd"` |
| `uitgeschakeld-actief` | status | error | `status === "Uitgeschakeld"` AND referenced by ≥1 automation with `status === "Actief"` |
| `missing-owner` | kwaliteit | warning | `!owner?.trim()` |
| `missing-trigger` | kwaliteit | warning | `!trigger?.trim()` |
| `missing-systems` | kwaliteit | warning | `systemen.length === 0` |
| `no-goal` | kwaliteit | info | `!doel?.trim()` |
| `hoge-complexiteit` | kwaliteit | warning | `berekenComplexiteit(a) > 50` AND `stappen.length <= 1` |
| `broken-link` | structuur | error | koppeling.doelId not in known IDs |
| `orphan` | structuur | warning | no outgoing koppelingen AND no other automation has a koppeling pointing to this one |
| `unverified` | verificatie | warning | `getVerificatieStatus(a) === "verouderd"` |
| `unverified` | verificatie | info | `getVerificatieStatus(a) === "nooit"` |

### API

```typescript
export function detectSignalen(automations: Automatisering[]): Signaal[]
```

Pure function, no side effects. Imports `berekenComplexiteit` and `getVerificatieStatus` from `types.ts`.

### Tests

`src/test/signalen.test.ts` — covers all 10 signal types. Replaces `domainLogic.test.ts` detectProblems tests. The `graphProblems` import in the existing test file is removed.

---

## Section 2: Supabase Mind Storage

**Table:** `brandy_mind`

```sql
create table brandy_mind (
  id               uuid primary key default gen_random_uuid(),
  signalen         jsonb not null,        -- Signaal[]
  samenvatting     text not null,         -- Brandy's Dutch narrative
  prioriteiten     jsonb not null,        -- string[] — signal IDs ranked by urgency
  automation_count int not null,          -- how many automations were analysed
  aangemaakt_op    timestamptz not null default now()
);
```

**Insert strategy:** Each analysis run inserts a new row. The frontend always reads `order by aangemaakt_op desc limit 1`. History is preserved (no hard delete required in this phase).

**RLS:**
- Authenticated users: SELECT
- Edge function (service role): INSERT

**Migration file:** `supabase/migrations/20260409000000_brandy_mind.sql`

---

## Section 3: Edge Function — `brandy-analyse`

**File:** `supabase/functions/brandy-analyse/index.ts`

### Input

```typescript
{
  signalen: Signaal[],
  automations: Array<{
    id: string
    naam: string
    status: string
    fasen: string[]
    systemen: string[]
    owner: string
    stappenCount: number
    complexiteit: number
  }>
}
```

The slim automation summary omits mermaid diagrams, raw step text, and branches to keep the Gemini payload small (token efficiency for free plan).

### Gemini prompt structure

**System block (static business context):**
```
Je bent Brandy, het procesbrein van Brand Boekhouders — een Nederlands boekhoudkantoor.

Brand Boekhouders begeleidt klanten door vijf fasen:
Marketing → Sales → Onboarding → Boekhouding → Offboarding

De belangrijkste systemen zijn: HubSpot (CRM + workflows), Zapier (integraties),
WeFact (facturatie), Typeform (intake), SharePoint (documenten), Backend scripts.

Kritische bedrijfsregel — Driehoekstructuur: elke HubSpot Deal moet gekoppeld zijn
aan zowel een Contact als een Company. Ontbreekt een van beide, dan stromen deals
niet correct door de pipeline.

Jouw taak: begrijp het volledige automatiseringslandschap én de bedrijfscontext,
en geef een eerlijk en scherp beeld van de huidige staat.
```

**Data block:** compact JSON of all signals + slim automations.

**Task instruction:**
1. Write a Dutch narrative (`samenvatting`) — what's healthy, what's concerning, what patterns you see across the business and its automations. Be direct and concrete.
2. Return the top 5 most urgent signal IDs (`prioriteiten`) ranked by business impact.

**Response format:** JSON `{ samenvatting: string, prioriteiten: string[] }`

### Function flow

1. Validate input
2. Build prompt
3. Call Gemini `gemini-2.5-flash` (same client pattern as `brandy-ask`)
4. Parse response
5. Insert into `brandy_mind` via service role client
6. Return the full inserted row

---

## Section 4: Frontend Integration

**File:** `src/pages/Brandy.tsx` (extended, not rewritten)

### On page load

- Fetch latest `brandy_mind` row from Supabase (`order by aangemaakt_op desc limit 1`)
- If row exists: render mind panel with narrative + prioritised signal cards
- If no row: render empty state ("Brandy heeft nog geen analyse uitgevoerd — klik op Analyseer om te beginnen")

### Mind panel (above chat)

- **Samenvatting:** Brandy's narrative prose (Dutch), rendered as plain text
- **Prioritaire signalen:** cards for each signal ID in `prioriteiten`, showing:
  - Automation name
  - Signal type label
  - Ernst badge (error/warning/info)
  - Bericht text
- **Meta:** "Geanalyseerd op [date] · [n] automatiseringen"
- **"Analyseer" button:** always visible

### On "Analyseer" click

1. Run `detectSignalen(automations)` locally
2. Build slim automation summaries (inline, no helper needed)
3. Call `brandy-analyse` edge function
4. Show loading state on button
5. On success: re-fetch `brandy_mind` and update panel
6. On error: toast with error message

### Chat interface

Unchanged. Sits below the mind panel. Continues to work independently.

### Visual polish

Deferred to Phase 11. Phase 9 UI is functional-first.

---

## What's Deleted

- `src/lib/graphProblems.ts` — fully replaced by `signalen.ts`
- `detectProblems` tests in `domainLogic.test.ts` — migrated to `signalen.test.ts`

---

## Out of Scope (Phase 9)

- Signal badges on automation rows (Phase 10)
- Dashboard widget (Phase 10)
- Signal click-throughs to Brandy chat (Phase 11)
- Visual redesign of Brandy page (deferred, noted by user)
- Auto-rebuild on page open without button (deferred — free Gemini plan, user wants manual control)

---

## Decisions

| Decision | Rationale |
|---|---|
| Replace graphProblems.ts, not extend | Clean unified module, no split detection logic |
| Manual "Analyseer" button instead of auto-rebuild | Free Gemini plan — user controls token spend |
| Slim automation summaries to Gemini | Token efficiency; mermaid/steps excluded |
| Insert-not-upsert for brandy_mind | Preserves analysis history |
| Static business context in edge function | Brand Boekhouders context is stable, no DB needed |
| 10 signal types (8 ported + 2 new) | All-in so Brandy knows everything |
| Complexity threshold > 50 for hoge-complexiteit | Midpoint of 0–100 scale; catches clearly incomplete docs |
