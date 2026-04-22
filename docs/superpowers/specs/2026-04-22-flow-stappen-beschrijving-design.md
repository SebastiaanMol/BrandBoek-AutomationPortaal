# Flow Stappen Beschrijving — Design Spec

**Date:** 2026-04-22
**Status:** Approved

## Overview

Wanneer een gebruiker een FlowDetail pagina opent, genereert het systeem automatisch een zakelijke beschrijving van de volledige flow: een korte samenvatting én een genummerde stappenlijst in begrijpelijke taal. Gemini genereert de inhoud; het resultaat wordt opgeslagen in de database zodat volgende bezoekers het direct zien.

---

## Data Model

### Wijziging aan tabel `flows`

```sql
ALTER TABLE flows
  ADD COLUMN stappen_beschrijving JSONB DEFAULT NULL,
  ADD COLUMN stappen_bijgewerkt_at TIMESTAMPTZ DEFAULT NULL;
```

**`stappen_beschrijving` JSON-structuur:**

```json
{
  "samenvatting": "Wanneer een nieuw contact binnenkomt via HubSpot...",
  "stappen": [
    "Een nieuw contact wordt aangemaakt in HubSpot.",
    "Het systeem haalt KVK- en LinkedIn-data op om het contact te verrijken.",
    "Er wordt een gepersonaliseerde welkomstmail verstuurd."
  ]
}
```

### TypeScript interface

`Flow` in `src/lib/types.ts` krijgt twee nieuwe optionele velden:

```typescript
stappenBeschrijving: {
  samenvatting: string;
  stappen: string[];
} | null;
stappenBijgewerktAt: string | null;
```

---

## Edge Function: `describe-flow`

Nieuw bestand: `supabase/functions/describe-flow/index.ts`

Zelfde patroon als `name-flow`: CORS-headers, OPTIONS preflight, Gemini 2.5 Flash via de OpenAI-compatible endpoint.

**Input:** `{ flowId: string }`

**Verwerking:**
1. Haal de flow op uit de `flows` tabel (om `automation_ids` te krijgen).
2. Haal alle automations op uit `automatiseringen` voor die IDs.
3. Bouw per automation de invoer op in volgorde van voorkeur:
   - Primair: `beschrijving_in_simpele_taal` (rijkste bron, al in gewone taal)
   - Fallback: `doel` + `trigger` + `stappen`
4. Stuur naar Gemini met een Nederlandse prompt.
5. Sla het resultaat op in de `flows` tabel.

**Prompt (Nederlands):**
> Je krijgt een reeks automations die samen één flow vormen, in volgorde van uitvoering. Schrijf een zakelijke beschrijving voor een niet-technisch publiek.
>
> Geef terug als JSON:
> - `samenvatting`: 2–4 zinnen die in begrijpelijke taal beschrijven wat de hele flow doet van begin tot eind.
> - `stappen`: een genummerde lijst van alle stappen die plaatsvinden in de hele flow, in gewone taal, zonder technisch jargon.

**Output:** `{ samenvatting: string; stappen: string[] }`

**Na generatie:** schrijft `stappen_beschrijving` en `stappen_bijgewerkt_at = NOW()` terug naar de `flows` tabel.

---

## Staleness Check

Uitgevoerd in `src/pages/FlowDetail.tsx` bij het laden van de pagina.

**Logica:**
```
isStale = flow.stappenBijgewerktAt === null
       || automations.some(a => a.updatedAt > flow.stappenBijgewerktAt)
```

Als `isStale === true`: roep de `describe-flow` edge function aan en herlaad daarna de flows query (via `queryClient.invalidateQueries`).

De aanroep gebeurt in een `useEffect` die afhangt van `flow.id`. Alleen getriggerd wanneer automations geladen zijn.

---

## UI — FlowDetail

Nieuwe sectie **"Wat doet deze flow?"** onderaan de pagina, boven de delete-knop.

**Tijdens generatie (loading state):**
- Drie skeleton-regels in de sectie (geen spinner overlay — de rest van de pagina blijft bruikbaar)

**Na generatie:**
- **Samenvatting:** alinea in normale tekstgrootte
- **Stappen:** genummerde lijst (`ol`) in dezelfde stijl als de bestaande stappenlijst

**Read-only:** de sectie is niet inline bewerkbaar.

---

## Nieuwe bestanden & wijzigingen

| Bestand | Type |
|---|---|
| `supabase/migrations/20260422000000_flows_stappen.sql` | Nieuw — DB migratie |
| `supabase/functions/describe-flow/index.ts` | Nieuw — Edge Function |
| `src/lib/types.ts` | Wijziging — `Flow` interface uitbreiden |
| `src/lib/supabaseStorage.ts` | Wijziging — mapping `fetchFlows` + `describeFlow()` functie |
| `src/pages/FlowDetail.tsx` | Wijziging — staleness check + loading state + nieuwe sectie |

---

## Edge Cases

| Situatie | Gedrag |
|---|---|
| Automation heeft geen `beschrijvingInSimpeleTaal` | Valt terug op `doel` + `trigger` + `stappen` |
| Gemini-aanroep mislukt | `stappen_beschrijving` blijft null; sectie toont een foutmelding met een "Probeer opnieuw" link |
| Flow bevat een automation die niet meer bestaat | Die automation wordt overgeslagen bij de input voor Gemini |
| Meerdere gebruikers openen de flow tegelijk terwijl hij stale is | Beide roepen `describe-flow` aan; de laatste schrijft wint — geen data-corruptie door idempotente overschrijving |

---

## Out of Scope

- Manuele bewerking van de gegenereerde samenvatting of stappen
- Versiebeheer van eerdere gegenereerde beschrijvingen
- Generatie bij aanmaken van de flow (alleen bij openen FlowDetail)
- Notificatie aan gebruikers dat de beschrijving verouderd is
