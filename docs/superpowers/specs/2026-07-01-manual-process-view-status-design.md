# Manual Process View Status Design

## Doel
Procesviews krijgen een handmatig instelbare beheerstatus. Deze status vervangt de huidige automatische tekst in de kolom `Processtatus` in de Proces Cockpit.

## Statussen
De toegestane statussen zijn:

- `Niet ingericht`: procesflow en automations zijn allebei nog niet gedaan.
- `Procesflow gereed`: procesflow staat goed, maar automations moeten nog geplaatst of gekoppeld worden.
- `In review`: procesflow en automations staan goed en moeten nog gecontroleerd worden.
- `In orde`: alles is gecontroleerd en akkoord.

## UI
- De bestaande kolom `Processtatus` blijft bestaan, maar toont voortaan de handmatige status.
- De badge wordt direct wijzigbaar via een dropdown in de cockpitrij.
- De status is ook zichtbaar en wijzigbaar in het detailpaneel van de geselecteerde procesview.
- De bestaande automatische signalen blijven zichtbaar in andere kolommen:
  - `Kwaliteit`: readiness-score.
  - `Model`: aantal stappen/routes/automations.
  - `Errors`: Sentry-signalen.
  - `Export`: exportgereedheid.
- Het statusfilter boven de tabel filtert op deze vier handmatige statussen.

## Opslag
- De status hoort bij onze procesview, niet bij de HubSpot-pipeline.
- Daarom wordt de status opgeslagen op `process_state`.
- Nieuwe kolom: `manual_status`.
- Default voor bestaande of ontbrekende records: `niet_ingericht`.
- Een statuswijziging mag een `process_state` record aanmaken zonder procesmodel, zodat ook pipelines zonder uitgewerkte procesview alvast beoordeeld kunnen worden.

## Data Flow
- `fetchProcessState` en `fetchAllProcessStates` lezen `manual_status`.
- `saveProcessState` bewaart `manual_status` mee wanneer een procesview wordt opgeslagen.
- Een aparte helper/mutatie, bijvoorbeeld `updateProcessManualStatus(pipelineId, status)`, past alleen de status aan en behoudt bestaande process_state-data.
- Na opslaan worden `processState` en alle cockpitdata opnieuw geinvalidieerd via TanStack Query.

## Defaults En Compatibiliteit
- Oude records zonder `manual_status` tonen `Niet ingericht`.
- Als een pipeline geen `process_state` heeft, toont de cockpit ook `Niet ingericht`.
- De automatische `row.needsAttention`, `row.exportReady` en readiness-score blijven bestaan voor controle, maar bepalen niet meer de tekst in `Processtatus`.

## Tests
- Storage-test: `manual_status` wordt gelezen, opgeslagen en valt terug naar `niet_ingericht`.
- Model/UI-test: de Proces Cockpit toont de handmatige status in de kolom `Processtatus`.
- UI-test: status dropdown wijzigt de status en toont de nieuwe waarde.
- Filtertest: statusfilter toont alleen rijen met de gekozen handmatige status.
- Regressie: automatische kwaliteit, errors en export blijven zichtbaar.
