# HubSpot–GitLab Endpoint Matching — Design Spec

## Doel

HubSpot-workflows die een webhook naar de GitLab-backend sturen automatisch koppelen aan het Python-script dat dat endpoint afhandelt. De koppeling is bidirectioneel zichtbaar: de HubSpot automation toont welk script hij aanroept, het GitLab script toont welke workflows het aanroepen.

## Scope

**Inbegrepen:**
- Regex-gebaseerde endpoint-extractie uit FastAPI Python-bestanden (gitlab-sync)
- Webhook-URL extractie uit HubSpot `raw_payload` WEBHOOK-acties (hubspot-sync)
- Matching-pass aan het einde van elke HubSpot sync
- Nieuwe `automation_links` join-table met `confirmed` vlag
- Frontend hooks + UI-secties in de detailview

**Niet inbegrepen:**
- Matching op basis van EXTENSION-acties (toekomstig)
- Handmatig toevoegen van links via de UI (alleen bevestigen van automatische suggesties)
- Zapier-links (geen directe webhook-naar-backend relatie)

## Architectuur

### 1. Database

Twee nieuwe kolommen op `automatiseringen`:

```sql
ALTER TABLE automatiseringen
  ADD COLUMN IF NOT EXISTS endpoints     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS webhook_paths TEXT[] DEFAULT '{}';
```

- `endpoints` — gevuld door gitlab-sync via regex; bevat de volledige HTTP-paden die het script blootstelt (bijv. `["/clockify/hubspot/upsert_client"]`)
- `webhook_paths` — gevuld door hubspot-sync; bevat de URL-paden van alle WEBHOOK-acties in de workflow (bijv. `["/clockify/hubspot/upsert_client"]`)

Nieuwe join-table:

```sql
CREATE TABLE automation_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   text NOT NULL REFERENCES automatiseringen(id) ON DELETE CASCADE,
  target_id   text NOT NULL REFERENCES automatiseringen(id) ON DELETE CASCADE,
  match_type  text NOT NULL CHECK (match_type IN ('exact', 'manual')),
  confirmed   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, target_id)
);
```

`source_id` = HubSpot automation, `target_id` = GitLab automation. RLS: zelfde policy als `automatiseringen` (authenticated users only).

### 2. GitLab sync — endpoint-extractie

Na `fetchFileContent`, vóór de upsert, wordt `extractEndpoints(content)` aangeroepen:

```typescript
function extractEndpoints(content: string): string[] {
  const prefixMatch = content.match(/APIRouter\s*\(\s*prefix\s*=\s*["']([^"']+)["']/);
  const prefix = prefixMatch?.[1] ?? "";
  const routeRe = /@router\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g;
  const endpoints: string[] = [];
  let m;
  while ((m = routeRe.exec(content)) !== null) {
    endpoints.push(`${prefix}${m[2]}`);
  }
  return endpoints;
}
```

Het resultaat (`string[]`) wordt opgeslagen in de `endpoints` kolom bij elke insert en update. Een bestand zonder FastAPI-router krijgt een lege array.

### 3. HubSpot sync — webhook-URL extractie

In `mapWorkflow()`, naast de bestaande `extractSystemen` call:

```typescript
function extractWebhookPaths(actions: any[]): string[] {
  return actions
    .filter((a) => (a.type ?? a.actionType) === "WEBHOOK")
    .flatMap((a) => {
      const raw = a.url ?? a.webhookUrl ?? "";
      try { return [new URL(raw).pathname]; } catch { return []; }
    });
}
```

Het resultaat wordt opgeslagen in de `webhook_paths` kolom bij elke insert en update.

### 4. Matching-pass

Draait aan het einde van elke HubSpot sync, na alle upserts:

1. Laad alle HubSpot automations met `webhook_paths != '{}'`
2. Laad alle GitLab automations met `endpoints != '{}'`
3. Voor elk HubSpot/GitLab paar: als `webhook_paths ∩ endpoints` niet leeg → upsert in `automation_links` met `match_type = 'exact'`, `confirmed = false` (bestaande `confirmed`-waarde wordt niet overschreven via `ON CONFLICT DO NOTHING`)
4. Verwijder rijen uit `automation_links` waarvan de path-overlap verdwenen is (bijv. webhook is uit de workflow verwijderd): delete waar `source_id` = HubSpot automation EN het pad niet meer in de overlap zit

`ON CONFLICT DO NOTHING` zorgt dat een al-bevestigde link niet gereset wordt.

### 5. Frontend

**Hook:**

```typescript
// src/lib/hooks.ts
export function useAutomationLinks(id: string) {
  return useQuery({
    queryKey: ["automation_links", id],
    queryFn: async () => {
      const asSource = await supabase
        .from("automation_links")
        .select("*, target:automatiseringen!target_id(id, naam, gitlab_file_path)")
        .eq("source_id", id);
      const asTarget = await supabase
        .from("automation_links")
        .select("*, source:automatiseringen!source_id(id, naam)")
        .eq("target_id", id);
      return { asSource: asSource.data ?? [], asTarget: asTarget.data ?? [] };
    },
    enabled: !!id,
  });
}

export function useConfirmLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => {
      await supabase.from("automation_links").update({ confirmed: true }).eq("id", linkId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation_links"] }),
  });
}
```

**UI — HubSpot detailview** (nieuwe sectie "Backend Script"):
- Zichtbaar als `asSource.length > 0`
- Per link: ID + naam van het GitLab script + `gitlab_file_path` als subtekst
- `confirmed = false`: gele badge "Suggestie" + "Bevestig"-knop
- `confirmed = true`: groene badge "Gekoppeld"

**UI — GitLab detailview** (nieuwe sectie "HubSpot Workflows"):
- Zichtbaar als `asTarget.length > 0`
- Per link: ID + naam van de HubSpot workflow
- Zelfde badge-logica

De detailview bevindt zich in `src/pages/AlleAutomatiseringen.tsx` in het drawer-paneel.

## Gedrag

| Situatie | Resultaat |
|---|---|
| HubSpot webhook-URL matcht exact het GitLab endpoint-pad | Link aangemaakt, `confirmed = false` (suggestie) |
| Gebruiker klikt "Bevestig" | `confirmed = true`, badge wordt groen |
| Webhook-URL verdwijnt uit HubSpot workflow | Link verwijderd bij volgende sync |
| GitLab-bestand zonder FastAPI-router | `endpoints = []`, nooit gematcht |
| HubSpot workflow zonder WEBHOOK-actie | `webhook_paths = []`, nooit gematcht |
| Beide kanten al bevestigd, sync draait opnieuw | `ON CONFLICT DO NOTHING` — bevestiging blijft intact |

## Wat er niet verandert

- Bestaande `koppelingen` array blijft ongewijzigd — automatische links leven in `automation_links`, niet in `koppelingen`
- De Gemini-aanroep in gitlab-sync krijgt geen extra velden — endpoint-extractie is puur regex
- Zapier sync wordt niet aangepast
