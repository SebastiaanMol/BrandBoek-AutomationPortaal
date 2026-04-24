# Processes — Pipeline Tabs Design Spec

## Doel

De `/processen` pagina wordt opgesplitst in twee tabs: **Bekijken** en **Bewerken**. Elke actieve HubSpot-pipeline krijgt zijn eigen canvas. De viewer toont het canvas in leesmodus met een pipeline-selectiebalk bovenin; de editor behoudt de huidige functionaliteit maar voegt een pipeline-dropdown toe.

## Architectuur

```
/processen
├── Tab: Bekijken  (ProcessenView)
│   ├── Pipeline selector bar (pill buttons, alle actieve pipelines)
│   └── ProcessCanvas in read-only mode (geen drag, geen handlers)
└── Tab: Bewerken  (ProcessenEditor — bestaande logica)
    ├── Pipeline dropdown in header (links)
    └── Bestaande canvas + UnassignedPanel + toolbar
```

**Canvas per pipeline:** De `process_state` tabel gebruikt al `id` als tekst-PK. In plaats van de vaste waarde `"main"` wordt de `pipeline_id` als `id` gebruikt. Er is geen schema-migratie nodig; er worden simpelweg nieuwe rijen aangemaakt per pipeline. De bestaande `"main"` rij kan worden genegeerd.

## Database

Geen migratie vereist. De `process_state` tabel heeft al het schema:

```
id          text  PRIMARY KEY   ← was "main", wordt pipeline_id
steps       jsonb
connections jsonb
auto_links  jsonb
updated_at  timestamptz
```

`fetchProcessState` en `saveProcessState` krijgen een verplichte `pipelineId: string` parameter. De constante `PROCESS_STATE_ID = "main"` wordt verwijderd.

## Bestandsstructuur

| Bestand | Actie | Verantwoordelijkheid |
|---------|-------|---------------------|
| `src/pages/Processen.tsx` | Aanpassen | Outer shell: tab-state, pipeline-state, routing naar sub-componenten |
| `src/components/process/ProcessenView.tsx` | Nieuw | Pipeline selector + read-only canvas |
| `src/components/process/ProcessenEditor.tsx` | Nieuw (extracted) | Bestaande editor-logica uit Processen.tsx |
| `src/lib/supabaseStorage.ts` | Aanpassen | `fetchProcessState(id)` / `saveProcessState(id, state)` accepteren pipelineId |
| `src/lib/hooks.ts` | Aanpassen | `useProcessState(pipelineId)` hook toevoegen |

## Detailontwerp

### `src/pages/Processen.tsx` (outer shell)

Beheert alleen:
- `mode: "view" | "edit"` state
- `selectedPipelineId: string | null` state (gedeeld tussen tabs — als je een pipeline selecteert in View, is diezelfde pipeline voorgeselecteerd in Edit)
- Renders tabs + delegeert naar `ProcessenView` of `ProcessenEditor`

```tsx
const [mode, setMode] = useState<"view" | "edit">("view");
const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
const { data: pipelines = [] } = usePipelines();

// Auto-select eerste pipeline als nog geen selectie
useEffect(() => {
  if (!selectedPipelineId && pipelines.length > 0) {
    setSelectedPipelineId(pipelines[0].pipelineId);
  }
}, [pipelines, selectedPipelineId]);
```

**Tab-header:**
```tsx
<div className="tabs">
  <button onClick={() => setMode("view")} className={mode === "view" ? "active" : ""}>
    👁 Bekijken
  </button>
  <button onClick={() => setMode("edit")} className={mode === "edit" ? "active" : ""}>
    ✏️ Bewerken
  </button>
</div>
```

### `src/components/process/ProcessenView.tsx` (nieuw)

Props: `pipelines: Pipeline[]`, `selectedPipelineId: string | null`, `onSelectPipeline: (id: string) => void`, `onSwitchToEdit: () => void`

**Pipeline selector bar:**
```tsx
<div className="pipeline-bar">
  {pipelines.map(p => (
    <button
      key={p.pipelineId}
      onClick={() => onSelectPipeline(p.pipelineId)}
      className={selectedPipelineId === p.pipelineId ? "active" : ""}
    >
      {p.naam}
    </button>
  ))}
</div>
```

**Canvas in leesmodus:**
- Laadt canvas state via `useProcessState(selectedPipelineId)` (nieuwe hook)
- Toont `ProcessCanvas` zonder edit-handlers. Alle handler-props van `ProcessCanvas` moeten optioneel worden gemaakt (`prop?: handler`) zodat ze zonder TypeScript-fout weggelaten kunnen worden:
  - `onStepClick` → weglaten
  - `onMoveStep` → weglaten
  - `onAddConnection` → weglaten
  - `onDeleteConnection` → weglaten
  - `onAttachAutomation` → weglaten
  - `onAddStep` → weglaten
  - `onAddBranch` → weglaten
  - `onUpdateConnectionLabel` → weglaten
- Geen `UnassignedPanel`, geen toolbar (Save/Reset/Export)
- Badge "👁 Leesmodus" onderaan het canvas

**Leeg canvas (nog niet aangemaakt):**
```tsx
<div className="empty-state">
  <p>Nog geen canvas voor deze pipeline.</p>
  <button onClick={() => onSwitchToEdit()}>Aanmaken in Bewerken →</button>
</div>
```

### `src/components/process/ProcessenEditor.tsx` (extracted)

Bevat alle huidige logica uit `Processen.tsx` (state, handlers, ProcessCanvas, UnassignedPanel, dialogs, export, Save/Reset).

**Nieuw:** pipeline-dropdown linksboven in de header:
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm">
      {activePipeline?.naam ?? "Selecteer pipeline"}
      <ChevronDown className="h-3 w-3" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    {pipelines.map(p => (
      <DropdownMenuItem key={p.pipelineId} onClick={() => handleSwitchPipeline(p.pipelineId)}>
        {p.naam}
      </DropdownMenuItem>
    ))}
  </DropdownMenuContent>
</DropdownMenu>
```

**Pipeline wisselen met dirty check:**
Als `isDirty` en de gebruiker wisselt van pipeline → toon bevestigingsdialog ("Niet-opgeslagen wijzigingen gaan verloren. Doorgaan?"). Bij bevestiging: laad nieuwe canvas state, reset dirty flag.

Props die de editor ontvangt: `pipelineId: string`, `onSwitchToView: () => void` (voor de link vanuit het leeg-state scherm).

**State initialisatie vanuit DB:**
```tsx
const { data: savedState } = useProcessState(pipelineId);

useEffect(() => {
  if (!savedState) return;
  savedLinksRef.current = savedState.autoLinks;
  setState(prev => ({
    ...prev,
    steps:       savedState.steps       as ProcessState["steps"],
    connections: savedState.connections as ProcessState["connections"],
  }));
  setSaved(s => ({
    ...s,
    steps:       savedState.steps       as ProcessState["steps"],
    connections: savedState.connections as ProcessState["connections"],
  }));
  setIsDirty(false);
}, [pipelineId]);
```

Dit vervangt de huidige `fetchProcessState` aanroep in het `useEffect` bij mount.

### `src/lib/supabaseStorage.ts`

```typescript
// Verwijder: const PROCESS_STATE_ID = "main";

export async function fetchProcessState(pipelineId: string): Promise<SavedProcessState | null> {
  const { data, error } = await db
    .from("process_state")
    .select("steps, connections, auto_links")
    .eq("id", pipelineId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    steps:       (data.steps       ?? []) as unknown[],
    connections: (data.connections ?? []) as unknown[],
    autoLinks:   (data.auto_links  ?? {}) as Record<string, { fromStepId: string; toStepId: string }>,
  };
}

export async function saveProcessState(pipelineId: string, state: SavedProcessState): Promise<void> {
  const { error } = await db
    .from("process_state")
    .upsert(
      { id: pipelineId, steps: state.steps, connections: state.connections, auto_links: state.autoLinks, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) throw error;
}
```

### `src/lib/hooks.ts`

Nieuwe hook:
```typescript
export function useProcessState(pipelineId: string | null) {
  return useQuery({
    queryKey: ["processState", pipelineId],
    queryFn: () => pipelineId ? fetchProcessState(pipelineId) : null,
    enabled: !!pipelineId,
  });
}
```

De hook wordt gebruikt door `ProcessenView` voor leesmodus en door `ProcessenEditor` voor het initieel laden van de state. In de editor blijft de state lokaal beheerd (useState) na initieel laden — `useProcessState` is alleen voor het ophalen, niet voor real-time sync.

## Niet in scope

- Automatisch aanmaken van een canvas op basis van de HubSpot stages (eerste load toont leeg canvas + leeg-state melding)
- Real-time samenwerking / live sync van canvas wijzigingen
- Verwijderen van een pipeline-canvas
- De "main" rij migreren naar een specifieke pipeline
