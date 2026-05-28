# Bronkwaliteit En Webhook-Match Matrix

## Doel

Maak een betrouwbare funderingspagina voor procesreisvorming. De pagina laat zien welke bronautomations een matchbare webhook of endpoint hebben, welke automations individueel/native zijn, en welke exacte webhook-naar-endpoint matches procesreisvoorstellen mogen vormen.

Deze stap lost geen brondata op en maakt geen nieuwe procesreizen aan. De pagina maakt zichtbaar waar bewijs bestaat en waar brondata ontbreekt.

## Probleem

Het portaal bevat veel losse automations uit HubSpot, Zapier, GitLab en Typeform. Niet elke automation hoort in een procesreis. Veel HubSpot workflows zijn native HubSpot-logica zonder externe overdracht. Zapier bevat veel simpele app-to-app automations. GitLab bevat zowel echte API endpoints als oudere bestandsimports zonder specifiek endpoint-record.

Zonder aparte bronkwaliteit- en matchlaag ontstaat verwarring:

- gebruikers verwachten webhooks bij automations waar die functioneel niet nodig zijn;
- procesreisvoorstellen kunnen lijken alsof bewijs ontbreekt, terwijl de automation simpelweg individueel is;
- echte brondata-gaps zijn moeilijk te onderscheiden van normale native automations;
- de review cockpit wordt te veel de plek waar bronkwaliteit, matching en procesbetekenis door elkaar lopen.

## Uitgangspunten

- HubSpot is meestal de source of truth.
- De API/GitLab is de plek voor complexe verwerking en systeemintegraties.
- Typeform is vooral intake en telt als processtartpunt wanneer er een actieve webhook is.
- Zapier is vooral simpel/legacy en telt alleen als procesreisschakel wanneer er een webhook-handoff is.
- Procesreisvorming blijft webhook-only: alleen exacte genormaliseerde route-matches tellen als bewijs.
- AI mag helpen met beschrijven, niet met bewijzen.

## Dataregels

Een automation telt als `matchbaar` wanneer:

- HubSpot: er een workflow action is met een bruikbare `webhookPath` of `webhookUrl`.
- Zapier: er een handoff staat in `importProposal.zap.process.webhookHandoffs` of `step.webhookPaths`.
- Typeform: er een actieve webhook met path staat in `importProposal.typeform.webhooks`.
- GitLab: er een receiver endpoint staat in `gitlabEndpoint.endpoint`, `importProposal.gitlab_endpoint.endpoint`, `importProposal.gitlab.endpoint.path` of `endpoints`.

Een automation telt als `individueel/native` wanneer:

- er geen matchbaar webhook/endpoint path is;
- de brondata wel voldoende is om te begrijpen dat de automation intern werkt.

Een automation telt als `brondata onvolledig` wanneer:

- workflow/form/zap/endpoint brondata ontbreekt;
- actions/steps/webhooks/endpoints ontbreken waar die nodig zijn om overdracht te beoordelen;
- er een open finding is zoals `source_missing`, `source_data_incomplete` of `webhook_changed`.

## UI Ontwerp

### Pagina

Nieuwe of bestaande tab binnen Processes, voorlopig bijvoorbeeld:

`Processes -> Bronkwaliteit`

De pagina bestaat uit twee hoofddelen:

1. Bronkwaliteit overzicht
2. Webhook-match matrix

### Header

Toon:

- titel: `Bronkwaliteit voor procesreizen`
- korte uitleg: `Alleen exacte webhook/endpoint matches mogen procesreizen vormen. Automations zonder webhook zijn niet automatisch fout; vaak zijn ze individuele of native automations.`
- laatst gesynchroniseerd wanneer beschikbaar

### Bronkwaliteit Overzicht

Vier bronkaarten:

- HubSpot
- Zapier
- GitLab/API
- Typeform

Elke kaart toont:

- totaal aantal automations
- aantal met matchbare webhook/endpoint
- aantal zonder matchbare route
- aantal met brondata-gaps
- korte interpretatie

Voorbeeldinterpretatie:

`HubSpot: de meeste workflows zijn native HubSpot-logica. Alleen workflows met webhook-action kunnen een procesreis-overdracht starten.`

### Detailtabel Per Bron

Een compacte tabel met tabs per bron:

Kolommen:

- Automation
- Status
- Routebewijs
- Classificatie
- Waarom
- Actie

Classificaties:

- `Matchbaar`
- `Individueel/native`
- `Brondata incompleet`
- `Legacy import`

Acties:

- `Open detail`
- optioneel `Bekijk raw data`

### Webhook-Match Matrix

Een tweede sectie toont alleen de harde technische matches.

Links:

- webhook-zenders uit HubSpot, Zapier en Typeform

Rechts:

- GitLab/API receiver endpoints

Een match verschijnt wanneer:

- de genormaliseerde route exact gelijk is;
- bijvoorbeeld `/properties/ib/finished_webhook` == `/properties/ib/finished_webhook`.

Elke matchrij toont:

- source automation
- source route
- target endpoint
- target automation
- bewijslabel: `100% webhook-match`
- actie: `Review procesreisvoorstel`

Routes zonder match komen in een aparte lijst:

- `Webhook zonder receiver`
- `Endpoint zonder bekende afzender`

Dit zijn geen procesreizen, maar bronkwaliteit of analysepunten.

## Componentstructuur

- `SourceQualityMatrixPage`
- `sourceQualityMatrixPresentation`
- `SourceQualitySummaryCards`
- `SourceQualityAutomationTable`
- `WebhookMatchMatrix`
- `WebhookUnmatchedRoutes`

De presenter krijgt `Automatisering[]` en optioneel open source findings. De UI gebruikt alleen presenter-output.

## Relatie Tot Bestaande Pagina's

- Automation detailpagina blijft uitleggen wat een automation doet.
- Procesreis-review blijft beoordelen of een voorgestelde keten klopt.
- Deze nieuwe pagina verklaart waarom een automation wel/niet procesreis-ready is.
- Procesreisvoorstellen mogen alleen uit de matchmatrix komen.

## Fouten En Edge Cases

- Als brondata niet geladen kan worden: toon lege state met retry.
- Als een route meerdere receivers matcht: toon als `meerdere mogelijke receivers` en blokkeer automatisch goedkeuren.
- Als meerdere senders hetzelfde endpoint aanroepen: toon alle senders; dit kan meerdere procesreisvoorstellen opleveren.
- Als een route alleen uit opgeslagen suggestie komt maar niet uit brondata: toon als `opgeslagen match`, niet als nieuwe matrix-match.

## Testplan

Presenter tests:

- HubSpot workflow met webhookPath wordt `Matchbaar`.
- HubSpot workflow zonder webhook-action wordt `Individueel/native`.
- HubSpot zonder actions wordt `Brondata incompleet`.
- Zapier met webhookHandoff wordt `Matchbaar`.
- Zapier zonder webhookHandoff wordt `Individueel/native`.
- Typeform met actieve webhook wordt `Matchbaar`.
- Typeform zonder webhooks wordt `Brondata incompleet`.
- GitLab endpoint record wordt receiver.
- Legacy GitLab file import wordt `Legacy import`.
- Exacte normalized route-match vormt `100% webhook-match`.
- Route mismatch vormt geen match.

UI tests:

- pagina toont vier bronkaarten;
- bronfilter/tabs werken;
- tabel toont classificaties;
- matchmatrix toont exacte matches;
- unmatched webhooks/endpoints staan apart;
- detail-links werken.

Browserchecks:

- desktop geen horizontale overflow;
- mobile tabel wordt scanbaar of stackt;
- matchmatrix blijft leesbaar met veel routes.

## Buiten Scope

- Geen nieuwe synclogica.
- Geen database-migratie.
- Geen AI-verrijking.
- Geen customer lifecycle visualisatie.
- Geen property-update naar workflow-trigger detectie.
- Geen automatische goedkeuring van procesreizen.

## Open Beslissing

De pagina kan als aparte tab onder `Processes` komen of als onderdeel van de bestaande procesreisvoorstellen. Aanbevolen is een aparte tab, omdat dit bronkwaliteit en technische matchbaarheid uitlegt voordat iemand procesreizen reviewt.
