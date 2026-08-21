# Workflow Matrix Automation Preview Design

## Doel
Op `/automation-navigator` moet elke workflowkaart klikbaar zijn, zodat je direct kunt zien wat de automation precies doet zonder de matrix te verlaten.

## Gebruikerservaring
- Een klik op een workflowkaart opent een rechter detailpaneel.
- De matrix blijft zichtbaar op de achtergrond.
- Het paneel toont beheerinformatie in vaste blokken:
  - naam, status, bron en HubSpot/external ID;
  - gekoppelde pipeline en stagecontext;
  - doel en triggerbeschrijving;
  - systemen en stappen/actions;
  - run-informatie zoals laatste run en aantal runs in 365 dagen;
  - technische details uit `import_proposal` of payload in een inklapbaar blok.
- Inactieve workflows blijven duidelijk herkenbaar met statuslabel, maar krijgen geen extra navigatiegedrag.

## Architectuur
- `WorkflowMatrix.tsx` beheert een lokale `selectedWorkflow` state.
- `WorkflowCard` krijgt `onSelect` en wordt een button/article hybride met goede keyboard-focus.
- Een nieuwe kleine component, bijvoorbeeld `WorkflowPreviewPanel`, rendert het detailpaneel.
- Er wordt geen extra query toegevoegd; de preview gebruikt dezelfde automation-data die al geladen is voor de matrix.

## Data
De preview gebruikt velden die al op `WorkflowMatrixAutomation` beschikbaar zijn:
- `naam`, `status`, `source`, `external_id`/`externalId`;
- `doel`, `trigger_beschrijving`/`trigger`, `systemen`, `stappen`;
- `pipeline_id`, `stage_id`;
- `hubspotLastRunAt`, `hubspotRunCount365d`;
- `import_proposal`.

Ontbrekende velden worden expliciet als "Niet bekend" getoond, zodat lege data zichtbaar blijft voor beheer.

## Foutafhandeling
- Als er geen workflow geselecteerd is, is het paneel gesloten.
- Als technische details geen object zijn, wordt het raw veld niet getoond.
- Lange teksten en JSON krijgen scrollbare containers zodat de pagina niet uitrekt.

## Tests
- UI-test: klikken op een workflow opent het previewpaneel.
- UI-test: paneel toont naam, status, trigger/doel en stappen.
- UI-test: sluiten van het paneel verbergt de preview.
- Regressie: bestaande matrix-groepering en filters blijven werken.
