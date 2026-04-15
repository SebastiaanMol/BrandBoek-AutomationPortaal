# Portaalinstellingen — Design Spec

## Doel

De huidige Instellingen-pagina beheert alleen externe koppelingen. Dit project voegt een "Portaalinstellingen"-sectie toe waarmee organisatiebrede configuratie beheerd kan worden zonder code-aanpassingen: verificatieperiode, actieve statussen/categorieën, weergave-standaarden en verplichte velden.

## Scope

**Inbegrepen:**
- A — Bedrijfsregels: verificatieperiode, beschikbare statussen, beschikbare categorieën
- B — Weergave-standaarden: standaard sortering, standaard statusfilter
- D — Datavelden: verplichte velden, extra systemen, extra categorieën

**Niet inbegrepen (apart project):**
- Gebruikers & rollen (rolgebaseerde toegang)
- Complexiteits- en impactformule-gewichten

## Architectuur

### Database

Nieuwe tabel `portal_settings` in Supabase:

```sql
create table portal_settings (
  id     text primary key default 'main',
  settings jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- RLS: iedereen leest, alleen authenticated users schrijven
alter table portal_settings enable row level security;
create policy "read" on portal_settings for select using (true);
create policy "write" on portal_settings for all using (auth.role() = 'authenticated');
```

Er is altijd precies één rij (`id = 'main'`). Nieuwe instellingen worden als extra velden in de JSON toegevoegd — bestaande data breekt nooit.

### TypeScript (`src/lib/types.ts`)

Nieuw type `PortalSettings`:

```typescript
export interface PortalSettings {
  verificatiePeriodeDagen: number;           // default: 90
  beschikbareStatussen: Status[];            // default: alle 4 statussen
  beschikbareCategorieen: Categorie[];       // default: alle categorieën
  standaardStatusFilter: string;             // default: "alle"
  standaardSortering: "created_at" | "naam" | "status"; // default: "created_at"
  verplichtVelden: Array<                   // default: []
    "doel" | "trigger" | "systemen" | "stappen" | "owner" | "fasen" | "afhankelijkheden"
  >;
  extraSystemen: string[];                   // default: []
  extraCategorieen: string[];               // default: []
}

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  verificatiePeriodeDagen: 90,
  beschikbareStatussen: [...STATUSSEN],
  beschikbareCategorieen: [...CATEGORIEEN],
  standaardStatusFilter: "alle",
  standaardSortering: "created_at",
  verplichtVelden: [],
  extraSystemen: [],
  extraCategorieen: [],
};

export function getPortalSettings(raw: Partial<PortalSettings>): PortalSettings {
  return { ...DEFAULT_PORTAL_SETTINGS, ...raw };
}
```

### Data-laag (`src/lib/supabaseStorage.ts`)

```typescript
export async function fetchPortalSettings(): Promise<PortalSettings> {
  const { data, error } = await supabase
    .from("portal_settings")
    .select("settings")
    .eq("id", "main")
    .maybeSingle();
  if (error) throw error;
  return getPortalSettings((data?.settings ?? {}) as Partial<PortalSettings>);
}

export async function savePortalSettings(settings: PortalSettings): Promise<void> {
  const { error } = await supabase
    .from("portal_settings")
    .upsert({ id: "main", settings, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw error;
}
```

### Hooks (`src/lib/hooks.ts`)

```typescript
export function usePortalSettings() {
  return useQuery({
    queryKey: ["portal_settings"],
    queryFn: fetchPortalSettings,
  });
}

export function useSavePortalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: savePortalSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portal_settings"] }),
  });
}
```

## Integraties met bestaande code

| Bestand | Wijziging |
|---|---|
| `src/lib/types.ts` — `getVerificatieStatus()` | Leest `verificatiePeriodeDagen` uit settings i.p.v. hardcoded `90` |
| `src/pages/AlleAutomatiseringen.tsx` | Initialiseer `statusFilter` en `sortOrder` vanuit portal settings |
| `src/lib/types.ts` — `SYSTEMEN` / `CATEGORIEEN` | Exporteer `useEffectiveSystemen()` en `useEffectiveCategorieen()` die extra items samenvoegen |
| `src/components/AutomatiseringForm.tsx` | Verplichte velden uit `verplichtVelden` krijgen een validatiefout bij opslaan |

## UI

### Locatie
Nieuwe kaart bovenaan `src/pages/Instellingen.tsx`, boven de integratie-cards.

### Layout — één scrollende kaart met labeled subsecties

```
┌─ Portaalinstellingen ──────────────────────────────────┐
│                                                          │
│  BEDRIJFSREGELS                                          │
│  Verificatieperiode    [90] dagen                        │
│  Actieve statussen     [✓ Actief] [✓ In review] [...]   │
│  Actieve categorieën   [✓ HubSpot Workflow] [...]        │
│                                                          │
│  ────────────────────────────────────────────────────── │
│  WEERGAVE-STANDAARDEN                                    │
│  Standaard statusfilter  [Alle statussen ▾]              │
│  Standaard sortering     [Aanmaakdatum ▾]                │
│                                                          │
│  ────────────────────────────────────────────────────── │
│  DATAVELDEN                                              │
│  Verplichte velden     [✓ Owner] [Fasen] [Doel] [...]   │
│  Extra systemen        [+ Systeem toevoegen]             │
│  Extra categorieën     [+ Categorie toevoegen]           │
│                                                          │
│                              [ Instellingen opslaan ]    │
└──────────────────────────────────────────────────────── ┘
```

### Gedrag
- De kaart laadt de huidige instellingen via `usePortalSettings()`
- Lokale form-state houdt wijzigingen bij tot de gebruiker opslaat
- "Instellingen opslaan" triggert `useSavePortalSettings()` met toast op succes/fout
- Toggles voor statussen/categorieën zijn checkboxes — minimaal één status moet actief blijven
- Extra systemen/categorieën zijn tekstvelden met een "+" knop en een verwijder-icoon per item

### Laadindicator
Tijdens laden: skeleton-placeholders voor de velden. Bij opslaan: knop toont "Opslaan..." en is disabled.

## Wat er niet verandert

- Bestaande automatiseringen blijven zichtbaar, ook als hun status/categorie later uit de actieve lijst wordt gehaald
- De sync-functies (HubSpot, Zapier, GitLab) zijn onafhankelijk van portaalinstellingen
- De complexiteits- en impactberekening blijft hardcoded
