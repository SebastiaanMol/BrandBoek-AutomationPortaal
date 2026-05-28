# Procesreis Voorstel Review Cockpit

## Doel

De procesreis-voorstelpagina wordt een reviewscherm vóór goedkeuring. De pagina moet twee vragen gescheiden beantwoorden:

1. Is deze procesreis technisch bewijsbaar met 100% webhook/endpoint-matches?
2. Begrijpt een reviewer wat er in de procesreis gebeurt, inclusief AI-verrijkte uitleg en onbewezen open punten?

De harde goedkeuringsregel verandert niet: alleen exacte webhook/endpoint-overgangen tellen als procesreis-bewijs. AI-output mag de pagina begrijpelijker maken, maar mag nooit een overgang bewijzen of de goedkeuringsstatus overschrijven.

## Scope

In scope:

- Herontwerp van de concept-procesreis detailpagina (`/flows/suggesties/:id`).
- Review cockpit als hoofdindeling.
- AI-werkbank met prompt kopiëren en AI-resultaat plakken.
- Beschrijvende AI-verrijking voor naam, samenvatting, processtappen, wijzigingen en reviewnotities.
- AI-voorstellen en gaps tonen als aparte, expliciet onbewezen informatie.
- Webhook-bewijs, goedkeuringsstatus en bewezen overgangen read-only houden.

Niet in scope:

- Nieuwe automatische AI-call vanuit het portaal.
- Nieuwe flow-detectielogica.
- Property-write naar workflow-trigger als bewijslaag.
- Mermaid-diagrammen of customer lifecycle visualisatie.
- Opslaan van AI-output als harde technische waarheid.

## Ontwerprichtingen

Er zijn drie richtingen bekeken:

- **Review cockpit**: bovenaan beslisbaarheid, daarna businessverhaal en bewijs. Dit is gekozen.
- **Keten eerst**: grote visuele keten als startpunt. Goed voor begrip, minder strak voor reviewbeslissingen.
- **Checklist eerst**: audit-first. Sterk voor governance, minder prettig voor procesowners.

De gekozen richting is de Review cockpit, omdat die zowel streng blijft op bewijs als bruikbaar is voor mensen die de procesreis inhoudelijk moeten begrijpen.

## Pagina-opbouw

### 1. Header Card

De header toont:

- concept-procesreis titel
- statusbadge, bijvoorbeeld `Klaar voor review` of `Niet goedkeuringsklaar`
- aantal automations
- aantal bewezen webhook-overgangen
- aantal AI-voorstellen of gaps
- acties: `Verwerp`, `AI prompt`, `Goedkeuren`

`Goedkeuren` is alleen actief wanneer alle overgangen in de voorgestelde keten exact webhook-bewezen zijn en er geen bronkwaliteit-blocker is die de edge-bewijsvoering raakt.

### 2. Metrics Row

Vier compacte cards:

- Bewijsstatus: altijd 100% of niet goedkeuringsklaar, geen waarschijnlijkheidspercentages.
- Bronkwaliteit: geen blocker, waarschuwing, of blocker.
- Primair businessobject: beschrijvend en eventueel AI-verrijkt, maar niet bepalend voor bewijs.
- Waar stopt de keten: laatste automation waar geen volgende bewezen webhook-match bestaat.

### 3. Wat Gebeurt Er In Deze Procesreis?

Een prominente beschrijvingskaart in gewone Nederlandse taal. Deze tekst mag AI-verrijkt zijn, maar krijgt een label zoals `AI-verrijkt, bewijs apart`.

De tekst beschrijft de procesreis als geheel:

- wat de reis start
- welke systemen of automations meedoen
- wat onderweg verandert
- waar de reis stopt

De tekst mag geen nieuwe technische koppelingen als bewezen presenteren.

### 4. Webhook-Bewezen Keten

Een horizontale keten met bronblokken en pijlen. Elke pijl toont:

- `100% webhook-match`
- genormaliseerd pad of endpoint
- bronautomation en doelautomation

Er zijn geen labels zoals waarschijnlijk, afgeleid, 88% of 95%. Als er geen exact bewijs is, hoort de relatie niet in de bewezen keten.

### 5. Reviewstappen

Een hoofdkaart links met een korte checklist:

1. Controleer of de keten technisch klopt.
2. Lees het businessverhaal.
3. Beoordeel AI-voorstellen en gaps.
4. Keur alleen de bewezen procesreis goed.

Deze kaart begeleidt de reviewer door de beslissing zonder technische details bovenaan te overdrijven.

### 6. Bewijs Per Overgang

Een rechterkaart met per overgang:

- source automation
- target automation
- exact gematchte webhook of endpoint
- korte bewijszin

Deze kaart is read-only en komt uit de bestaande webhook/endpoint data.

### 7. AI-Voorstellen & Gaps

Een rechterkaart met AI-output die niet als bewijs telt:

- mogelijke lifecycle-fase
- mogelijke ontbrekende vervolgstap
- open vraag voor developer of procesowner
- suggestie voor betere procesnaam

Elke regel krijgt een label zoals `AI-voorstel`, `Niet bewezen`, of `Review nodig`.

### 8. AI-Werkbank

Onderaan de pagina staat een aparte werkbank met twee helften:

- `Prompt kopiëren`: genereert een prompt met alle beschikbare brondata en strikte instructies.
- `AI-resultaat plakken`: tekstvlak waarin de reviewer AI-output terugplakt.

Na verwerken splitst het portaal de input in twee soorten informatie:

- Beschrijvende verrijking: mag naam, samenvatting, processtappen, wat-verandert-er en reviewnotities invullen.
- Onbewezen voorstellen: blijven apart gelabeld als AI-voorstel of gap.

## AI Prompt Contract

De prompt bevat:

- bewezen webhook-keten
- betrokken automation IDs, namen, bronnen en statussen
- relevante raw source data per automation
- source quality status en findings
- webhook paths en endpoint matches
- bestaande conceptsuggesties
- duidelijke instructie: verzin geen bewijs en markeer onzekerheden als voorstel

De AI-output moet bij voorkeur gestructureerd zijn, bijvoorbeeld JSON met deze velden:

- `title`
- `summary`
- `businessObject`
- `processSteps`
- `changeSummary`
- `reviewNotes`
- `aiSuggestions`
- `openQuestions`

Het portaal accepteert geen AI-output voor:

- `confirmedTransitions`
- `webhookEvidence`
- `approvalStatus`
- `sourceAutomationId`
- `targetAutomationId`

Deze velden blijven uitsluitend afkomstig uit portaldata.

## Data Flow

1. De pagina laadt de bestaande suggestiegroep en automations.
2. De presenter bepaalt de bewezen keten op basis van exacte webhook/endpoint matches.
3. De presenter bouwt de reviewstatus en de bewijskaarten.
4. De AI-prompt generator verzamelt alleen bestaande brondata en schrijft geen data weg.
5. De gebruiker kopieert de prompt naar een externe AI.
6. De gebruiker plakt het resultaat terug.
7. Een parser leest alleen toegestane beschrijvende velden en AI-voorstellen.
8. De UI toont een review preview voordat AI-verrijking definitief wordt toegepast.
9. Bij goedkeuring wordt alleen de bewezen procesreis opgeslagen; AI-context wordt als beschrijvende metadata of reviewcontext opgeslagen als daar bestaande velden voor zijn.

## Componenten

### `FlowSuggestionReviewPresentation`

Nieuwe interne presentatievorm voor de conceptpagina:

- `header`
- `metrics`
- `approvalState`
- `journeySummary`
- `verifiedChain`
- `transitionEvidence`
- `reviewSteps`
- `aiSuggestions`
- `sourceQualityBlockers`
- `automationCards`

### `FlowSuggestionReviewCockpit`

Hoofdcomponent voor `/flows/suggesties/:id`.

Verantwoordelijk voor:

- header
- metrics
- samenvatting
- keten
- reviewgrid
- acties

### `FlowSuggestionAiWorkbench`

Losse component voor:

- prompt preview
- prompt kopiëren
- AI-resultaat plakken
- parse/validatie feedback
- preview van wijzigingen

### `FlowSuggestionPromptBuilder`

Helper die de prompt maakt uit bestaande data. Deze helper mag geen businessclaims verzinnen en geen externe calls doen.

### `parseFlowSuggestionAiResult`

Parser die alleen toegestane velden accepteert en onbekende of bewijsgevoelige velden negeert met een duidelijke melding.

## Guardrails

- AI-output mag nooit webhook-bewijs aanmaken.
- AI-output mag nooit een niet-bewezen relatie in de keten plaatsen.
- Goedkeuren blijft gekoppeld aan portaldata, niet aan AI-tekst.
- Elke AI-claim die onzeker is wordt zichtbaar als voorstel of gap.
- Als AI-output ongeldige JSON is, blijft de pagina bruikbaar en toont hij een herstelbare fout.
- Als AI-output probeert bewijsvelden te vullen, worden die genegeerd en zichtbaar gemeld.

## Testing

Presenter tests:

- webhook-bewezen suggestie krijgt `Klaar voor review`.
- suggestie zonder exacte webhook-match krijgt geen goedkeuringsklare status.
- AI-verrijkte samenvatting wijzigt geen bewezen overgangen.
- AI-voorstellen verschijnen apart als onbewezen.
- source quality blocker blokkeert goedkeuring wanneer het edge-bewijs raakt.

Prompt builder tests:

- prompt bevat automation data, webhook evidence en source quality.
- prompt bevat instructie dat AI geen bewijs mag verzinnen.
- prompt bevat geen secrets of gevoelige tokens.

Parser tests:

- geldige AI-output vult beschrijvende velden.
- bewijsvelden in AI-output worden genegeerd.
- onbekende velden veroorzaken geen crash.
- ongeldige JSON geeft een duidelijke fout.

UI tests:

- conceptpagina toont Review cockpit.
- `Prompt kopiëren` is aanwezig.
- AI-resultaat kan geplakt en gevalideerd worden.
- AI-gaps blijven gelabeld als onbewezen.
- `Goedkeuren` blijft alleen beschikbaar bij 100% webhook-bewijs.

Browser checks:

- desktop en mobiel geen horizontale overflow.
- keten scrollt horizontaal wanneer nodig.
- AI-werkbank staat onder de primaire reviewinformatie.
- bewijs en AI-voorstellen zijn visueel duidelijk gescheiden.

## Open Beslissingen

Er zijn geen blokkerende ontwerpbeslissingen meer voor de implementatie. De implementatie mag starten met de aanname dat AI-output lokaal handmatig wordt geplakt en dat automatische AI-integratie buiten scope blijft.
