# Process Artifacts Manual Exception Block Design

## Doel

De Proces Editor moet een handmatig plaatsbaar BPMN-artifact ondersteunen voor pipeline-acties die altijd handmatig beschikbaar zijn. Zo een actie hoort niet in de verplichte hoofdsequence en mag niet met routes vanuit elke stap worden verbonden.

Het eerste artifact-type is:

**Manual exception block**

Dit blok communiceert: deze handmatige pipeline-actie kan vanuit elke fase gekozen worden, maar is geen normale processtap.

## Scope

In scope:

- Een nieuw `ProcessArtifact` model naast `steps`, `connections`, `automations`, `flows` en `attachments`.
- Een eerste artifact-type: `manualExceptionBlock`.
- Handmatig plaatsen, slepen, bewerken en verwijderen in edit mode.
- Read-only rendering in viewer mode.
- Opslaan, laden, exporteren en importeren via bestaande process state/backups.
- Een dotted association vanuit algemene procescontext of een gekozen anchor naar het block.

Niet in scope:

- Automatisch herkennen welke pipeline stages always-available zijn.
- BPMN XML-export.
- Volledige event-subprocess modellering met interne routes.
- Routes vanuit elke individuele taak genereren.
- De bestaande route/snapping-logica wijzigen.

## Conceptueel Model

`ProcessArtifact` is bedoeld voor BPMN-contextobjecten die niet onderdeel zijn van de sequence flow.

Voorgestelde typevorm:

```ts
export type ProcessArtifactType = "manualExceptionBlock";

export interface ProcessArtifact {
  id: string;
  type: ProcessArtifactType;
  title: string;
  description?: string;
  position: {
    x: number;
    y: number;
  };
  size?: {
    width: number;
    height: number;
  };
  association?: {
    label?: string;
    anchor: "process";
  };
}
```

Voor de eerste versie is `association.anchor` bewust beperkt tot `"process"`. Daarmee zeggen we: dit blok hoort bij de hele procescontext, niet bij een taak.

## Gebruikersgedrag

In edit mode:

1. De gebruiker kiest `Manual exception` uit de BPMN/elementen-toolbar.
2. De gebruiker plaatst het blok op de canvas, bij voorkeur onder of naast de hoofdflow.
3. Het blok krijgt standaard:
   - titel: `Altijd beschikbare handmatige actie`
   - beschrijving: `Mogelijk vanuit elke pipeline stage. Geen verplichte processtap.`
   - association label: `Mogelijk vanuit elke pipeline stage`
4. De gebruiker kan het blok slepen.
5. De gebruiker kan titel en beschrijving aanpassen.
6. De gebruiker kan het blok verwijderen.

In viewer mode:

1. Het blok is zichtbaar maar niet bewerkbaar.
2. De dotted association is zichtbaar.
3. Het blok opent geen normale step-route logica.
4. Het detailpaneel mag later artifact-details tonen, maar dat is niet nodig voor de eerste versie.

## Visueel Ontwerp

Manual exception block:

- dashed border;
- lichte amber/sand achtergrond;
- compact BPMN event-subprocess gevoel;
- kleine start-event indicator linksboven;
- titel vet;
- beschrijving kleiner;
- optioneel pill-label: `Manual`;
- vaste minimumgrootte zodat tekst niet overloopt.

Dotted association:

- grijze gestippelde lijn vanuit de algemene procescontext naar het blok;
- label bij de lijn: `Mogelijk vanuit elke pipeline stage`;
- geen arrowhead zoals een sequence flow;
- visueel duidelijk anders dan hoofdroute/correctie/einde.

Belangrijk: dit artifact mag niet lijken op een normale taak en niet als procesroute gelezen worden.

## Dataflow

`ProcessState` krijgt een optioneel veld:

```ts
artifacts?: ProcessArtifact[];
```

De editor behandelt artifacts hetzelfde persistentieniveau als attachments:

- opnemen in `state`;
- bewaren via bestaande `saveProcessState`;
- laden vanuit `useProcessState`;
- meenemen in JSON backup export;
- herstellen uit JSON backup import;
- verwijderen wanneer de gebruiker het artifact verwijdert.

Omdat artifacts niet aan steps of connections hangen, hoeven ze niet verwijderd te worden bij step-delete of connection-delete.

## Componenten

Primaire wijzigingen:

- `src/data/processData.ts`
  - `ProcessArtifact` types toevoegen.
  - `ProcessState` uitbreiden met `artifacts?: ProcessArtifact[]`.

- `src/components/process/ProcessCanvas.tsx`
  - artifacts prop accepteren.
  - `manualExceptionBlock` renderen.
  - drag/edit/delete interacties via callbacks ondersteunen.
  - dotted association tekenen.

- `src/components/process/ProcessenEditor.tsx`
  - artifacts beheren in state.
  - toolbar-actie toevoegen voor nieuw manual exception block.
  - callbacks doorgeven aan `ProcessCanvas`.
  - artifact updates markeren als dirty.

- `src/components/process/ProcessenView.tsx`
  - artifacts read-only doorgeven aan shared canvas.

- `src/lib/processBackup.ts`
  - artifacts meenemen in export/import validatie.

Mogelijke helper:

- `src/lib/processArtifacts.ts`
  - default labels/positions;
  - artifact update/delete helpers;
  - optioneel als `ProcessenEditor` te groot wordt.

## Interactiegrenzen

Artifacts zijn geen:

- `ProcessStep`;
- `Connection`;
- `Automation`;
- `Flow`;
- `ProcessAttachment`.

Daarom:

- geen route handles;
- geen connection ports;
- geen automatic snapping naar steps;
- geen lane/team ownership in versie 1;
- geen impact op routeberekening.

Dit voorkomt dat always-available manual acties per ongeluk als normale pipelinefase worden gelezen.

## Randgevallen

- Oude process states zonder `artifacts` blijven geldig.
- Een backup zonder `artifacts` importeert als lege artifactlijst.
- Een artifact buiten de huidige canvas bounds vergroot de canvas indien nodig of blijft zichtbaar binnen bestaande overflow.
- Lange titel/beschrijving breekt netjes af binnen het blok.
- Viewer mode toont geen drag handles of edit inputs.
- Delete van steps/connections verwijdert artifacts niet.

## Teststrategie

Unit/component tests:

- `ProcessCanvas` rendert een manual exception block.
- Viewer/read-only mode toont het block zonder edit controls.
- Edit mode kan een artifact slepen via callback.
- Dotted association gebruikt geen sequence-flow styling.
- Lange tekst blijft binnen het blok.

Editor tests:

- Toolbaractie voegt een `manualExceptionBlock` toe aan `state.artifacts`.
- Bewerken van titel/beschrijving update het artifact.
- Verwijderen haalt alleen het artifact weg.
- Opslaan bewaart artifacts in process state.

Backup tests:

- Export bevat artifacts.
- Import herstelt artifacts.
- Oude backups zonder artifacts blijven geldig.

Regressietests:

- Bestaande lijnteken-, waypoint-, timer-, gateway- en viewer-tests blijven groen.

## Acceptatiecriteria

- Gebruiker kan handmatig een manual exception block plaatsen.
- Het block is visueel duidelijk geen normale processtap.
- Er is een dotted association vanuit procescontext, niet vanuit elke taak.
- Het block kan worden gesleept, bewerkt en verwijderd in edit mode.
- Viewer mode toont het block read-only.
- Artifacts worden opgeslagen en meegenomen in backups.
- Bestaande route- en canvaslogica blijft ongewijzigd werken.
