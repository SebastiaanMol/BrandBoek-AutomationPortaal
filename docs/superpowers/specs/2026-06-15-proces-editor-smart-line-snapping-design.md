# Proces Editor Smart Line Snapping Design

## Doel

Nieuwe lijnen in de Proces Editor moeten direct netjes aansluiten op nieuwe of bestaande proces-elementen. De editor moet daarbij helpen met automatische snapping en nette rechte routes, zonder bestaande handmatige routes later onverwacht te veranderen.

## Scope

Dit ontwerp geldt voor de Proces Editor-canvas in `src/components/process/ProcessCanvas.tsx`.

In scope:

- Nieuwe handmatige lijnen automatisch laten snappen op geschikte ankerpunten.
- Nieuwe lijnen standaard als orthogonale route tekenen: horizontaal/verticaal met nette knikpunten.
- Hoeken/knikpunten handmatig sleepbaar houden.
- Zodra een gebruiker een knikpunt wijzigt, blijft die route handmatig en wordt hij niet opnieuw automatisch gerouted.
- Viewer mode read-only houden: geen lijn tekenen, geen knikpunten slepen, geen editor-controls.
- Bestaande editor-interacties behouden, waaronder dubbelklik/insert-gedrag, timer events en gateway/task plaatsing.

Niet in scope:

- Bestaande handmatig aangepaste lijnen automatisch opnieuw routeren na layoutwijzigingen.
- Een globale "maak alle routes netjes" actie.
- Grote herbouw van de canvas-architectuur.

## Gebruikersgedrag

Wanneer de gebruiker in edit mode een nieuwe lijn tekent:

1. De gebruiker start vanaf een stappoort of bestaand startpunt.
2. Tijdens het richten op een doel-element kiest de editor de beste doelpoort.
3. Bij het afronden van de lijn slaat de editor de verbinding op met source/target side en standaard waypoints.
4. De lijn verschijnt als rechte, orthogonale route zonder diagonale segmenten.
5. De standaard knikpunten zijn zichtbaar/selecteerbaar wanneer de lijn geselecteerd is.
6. Als de gebruiker een knikpunt sleept, worden de nieuwe waypoints opgeslagen en blijft die lijn handmatig.

Nieuwe lijnen mogen slim zijn. Bestaande handmatig aangepaste lijnen moeten voorspelbaar blijven.

## Routingregels

De automatische keuze voor nieuwe lijnen gebruikt eenvoudige, voorspelbare regels:

- Element rechts van bron: source `right`, target `left`.
- Element links van bron: source `left`, target `right`.
- Element onder bron in dezelfde kolom: source `bottom`, target `top`.
- Element boven bron in dezelfde kolom: source `top`, target `bottom`.
- Bij diagonale plaatsing krijgt horizontale flow voorrang, tenzij verticale afstand duidelijk groter is dan horizontale afstand.

De standaard route gebruikt grid-snapping voor waypoints, zodat lijnen aansluiten bij de bestaande editor-grid en de handmatige handles stabiel blijven.

## Data

De bestaande `Connection`-structuur blijft leidend.

Nieuwe handmatige routes krijgen:

- `manual: true`
- `routeType` volgens de gekozen routeknop
- `fromStepId` en `toStepId`
- `fromSide` en `toSide` als expliciete `ConnectionSide` waarden
- `waypoints` met de automatisch bepaalde knikpunten

Wanneer een gebruiker een knikpunt sleept, worden alleen de `waypoints` van die verbinding aangepast.

## Componenten

De hoofdwijziging hoort in `ProcessCanvas`.

Te isoleren helperfuncties:

- `chooseConnectionSides(from, to)`: kiest source/target poort voor een nieuwe lijn.
- `buildDefaultManualWaypoints(from, to, sides)`: maakt nette standaard knikpunten.
- `snapPointToRoutingGrid(point)`: hergebruikt of centraliseert bestaande grid-snapping.
- `isManualRouteLocked(connection)`: bepaalt dat bestaande handmatige waypoints niet automatisch worden overschreven.

Deze helpers maken de gedragsregels testbaar zonder browserinteractie.

## Randgevallen

- Nieuwe lijn tussen gestapelde elementen moet verticaal netjes lopen.
- Nieuwe lijn tussen naast elkaar staande elementen moet horizontaal netjes lopen.
- Nieuwe lijn naar timer/event/gateway gebruikt de rand van de vorm, niet het midden.
- Een route zonder opgeslagen waypoints mag bij selectie nog steeds een standaard handle tonen.
- Routes met bestaande `waypoints` worden niet vervangen door nieuwe automatische waypoints.
- Viewer mode mag geen drag handles of drawing controls tonen.

## Teststrategie

Tests eerst uitbreiden rond `src/test/processCanvasManualConnections.test.tsx`.

Te dekken:

- Nieuwe route krijgt automatisch source/target sides.
- Nieuwe route krijgt orthogonale standaard waypoints.
- Draggen van een knikpunt bewaart handmatige waypoints.
- Bestaande handmatige waypoints blijven behouden wanneer dezelfde canvas opnieuw rendert.
- Viewer mode toont geen lijn-teken controls of waypoint handles.
- Bestaande tests voor timers, dubbelklik/insert en editor mode blijven groen.

## Acceptatiecriteria

- Nieuwe lijnen snappen automatisch netjes op taken, timers en gateways.
- Nieuwe lijnen hebben direct sleepbare hoeken.
- Handmatig aangepaste lijnen veranderen niet vanzelf.
- Viewer mode blijft read-only.
- De bestaande proceseditor-interacties blijven werken.
- De relevante tests en build slagen.
