# Pipeline AI-beschrijving — Design Spec

## Doel

Toon een AI-gegenereerde Nederlandstalige samenvatting van elke pipeline op de detailpagina, verwerkt in het gekleurde hero-blok. De beschrijving wordt opgeslagen in de database en alleen opnieuw gegenereerd als de stages van een pipeline zijn veranderd tijdens een HubSpot-sync.

## Architectuur

De beschrijving wordt opgeslagen als een kolom `beschrijving` in de bestaande `pipelines` tabel. Een nieuwe Edge Function `describe-pipeline` genereert de tekst via `gemini-2.5-flash` (zelfde patroon als `describe-flow`). De `hubspot-pipelines` sync-functie detecteert stage-wijzigingen en regenereert de beschrijving inline. De frontend toont de opgeslagen waarde; als die nog ontbreekt, wordt de generatie eenmalig getriggerd via `useEffect`.

## Database

### Migratie
Voeg kolom toe aan `pipelines`:

```sql
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS beschrijving text;
```

Nullable — bestaande rijen krijgen `null`, worden gevuld bij eerste sync of bij openen van de detailpagina.

## Data Shape (bijgewerkt)

```typescript
interface Pipeline {
  pipelineId:   string;
  naam:         string;
  stages:       PipelineStage[];
  syncedAt:     string;
  beschrijving: string | null;  // nieuw
}
```

## Nieuwe Edge Function: `describe-pipeline`

**Pad:** `supabase/functions/describe-pipeline/index.ts`

**Request:** `POST { pipeline_id: string }`

**Stappen:**
1. Pipeline ophalen uit DB (`pipeline_id`, `naam`, `stages`)
2. Prompt samenstellen met naam en stage-labels
3. `gemini-2.5-flash` aanroepen via OpenAI-compatible endpoint (zelfde als `describe-flow`)
4. Resultaat opslaan: `UPDATE pipelines SET beschrijving = $1 WHERE pipeline_id = $2`
5. `{ beschrijving: string }` teruggeven

**Prompt (Nederlands):**

```
Je krijgt een HubSpot deal-pipeline genaamd "{naam}" met de volgende stages:
{stages als genummerde lijst: "1. Label\n2. Label\n..."}

Schrijf een zakelijke beschrijving van 2-3 zinnen die uitlegt wat het doel van deze pipeline is
en wat het proces globaal inhoudt. Schrijf voor medewerkers van een boekhoudkantoor,
geen technisch jargon. Antwoord uitsluitend in het Nederlands.

Antwoord in JSON: { "beschrijving": "..." }
```

**Foutafhandeling:** als Gemini een fout geeft of de JSON ongeldig is, geeft de functie `status 500` terug met `{ error: "..." }`. De bestaande beschrijving in de DB blijft dan ongewijzigd.

## Aanpassing: `hubspot-pipelines`

Vóór de upsert van elke pipeline, huidige data ophalen:

```typescript
const { data: existing } = await db
  .from("pipelines")
  .select("stages, beschrijving")
  .eq("pipeline_id", pipeline.id)
  .maybeSingle();
```

Stage-vergelijking: extraheer `stage_id`s uit de nieuwe en bestaande stages en vergelijk als gesorteerde arrays:

```typescript
const existingIds = (existing?.stages ?? [])
  .map((s: any) => s.stage_id).sort().join(",");
const newIds = stages.map((s) => s.stage_id).sort().join(",");
const stagesChanged = existingIds !== newIds;
const needsDescription = !existing?.beschrijving;
```

Als `stagesChanged || needsDescription`: Gemini aanroepen (zelfde patroon als `describe-pipeline`) en `beschrijving` meenemen in de upsert. Anders: `beschrijving: existing.beschrijving` meenemen zodat de waarde behouden blijft.

## Frontend

### `src/lib/types.ts`
Voeg `beschrijving: string | null` toe aan de `Pipeline` interface.

### `src/lib/supabaseStorage.ts`
`fetchPipelines` gebruikt al `select("*")`, maar de mapping-functie retourneert `beschrijving` nog niet. Voeg het toe:

```typescript
return (data as PipelineRow[] ?? []).map((r) => ({
  pipelineId:   r.pipeline_id,
  naam:         r.naam,
  stages:       r.stages ?? [],
  syncedAt:     r.synced_at,
  beschrijving: r.beschrijving ?? null,   // nieuw
}));
```

### `src/lib/hooks.ts`
Nieuw hook:

```typescript
export function useDescribePipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pipelineId: string) =>
      supabase.functions.invoke("describe-pipeline", {
        body: { pipeline_id: pipelineId },
      }).then(({ data, error }) => {
        if (error) throw error;
        return data as { beschrijving: string };
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pipelines"] }),
  });
}
```

### `src/pages/PipelineDetail.tsx`

**Hero-blok uitbreiding** — direct onder de `<h1>` naam, binnen het gekleurde hero-blok:

```tsx
<div
  className="mt-4 rounded-lg px-3 py-2.5"
  style={{ background: "rgba(255,255,255,0.15)" }}
>
  <div className="flex items-center gap-1.5 mb-1.5">
    <Sparkles className="w-2.5 h-2.5" style={{ color: "rgba(255,255,255,0.8)" }} />
    <span
      className="text-[9px] font-semibold uppercase tracking-widest"
      style={{ color: "rgba(255,255,255,0.7)" }}
    >
      AI Samenvatting
    </span>
  </div>
  {pipeline.beschrijving ? (
    <p className="text-[11px] leading-relaxed" style={{ color: "rgba(255,255,255,0.9)" }}>
      {pipeline.beschrijving}
    </p>
  ) : (
    <div className="space-y-1.5 animate-pulse">
      <div className="h-2 rounded-full w-full" style={{ background: "rgba(255,255,255,0.25)" }} />
      <div className="h-2 rounded-full w-4/5" style={{ background: "rgba(255,255,255,0.25)" }} />
      <p className="text-[8px] mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
        Beschrijving wordt gegenereerd…
      </p>
    </div>
  )}
</div>
```

**`useEffect` voor automatische generatie** (in de component, na de guards):

```tsx
const describeMutation = useDescribePipeline();

useEffect(() => {
  if (pipeline && !pipeline.beschrijving && !describeMutation.isPending) {
    describeMutation.mutate(pipeline.pipelineId);
  }
}, [pipeline?.pipelineId]);
```

**Import:** voeg `Sparkles` toe aan de lucide-react imports.

## Niet in scope

- Handmatig bewerken van de beschrijving
- Beschrijving per stage (alleen pipeline-niveau)
- Regenereren via een knop (alleen via sync of eerste load)
- Andere talen dan Nederlands
