# Bevindingen: ongeplaatste actieve automations

*Onderzoek en uitvoering op 27 augustus 2026. Alle schrijfacties zijn ook gelogd in `portal_change_log.md`.*

## Samenvatting

Van de 342 actieve automations stonden er 245 nergens op een canvas. Daarvan zijn er, na harde verificatie (de daadwerkelijke `dealstage`-triggervoorwaarde per automation gecontroleerd, niet alleen een los veld), **16 nieuw geplaatst** en is **1 eerder opzij gezette procesreis alsnog geplaatst**. De rest is gecategoriseerd zodat duidelijk is wat er nog openstaat en waarom.

## Uitgevoerd: 16 nieuwe plaatsingen + 1 heropende procesreis

Alles hieronder is met dryRun eerst getest (schoon bevonden) en daarna echt geschreven; geverifieerd via een GET na de write.

### 📁 Klantenbestand (pipeline 5941173) — If-Match 8→9

| Automation | Plaatsing |
|---|---|
| Deal won -> N8N -> Google Ads (AUTO-HS-1824972216) | stap: "Onboarding gesprek" (stage-150121102) |
| Jaarlijkse klanten nieuwsbrief augustus (AUTO-098) | stap: "Omzet in uitvoering - Dossier nog onvolledig" (stage-5941264) |
| Jaarlijkse klanten nieuwsbrief mei (AUTO-097) | stap: stage-5941264 |
| Jaarlijkse klanten nieuwsbrief februari (AUTO-096) | stap: stage-5941264 |
| Jaarlijkse klanten nieuwsbrief november (AUTO-095) | stap: stage-5941264 |
| Dtm Eerste Bel Moment (AUTO-HS-142736420) | sync-blok (trigger spant meerdere stappen) |
| Update Onboarding Typeform status for accepted deals (AUTO-HS-1656807343) | sync-blok |
| Mark onboarding as not completed when deal in Offerte geaccepteerd start (AUTO-HS-1657996625) | sync-blok |
| Geen Taal in Contact- Melding (AUTO-106) | sync-blok |
| Set contacts as marketing contacts (AUTO-104) | sync-blok |
| set source to organic (AUTO-HS-430053771) | sync-blok (pipeline-breed) |
| Set Deal Property: Activiteit Sales Deal Stage - Default (AUTO-HS-1631923489) | sync-blok (pipeline-breed) |
| Copy City from contact to deal- eenmalig (AUTO-110) | sync-blok (pipeline-breed) |

Sync-blok ging van 24 naar 32 gekoppelde automations.

### 👤 Inkomstenbelasting (pipeline 749749904) — If-Match 6→7

| Automation | Plaatsing |
|---|---|
| VIG ontvangen (AUTO-HS-1732407572) | sync-blok (trigger spant 4 stappen) |
| Gegevens voor 1 april aangeleverd -> priority (AUTO-HS-1774265347) | sync-blok |
| Procesreis "IB procesreis: Copy Machtiging contact property naar deal" | flowLinks, pipeline-breed |

De laatste stond op de lijst van 8 eerder opzij gezette procesreizen ("geen plaatsingsbewijs"), maar bleek via het `pipelineId`-veld van de onderliggende automation AUTO-085 alsnog resolvebaar naar deze pipeline.

### Niet meegenomen — twijfelgeval

**"Copy dossier naam from company to deal" (AUTO-HS-1798721133)** wijst naar 5 verschillende pipelines tegelijk (VPB, Voorlopige Aanslag VPB, BTW-Q, Administratie-M, Externe software BTW-Q), elk met een eigen canvas. Eén daarvan kiezen zou de werkelijke reikwijdte verkeerd weergeven; plaatsing op alle 5 is een grotere stap die ik niet zonder overleg zelf doorvoer.

## Onderzoek: terugval van "Deal won -> N8N -> Google Ads"

Deze automation was op 18 augustus al eens geplaatst (batch 2b), maar stond er bij controle op 27 augustus niet meer in. Via `GET /v1/audit-log` (83 records met diffs) gecontroleerd: het enige record dat het `auto_links`-veld van Klantenbestand raakt vóór vandaag is precies die plaatsing van 18 augustus. Geen van de latere batches (3, 4, 5, Typeform A3, Zapier D2) heeft dit veld ooit aangeraakt volgens het audit-log — die schreven allemaal alleen naar `artifacts` of `flow_links`.

**Conclusie:** de oorzaak van het verdwijnen kan ik met het beschikbare audit-log niet sluitend vaststellen. Ofwel gebeurde het buiten de gelogde API-schrijfpaden om (bijvoorbeeld een directe databasewijziging), ofwel heeft het audit-log geen volledige historische dekking — 83 records totaal is weinig ten opzichte van het werkelijke aantal schrijfacties in dit project. Wel uit te sluiten: geen van de door mij uitgevoerde vervolgbatches is de oorzaak. De vermelding is hersteld als onderdeel van de plaatsing hierboven.

## Overige bevindingen (nog niet geplaatst)

### Technische schuld — 16 automations met een dode trigger-stap

Deze staan nog op "actief", maar hun enige trigger-stap bestaat nergens meer in de huidige 50 pipelines — ze kunnen dus nooit meer geactiveerd worden:

- Stap 2.1: IB 2019 (AUTO-HS-32358794)
- Stap 2.1: VPB 2019 (AUTO-HS-32358747)
- Stap 2.1: LH juni 2020 (AUTO-HS-33439613)
- Stap 2.1: LH juli 2020 (AUTO-HS-32583267)
- Stap 2.1: LH augustus 2020 (AUTO-HS-37240562)
- Stap 2.1: LH september 2020 (AUTO-HS-37241684)
- JR status 2023 uit VPB pipeline (AUTO-HS-536328727)
- VPB goed plaatsen gebaseerd op JR status 2023 (AUTO-HS-536358463)
- BTW naar contact verzonden (AUTO-HS-164562318)
- BTW naar contact berekening gereed (AUTO-HS-164535421)
- JR verzonden naar contact (AUTO-HS-164609094)
- DTM afspraak (AUTO-HS-149404974)
- DTM derde gemiste telefoongesprek (AUTO-HS-149895041)
- Add Deals for Bankkoppeling (AUTO-HS-472175511)
- Create follow-up sales gesprek notitie (AUTO-HS-563280020)
- Move VPB deal when JR = done (default) (AUTO-HS-1617938093)

**Advies:** kandidaten voor archivering — de kern-trigger bestaat niet meer, ongeacht de rest van de configuratie.

### Wijzen naar gedateerde pipelines zonder canvas (buiten bereik)

Circa 20-25 automations wijzen uitsluitend naar jaargebonden pipeline-varianten zoals "Jaarrekening - 2023*", "BTW - Q2 2024*", "BTW - Q4 2023*", "Inkomstenbelasting - 2024*". Geen van deze pipelines heeft een canvas — plaatsing is hier pas mogelijk nadat er eerst een canvas voor is opgezet, een grotere stap dan losse plaatsing.

### Zonder enige plaatsingsinformatie — 170 automations

| Bron | Aantal | Toelichting |
|---|---|---|
| HubSpot | 78 | vooral categorie "Data beheer", veelal oudere jaargebonden workflows |
| GitLab | 56 | allemaal backend-scripts met een eigen endpoint — wachten op hun aanroepende (HubSpot/Typeform/Zapier) tegenhanger |
| Typeform | 23 | geen bevestigde koppeling naar de backend gevonden |
| Zapier | 13 | geen bevestigde koppeling gevonden |

Voor deze groep is zonder de broncode van de aanroepende kant te raadplegen geen betrouwbare plaatsing te bepalen — vergelijkbare aanpak als eerder bij "Groep C" in de GitLab-analyse.

## Openstaand

- Akkoord van Sebas over de 16 dode-trigger-automations (archiveren?).
- Beslissing over "Copy dossier naam from company to deal" (5 pipelines tegelijk).
- De 8 (nu 7, want 1 is heropend) eerder opzij gezette procesreizen zonder plaatsingsbewijs.
- De eerder gevonden foutieve VPB-flowLinks-vermelding voor "JR boekers instellen" (wacht nog op akkoord voor verwijdering).
