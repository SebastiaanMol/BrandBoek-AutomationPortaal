# Import Source Tag — Design Spec

## Doel

Bij het importeren van een automation via HubSpot, Zapier of GitLab wordt de naam van het bronsysteem automatisch als eerste item in het `systemen`-veld opgeslagen. Zo is altijd aantoonbaar welk platform de bron was, zonder dat handmatige invulling nodig is — en de tag verschijnt alleen als de automation echt via dat systeem is binnengekomen.

## Scope

**Inbegrepen:**
- `"GitLab"` toevoegen aan `Systeem` type en `SYSTEMEN` constante
- Drie edge functions aanpassen zodat ze hun source tag garanderen
- Backfill-migratie voor bestaande geïmporteerde records

**Niet inbegrepen:**
- Typeform (geen `systemen`-extractie nodig, Typeform staat al in SYSTEMEN maar heeft geen eigen sync die systemen zet)
- UI-wijzigingen (de tag verschijnt vanzelf in bestaande systemen-checkboxes)
- Vergrendeling van de source tag (gebruiker mag hem nog steeds handmatig verwijderen)

## Architectuur

### 1. Type (`src/lib/types.ts`)

Voeg `"GitLab"` toe aan de `Systeem` union en `SYSTEMEN` array:

```typescript
export type Systeem =
  | "HubSpot" | "Zapier" | "Typeform" | "SharePoint"
  | "WeFact" | "Docufy" | "Backend" | "E-mail" | "API"
  | "GitLab" | "Anders";

export const SYSTEMEN: Systeem[] = [
  "HubSpot", "Zapier", "Typeform", "SharePoint",
  "WeFact", "Docufy", "Backend", "E-mail", "API",
  "GitLab", "Anders",
];
```

### 2. Edge functions

Patroon in alle drie functies: bouw eerst de content-gebaseerde `systemen` array, voeg dan de source tag als eerste item toe en dedupliceer:

```typescript
systemen = Array.from(new Set(["<SourceTag>", ...bestaandeSystemen]));
```

#### `supabase/functions/hubspot-sync/index.ts`
Na de aanroep van `extractSystemen(workflow.actions)`, vóór het upsert-object:
```typescript
const rawSystemen = extractSystemen(workflow.actions);
const systemen = Array.from(new Set(["HubSpot", ...rawSystemen]));
```

#### `supabase/functions/zapier-sync/index.ts`
Vervangt het huidige fallback-patroon (`systemen.length ? systemen : ["Zapier"]`):
```typescript
const rawSystemen = [...new Set((zap.steps || []).map((s: any) => s.app?.name).filter(Boolean))];
const systemen = Array.from(new Set(["Zapier", ...rawSystemen]));
```

#### `supabase/functions/gitlab-sync/index.ts`
Na het ophalen van `parsed.systemen` uit Gemini:
```typescript
const rawSystemen: string[] = parsed.systemen ?? [];
const systemen = Array.from(new Set(["GitLab", ...rawSystemen]));
```

### 3. Backfill-migratie (`supabase/migrations/20260415130000_backfill_source_tags.sql`)

```sql
-- Voeg source tag toe aan bestaande imports waar die nog ontbreekt
UPDATE automatiseringen
SET systemen = (to_jsonb(ARRAY['HubSpot']) || systemen::jsonb)
WHERE source = 'hubspot'
  AND NOT (systemen::jsonb @> '["HubSpot"]'::jsonb);

UPDATE automatiseringen
SET systemen = (to_jsonb(ARRAY['Zapier']) || systemen::jsonb)
WHERE source = 'zapier'
  AND NOT (systemen::jsonb @> '["Zapier"]'::jsonb);

UPDATE automatiseringen
SET systemen = (to_jsonb(ARRAY['GitLab']) || systemen::jsonb)
WHERE source = 'gitlab'
  AND NOT (systemen::jsonb @> '["GitLab"]'::jsonb);
```

Idempotent: records die de tag al hebben worden niet aangeraakt.

## Gedrag

| Situatie | Resultaat |
|---|---|
| HubSpot workflow geïmporteerd | `systemen` bevat altijd `"HubSpot"` als eerste item |
| Zapier zap geïmporteerd | `systemen` bevat altijd `"Zapier"` als eerste item |
| GitLab script geïmporteerd (Gemini geeft ook "HubSpot" terug) | `systemen = ["GitLab", "HubSpot"]` — geen duplicaten |
| Handmatig aangemaakte automation | Geen automatische source tag — gebruiker kiest zelf |
| Bestaande HubSpot/Zapier/GitLab imports | Backfill voegt tag toe als eerste item |

## Wat er niet verandert

- Gebruikers kunnen de source tag handmatig verwijderen (geen vergrendeling)
- De `source` kolom blijft los bestaan als technisch veld
- Typeform imports raken niet aan `systemen`
- De systemen-checkboxes in `AutomatiseringForm` tonen `"GitLab"` automatisch zodra het type is toegevoegd
