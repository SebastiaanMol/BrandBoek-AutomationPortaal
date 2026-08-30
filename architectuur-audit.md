# Architectuur-audit: waar het portaal "los aan elkaar geplakt" aanvoelt

Gemaakt op verzoek van Sebas, n.a.v. de vraag of automations per bron (HubSpot/Zapier/Typeform/GitLab) los van elkaar behandeld worden en of het portaal als geheel voldoende samenhangt. Dit is een eerste, op bewijs gebaseerde kaart van de belangrijkste naden — geen volledige audit van de hele codebase (die is groter dan gedacht, zie hieronder), maar wel elk punt hieronder is echt nagekeken in de code, niet aangenomen.

**Context:** de codebase is groot. `src/lib` alleen al bevat ~90 bestanden, `src/test` ~190 testbestanden, en er draaien minstens 7 verschillende pagina's die elk op hun eigen manier proberen te tonen "hoe hangen automations samen". Dat is zelf al een belangrijke bevinding.

---

## 1. Vier losse detail-templates per bron

`src/pages/AutomationDetailPage.tsx` kiest met een lange if/else-keten (`isHubSpotAutomation` / `isZapierAutomation` / `isGitLabAutomation` / `isTypeformAutomation`) tussen vier volledig gescheiden componenten:

- `HubSpotAutomationDetailTemplate.tsx`
- `ZapierAutomationDetailTemplate.tsx`
- `GitLabAutomationDetailTemplate.tsx`
- `TypeformAutomationDetailTemplate.tsx`

Elk heeft zijn eigen presentatiebestand (`hubspotAutomationDetailPresentation.ts`, `zapierAutomationDetailPresentation.ts`, `gitlabAutomationDetailPresentation.ts`, `typeformAutomationDetailPresentation.ts`) en eigen testbestand. Op zich is dit een consistent patroon (presentatie/component/test gescheiden, en dat patroon wordt overal netjes gevolgd) — het probleem is niet de scheiding zelf, maar dat er niets is dat afdwingt dat ze ook maar iets delen.

**Concreet gevolg, vandaag zelf tegengekomen:** de "boekhouders-lens" (`ai_enrichment.when_text` / `why_text` / `visible_in_hubspot`) die we deze sessie bouwden — bedoeld als dé begrijpelijke laag voor niet-technische lezers — bestaat alleen in `HubSpotAutomationDetailTemplate.tsx`. In `GitLabAutomationDetailTemplate.tsx` komt geen enkel `ai_enrichment`-veld voor; die toont alleen `presentation.summary` (technische autotekst). Dus het onderdeel dat juist de vier bronnen moest verbinden, is zelf weer HubSpot-only.

## 2. Het datamodel zelf is los, niet alleen de UI

`src/lib/types.ts`:
- `Automatisering.source?: string` — een losse string, geen literal union (`"hubspot" | "zapier" | ...`). Niets in TypeScript voorkomt dat een Zapier-record een `hubspotWorkflow`-veld draagt.
- HubSpot en GitLab hebben hun eigen top-level velden (`hubspotWorkflow`, `gitlabEndpoint`, `gitlabFilePath`).
- Zapier en Typeform zitten genest onder `AutomationImportProposal.zap` / `.typeform` — inconsistente plek t.o.v. HubSpot/GitLab.
- `AutomationImportProposal` heeft `[key: string]: unknown` — een vangnet waar letterlijk elk veld in mag, zonder typecontrole.

Dit is exact waarom je gevoel klopt: het is geen bewust ontworpen model per bron, het is één grote structuur waar per bron iets bij is gepropt.

## 3. Legacy vs. nieuw: twee systemen naast elkaar voor dezelfde koppeling

Uit `portal_change_log.md` (mijn eigen log van vandaag/gisteren): bij het plaatsen van "Correct Stage IB" bleken er *twee* onafhankelijke mechanismen te bestaan om een automation aan een pipeline-stap te koppelen:
- **Legacy:** `autoLinks` op het process-state-artifact (`src/lib/storage/automationLinks.ts`) — dit is wat de UI vandaag daadwerkelijk uitleest.
- **Nieuw:** een `placements`-tabel (`src/lib/processStepStagingModel.ts` / `processStatePlacement.test.ts`) — bedoeld als opvolger, "toekomstbestendig", maar nog nergens door de UI gebruikt.

Beide worden nu bij elke koppeling dubbel geschreven ("voor de zekerheid"). Dat is een migratie die begonnen is maar niet is afgemaakt — een schoolvoorbeeld van "twee stukken naast elkaar geplakt in plaats van er één van gemaakt".

Extra signaal hiervoor: er zijn **vijf** aparte testbestanden met "migration" in de naam (`portalApiMigration.test.ts`, `sourceSyncReviewMigration.test.ts`, `sourceDataIncompleteMigration.test.ts`, `webhookMatchTypeMigration.test.ts`, `sourceSyncReviewNullableValuesMigration.test.ts`). Elk van die bestanden documenteert een moment waarop een oude datavorm niet meer paste bij een nieuwe en er iets bijgeplakt moest worden.

## 4. Zes tot zeven verschillende plekken die "hoe hangen automations samen" proberen te tonen

Uit `App.tsx` en de navigatie in `AppLayout.tsx`:

| Route | In hoofdnavigatie? | Doel (zo goed als af te leiden) |
|---|---|---|
| `/flows` (Procesreis) | Ja | Kettingreactie/flow-suggesties tussen automations |
| `/procesviewer` | Ja | BPMN-canvas van het proces |
| `/pipelines` | Ja | Pipeline-stages en welke automations daaraan hangen |
| `/analyse` | Ja | Analytics/gezondheid |
| `/automation-navigator` (WorkflowMatrix) | **Nee** | Eigen matrix-weergave, 6 testbestanden, niet in het menu |
| `/runtime` (RuntimeExplorer) | **Nee** | 57KB pagina + twee gegenereerde analysebestanden van resp. 1,4MB en 197KB in `src/lib` (`generatedPythonCodePathAnalysis.ts`, `generatedRuntimeAnalysis.ts`) — niet in het menu |
| `/gitlab-endpoint-check` | **Nee** | Losse GitLab-endpointcontrole, niet in het menu |

Drie van deze zeven bestaan nog volledig in code (met tests!) maar zijn onzichtbaar in de eigenlijke navigatie — gebouwd, daarna kennelijk ingehaald door een volgende aanpak, maar nooit opgeruimd.

## 5. Ook los: Systems, Owners, en Systemen & Eigenaren

Zelfde patroon als hierboven, maar dan voor "wie is waarvoor verantwoordelijk": `pages/Systems.tsx` en `pages/Owners.tsx` bestaan nog als losse routes (`/systems`, `/owners`), maar de navigatie linkt alleen naar `/systemen-eigenaren` (`SystemenEnEigenaren.tsx`), wat een samengevoegde versie lijkt te zijn. De oude twee zijn vermoedelijk de voorloper hiervan en hadden weg gekund.

## 6. Wat ik NIET als probleem zou bestempelen (ter eerlijkheid)

Ik verwachtte een duplicaat te vinden tussen `conceptJourneys.ts` en de "process journey"-familie (`processJourneyDetailPresentation.ts`, `processJourneyTrace.ts`, `processJourneyCopy.ts`). Bij het nalezen bleek dit wél een bewuste pipeline te zijn: een `ConceptJourney` wordt opgebouwd uit *onbevestigde* flow-suggesties (`zekerheid === "webhook" && !confirmed && !rejected`) — dus concept → beoordelen → bevestigen. Dat is geen naad, dat is gewoon een review-stap. Niet alles wat op het eerste gezicht op duplicatie lijkt, is dat ook; ik noem dit expliciet zodat dit rapport niet overdrijft.

---

## Conclusie

Je gevoel klopt, en het is preciezer te maken dan "het voelt los": het portaal is niet fout ontworpen, het is **nooit heringericht** nadat het meerdere keren is uitgebreid. Elke nieuwe bron, elke nieuwe manier om automations te visualiseren, en elke nieuwe schrijf-/koppelmethode kreeg zijn eigen plek naast de vorige, in plaats van de vorige te vervangen. Het onderliggende idee (één automation-identiteit, procesrouter/backend-worker-onderscheid, Procesreis als verbindend verhaal) is zelf wél consistent — de code heeft dat idee alleen nooit helemaal ingehaald.

## Aanbevolen volgorde

Dit sluit aan bij wat we net al afspraken (eerst 1 proefautomation per bron). Op basis van deze audit zou ik de opschoning in deze volgorde prioriteren, van laagst naar hoogst risico:

1. **Dode routes opruimen** (`/systems`, `/owners`, `/runtime`, `/automation-navigator`, `/gitlab-endpoint-check`) — laag risico, puur verwijderen of bewust weer terugzetten in de navigatie. Kost weinig, ruimt meteen zichtbaar op.
2. **Kiezen tussen legacy `autoLinks` en de nieuwe `placements`-tabel** — en de andere daadwerkelijk uitfaseren, niet allebei blijven schrijven.
3. **De boekhouders-lens (`ai_enrichment`) uitbreiden naar alle vier de bronnen** — dit sluit direct aan bij de proefautomations die we toch al gaan doen.
4. **Het datamodel pas als laatste** (discriminated union voor `Automatisering`) — nadat 1-3 gedaan zijn, weten we pas echt welke velden per bron structureel nodig zijn.

Dit rapport is een momentopname op basis van een gerichte steekproef, geen garantie dat dit alles is — een codebase van deze omvang kan nog meer van dit soort naden bevatten. Zeg maar of je hier dieper op wilt laten zoeken, of dat dit genoeg is om mee verder te gaan.
