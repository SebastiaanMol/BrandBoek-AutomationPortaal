# Proces Editor Selected Line Focus Design

## Doel

In de Proces Editor moet een geselecteerde lijn direct herkenbaar zijn en vooraan liggen, zodat handmatige knikpunten en ankerpunten makkelijk te pakken blijven. Dit gedrag geldt alleen in edit mode.

## Scope

In scope:

- Geselecteerde route visueel duidelijker maken.
- Geselecteerde route boven andere routes renderen.
- Waypoint-handles van geselecteerde handmatige routes beter zichtbaar en makkelijker klikbaar maken.
- Bestaande route-data ongemoeid laten.
- Viewer mode read-only en visueel rustig houden.

Niet in scope:

- Nieuwe routingregels.
- Automatisch herrouteren van bestaande lijnen.
- Nieuwe route-inspector of detailpaneel.
- Selectiegedrag in viewer mode.

## Gebruikersgedrag

Wanneer de gebruiker in edit mode op een lijn klikt:

1. De lijn wordt geselecteerd.
2. De geselecteerde lijn komt visueel boven andere routes te liggen.
3. De lijn krijgt een duidelijke focus-stijl zonder zijn route-type kleur te verliezen.
4. Handmatige waypoint-handles worden groter en duidelijker.
5. De gebruiker kan de waypoint-handles slepen zoals nu.

Wanneer de gebruiker een andere lijn selecteert, verhuist de focus naar die lijn. Wanneer de editor in viewer/read-only mode staat, verandert dit gedrag niet.

## Ontwerpkeuze

We gebruiken aanpak A: de geselecteerde route wordt als laatste binnen de route-layer gerenderd. Dit houdt de wijziging beperkt tot presentatie en interactie-zichtbaarheid. De opgeslagen `Connection` blijft hetzelfde.

De route-layer splitst verbindingen conceptueel in:

- Niet-geselecteerde verbindingen.
- De geselecteerde verbinding.

De geselecteerde verbinding wordt na de rest getekend. Daardoor liggen stroke, hitbox, labels en handles boven conflicterende routes.

## Visuele Regels

De geselecteerde lijn behoudt zijn routekleur:

- Hoofdroute blijft blauw.
- Correctie/optioneel blijft oranje en dashed.
- Uitzondering/einde blijft rood.

De selectie voegt alleen focus toe:

- Een iets dikkere zichtbare stroke.
- Een subtiele lichte outline of glow achter de route.
- Grotere waypoint-handles.
- Een royale transparante hitbox blijft aanwezig voor makkelijk selecteren.

De focus-stijl moet duidelijk zijn maar niet lijken op een ander route-type.

## Componenten

De wijziging hoort primair in `src/components/process/ProcessCanvas.tsx`.

Verwachte aanpassingen:

- Route-rendering sorteren of splitsen zodat `selectedConnectionId` als laatste komt.
- De bestaande `selected` prop blijven gebruiken voor styling.
- Waypoint-handle-afmetingen verhogen wanneer `selected === true`.
- Alleen toepassen wanneer `readOnly === false`.

Als helperlogica nodig is, blijft die lokaal en klein, bijvoorbeeld:

- `splitSelectedConnection(connections, selectedConnectionId)`
- `routeFocusStrokeWidth(selected)`
- `waypointHandleSize(selected)`

## Randgevallen

- Als de geselecteerde verbinding niet meer bestaat, wordt niets extra gerenderd.
- Labels van de geselecteerde route blijven klikbaar/bewerkbaar zoals nu.
- De transparante hitbox mag niet voorkomen dat nodes nog selecteerbaar blijven wanneer je duidelijk op een node klikt.
- Viewer mode toont geen extra focus-stijl voor routebewerking.
- Handmatige routes met meerdere knikpunten moeten alle handles vooraan tonen.

## Teststrategie

Tests richten zich op regressierisico rond editor versus viewer:

- In edit mode krijgt een geselecteerde route de focus-stijl.
- In edit mode worden waypoint-handles van geselecteerde handmatige routes getoond.
- Viewer/read-only mode toont geen waypoint-handles.
- Bestaande route-interacties blijven werken: lijn selecteren, waypoint slepen, nieuwe lijn tekenen.

Waar DOM-volgorde betrouwbaar testbaar is, controleren we dat de geselecteerde route na de andere routes gerenderd wordt. Anders testen we via zichtbare selectie-attributen/classes en een browser-smoke test.

## Acceptatiecriteria

- Een geselecteerde lijn is direct visueel herkenbaar.
- De geselecteerde lijn ligt boven andere lijnen.
- Waypoint-handles zijn makkelijker te pakken.
- Alleen edit mode verandert.
- Viewer mode blijft read-only.
- Bestaande lijnteken- en waypoint-interacties blijven werken.
