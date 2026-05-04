# Flow Suggesties — Design Spec

## Doel

Automatisch koppelingen tussen automations detecteren via webhook/endpoint-matching en AI-analyse, en deze als suggesties presenteren op de Flows-pagina. Gebruiker bevestigt of verwerpt per suggestie. Bevestigde koppelingen voeden de bestaande `detectFlows()` logica zodat flows automatisch ontstaan.

---

## Gebruikersflow

1. Gebruiker opent `/flows`
2. Twee tabs: **Bevestigd** (bestaande flows, ongewijzigd) en **Suggesties** (nieuw)
3. In de Suggesties-tab: klik "Detecteer suggesties"
4. App voert hybride detectie uit (zie Backend)
5. Resultaten verschijnen in lijst, gegroepeerd op zekerheid
6. Gebruiker bevestigt of verwerpt per rij (of bulk: "Bevestig alle hoge zekerheid")
7. Bevestigde suggestie → `automation_links` record met `confirmed: true`
8. Terug in Bevestigd-tab: `detectFlows()` pikt nieuwe links op en groepeert flows

---

## Frontend

### `src/pages/Flows.tsx`

Voeg twee tabs toe met `Tabs` / `TabsList` / `TabsContent` (shadcn):

- **Tab "Bevestigd"** — bestaande FlowCard-lijst, geen wijzigingen
- **Tab "Suggesties"** — nieuw `<FlowSuggestiesTab />` component

### `src/components/FlowSuggestiesTab.tsx` (nieuw)

Verantwoordelijk voor:
- "Detecteer suggesties" knop (triggert edge function)
- Loading state tijdens detectie
- Weergave van suggesties gesorteerd op zekerheid (hoog eerst)
- Per rij: source automation → target automation, zekerheidstype badge, redenering
- Bevestigen / verwerpen knoppen per rij
- Bulk-knop: "Bevestig alle hoge zekerheid"

UI-structuur:

```
[Detecteer suggesties knop]

── Hoge zekerheid — webhook match ──────────────────────
[HubSpot Workflow] Naam A  →  [Backend script] Naam B
Webhook /path/endpoint — exact match
                                    [✕ Verwerpen] [✓ Bevestigen]

── AI-suggestie ─────────────────────────────────────────
[Zapier Zap] Naam C  →  [HubSpot Workflow] Naam D
AI: "redenering..."
                                    [✕ Verwerpen] [✓ Bevestigen]
```

Badges per zekerheidstype:
- `webhook` → groen label "Hoge zekerheid"
- `ai` → geel label "AI-suggestie"

### `src/lib/storage/automationLinks.ts`

Bestaand bestand. Voeg toe:

```ts
// Haal pending suggesties op uit automatisering_ai_flows
export async function getFlowSuggesties(): Promise<FlowSuggestie[]>

// Sla suggesties op na detectie
export async function saveFlowSuggesties(items: FlowSuggestie[]): Promise<void>

// Bevestig of verwerp een suggestie
export async function bevestigSuggestie(fromId: string, toId: string): Promise<void>
export async function verwerpSuggestie(fromId: string, toId: string): Promise<void>
```

`bevestigSuggestie` maakt een `automation_links` record aan (confirmed: true) én verwijdert de suggestie uit `automatisering_ai_flows`.
`verwerpSuggestie` verwijdert alleen de suggestie.

### `src/lib/queryHooks/flows.ts`

Voeg toe:
- `useFlowSuggesties()` — query voor pending suggesties
- `useDetecteerSuggesties()` — mutation die de edge function aanroept

### Type

```ts
interface FlowSuggestie {
  fromId: string;
  toId: string;
  fromNaam: string;
  toNaam: string;
  fromCategorie: string;
  toCategorie: string;
  zekerheid: "webhook" | "ai";
  redenering: string; // endpoint path of AI-toelichting
}
```

---

## Backend

### Edge function: `supabase/functions/detect-flow-links/index.ts` (nieuw)

Voert hybride detectie uit in twee stappen:

**Stap 1 — Webhook/endpoint matching (deterministisch)**

```
voor elke automation met webhook_paths (HubSpot):
  voor elke automation met endpoints (GitLab):
    als endpoint een suffix is van webhook_path (bijv. webhook_path="https://api.../typeform/webhook", endpoint="/typeform/webhook"):
      → suggestie met zekerheid="webhook", redenering=matched path (bijv. "/typeform/webhook")
```

Resultaat: lijst van `{ fromId, toId, zekerheid: "webhook", redenering }`.

**Stap 2 — AI-analyse (Gemini)**

Stuur naar Gemini:
- Alle automations die nog geen link hebben na stap 1
- Per automation: `naam`, `categorie`, `doel`, `trigger_beschrijving`, `systemen`
- Prompt: "Welke van deze automations hangen logisch samen? Geef koppels terug als `{ from, to, redenering }`. Alleen directe functionele verbanden."

Resultaat: lijst van `{ fromId, toId, zekerheid: "ai", redenering }`.

**Stap 3 — Opslaan**

Sla alle suggesties op in `automatisering_ai_flows` (`from_id`, `to_id`, `confidence` = "webhook"/"ai", `reasoning`). Verwijder eerst oude suggesties voor dezelfde automations (idempotent).

**Auth:** `verify_jwt = false` (zelfde patroon als andere AI-functies).

---

## Database

`automatisering_ai_flows` tabel bestaat al met kolommen `from_id`, `to_id`, `confidence`, `reasoning`. Geen migratie nodig.

---

## Wat niet verandert

- `detectFlows()` in `src/lib/detectFlows.ts` — ongewijzigd
- Bestaande flows en `automation_links` — ongewijzigd
- Bevestigd-tab in Flows.tsx — ongewijzigd
- Alle andere pagina's — ongewijzigd

---

## Bestanden gewijzigd / aangemaakt

| Bestand | Wijziging |
|---------|-----------|
| `src/pages/Flows.tsx` | Voeg twee tabs toe |
| `src/components/FlowSuggestiesTab.tsx` | Nieuw component |
| `src/lib/storage/automationLinks.ts` | Voeg 4 functies toe |
| `src/lib/queryHooks/flows.ts` | Voeg 2 hooks toe |
| `supabase/functions/detect-flow-links/index.ts` | Nieuwe edge function |
| `supabase/config.toml` | Registreer nieuwe function |
