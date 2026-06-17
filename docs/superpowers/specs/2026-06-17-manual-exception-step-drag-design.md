# Manual Exception Step Drag Design

## Doel

De Proces Editor moet bestaande processtappen naar een `manualExceptionBlock` kunnen verplaatsen. Daarmee kan een pipelinefase die niet meer in de verplichte hoofdflow hoort, als handmatig beschikbare stap worden gemodelleerd zonder dat de normale sequence-flow misleidend blijft.

De gekozen richting is:

- bestaande stap naar manual block slepen;
- bestaande lijnen van en naar die stap automatisch verwijderen;
- meerdere stappen in hetzelfde manual block toestaan;
- stappen binnen het manual block tonen als normale processtap-vormen;
- stappen binnen het manual block hersorteerbaar maken;
- stappen later terug naar de canvas kunnen slepen, zonder automatische lijnen.

## Scope

In scope:

- Een bestaande `ProcessStep` vanuit de hoofdcanvas naar een `manualExceptionBlock` slepen.
- De stap uit de normale flow halen zodra de drop op het manual block lukt.
- Alle inkomende en uitgaande `connections` van die stap verwijderen.
- Attachments, flow links of andere data die aan verwijderde connections hangen opruimen volgens bestaande cleanup-regels.
- Meerdere stappen per manual block bewaren.
- Volgorde van manual stappen binnen het block handmatig hersorteren.
- Een manual stap terug naar de canvas slepen als losse stap zonder lijnen.
- Viewer mode toont manual stappen read-only binnen het block.
- Opslag, backup export/import en oude states blijven compatibel.

Niet in scope:

- Automatisch routes herstellen wanneer een manual stap terug op canvas komt.
- Lijnen tekenen tussen stappen binnen het manual block.
- Een stap tegelijk in hoofdflow en manual block tonen.
- Automatisch herkennen welke HubSpot pipeline stages manual beschikbaar zijn.
- BPMN XML-export of volledige event-subprocess modellering.

## Data Model

Het bestaande `ProcessArtifact` model blijft het hoofdobject voor het manual block. Het block krijgt een optionele lijst met stap-id's:

```ts
interface ProcessArtifact {
  id: string;
  type: "manualExceptionBlock";
  title: string;
  description?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  association?: {
    label?: string;
    anchor: "process";
  };
  stepIds?: string[];
}
```

De `ProcessStep` objecten blijven in `ProcessState.steps`, maar een step-id die in `artifact.stepIds` voorkomt wordt niet meer als normale canvasstap gerenderd. Dit voorkomt dubbele step-bronnen en maakt terugplaatsen eenvoudig: het terugplaatsen verwijdert de id uit `stepIds` en zet de positie/team/kolom/rij van de stap opnieuw.

Belangrijke invariant:

Een `ProcessStep.id` mag in maximaal één `manualExceptionBlock.stepIds` voorkomen. Als een stap naar een ander manual block wordt gesleept, wordt hij eerst uit andere manual blocks verwijderd.

## Gebruikersgedrag

### Stap naar manual block slepen

In edit mode:

1. De gebruiker sleept een bestaande processtap.
2. Wanneer de stap boven een manual block hangt, krijgt het block een duidelijke drop-highlight.
3. Bij drop in het block:
   - de step-id wordt toegevoegd aan `manualExceptionBlock.stepIds`;
   - de stap verdwijnt uit de hoofdflow-rendering;
   - alle connections met `fromStepId` of `toStepId` gelijk aan die step-id worden verwijderd;
   - gerelateerde connection attachments en flow links worden opgeruimd;
   - de stap verschijnt binnen het manual block als normale taakvorm.

### Meerdere stappen in een manual block

Een manual block kan meerdere stappen bevatten. De stappen worden verticaal onder elkaar getoond in de volgorde van `stepIds`.

Binnen het manual block:

- elke stap gebruikt dezelfde visuele taakvorm als op de canvas;
- elke stap heeft een kleine drag-handle voor hersorteren;
- hersorteren verandert alleen de volgorde binnen `stepIds`;
- er worden geen sequence-lijnen tussen deze stappen getekend.

### Stap terug naar canvas slepen

In edit mode:

1. De gebruiker sleept een manual stap uit het block naar een geldige canvaspositie.
2. De step-id wordt uit `manualExceptionBlock.stepIds` verwijderd.
3. De stap wordt teruggezet op de gekozen lane/kolom/rij.
4. De stap krijgt geen connections terug.
5. De gebruiker tekent daarna zelf de gewenste lijnen.

Als de gebruiker de stap buiten een geldige canvaspositie loslaat, blijft de stap in het manual block.

## Visueel Ontwerp

Manual block:

- behoudt de dashed amber styling;
- groeit in hoogte op basis van het aantal manual stappen;
- toont een compacte teller, bijvoorbeeld `3 stappen`;
- gebruikt een drop-highlight wanneer een gewone stap erboven hangt.

Manual stappen binnen het block:

- gebruiken dezelfde taakvorm als normale processtappen;
- zijn iets compacter geplaatst maar niet als chips/tags;
- tonen de normale staplabel;
- hebben een drag-handle links voor sorteren;
- tonen geen connection ports of route handles zolang ze in het manual block zitten.

Read-only viewer:

- toont het manual block en de manual stappen;
- toont geen drag handles, edit inputs, route handles of contextmenu-acties;
- maakt duidelijk dat de stappen handmatig beschikbaar zijn en geen verplichte sequence vormen.

## Interactieregels

- Alleen edit mode mag stappen naar of uit manual blocks verplaatsen.
- Het slepen naar manual mag bestaande lijnteken-modus niet activeren.
- Route handles en anchor points blijven alleen voor normale canvasroutes beschikbaar.
- Een manual step kan niet verbonden worden zolang hij in een manual block zit.
- Bij verwijderen van een manual block blijven de onderliggende stappen niet stilletjes verdwijnen. De editor moet ze terugplaatsen of de gebruiker expliciet laten bevestigen dat ze ook verwijderd worden. Voor versie 1 is de conservatieve keuze: bij block-delete worden de contained steps teruggezet als losse canvasstappen zonder lijnen.

## Dataflow

Opslaan:

- `ProcessState.steps` blijft alle stappen bevatten;
- `ProcessState.connections` bevat geen connections naar manual stappen;
- `ProcessState.artifacts[].stepIds` bewaart welke stappen in welk manual block zitten.

Laden:

- states zonder `stepIds` blijven geldig;
- invalid step ids in `stepIds` worden genegeerd;
- duplicate step ids in meerdere blocks worden gededupliceerd, waarbij de eerste geldige block-volgorde wint.

Backup:

- JSON backup export neemt `stepIds` mee als onderdeel van artifacts;
- import valideert artifacts via de bestaande parser;
- oude backups zonder `stepIds` blijven geldig.

## Randgevallen

- Stap heeft inkomende en uitgaande lijnen: alle betrokken lijnen worden verwijderd.
- Stap heeft branch/optional/end routes: die worden ook verwijderd als ze normale `connections` zijn.
- Connection attachments op verwijderde lijnen worden verwijderd.
- Step attachments op de stap blijven aan de stap gekoppeld, maar worden in versie 1 niet apart in het manual block gerenderd.
- Een manual block met veel stappen groeit in hoogte en vergroot de canvas bounds indien nodig.
- Als een stap terug naar canvas wordt geplaatst op een bezette positie, gebruikt de editor dezelfde bestaande row/column plaatsingslogica als normale step-drag.

## Teststrategie

Unit tests:

- `ProcessArtifact` parsing bewaart geldige `stepIds`.
- Invalid of dubbele `stepIds` worden veilig opgeschoond.
- Helper voor stap naar manual verplaatsen verwijdert relevante connections.
- Helper voor terugplaatsen verwijdert de id uit het block en laat connections leeg.

Canvas/editor tests:

- Een gewone stap droppen op manual block voegt de step-id toe aan `artifact.stepIds`.
- De stap verdwijnt uit de hoofdflow en verschijnt binnen het manual block.
- Connections van/naar die stap worden automatisch verwijderd.
- Meerdere stappen kunnen in hetzelfde block staan.
- Manual stappen kunnen binnen het block worden hersorteerd.
- Manual stap terug naar canvas verschijnt zonder lijnen.
- Read-only viewer toont manual stappen zonder edit controls.

Regressietests:

- Bestaande lijntekenen-flow blijft werken.
- Waypoint/anchor editing blijft werken voor normale routes.
- Viewer/editor blijven dezelfde opgeslagen process state tonen.
- Backup import/export behoudt manual step ids.

## Acceptatiecriteria

- Gebruiker kan een bestaande stap naar een manual block slepen.
- De stap wordt niet meer als normale sequence-stap gerenderd.
- Alle lijnen van en naar die stap worden automatisch verwijderd.
- Meerdere stappen kunnen in hetzelfde manual block staan.
- Manual stappen zijn binnen het block hersorteerbaar.
- Manual stappen zien eruit als normale processtappen, niet als chips.
- Een manual stap kan terug naar de canvas als losse stap zonder lijnen.
- Viewer mode toont alles read-only.
- Oude process states en backups blijven werken.
