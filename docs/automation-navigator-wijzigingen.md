# Automation Navigator Wijzigingenlog

Dit document is de vaste plek waar inhoudelijke wijzigingen aan Automation Navigator worden vastgelegd.

## Vaste Werkafspraak

Bij elke inhoudelijke wijziging aan de portal, analysepipeline, flowlogica, documentatie of Supabase-integratie moet deze wijzigingenlog worden bijgewerkt.

Gebruik per wijziging deze structuur:

```text
1. Wat is aangepast?
2. Waarom is het aangepast?
3. Welke bestanden zijn geraakt?
4. Wat is het effect voor de gebruiker?
5. Wat is getest?
6. Welke open punten blijven over?
```

Deze afspraak geldt ook voor experimentele pagina's, analyse-artifacts, scripts, Supabase edge functions en documentatie.

Belangrijke randvoorwaarde:

```text
gitlabtest/ blijft read-only analyse-input.
Wijzigingen aan runtimegedrag horen niet in gitlabtest/.
```

## 2026-05-24 - Automatiseringspagina Als Beslis-dashboard

### Wat Is Aangepast?

De automatiseringspagina heeft nu een compacte beslis-dashboardlaag gekregen.

Elke automation blijft als rustige lijstregel zichtbaar, maar kan worden uitgeklapt naar een proceslijn:

```text
Trigger -> Acties -> Outcome
```

Daaronder staan compacte bewijs-badges die laten zien welke brondata de samenvatting ondersteunt.

De bronmapping gebruikt bestaande data uit:

- HubSpot workflow triggers, actions, webhooks en run-data
- Zapier processtappen, condities, lookups en webhook-overdrachten
- GitLab endpoints, handlers en herkende HubSpot reads/writes
- Typeform formulierstructuur, hidden fields en actieve webhooks

### Waarom?

De gebruiker wil de automatiseringspagina gebruiken om snel te begrijpen wat een automation doet.

Daarom toont de lijst niet alle ruwe brondata direct, maar vertaalt de belangrijkste broninformatie naar een korte, vergelijkbare procesuitleg per automation.

### Geraakte Bestanden

```text
src/lib/automationOverviewPresentation.ts
src/pages/AlleAutomatiseringen.tsx
src/test/automationOverviewPresentation.test.ts
src/test/automationsOverviewUi.test.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De gebruiker kan per automation nu sneller zien:

- waardoor de automation start
- welke hoofdactie er gebeurt
- wat de verwachte uitkomst is
- welk bewijs uit de brondata beschikbaar is

Er kan steeds maar een automation tegelijk openstaan, zodat de pagina rustig blijft.

### Getest

Uitgevoerd:

```bash
npx vitest run src/test/automationOverviewPresentation.test.ts src/test/automationsOverviewUi.test.tsx
npm run test
npm run build
npm run lint
```

Resultaat:

- 60 testbestanden geslaagd
- 332 tests geslaagd, 3 todo
- productie-build geslaagd
- lint zonder errors, met bestaande Fast Refresh/useMemo warnings

### Open Punten

Browsercontrole op echte data blijft nuttig om te beoordelen of de bewijs-badges precies de juiste informatiedichtheid hebben.

## 2026-05-08 - Genest GitLab Backendblok In Procesreis

### Wat Is Aangepast?

De procesreis-keten groepeert GitLab automations nu in een herkenbaar backendblok.

In plaats van losse technische GitLab-stappen op hetzelfde niveau als HubSpot toont de keten nu:

```text
Startsignaal van HubSpot workflow
↓
HubSpot workflow
↓
GitLab backendblok
  - GitLab automation 1 met eigen mini-funnel
  - GitLab automation 2 met eigen mini-funnel
↓
HubSpot update
↓
Nieuw signaal
↓
Vervolgprocessen
```

Binnen het GitLab backendblok blijven losse GitLab automations apart zichtbaar. Elke automation toont kort wat hij start, leest, bepaalt en schrijft.

### Waarom?

De gebruiker wil de procesreis als bedrijfsverhaal zien, maar binnen het backendstuk wel grip houden op welke GitLab automations precies meedoen.

Daarom is het model nu genest:

```text
Procesreis = verhaal over systemen heen
GitLab backendblok = backendstuk binnen die reis
GitLab automation = concrete endpoint/worker binnen dat backendstuk
```

### Geraakte Bestanden

```text
src/lib/flowRuntimeChain.ts
src/components/flows/FlowRuntimeChain.tsx
src/components/flows/FlowProcessJourneyCard.tsx
src/test/flowRuntimeChain.test.ts
docs/gitlab-backend-automation-handleiding.md
docs/hubspot-automation-handleiding.md
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De procesreis-detailpagina maakt duidelijker:

- welk deel HubSpot doet
- waar het GitLab backendblok begint
- welke GitLab automations binnen dat backendblok zitten
- wat elke GitLab automation intern doet
- wanneer er weer HubSpot-state ontstaat

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

### Open Punten

Browsercontrole van de procesreis-detailpagina blijft nodig om spacing en leesbaarheid op echte data te beoordelen.

## 2026-05-08 - Browsercontrole Procesreis Na GitLab Backendblok

### Wat Is Aangepast?

Geen functionele codewijziging. De procesreis-pagina is live in de browser gecontroleerd via de bestaande ingelogde Chrome-context.

Gecontroleerde routes:

```text
/flows
/flows/d71f578e-83f1-4710-b4aa-55fde1d3896c
/alle?open=AUTO-HS-1692171427
```

Screenshots zijn lokaal opgeslagen in:

```text
tmp/processreis-overview-live.png
tmp/processreis-detail-live.png
tmp/processreis-detail-desktop-live.png
tmp/processreis-open-automation-live.png
```

### Waarom?

Na de wijziging naar een genest GitLab backendblok moest gecontroleerd worden of de echte applicatie nog goed navigeert en of de procesreis-detailpagina begrijpelijk blijft.

### Geraakte Bestanden

```text
docs/automation-navigator-wijzigingen.md
tmp/processreis-overview-live.png
tmp/processreis-detail-live.png
tmp/processreis-detail-desktop-live.png
tmp/processreis-open-automation-live.png
```

### Effect Voor De Gebruiker

Bevestigd in de browser:

- de procesreizen-overzichtspagina laadt
- de tab `Conceptprocesreizen` toont 14 open concepten
- de procesreis-detailpagina toont het nieuwe `GitLab backendblok`
- de GitLab automation staat binnen dat backendblok met mini-funnel
- de oude canvasweergave staat niet meer op de detailpagina
- `Open automation` navigeert naar de automation beheerpagina met de automation-modal open

### Getest

Live browsercontrole via Playwright/CDP op de ingelogde Chrome-context.

Daarnaast eerder uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Consolecontrole:

```text
Geen page errors gevonden.
Alleen bekende React Router future-flag warning gezien.
```

### Open Punten

Geen blokkade gevonden. De pagina is inhoudelijk werkend. Eventuele volgende stap is visueel finetunen op basis van gebruikersgevoel, niet het oplossen van een runtimefout.

## 2026-05-08 - RuntimeJourney Crashfix Voor GitLab Backendblok

### Wat Is Aangepast?

De conceptprocesreis-detailpagina en de experimentele Blob-pagina kenden het nieuwe runtime-staptype `gitlab_backend_block` nog niet in hun icon/style mappings.

Daardoor kon `RuntimeJourney` crashen met:

```text
Element type is invalid: expected a string ... but got: undefined
```

Toegevoegd:

```text
gitlab_backend_block -> GitBranch icon
gitlab_backend_block -> paarse backendblok-styling
```

### Waarom?

`buildFlowRuntimeChain` levert sinds de geneste procesketen geen losse `gitlab_worker` stap meer op, maar een `gitlab_backend_block`. Alle renderplekken moeten dat type kennen.

### Geraakte Bestanden

```text
src/pages/FlowSuggestionDetail.tsx
src/pages/Blob.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Conceptprocesreis-details openen weer zonder crash. Het GitLab backendblok wordt ook daar correct als backendstap getoond.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live gecontroleerd:

```text
/flows
/flows/suggesties/edge%3AAUTO-HS-1692171427~AUTO-076
```

Resultaat:

```text
Geen RuntimeJourney crash meer.
Geen page errors.
Alleen bekende React Router future-flag warning.
```

### Open Punten

Geen.

## 2026-05-08 - Documentatieplicht Vastgelegd

### Wat Is Aangepast?

Er is een vaste documentatieafspraak toegevoegd voor alle toekomstige inhoudelijke wijzigingen.

### Waarom?

Zodat zichtbaar blijft:

- wat er is aangepast
- waarom het is aangepast
- welke bestanden geraakt zijn
- wat het effect voor gebruikers is
- wat getest is
- welke open punten overblijven

### Geraakte Bestanden

```text
docs/automation-navigator-wijzigingen.md
docs/codebase-chatgpt-context.md
```

### Effect Voor De Gebruiker

Beslissingen en wijzigingen worden beter navolgbaar. Nieuwe sessies met Codex of ChatGPT kunnen sneller begrijpen wat er al gedaan is.

### Getest

Niet van toepassing. Dit is documentatie.

### Open Punten

Deze wijzigingenlog moet voortaan actief worden bijgewerkt bij elke inhoudelijke wijziging.

## 2026-05-08 - GitLab Backend Automation Handleiding

### Wat Is Aangepast?

Er is een handleiding toegevoegd die uitlegt wat een GitLab/backend automation is.

### Waarom?

Er was behoefte aan een simpele, gedeelde definitie:

```text
één endpoint
dat één backend worker start
die iets leest
iets bepaalt
iets terugschrijft
en daardoor vervolgprocessen kan starten
```

### Geraakte Bestanden

```text
docs/gitlab-backend-automation-handleiding.md
```

### Effect Voor De Gebruiker

Gebruikers en ontwikkelaars kunnen beter begrijpen waarom een GitLab automation niet een heel bestand is, maar meestal één FastAPI endpoint.

### Getest

Niet van toepassing. Dit is documentatie.

### Open Punten

De handleiding kan later worden aangevuld met concrete voorbeelden per workflowdomein, zoals BTW, IB, JR en Sales.

## 2026-05-08 - HubSpot Automation Handleiding

### Wat Is Aangepast?

Er is een handleiding toegevoegd die uitlegt wat een HubSpot automation is.

### Waarom?

De portal moet HubSpot niet behandelen als simpele datastore, maar als runtime procesmotor:

```text
HubSpot workflows = procesrouters
HubSpot properties = signalen
HubSpot deal stages = processtatussen
HubSpot associations = procesrelaties
```

### Geraakte Bestanden

```text
docs/hubspot-automation-handleiding.md
```

### Effect Voor De Gebruiker

Het verschil tussen HubSpot automations en GitLab/backend automations wordt duidelijker:

```text
HubSpot automation = procesrouter
GitLab automation = backend worker
Flow = hele ketting van signaal naar vervolgproces
```

### Getest

Niet van toepassing. Dit is documentatie.

### Open Punten

De handleiding kan later worden gekoppeld aan echte HubSpot workflowmetadata zodra die rijker beschikbaar is.

## 2026-05-08 - GitLab Endpoint Extractie Audit

### Wat Is Aangepast?

Er is een audit uitgevoerd op GitLab endpoint-automations.

### Waarom?

We wilden controleren of alle backend automations uit `gitlabtest/app/API` succesvol als endpoint-automation in de portal staan.

### Uitkomst

```text
54 endpoints gevonden in gitlabtest/app/API
51 endpoint-automations opgeslagen in Supabase
3 endpoints ontbreken
51 / 51 opgeslagen endpoint-automations hebben complete kernmetadata
```

Ontbrekende endpoints:

```text
POST /properties/bankkoppeling/sync_bedrijven_zonder_bankkoppeling_webhook
POST /sales/leads/hubspot/typeform
POST /typeform/onboarding
```

### Geraakte Bestanden / Artifacts

```text
tmp/api-endpoint-analysis.json
tmp/gitlab-automation-extraction-audit.json
tmp/gitlab-automation-quality-audit.json
```

### Effect Voor De Gebruiker

De bestaande GitLab endpoint-automations zijn inhoudelijk betrouwbaar, maar de dekking is nog niet volledig.

### Getest

Broncode-analyse is uitgevoerd met:

```bash
node scripts\analyze-api-endpoint-flows.mjs
```

Daarna is vergeleken met live Supabase-data via de ingelogde browser-sessie.

### Open Punten

De 3 ontbrekende endpoints moeten nog via GitLab sync/import in Supabase komen.

## 2026-05-08 - Flowpagina Naar Procesreizen

### Wat Is Aangepast?

De flowpagina is aangepast zodat hij niet alleen bevestigde flows toont, maar ook conceptuele procesreizen uit suggesties.

### Waarom?

Na het leegmaken van bestaande flows had `/flows` geen bevestigde flows meer. Toch waren er wel suggesties en automation-ketens. De gebruiker moest kunnen zien hoe werk door het bedrijf beweegt, ook vóórdat een flow officieel is opgeslagen.

### Geraakte Bestanden

```text
src/pages/Flows.tsx
src/components/flows/FlowProcessJourneyCard.tsx
src/lib/flowSuggestionDetailIds.ts
```

### Effect Voor De Gebruiker

De flowpagina start nu met **Procesreizen**:

```text
startsignaal
↓
HubSpot workflow
↓
GitLab/backend worker
↓
HubSpot state write
↓
vervolgproces
```

De procesreizen worden opgebouwd per startsignaal en endpoint. Grote clusters worden daardoor beter leesbaar.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Ook live getest in de browser op:

```text
http://localhost:8080/flows
```

### Open Punten

De menselijke tekst van sommige state writes is nog afgeleid en kan later rijker worden gemaakt met betere read/write-property analyse.

## 2026-05-08 - Suggestie Detailpagina Naar Concept-Procesreis Review

### Wat Is Aangepast?

De suggestie-detailpagina is omgebouwd van technische automation-keten review naar concept-procesreis review.

### Waarom?

De pagina moest niet centraal vragen:

```text
Zijn deze twee technische automations gekoppeld?
```

Maar:

```text
Klopt deze gereconstrueerde procesreis?
```

### Geraakte Bestanden

```text
src/pages/FlowSuggestionDetail.tsx
src/lib/flowSuggestionDetailIds.ts
```

### Effect Voor De Gebruiker

De pagina toont nu:

- procesverhaal
- visuele procesreis
- bewijs
- impact
- betrokken automations
- review-acties

Technische review staat ingeklapt onder:

```text
Technische review en overgangen tonen
```

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Ook live getest door vanaf `/flows` op **Bekijk details** te klikken.

### Open Punten

De acceptatie-flow kan nog duidelijker worden gemaakt: eerst “Bevestig procesreis”, daarna “Accepteer als Flow”.

## 2026-05-08 - Automation Funnel En GitLab Vindbaarheid

### Wat Is Aangepast?

Er is een automation funnel toegevoegd voor GitLab/backend automations.

### Waarom?

Gebruikers wilden onder een automation kunnen zien:

```text
wat start dit?
wat leest het?
wat bepaalt het?
wat schrijft het?
wat gebeurt daarna?
waar staat het in GitLab?
```

### Geraakte Bestanden

```text
src/lib/automationFunnel.ts
src/components/AutomationFunnel.tsx
src/components/GitLabLocationCard.tsx
src/components/flows/AutomationDetail.tsx
src/test/automationFunnel.test.ts
```

### Effect Voor De Gebruiker

GitLab/backend automations worden minder technisch gepresenteerd en meer als runtime-stap.

### Getest

Uitgevoerd:

```bash
npm run test -- --run src/test/automationFunnel.test.ts
```

Later ook meegenomen in gecombineerde testsets.

### Open Punten

De uitleg kan nog preciezer worden als property read/write-analyse rijker wordt.

## 2026-05-08 - Flow Reset En Regeneratie

### Wat Is Aangepast?

Alle bestaande flows, flow-suggesties en bevestigde automation links zijn live verwijderd en daarna zijn suggesties opnieuw gegenereerd.

### Waarom?

De oude flowdata bevatte verouderde koppelingen en oude GitLab bestand-records. De gebruiker wilde opnieuw beginnen.

### Uitkomst

Verwijderd:

```text
2 flows
31 automatisering_ai_flows
41 automation_links
```

Daarna opnieuw gegenereerd:

```text
27 suggesties
27 hoge zekerheid
0 bevestigde flows
```

Gemini AI batches kregen een `429 rate limit`, waardoor alleen webhook/endpoint-suggesties opnieuw zijn gevuld.

### Backup

Er is eerst een backup gemaakt:

```text
tmp\flow-reset-backups\flow-reset-2026-05-08T08-54-59-280Z.json
```

### Effect Voor De Gebruiker

De flowdata is opgeschoond. De flowpagina werkt nu vanaf concept-procesreizen in plaats van oude bevestigde flows.

### Getest

Live getest in de browser op `/flows`.

### Open Punten

AI-suggesties kunnen opnieuw worden gedraaid wanneer de Gemini rate limit voorbij is of wanneer retry/backoff is toegevoegd.

## 2026-05-08 - Flows Hernoemd Naar Procesreis

### Wat Is Aangepast?

De pagina in het menu heet nu `Procesreis` in plaats van `Flows`.

De pagina zelf is opnieuw ingedeeld rond twee tabs:

```text
Procesreizen
Conceptprocesreizen
```

`Procesreizen` toont bevestigde procesreizen. `Conceptprocesreizen` toont gereconstrueerde routes die nog beoordeeld moeten worden.

### Waarom?

De gebruiker wil niet denken vanuit losse technische flows, maar vanuit de reis van werk door het bedrijf:

```text
startsignaal
-> HubSpot automation
-> GitLab/backend automation
-> HubSpot state write
-> vervolgproces
```

### Geraakte Bestanden

```text
src/components/AppLayout.tsx
src/pages/Flows.tsx
docs/codebase-chatgpt-context.md
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De pagina voelt nu meer als een procesreis-overzicht:

- bevestigde routes staan apart
- conceptroutes staan apart
- technische suggesties zitten ingeklapt onder de concepttab
- de menu-benaming sluit beter aan op de gewenste taal

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser op:

```text
/flows
/flows -> tab Conceptprocesreizen
```

### Open Punten

De detailpagina moet nog dezelfde taal volledig volgen: procesreis eerst, technische flowdetails pas daarna.

## 2026-05-08 - Conceptprocesreizen Als Tabel

### Wat Is Aangepast?

De tab `Conceptprocesreizen` toont voorstellen nu als compacte tabel in plaats van grote proceskaarten.

De tabelkolommen zijn:

```text
Startsignaal
HubSpot automation
GitLab worker / endpoint
Zekerheid
Impact
Status
```

Een klik op een rij opent de bestaande detailpagina van die conceptprocesreis.

### Waarom?

Conceptprocesreizen zijn een werkvoorraad. De gebruiker moet snel kunnen scannen, vergelijken en daarna pas doorklikken naar de uitgebreide procesreis-uitleg.

### Geraakte Bestanden

```text
src/pages/Flows.tsx
src/components/FlowSuggestiesTab.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De conceptlijst is rustiger en beter scanbaar. De detailpagina blijft de plek voor het volledige verhaal van de procesreis.

Ook de ingeklapte technische suggestielijst gebruikt nu `procesreis`-taal in plaats van oude `flow`-taal.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser op `/flows`:

- tab `Conceptprocesreizen` toont 14 rijen
- klik op eerste rij opent de bestaande detailpagina
- keyboard Enter op een rij opent de detailpagina
- mobiele viewport laadt de tabel zonder crash
- technische suggestielijst opent en gebruikt procesreis-taal
- geen page errors gevonden

### Open Punten

De tabel kan later nog filters krijgen voor zekerheid, domein, endpoint en impact.

## 2026-05-08 - Detailpagina Labels Naar Procesreis

### Wat Is Aangepast?

Resterende oude flow-labels op de conceptprocesreis-detailpagina zijn vervangen door procesreis-labels.

Voorbeelden:

```text
Accepteer als Flow -> Accepteer als procesreis
Flow opslaan -> Procesreis opslaan
Terug naar flows -> Terug naar procesreizen
Klopt deze gereconstrueerde flow? -> Klopt deze gereconstrueerde procesreis?
```

### Waarom?

De gebruiker zag nog oude flow-taal op de detailpagina. Dat maakte de nieuwe procesreis-denkwijze inconsistent.

### Geraakte Bestanden

```text
src/pages/FlowSuggestionDetail.tsx
src/components/FlowConfirmDialog.tsx
src/components/FlowSuggestiesTab.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De detailpagina en opslaan-dialog gebruiken nu dezelfde taal als het menu en de overzichtspagina.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser:

- eerste conceptprocesreis geopend vanaf de tabel
- gecontroleerd dat `Accepteer als Flow`, `Flow opslaan`, `Terug naar flows` en `gereconstrueerde flow` niet meer zichtbaar zijn
- gecontroleerd dat `Accepteer als procesreis` wel zichtbaar is

### Open Punten

Sommige interne componentnamen en database-termen heten technisch nog `flow`; dat is acceptabel zolang de gebruikersinterface `procesreis` toont.

## 2026-05-08 - Procesreis Review Naar Een Actie

### Wat Is Aangepast?

Het reviewblok op de conceptprocesreis-detailpagina had twee acties:

```text
Bevestig procesreis
Accepteer als procesreis
```

Dat is vervangen door een enkele primaire actie:

```text
Sla op als procesreis
```

### Waarom?

Voor de gebruiker voelde bevestigen en accepteren dubbel. Een conceptprocesreis moet simpelweg worden opgeslagen als hij klopt.

### Geraakte Bestanden

```text
src/pages/FlowSuggestionDetail.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De detailpagina heeft nu een duidelijkere review-actie. Onder water gebruikt de portal nog dezelfde opslaglogica, maar de gebruiker ziet geen dubbele stap meer.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser:

- conceptprocesreis geopend vanuit de tabel
- gecontroleerd dat `Bevestig procesreis` en `Accepteer als procesreis` niet meer zichtbaar zijn
- gecontroleerd dat `Sla op als procesreis` zichtbaar is
- gecontroleerd dat de opslaan-dialog opent

### Open Punten

De onderliggende database heet technisch nog `flows`; dat hoeft niet direct te wijzigen zolang de UI procesreis-taal gebruikt.

## 2026-05-08 - AI Naamgeving Fallback Voor Procesreizen

### Wat Is Aangepast?

Wanneer AI-naamgeving voor een procesreis niet beschikbaar is, toont de portal geen rode foutmelding meer.

In plaats daarvan vult de portal automatisch een voorlopige naam en beschrijving in op basis van:

```text
eerste automation
laatste automation
endpoint-bewijs indien aanwezig
```

### Waarom?

De melding `AI-naamgeving mislukt` voelde als een fout, terwijl de gebruiker de procesreis gewoon moet kunnen opslaan en de naam zelf kan aanpassen.

### Geraakte Bestanden

```text
src/pages/FlowSuggestionDetail.tsx
src/components/FlowSuggestiesTab.tsx
src/components/FlowConfirmDialog.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De opslaan-dialog blijft bruikbaar als AI faalt. De gebruiker ziet een normale conceptnaam en beschrijving, geen blokkerende fout.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser:

- conceptprocesreis geopend
- `Sla op als procesreis` aangeklikt
- gecontroleerd dat de dialog opent
- gecontroleerd dat `AI-naamgeving mislukt` niet zichtbaar is

### Open Punten

De fallbacknaam is bewust eenvoudig. Later kan deze slimmer worden gemaakt met runtime-semantiek uit de analyse-artifacts.

## 2026-05-08 - Simpele Procesreis Beschrijving Zonder Endpointtaal

### Wat Is Aangepast?

De fallbackbeschrijving voor procesreizen is herschreven naar gewone mensentaal.

Voorbeeld:

```text
Zodra de BTW van de afgelopen twee maanden als geboekt wordt gemarkeerd, werkt het systeem automatisch het volgende kwartaal bij. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.
```

De fallbackbeschrijving gebruikt geen technische woorden zoals:

```text
POST
endpoint
webhook URL
```

### Waarom?

De gebruiker wil dat procesreizen begrijpelijk zijn voor mensen die het bedrijfsproces willen snappen, niet voor ontwikkelaars die endpointnamen lezen.

### Geraakte Bestanden

```text
src/pages/FlowSuggestionDetail.tsx
src/components/FlowSuggestiesTab.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Wanneer AI-naamgeving faalt, staat er alsnog een simpele, bruikbare beschrijving klaar die de gebruiker direct kan beoordelen en aanpassen.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser door de AI-naamfunctie te blokkeren:

- conceptprocesreis geopend
- `Sla op als procesreis` aangeklikt
- gecontroleerd dat de fallbackbeschrijving simpele taal gebruikt
- gecontroleerd dat de fallbackbeschrijving geen `POST`, `endpoint` of technisch pad bevat

### Open Punten

De fallbackregels zijn nu op basis van herkenbare woorden zoals BTW, JR, machtiging, bankkoppeling, Typeform en stage. Later kan dit worden gevoed door rijkere runtime-semantiek.

## 2026-05-08 - Simpele Procesreis Naam Zonder Techniek

### Wat Is Aangepast?

De fallbacknaam voor procesreizen is nu ook in gewone taal.

Voorbeeld:

```text
BTW vervolgkwartaal bijwerken
```

In plaats van:

```text
'BTW 2 maanden geboekt' instellen naar Update next quarter prev2m
```

### Waarom?

De naam van een procesreis moet direct duidelijk maken welk bedrijfsproces wordt geraakt, zonder worker-, endpoint- of functienaam.

### Geraakte Bestanden

```text
src/pages/FlowSuggestionDetail.tsx
src/components/FlowSuggestiesTab.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Als AI-naamgeving niet beschikbaar is, krijgt de gebruiker toch een korte, begrijpelijke naam die direct bruikbaar is.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser door de AI-naamfunctie te blokkeren:

- naam wordt `BTW vervolgkwartaal bijwerken`
- beschrijving blijft in simpele taal
- naam en beschrijving bevatten geen `POST`, endpointpad of worker-functienaam

### Open Punten

De naamregels kunnen later worden uitgebreid per domein, bijvoorbeeld voor debtor/payment, VA en VPB.

## 2026-05-08 - HubSpot Stappen Ontdubbelen

### Wat Is Aangepast?

HubSpot-workflows met vertakkingen tonen herhaalde acties nu als één begrijpelijke stap met het aantal paden erbij.

Voorbeeld:

```text
Stel 'btw_2_maanden_geboekt_huidig_kwartaal' in
Stel 'btw_2_maanden_geboekt_huidig_kwartaal' in
Stel 'btw_2_maanden_geboekt_huidig_kwartaal' in
```

Wordt:

```text
Stel 'btw_2_maanden_geboekt_huidig_kwartaal' in (3 paden)
```

### Waarom?

De automation-pagina liet bij HubSpot-workflows soms dezelfde interne stap meerdere keren zien. Dat kwam doordat HubSpot branch-paden als losse acties terugkomen. Voor gebruikers leek het daardoor alsof de workflow onnodig veel losse stappen had, terwijl het eigenlijk dezelfde actie in meerdere paden was.

Dit is belangrijk omdat procesreizen en suggesties alleen betrouwbaar kunnen zijn als de automation-brondata goed leesbaar is.

### Geraakte Bestanden

```text
src/lib/automationSteps.ts
src/lib/storage/automations.ts
src/test/automationSteps.test.ts
supabase/functions/hubspot-sync/index.ts
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

HubSpot automations worden rustiger en betrouwbaarder weergegeven:

- minder dubbele stappen
- duidelijker dat acties in meerdere paden zitten
- betere basis voor procesreis-suggesties
- minder kans op verkeerde analyse door rommelige brondata

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/automationSteps.test.ts src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser op de automation:

```text
'BTW 2 maanden geboekt' instellen
```

Gecontroleerd:

- de herhaalde property-stap wordt samengevat als `(3 paden)`
- de ruwe dubbele stap komt niet meer drie keer terug in de getoonde data
- de app blijft bouwen met alleen de bekende Vite chunk-waarschuwing

### Open Punten

De lokale terminal had geen Supabase-URL/key beschikbaar, dus ik kon geen volledige database-audit vanuit Node draaien. De volgende stap is een auditpagina of script maken dat alle HubSpot automations markeert met:

- dubbele stappen
- lege doelen
- ontbrekende triggers
- onduidelijke branch-acties
- ontbrekende simpele beschrijving

## 2026-05-08 - Procesreizen Als Tabelweergave

### Wat Is Aangepast?

De pagina `Procesreizen` gebruikt nu ook voor bevestigde procesreizen een tabelweergave.

De pagina heeft twee duidelijke lijsten:

```text
Procesreizen = bevestigde proceskaarten
Conceptprocesreizen = voorstellen die nog beoordeeld moeten worden
```

De bevestigde procesreizen tonen nu in een rustige tabel:

```text
Procesreis
Startsignaal
Domein
Systemen
Stappen
Impact
Eigenaar
Laatst bijgewerkt
```

Conceptprocesreizen blijven een reviewtabel met onder andere:

```text
Startsignaal
HubSpot automation
GitLab worker / endpoint
Zekerheid
Impact
Status
```

### Waarom?

De bevestigde procesreizen moeten niet voelen als losse cards of technische flowblokken, maar als een beheerbare officiele lijst van proceskaarten. Conceptprocesreizen moeten juist wel voelen als een reviewlijst waar nog actie op nodig is.

### Geraakte Bestanden

```text
src/pages/Flows.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Gebruikers zien sneller het verschil tussen:

- voorstellen die nog beoordeeld moeten worden
- bevestigde procesreizen die als officiele proceskaart gelden

De bevestigde tab is rustiger gemaakt en gebruikt geen bevestigingsbadge per rij.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts src/test/automationSteps.test.ts
npm run build
```

Live getest in de browser:

- `/flows` geopend
- gecontroleerd dat de tab `Procesreizen` een tabel toont
- gecontroleerd dat de tab `Conceptprocesreizen` een reviewtabel toont
- gecontroleerd dat concepten nog steeds badges/statussen hebben
- gecontroleerd dat bevestigde procesreizen geen badge per rij gebruiken

### Open Punten

De bevestigde procesreis-tabel gebruikt nu beschikbare data zoals automation IDs, systemen, eigenaar en updated timestamp. Later kan dit sterker worden met echte velden voor:

- startsignaal
- procesdomein
- eigenaar van procesreis
- laatst gecontroleerd door
- downstream impactscore

## 2026-05-08 - Aantal Open Conceptprocesreizen In Tab

### Wat Is Aangepast?

De tab `Conceptprocesreizen` toont nu direct hoeveel concepten nog openstaan om te beoordelen.

Voorbeeld:

```text
Conceptprocesreizen 14
```

### Waarom?

Conceptprocesreizen zijn een reviewbak. Door het openstaande aantal direct in de tab te tonen, wordt zichtbaar dat er nog werk ligt.

### Geraakte Bestanden

```text
src/pages/Flows.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Gebruikers zien sneller hoeveel procesreisvoorstellen nog beoordeeld moeten worden.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts src/test/automationSteps.test.ts
```

### Open Punten

Geen.

## 2026-05-08 - Meer Ademruimte Op Procesreis Detailpagina

### Wat Is Aangepast?

De procesreis-detailpagina heeft meer ruimte gekregen tussen de belangrijkste elementen:

- meer verticale ruimte tussen hoofdblokken
- grotere afstand tussen linker procesreis en rechter sidebar
- ruimere spacing in de procesketen
- iets meer padding rond de procesketen
- iets meer ruimte tussen automationkaartjes
- sectiekoppen hebben meer lucht gekregen

### Waarom?

De pagina bevat veel informatie tegelijk. Meer witruimte maakt het makkelijker om te scannen wat bij elkaar hoort.

### Geraakte Bestanden

```text
src/pages/FlowDetail.tsx
src/components/flows/FlowRuntimeChain.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De detailpagina voelt rustiger en overzichtelijker. De procesketen, automations, bewijs en sidebar zijn beter van elkaar te onderscheiden.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
```

### Open Punten

Geen.

## 2026-05-08 - Automationkaartjes In Procesreis Compacter

### Wat Is Aangepast?

De automationkaartjes onder `Automations in deze procesreis` zijn compacter gemaakt:

- minder padding
- kleinere nummerbadge
- kortere samenvatting
- compactere spacing
- kleinere open-icoon

### Waarom?

De kaartjes waren te groot voor hun functie. Ze zijn bedoeld als snelle doorklik naar het automation-record, niet als tweede detailpaneel.

### Geraakte Bestanden

```text
src/pages/FlowDetail.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Het blok neemt minder ruimte in en de procesketen blijft visueel belangrijker.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
```

### Open Punten

Geen.

## 2026-05-08 - Procesreis Headerbeschrijving Beter Leesbaar

### Wat Is Aangepast?

De beschrijving in de header van een procesreis is groter en beter leesbaar gemaakt:

- meer hoogte
- bredere tekstregel
- geen kleine scrollervaring meer
- subtiele focus/hover-styling zodat het nog wel bewerkbaar blijft

### Waarom?

De beschrijving is een van de belangrijkste onderdelen van de procesreis. Die moet direct leesbaar zijn als je de detailpagina opent.

### Geraakte Bestanden

```text
src/components/flows/FlowHeader.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De procesreis begint nu duidelijker met het menselijke verhaal van de flow, in plaats van een klein scrollbaar tekstvak.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
```

### Open Punten

Geen.

## 2026-05-08 - GitLab Stap In Procesketen Duidelijker

### Wat Is Aangepast?

De GitLab worker-stap in de procesketen heeft een concretere uitleg gekregen.

In plaats van alleen:

```text
Deze GitLab worker wordt door HubSpot aangeroepen.
```

toont de stap nu ook:

- of de worker HubSpot-data leest
- welke procesbeslissing hij maakt
- of hij de uitkomst terugschrijft naar HubSpot

Voorbeeld:

```text
Deze GitLab worker wordt door HubSpot aangeroepen, leest HubSpot-data,
bepaalt welke volgende BTW-periode bijgewerkt moet worden en schrijft de uitkomst terug naar HubSpot.
```

### Waarom?

Na het koppelen van het startsignaal aan de HubSpot workflow werd duidelijk dat de GitLab-stap zelf te weinig uitlegde wat GitLab precies doet.

### Geraakte Bestanden

```text
src/lib/flowRuntimeChain.ts
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De procesketen maakt nu beter onderscheid tussen:

- HubSpot start en routeert
- GitLab leest/berekent/schrijft terug
- HubSpot reageert daarna weer op de nieuwe status

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts
```

### Open Punten

Geen.

## 2026-05-08 - Startsignaal Visueel Gekoppeld Aan HubSpot Stap

### Wat Is Aangepast?

Het startsignaal staat in de procesketen niet meer als losse stap op de verticale lijn.

Het wordt nu boven de keten getoond als triggerkaart:

```text
Startsignaal van HubSpot workflow
hoort bij stap 1
```

Daarna begint de procesketen met de HubSpot workflow als stap 1.

### Waarom?

Het startsignaal hoort inhoudelijk bij de HubSpot workflow. Het is geen losse automation en moet dus niet voelen alsof het uit de lucht komt vallen.

### Geraakte Bestanden

```text
src/components/flows/FlowRuntimeChain.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De procesketen leest nu logischer:

```text
Startsignaal hoort bij HubSpot workflow
-> HubSpot workflow start
-> GitLab worker draait
-> HubSpot update
-> nieuw signaal
```

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts
```

### Open Punten

Geen.

## 2026-05-08 - Procesketen Relatie Tussen Signaal, HubSpot En GitLab Duidelijker

### Wat Is Aangepast?

De teksten in de procesketen zijn explicieter gemaakt:

- startsignaal vermeldt nu dat HubSpot het signaal ziet
- startsignaal vermeldt `Bron: HubSpot`
- HubSpot workflow vermeldt nu dat deze op het signaal start
- als er een GitLab worker in de procesreis zit, vermeldt de HubSpot stap dat hij de GitLab worker aanroept
- GitLab worker vermeldt dat hij door HubSpot wordt gestart

### Waarom?

De keten liet de stappen wel zien, maar maakte onvoldoende duidelijk:

```text
HubSpot ziet signaal
-> HubSpot workflow start
-> HubSpot roept GitLab worker aan
```

### Geraakte Bestanden

```text
src/lib/flowRuntimeChain.ts
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De procesketen leest nu meer als een echte kettingreactie, niet alleen als losse blokken onder elkaar.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts
```

### Open Punten

Geen.

## 2026-05-08 - Automations In Procesreis Als Doorklikkaartjes

### Wat Is Aangepast?

In de procesreis-detailpagina is het blok `Automations in deze procesreis` aangepast.

Voorheen stond daar dezelfde selectielijst als in `Snelle navigatie`. Nu staan daar losse kaartjes per automation.

Klikken op zo'n kaartje opent het volledige automation-record op de automation beheerpagina:

```text
/alle?open=<automation-id>
```

### Waarom?

De linkerkant en rechter sidebar hadden deels dezelfde functie. Daardoor was het onduidelijk of je een automation selecteerde binnen de procesreis of het echte automation-record wilde openen.

Nieuwe rolverdeling:

- `Automations in deze procesreis` = doorklikken naar het automation-record
- `Snelle navigatie` = wisselen tussen automations binnen de procesreisdetailpagina

### Geraakte Bestanden

```text
src/pages/FlowDetail.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De procesreisdetailpagina is duidelijker:

- kaartjes tonen welke automations onderdeel zijn van de procesreis
- klikken opent de automation in `Alle automations`
- de sidebar blijft verantwoordelijk voor selectie binnen de procesreis

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
```

### Open Punten

Geen.

## 2026-05-08 - Snelle Navigatie Bovenaan Procesreis Sidebar

### Wat Is Aangepast?

Op de procesreis-detailpagina staat `Snelle navigatie` nu boven de geselecteerde automation/funnel.

### Waarom?

De automation funnel kan per selectie sterk in hoogte verschillen. Daardoor versprong de sidebar tijdens het wisselen tussen automations. Door de navigatie bovenaan te zetten blijft het klikpunt stabieler.

### Geraakte Bestanden

```text
src/pages/FlowDetail.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De gebruiker kan rustiger tussen automations klikken. De navigatie blijft bovenaan staan en de wisselende details verschijnen eronder.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
```

### Open Punten

Geen.

## 2026-05-08 - Procesketen Highlight Duidelijker

### Wat Is Aangepast?

De geselecteerde stap in de procesketen heeft nu een duidelijkere highlight:

- fellere primary border
- dikkere ring
- subtiele schaduw
- het icoon links kleurt mee met de selectie

### Waarom?

De highlight was te subtiel en daardoor moeilijk te onderscheiden op de procesreis-detailpagina.

### Geraakte Bestanden

```text
src/components/flows/FlowRuntimeChain.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Het is duidelijker welke stap in de procesketen geselecteerd is en welke automation rechts wordt uitgelegd.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
```

### Open Punten

Geen.

## 2026-05-08 - Procesreis Browsercontrole En Detailverbeteringen

### Wat Is Aangepast?

De procesreizenpagina en detailpagina zijn live in de browser gecontroleerd en aangescherpt.

Aangepast:

- de procesreis-detailpagina gebruikt nu dezelfde volledige automationbron als het overzicht, inclusief legacy GitLab-records
- overgangsbewijs verdwijnt niet meer stil; als er geen bewijs is, staat er nu een duidelijke lege staat
- de oude canvas/ReactFlow-weergave blijft weg uit procesreizen
- Engelse runtime-labels zoals `Signal`, `State write` en `Emitted signal` zijn vervangen door gewone procesreistaal
- GitLab automation-details tonen nu mensentaal als hoofdtekst
- technische SDK-details zoals `Client.crm`, `basic_api` en `HubSpotAPIError` verdwijnen uit de hoofdweergave
- GitLab namen in procesreisdetails zijn simpeler gemaakt, bijvoorbeeld `Volgend BTW-kwartaal bijwerken`
- endpoint/POST-informatie blijft alleen in het GitLab-locatieblok staan, niet in de gewone uitleg
- fout opgelost waarbij de detailheader tijdelijk `NaN` kon tonen door een kapotte fallbackwaarde

### Waarom?

De procesreis moet uitleggen hoe werk door het bedrijf beweegt. De pagina moet niet voelen als een technisch schema of endpoint-overzicht.

De belangrijkste vragen moeten snel te beantwoorden zijn:

- wat start deze procesreis?
- welke HubSpot workflow doet mee?
- welke GitLab worker doet mee?
- wat verandert er in HubSpot?
- wat kan daarna gebeuren?

### Geraakte Bestanden

```text
src/pages/FlowDetail.tsx
src/pages/FlowSuggestionDetail.tsx
src/pages/Flows.tsx
src/components/flows/AutomationDetail.tsx
src/components/flows/AutomationList.tsx
src/components/flows/FlowHeader.tsx
src/components/flows/FlowRuntimeChain.tsx
src/lib/automationDisplay.ts
src/lib/automationFunnel.ts
src/lib/flowEdges.ts
src/lib/flowRuntimeChain.ts
src/test/automationFunnel.test.ts
src/test/flowEdges.test.ts
src/test/flowRuntimeChain.test.ts
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De procesreizenpagina is consistenter:

- bevestigde procesreizen staan in een tabel
- conceptprocesreizen staan in een aparte tabel met teller
- klikken op een rij opent de detailpagina
- de detailpagina toont een procesketen in gewone taal
- GitLab workers zijn zichtbaar binnen de procesreis
- technische code-details zitten niet meer in de hoofdtekst

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts src/test/automationSteps.test.ts
npm run build
```

Live getest in de browser:

- `/flows` geopend
- bevestigd dat de conceptteller zichtbaar is
- bevestigd dat er geen oude `Flow`-acties of `Visuele flow` meer zichtbaar zijn
- bevestigde procesreis geopend
- GitLab automation geselecteerd in de detailpagina
- bevestigd dat `Procesketen` en `Bewijs per overgang` zichtbaar zijn
- bevestigd dat ReactFlow/canvas niet meer aanwezig is
- bevestigd dat SDK-details niet in de hoofdtekst staan
- conceptprocesreizen-tab geopend
- eerste conceptprocesreis geopend
- bevestigd dat `Procesverhaal`, procesreis, review, opslaan en verwerpen zichtbaar zijn

Console:

- geen page errors
- alleen bekende React Router future flag waarschuwing

### Open Punten

De GitLab-locatiekaart toont bewust nog het endpoint en bestandspad. Dat is geen hoofdprocesuitleg, maar nodig om de automation terug te vinden in de bron.

## 2026-05-08 - Conceptprocesreis Label Webhook Versimpeld

### Wat Is Aangepast?

Het label `Webhook bewijs` op de conceptprocesreizenpagina is aangepast naar `Webhook`.

Ook het interne label `Hard bewijs: webhook endpoint` is versimpeld naar `Webhook endpoint`.

### Waarom?

De gebruiker gaf aan dat `Webhook bewijs` te omslachtig klinkt. Op de conceptlijst moet het label kort en duidelijk zijn.

### Geraakte Bestanden

```text
src/pages/Flows.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Conceptprocesreizen tonen nu een eenvoudiger zekerheidslabel:

```text
Webhook
```

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
```

Ook gecontroleerd dat `Webhook bewijs` niet meer voorkomt in de procesreizenbron.

### Open Punten

Geen.

## 2026-05-08 - Canvasweergave Verwijderd Uit Procesreis

### Wat Is Aangepast?

De ReactFlow/canvasweergave met losse automation-blokken is verwijderd uit de procesreis-detailpagina's.

Verwijderd uit:

```text
bevestigde procesreis detail
conceptprocesreis detail
```

De procesreis-detailpagina toont nu de begrijpelijke procesketen, de automations in volgorde en het bewijs per overgang.

### Waarom?

De canvasweergave voelde te technisch en hielp niet genoeg om de procesreis te begrijpen. De kern moet zijn:

```text
wat start iets
wat gebeurt daarna
wat verandert er
welk vervolgproces kan starten
```

Niet:

```text
nodekaart met technische blokken
```

### Geraakte Bestanden

```text
src/pages/FlowDetail.tsx
src/pages/FlowSuggestionDetail.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Procesreizen zijn rustiger en beter leesbaar:

- geen canvas met zoom/pan meer
- geen `Visuele flow` toggle meer
- geen technische reviewkaart meer op conceptdetail
- procesketen en uitleg staan centraal

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts src/test/automationSteps.test.ts
npm run build
```

Live getest in de browser:

- bevestigde procesreis geopend
- gecontroleerd dat er geen `.react-flow` canvas meer staat
- gecontroleerd dat `Visuele flow` niet meer zichtbaar is
- gecontroleerd dat de procesketen nog zichtbaar is
- conceptprocesreis geopend
- gecontroleerd dat ook daar geen `.react-flow` canvas meer staat

### Open Punten

Geen.

## 2026-05-08 - Nieuwe Automation Naar Eigen Pagina

### Wat Is Aangepast?

De tab `Nieuwe automation` is verwijderd uit de tabbar van `Automation beheer`.

In plaats daarvan staat er nu een knop in de header:

```text
Nieuwe automation
```

Deze knop opent een eigen pagina:

```text
/nieuw
```

Op die pagina staat rechtsboven een sluitknop met een kruisje. Die brengt de gebruiker terug naar:

```text
/alle
```

De plek waar eerst `Overzicht` en `Nieuwe automation` stonden, wordt nu gebruikt voor de brontabs:

```text
Alle automations
HubSpot
GitLab
```

### Waarom?

Het overzicht is de standaardstatus van de beheerpagina en hoeft daarom geen aparte tab te zijn. Een nieuwe automation toevoegen is een aparte actie en past beter als knop in de header.

### Geraakte Bestanden

```text
src/pages/AutomationsPage.tsx
src/pages/AlleAutomatiseringen.tsx
src/pages/NieuweAutomation.tsx
src/App.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De beheerpagina is duidelijker:

- `/alle` is altijd het automation-overzicht
- de headerknop opent toevoegen
- `/nieuw` is de aparte toevoegpagina
- het kruisje sluit de toevoegpagina
- de hoofdtabbar toont nu direct `Alle`, `HubSpot` en `GitLab`

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/automationSteps.test.ts src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser:

- `/alle` geopend
- gecontroleerd dat `Overzicht` niet meer als tab zichtbaar is
- gecontroleerd dat `Alle automations`, `HubSpot` en `GitLab` in de header-tabbar staan
- gecontroleerd dat `GitLab` filtert naar GitLab automations
- op `Nieuwe automation` geklikt
- gecontroleerd dat `/nieuw` opent
- gecontroleerd dat `Manual` en `AI Upload` zichtbaar zijn
- op het kruisje geklikt
- gecontroleerd dat de pagina teruggaat naar `/alle`

### Open Punten

Geen.

## 2026-05-08 - CSV Export HubSpot En GitLab Automations

### Wat Is Aangepast?

Er zijn twee CSV-bestanden gegenereerd met alle automations per bron:

```text
tmp/exports/hubspot-automations-2026-05-08.csv
tmp/exports/gitlab-automations-2026-05-08.csv
```

De export gebruikt de ingelogde browsersessie, zodat dezelfde records worden opgehaald als in de portal.

### Waarom?

We willen kunnen controleren of de brondata zelf klopt voordat procesreizen en analyses daarop worden gebaseerd.

### Geraakte Bestanden

```text
tmp/exports/hubspot-automations-2026-05-08.csv
tmp/exports/gitlab-automations-2026-05-08.csv
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Er is nu een losse controlelijst voor:

- alle HubSpot automations
- alle GitLab automations
- ook records die nog niet bevestigd zijn
- status, importstatus, stappen, endpoints en broninformatie

### Resultaat

```text
Totaal opgehaalde automation-records: 377
HubSpot automations: 287
GitLab automations: 90
```

HubSpot importstatus:

```text
approved: 156
pending_approval: 131
```

GitLab importstatus:

```text
approved: 90
```

HubSpot status:

```text
Actief: 199
Uitgeschakeld: 88
```

GitLab status:

```text
Actief: 51
Inactief: 39
```

### Getest

Gecontroleerd:

- beide CSV-bestanden bestaan
- beide CSV-bestanden hebben inhoud
- eerste regels bevatten de verwachte kolommen en data

### Open Punten

De GitLab-export bevat alle GitLab automation-records in de portal. Dit kunnen zowel specifieke endpoint-records als oudere/grovere GitLab-records zijn. Een vervolgstap is een aparte kolom of filter toevoegen voor:

```text
endpoint-record
oud bestand-record
nog te koppelen aan procesreis
```

## 2026-05-08 - Automation Beheer Header En Brontabs

### Wat Is Aangepast?

De pagina `Automation beheer` heeft nu dezelfde soort brede header als de meeste andere hoofdpagina's.

De header toont:

```text
Automations
Automation beheer
Korte uitleg
Totaal aantal automations
Aantal actieve automations
Aantal HubSpot automations
Aantal GitLab automations
```

Daarnaast heeft het automation-overzicht nu brontabs:

```text
Alle automations
HubSpot
GitLab
```

Elke tab toont ook het aantal records binnen die bron.

### Waarom?

De automationlijst werd te groot om alleen via filters te benaderen. Met brontabs kan de gebruiker direct schakelen tussen alle automations, HubSpot workflows en GitLab/backend automations.

### Geraakte Bestanden

```text
src/pages/AutomationsPage.tsx
src/pages/AlleAutomatiseringen.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

Gebruikers kunnen sneller controleren:

- hoeveel automations er totaal zijn
- hoeveel HubSpot automations zichtbaar zijn
- hoeveel GitLab automations zichtbaar zijn
- welke bron ze op dit moment bekijken

De bestaande filters blijven werken binnen de gekozen brontab.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/automationSteps.test.ts src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser:

- `/alle` geopend
- gecontroleerd dat de nieuwe header zichtbaar is
- gecontroleerd dat de tabs `Alle automations`, `HubSpot` en `GitLab` zichtbaar zijn
- gecontroleerd dat HubSpot filtert naar HubSpot automations
- gecontroleerd dat GitLab filtert naar GitLab automations

### Open Punten

De brontabs gebruiken de automations die op de beheerpagina geladen worden. Pending imports blijven primair op de import/reviewpagina staan.

## 2026-05-08 - Automation Tabs Aangesloten Op Header

### Wat Is Aangepast?

De tabs `Overzicht` en `Nieuwe automation` sluiten nu visueel aan op de grote header van `Automation beheer`.

De header en tabs staan samen in één afgeronde container:

```text
Hero/header
-
Tabbar
```

### Waarom?

De tabs stonden los onder de header en voelden daardoor minder verbonden met de pagina. Dit is gelijkgetrokken met de stijl van andere pagina's zoals Pipelines.

### Geraakte Bestanden

```text
src/pages/AutomationsPage.tsx
docs/automation-navigator-wijzigingen.md
```

### Effect Voor De Gebruiker

De pagina voelt rustiger en consistenter. De belangrijkste tabs horen nu duidelijk bij de header.

### Getest

Uitgevoerd:

```bash
npx tsc --noEmit
npm run test -- --run src/test/automationSteps.test.ts src/test/flowRuntimeChain.test.ts src/test/flowEdges.test.ts src/test/automationFunnel.test.ts
npm run build
```

Live getest in de browser:

- `/alle` geopend
- gecontroleerd dat header en tabs visueel aansluiten
- gecontroleerd dat `Overzicht` zichtbaar blijft
- gecontroleerd dat `Nieuwe automation` opent en de sub-tabs `Manual` en `AI Upload` toont
- gecontroleerd dat de bron-tabs onder het overzicht blijven werken

### Open Punten

Geen.
