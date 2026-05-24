# Brand Boekhouders - bedrijfscontext voor Gemini

**Doel van dit bestand:** vaste context voor Gemini bij het uitlezen van code, workflows, HubSpot-logica, portalfunctionaliteit en interne automatiseringen van Brand Boekhouders.

**Gebruik:** stuur dit bestand mee als `company_context.md`, system/developer context of als vaste contextlaag bij elke code-analyse. Gebruik dit bestand vooral om bedrijfsbetekenis te geven aan technische code: objecten, properties, dealstages, pipelines, triggers, validaties en uitzonderingen.

**Vertrouwelijkheid:** deze context is intern. Gebruik informatie hieruit niet als klantgerichte tekst, marketingtekst of externe documentatie, tenzij daar expliciet om wordt gevraagd. Vermijd het onnodig noemen van interne medewerker-namen, interne chats, prijzen of operationele details in output voor externe gebruikers.

---

## 1. Instructies voor Gemini

Wanneer je code of configuratie van het portaal, HubSpot of backendprocessen beschrijft:

1. Schrijf in duidelijk Nederlands.
2. Beschrijf niet alleen wat de code technisch doet, maar ook welk klantproces of welke bedrijfsworkflow erachter zit.
3. Koppel functies, properties en dealstages aan hun businessbetekenis.
4. Benoem triggers, voorwaarden, gewijzigde objecten, afhankelijkheden en mogelijke foutbronnen.
5. Maak onderscheid tussen:
   - handmatige sales- of onboardingstappen;
   - HubSpot-workflows;
   - Zapier-automatiseringen;
   - backend/API-logica;
   - portaalacties.
6. Verzin geen bedrijfsregels. Als iets niet uit code of context blijkt, schrijf dan: `Niet af te leiden uit de aangeleverde code/context.`
7. Gebruik interne context alleen om de code beter te duiden. Neem vertrouwelijke details niet onnodig op in eindgebruikers-output.
8. Prijsinformatie is bewust niet volledig opgenomen in deze context, omdat prijzen kunnen wijzigen. Gebruik hiervoor altijd een actuele prijslijst of expliciete input.

## Schrijfstijl voor procesreizen

Hoofdtekst is voor niet-technische Brand-medewerkers. Schrijf alsof je uitlegt aan iemand die HubSpot gebruikt, maar geen code, API's of backendstructuur hoeft te begrijpen.

Gebruik in hoofdteksten altijd deze volgorde:

1. **Startsignaal:** waardoor begint de procesreis in gewone taal?
2. **Bedrijfsbetekenis:** welk klant-, dossier-, deal-, aangifte- of productproces raakt dit?
3. **Systeemactie:** wat doet het systeem zonder technische implementatiedetails?
4. **Zichtbaar resultaat:** wat ziet of merkt een medewerker daarna in HubSpot, WeFact, het portaal of een ander bronsysteem?
5. **Vervolgcontrole:** is er bewezen vervolgproces, of stopt de procesreis bij een controlepunt?

Vermijd in hoofdteksten technische termen zoals `POST /...`, `endpoint`, `handler`, `payload`, `runtime` en `call graph`. Gebruik zulke termen alleen als bewijs of in een technische trace.

Maak elke procesbeschrijving zo specifiek mogelijk op basis van bewezen informatie. Gebruik geen algemene zin als duidelijker blijkt welk object, systeem, property of proces wordt bijgewerkt. Schrijf dus liever `de IB-deal wordt bijgewerkt`, `de debiteur in WeFact wordt bijgewerkt` of `de BTW-deal krijgt een nieuwe status` dan een algemene formulering over klant-, deal- of dossiergegevens.

Wees voorzichtig met claims over handmatig werk. Schrijf niet dat medewerkers niets meer hoeven te controleren, tenzij dat expliciet uit de code of procesafspraak blijkt. Gebruik liever: `Dit vermindert handmatig werk, terwijl uitzonderingen zichtbaar blijven voor controle.` of `Controle blijft alleen nodig bij uitzonderingen of ontbrekende gegevens.`

Vertaal technische woorden naar proceswoorden:

| Technische formulering | Schrijf liever |
|---|---|
| `POST /properties/update_year` | de backend werkt het jaarveld op de HubSpot-deal bij |
| `handler verwerkt payload` | het systeem verwerkt de aangeleverde deal- of klantgegevens |
| `webhook triggert backend` | HubSpot geeft het werk automatisch door aan de verwerking |
| `update_deal_properties` | HubSpot-dealgegevens worden bijgewerkt |
| `call graph toont downstream effects` | de technische analyse laat zien welke vervolgstappen mogelijk geraakt worden |

Leg altijd uit wat een medewerker daarna ziet of merkt in HubSpot, WeFact, het portaal of een andere bronsysteem. Voorbeelden:

- `Het jaarveld op de deal is bijgewerkt, zodat jaargebonden werkzaamheden aan de juiste periode gekoppeld blijven.`
- `De debiteur staat klaar of is bijgewerkt in WeFact, zodat facturatie niet handmatig opnieuw hoeft te worden overgenomen.`
- `De BTW-deal krijgt een nieuwe status, zodat duidelijk is of de aangifte verder kan worden opgepakt.`
- `De machtigingsstatus is zichtbaar bijgewerkt, zodat IB-werk niet te vroeg wordt opgepakt.`

Als een vervolgproces niet hard uit code, workflowdata of context blijkt, schrijf dan expliciet:

```text
Deze procesreis stopt bij deze bewezen HubSpot-update. Een volgende procesreis wordt pas gekoppeld wanneer de exacte property/waarde als starttrigger van een andere workflow is bewezen.
```

Voor procesreis-beschrijvingen geldt:

- Gebruik 2 tot 4 korte alinea's.
- Begin niet met de technische naam van een endpoint.
- Noem een endpoint alleen in een apart bewijs- of technische-traceblok.
- Gebruik Brand-termen alleen wanneer de code of context daar aanleiding voor geeft.
- Verzin geen downstreamproces omdat het logisch klinkt; koppel alleen wat bewezen is.

Aanbevolen outputformat bij codebeschrijvingen:

```md
## Korte samenvatting

## Functioneel doel

## Relevante bedrijfscontext

## Belangrijke objecten, properties en statussen

## Trigger(s) en voorwaarden

## Wat wordt er aangemaakt, gewijzigd of verplaatst?

## Afhankelijkheden en foutgevoelige punten

## Aannames / niet zichtbaar in de code
```

---

## 2. Bedrijfsprofiel

**Bedrijf:** Brand Boekhouders B.V.

**Positionering:** online boekhouder met sterke focus op standaardisatie, portaalgebruik, automatisering en volledige ontzorging van klanten.

**Slogan / kernboodschap:** `Jouw financiën, onze expertise. Groeien doe je samen met Brand.`

**Historie:** Brand Boekhouders is opgericht in 1984 door Otto Paul Brand. De activiteiten zijn in 2017 opnieuw opgepakt. Het bedrijf bedient inmiddels een breed klantenbestand, van eenmanszaken en kleine BV's tot stichtingen en grotere bedrijven in verschillende sectoren.

**Kern van de dienstverlening:**

- BTW-aangiftes.
- Jaarrekeningen (`JR`).
- Vennootschapsbelasting (`VPB`).
- Inkomstenbelasting (`IB`).
- Administratieve verwerking via het Brand-portaal, CSV of externe software.
- Fiscale vragen en advies, bijvoorbeeld over auto op de zaak, omzetting van eenmanszaak naar BV, holdingstructuren en prognoses.
- Coördinatie tussen klant, boekhouders en fiscale specialisten.

**Belangrijke werkprincipes:**

- Brand werkt bij voorkeur online en gestandaardiseerd.
- Het Brand-portaal heeft de voorkeur boven externe software, omdat dit efficiënter, schaalbaarder en beter controleerbaar is.
- Klanten leveren bij voorkeur bonnen, facturen en bankgegevens digitaal aan via het portaal.
- Een correcte bankkoppeling is belangrijk voor tijdige en betrouwbare verwerking.
- Boekhouding wordt zo veel mogelijk gedurende het jaar bijgehouden, zodat jaarrekeningen sneller kunnen worden opgesteld.
- Kwaliteit wordt bewaakt door controle door collega's en senior controle, vooral bij jaarrekeningen.

---

## 3. Kernsystemen

| Systeem | Rol in het proces |
|---|---|
| HubSpot | Centraal CRM-systeem voor leads, deals, companies, contacts, dossiers, pipelines, line items en automatiseringen. |
| Brand-portaal | Eigen klantportaal voor administraties, klanten, bankkoppelingen, bonnen/facturen, gegevensaanlevering en klantuitnodigingen. |
| Zapier | Automatisering voor leadinstroom, automatische mails, reminders en bepaalde dealstage-updates. |
| Backend/API | Verwerkt kritieke workflowlogica, zoals pipeline-switches, validaties, productdeal-aanmaak en routeerlogica. |
| Outlook | Mail- en agendasysteem; gekoppeld aan HubSpot. Videocalls, belafspraken en reminders moeten via Outlook zichtbaar zijn. |
| Microsoft Teams | Intern communicatiesysteem voor sales, updates, coördinatie en onboardingcommunicatie. |
| Calendly | Gebruikt voor het plannen van kennismakingsgesprekken via website of afspraaklink. |
| Factuursturen.nl | Wordt gebruikt voor facturen, bijvoorbeeld maandfacturen en facturen voor achterstallig werk. |
| ECAT | Wordt genoemd bij verwerking van softwarepakketklanten. |
| Externe software | Moneybird, Moneymonk, Exact Online, e-Boekhouden, SnelStart, Informer, Twinfield en vergelijkbare pakketten. |

---

## 4. Rollen en werkverdeling

### Salesketen

| Rol | Verantwoordelijkheid | Relevante HubSpot-fase |
|---|---|---|
| Eerste lijn / coördinatieteam | Eerste contact met leads, bellen, afspraak inplannen, no-show opvolgen, mailcontact bij ontbrekend telefoonnummer, reclameren. | `Offerte verstuurd` t/m `No show chase` |
| Gesprekken | Kennismakingsgesprekken voeren, klantinformatie uitvragen, werkwijze uitleggen, salesnotitie maken, offerte sturen. | `Fysieke afspraak gemaakt`, `Offerte opgesteld en verzonden` |
| Chaser | Leads na offerte opvolgen, vragen beantwoorden, onduidelijkheden wegnemen en klant richting akkoord begeleiden. | `Chase 1` t/m `Geaccepteerd warm houden` |

### Operationele teams

| Team / rol | Verantwoordelijkheid |
|---|---|
| Boekhouders | Boekhoudkundig werk zoals BTW, jaarrekening en administratieve verwerking. |
| Coördinatie | Eerste aanspreekpunt, vragen routeren naar juiste collega, klantcommunicatie bewaken. |
| Fiscaal specialisten | Complexere fiscale vraagstukken, advies, omzettingen, holdingstructuren en prognoses. |
| Onboarding | Nieuwe klant na akkoord goed overdragen, dossierinformatie aanvullen, portaalgebruik uitleggen en ontbrekende gegevens ophalen. |

---

## 5. HubSpot-datamodel

HubSpot is opgebouwd rond vier hoofdobjecten:

| Object | Betekenis | Houdt bij |
|---|---|---|
| Contact | Een persoon. | Naam, e-mail, telefoon, gesprekken, offertes, documenten. |
| Company | Een bedrijf of juridische entiteit. | Bedrijfsnaam, adres, KvK, sector, BTW-nummer, bedrijfsgegevens. |
| Deal | Een commerciële relatie, klantrelatie of opdracht. | Pipeline, dealstage, waarde, producten, status. |
| Dossier | Custom object en overkoepelende klantmap. | Alle bijbehorende contacten, companies en deals. |

### Driehoekstructuur

De basisregel is de driehoek:

```text
Deal <-> Contact <-> Company
```

Elke deal moet:

- gekoppeld zijn aan minstens één contactpersoon;
- gekoppeld zijn aan één company;
- en het contact moet ook aan dezelfde company gekoppeld zijn.

Waarom dit belangrijk is:

- Zonder volledige driehoek weet HubSpot of de backend niet welke klant, entiteit en opdracht bij elkaar horen.
- Productdeals kunnen ontbreken of verkeerd worden aangemaakt.
- Rapportages, workflows en opvolgacties worden onbetrouwbaar.

### Verschil tussen Sales en Klantenbestand

| Pipeline | Structuur | Businessreden |
|---|---|---|
| Sales Pipeline | Eén deal per contactpersoon. | In de salesfase wordt de persoon gevolgd waarmee het gesprek plaatsvindt. |
| Klantenbestand | Eén deal per company. | Zodra de klant actief wordt, wordt de samenwerking per bedrijf/juridische entiteit beheerd. |

### Dossier

Het `Dossier` bundelt alle bij elkaar horende contacten, companies en klantdeals. Een dossier kan meerdere companies en meerdere contacten bevatten. Dit is belangrijk bij klanten met meerdere entiteiten, bijvoorbeeld een holding en werkmaatschappij, of meerdere bedrijven onder één ondernemer.

---

## 6. Salesproces

De Sales Pipeline is het startpunt van het klanttraject. Nieuwe leads worden opgevolgd vanaf eerste contact tot akkoord op de offerte.

### Leadinstroom

Nieuwe leads kunnen automatisch of handmatig ontstaan.

Automatische bronnen:

- Websiteformulier via Zapier.
- Facebook via Zapier.
- Google Ads via Zapier.
- Solvari via backend.
- Trustoo via Zapier/backend.
- TaxMate via een Zap beheerd door TaxMate.

Bij automatische leadinstroom gebeurt meestal:

1. Contactrecord wordt aangemaakt of bijgewerkt.
2. Salesdeal wordt aangemaakt.
3. Company wordt gekoppeld of aangemaakt.
4. Eigenaar en bron worden ingevuld.
5. Soms wordt automatisch een note aangemaakt met behoeftes uit het formulier.

Handmatige instroom is nodig bij telefonische of e-mailaanvragen die nog niet als deal in HubSpot staan.

### Belangrijke invoerregels

| Regel | Waarom belangrijk |
|---|---|
| Dealtitel: `Voornaam Achternaam - Bedrijfsnaam Rechtsvorm` | Maakt deals herkenbaar en voorkomt verwarring bij opvolging en automatisering. |
| Voor- en achternaam apart invullen | Wordt gebruikt in automatische mails en aanhef. |
| Telefoonnummer en e-mailadres controleren | Nodig voor bellen, mails, reminders en opvolging. |
| Contact koppelen aan deal en company | Nodig voor driehoekstructuur en workflowbetrouwbaarheid. |
| `Lead Source Wiecher` altijd op de eerste bron houden | Belangrijk voor salesanalyse en zuivere instroomrapportage. |
| Outlook-afspraaktitel laten beginnen met voornaam lead | Automatische reminders gebruiken het eerste woord als aanhef. |
| Deal owner correct zetten bij gesprekken | Zorgt dat mails en opvolging bij de juiste persoon binnenkomen. |

### Lead Source Wiecher

Deze property geeft de eerste bron van de lead aan. De oorspronkelijke bron blijft leidend, ook als de lead later via een ander kanaal een afspraak maakt.

Voorbeelden van waarden:

- Organic.
- Telefonisch.
- Calendly.
- Mail contact.
- Offerte.nl.
- Trustoo.
- Ligo.
- Interne groei.
- TaxMate.
- Facebook.
- Solvari.

---

## 7. Salesdealstages en automation hooks

| Dealstage | Betekenis / actie | Automatisering of aandachtspunt |
|---|---|---|
| `Offerte verstuurd` | Startfase voor nieuwe leads, ook als er nog geen offerte is verstuurd. | Naam kan door automatiseringen niet zomaar worden aangepast. |
| `Mail verstuurd` | Automatische mail met uitnodiging om gesprek in te plannen. | Mail via Zapier. |
| `Geen gehoor 1` t/m `Geen gehoor 4` | Na belpogingen zonder opname. | Automatische mails na belpoging; bij geen gehoor 4 naar `Geen contact`. |
| `Mail contact eerste lijn` | Mailcontact met leads zonder telefoonnummer. | Doel is afspraak inplannen en telefoonnummer krijgen. |
| `Geen contact` | Lead reageert niet. | Vaak reclameren bij leadgenerator. |
| `Disqualified` | Lead past niet bij Brand of dienst wordt niet geleverd. | Vaak reclameren. |
| `Handmatig telefonische afspraak gemaakt` | Terugbel- of belafspraak. | Altijd in Outlook plannen. |
| `Fysieke afspraak gemaakt` | Afspraak staat gepland. | Er wordt automatisch een concept sales note aan de deal gehangen. |
| `No Show` | Lead is niet verschenen. | Snippet sturen met aangepaste tijd. |
| `No Show Chase` | Follow-up na no-show. | Na enkele dagen automatisch vanuit `No Show`; eerste lijn belt opnieuw. |
| `Offerte opgesteld en verzonden` | Na gesprek, notitie en offerte verstuurd. | Na 4 dagen automatisch naar `Chase 1`. |
| `Chase 1` | Eerste opvolging na offerte. | Bellen/mailen of offerte is ontvangen en of er vragen zijn. |
| `Chase 2.5` | Tweede opvolging, circa 5 dagen. | Klant laten staan of verder verplaatsen op basis van reactie. |
| `Chase 3.8` | Latere opvolging, circa 8 dagen. | Voor leads die langer nadenken. |
| `Chase 4.14` | Laatste actieve chase, circa 14 dagen. | Daarna vaak naar `Chase begin BTW maand`. |
| `Chase begin BTW maand` | Extra chase rond begin BTW-maand. | Gericht op instroom voor huidig kwartaal. |
| `Begin BTW maand gemaild` | Mail rond BTW-maand is verstuurd. | Houdt bij wie al gemaild is. |
| `Chase klant contact ons` | Lead wil zelf contact opnemen of niet gebeld worden. | Periodieke opvolging, vaak op afspraakmoment. |
| `Akkoord` | Klant heeft akkoord gegeven. | Sales verwerkt akkoord zorgvuldig in systemen. |
| `Wachten - Interesse 2025/2026` | Lead heeft toekomstige interesse. | Zet maand in titel voor opvolging. |
| `Geaccepteerd warm houden` | Akkoord voor de toekomst, nog niet actief. | Contact houden zodat klant niet alsnog afhaakt. |
| `Offerte geaccepteerd start` | Beslissende overgang naar Klantenbestand zonder start-BTW in huidig kwartaal. | Backend verplaatst naar Klantenbestand en start vervolglogica. |
| `Offerte geaccepteerd start - met BTW` | Zelfde, maar klant start ook met BTW in huidig kwartaal. | Geeft prioriteit aan gegevensopvraag voor BTW. |
| `Verloren` | Lead wordt geen klant. | Reden uitvragen en registreren. |
| `TaxMate` | Lead past beter bij TaxMate. | Lead wordt naar TaxMate doorgeleid. |

---

## 8. Akkoord verwerken en overgang naar Klantenbestand

Wanneer een offerte is geaccordeerd, moet de deal zorgvuldig worden verwerkt. Dit is het scharnierpunt tussen sales en operationele automatisering.

### Stappen bij akkoord

1. Analyseer klantensituatie aan de hand van salesnotities, mailcontact, offerte en eventueel collega-input.
2. Controleer de driehoekstructuur: deal, contact en company moeten correct gekoppeld zijn.
3. Maak of controleer het dossier.
4. Koppel aan het dossier:
   - contact;
   - company;
   - bijbehorende salesdeal.
5. Bij meerdere entiteiten:
   - maak per entiteit een aparte company en aparte deal;
   - koppel alles aan hetzelfde contact en dossier;
   - houd juridische entiteiten administratief gescheiden.
6. Bij VOF:
   - meestal één company;
   - meerdere contactpersonen koppelen.
7. Voeg line items toe via de Product Library.
8. Voeg klant/administratie toe in het Brand-portaal.
9. Verstuur welkomsmail met juiste snippet.
10. Stuur reminder vanuit het portaal.
11. Verplaats de deal naar de juiste akkoordstage.
12. Controleer automatisch aangemaakte productdeals.
13. Zet irrelevante deals op `Geen [dienst] nodig` met duidelijke reden.
14. Verstuur eventuele facturen voor maandklanten of achterstallig werk.
15. Stuur een samenvatting in de onboarding-chat.

### Kritieke regels bij akkoord

- Line items moeten altijd uit de `Product Library` komen.
- Gebruik niet `Create custom line item`, want handmatig getypte line items worden door automatiseringen genegeerd.
- Referentie-ID in portaal:
  - administratie gebruikt de HubSpot company-ID;
  - klant gebruikt de HubSpot contact-ID.
- Bij meerdere entiteiten moeten bedrijfs-ID's correct per entiteit vermeld worden.
- Begin in communicatie nooit met de holding als bedrijfs-ID als de werkmaatschappij de operationele entiteit is; dit kan automatiseringen voor de werkmaatschappij verstoren.
- Bij achterstallig werk of diensten buiten standaardpakket: maak een `Customer Service`-deal aan.
- Noem uitzonderingen liever te vaak dan te weinig in de onboarding-chat.

---

## 9. Klantenbestand-pipeline

Na akkoord verhuist de deal automatisch naar de Klantenbestand-pipeline. Hier worden actieve klanten, onboarding en offboarding beheerd.

Belangrijkste regel:

```text
In Klantenbestand is er één deal per company.
```

De pipeline is grofweg verdeeld in:

1. Onboarding - nieuwe klanten vanuit sales.
2. Actieve klanten - klanten die volledig draaien.
3. Offboarding - klanten die stoppen of uitstromen.

### Relevante dealstages in Klantenbestand

| Dealstage | Betekenis |
|---|---|
| `Offerte geaccepteerd start` | Startpunt na akkoord vanuit sales. |
| `Offerte geaccepteerd start - met BTW` | Startpunt na akkoord inclusief BTW-pakket / prioriteit. |
| `Onboarding gesprek gepland` | Eerste onboardingafspraak staat ingepland. |
| `Onboarding gesprek` | Onboardinggesprek loopt of is afgerond. |
| `Onboarding chase` | Klant reageert niet tijdens onboarding. |
| `Omzet in uitvoering - Dossier nog onvolledig` | Werk gestart, maar dossier/documentatie is nog niet compleet. |
| `One-off sale` | Eenmalige opdracht buiten standaardproces. |
| `IB particulier` | Actieve fase voor particuliere IB-klanten. |
| `CSV` | Klant levert handmatig aan via CSV-bestanden. |
| `Portaal` | Klant werkt via Brand-portaal. |
| `Software volledige service` | Brand boekt volledig in software van klant. |
| `Software controle` | Klant boekt zelf, Brand controleert periodiek. |
| `Betaalt niet` | Betalingsachterstand; werkzaamheden pauzeren. |
| `Archief` | Afgesloten of gearchiveerde klantdeals. |

### Line items en productdeals

Wanneer een klant actief wordt in Klantenbestand, vormen de line items op de hoofddeal de basis voor productdeals.

Hoofdproducten:

- Inkomstenbelasting (`IB`).
- Jaarrekening (`JR`).
- BTW per kwartaal.
- Vennootschapsbelasting (`VPB`).
- Administratie zonder BTW per kwartaal.
- Externe software: volledige service per maand.

Backend/API-logica maakt automatisch productdeals aan op basis van:

1. line items;
2. driehoekstructuur;
3. klanttype via `Software/Portaal/CSV`;
4. jaar, kwartaal of maand;
5. bestaande deals die al aanwezig zijn.

Veelvoorkomende foutbronnen:

- Product handmatig toegevoegd in plaats van uit Product Library.
- Verkeerd of ontbrekend product.
- Contact, company of deal niet correct gekoppeld.
- `Software/Portaal/CSV` ontbreekt of staat verkeerd.
- Dealstage en property spreken elkaar tegen.

---

## 10. Software/Portaal/CSV

`Software/Portaal/CSV` bepaalt hoe Brand met de klant samenwerkt. Dit veld is verplicht bij `Offerte geaccepteerd start`, maar wordt later vaak gestuurd door de dealstage in Klantenbestand.

| Klantenbestand-stage | Propertywaarde | Betekenis |
|---|---|---|
| `CSV` | `CSV` | Klant levert gegevens handmatig via CSV. |
| `Portaal` | `Portaal` | Klant werkt via Brand-portaal. |
| `Software controle` | `Software` | Klant werkt in eigen software, Brand controleert. |
| `Software volledige service` | `Software volledige service` | Brand boekt volledig in de software van de klant. |

Belangrijke regel:

```text
De dealstage is leidend; wijzig bij voorkeur de stage, niet alleen handmatig de property.
```

Waarom dit belangrijk is:

- Automatiseringen gebruiken deze property om te bepalen in welke pipeline productdeals terechtkomen.
- Verkeerde waarde leidt tot verkeerde of ontbrekende productdeals.
- Rapportages en operationele planning raken vervuild als dit veld niet klopt.

---

## 11. Productpipelines

Productpipelines zijn waar het daadwerkelijke werk per dienst wordt opgevolgd. Ze worden automatisch gevuld vanuit Klantenbestand zodra line items aanwezig zijn.

### Hoofdproductpipelines

| Pipeline | Doel |
|---|---|
| `BTW - Q` | BTW-aangiftes per kwartaal. |
| `Jaarrekening` | Jaarrekening per boekjaar. |
| `Inkomstenbelasting` / `IB` | IB-aangiftes voor particuliere en ondernemers-IB. |
| `Vennootschapsbelasting` / `VPB` | VPB-aangiftes voor BV's en andere VPB-plichtige rechtspersonen. |
| `Administratie zonder BTW` | Kwartaaladministraties zonder BTW. |
| `Externe software: BTW` | BTW-proces voor softwareklanten. |
| `Externe software: Jaarrekening` | JR-proces voor softwareklanten. |
| `Externe software: VPB` | VPB-proces voor softwareklanten. |
| `Externe software: Volledige service` | Maandelijkse werkzaamheden voor klanten waarvoor Brand volledig in externe software boekt. |

### Doorlopende pipelines

Er is één doorlopende pipeline per producttype. Jaar, kwartaal en maand worden vastgelegd met properties zoals:

- `Jaar`.
- `Kwartaal`.
- `Maand`.

Daardoor hoeven er geen nieuwe pipelines per jaar of kwartaal te worden aangemaakt. Views/filters bepalen welk jaar of kwartaal zichtbaar is.

---

## 12. BTW-pipeline

De BTW-pipeline beheert alle BTW-aangiftes. De pipeline is doorlopend en wordt automatisch gevuld vanuit Klantenbestand.

### Belangrijke functies / logica

| Functie / logica | Betekenis |
|---|---|
| `find_correct_stage` | Bepaalt bij aanmaak de juiste beginstage. |
| `route_btw_by_deal_id_and_update` | Controleert continu of de BTW-deal nog in de juiste stage staat. |

### Bankkoppeling

De bankkoppeling is de belangrijkste factor in de BTW-pipeline.

| Situatie | Automatische betekenis |
|---|---|
| Bankkoppeling actief of geldig tot na volgend kwartaal | Deal kan naar `Gegevens gereed`; data zijn bruikbaar. |
| Bankkoppeling ontbreekt/inactief/verlopen | Deal blijft of gaat naar een openfase. |
| Eerder voortgang maar koppeling verlopen | Deal kan naar een specifieke verlopen-stage, zoals `2 maanden geboekt (bankkoppeling verlopen)`. |

### Veelvoorkomende BTW-stages

| Stage | Betekenis |
|---|---|
| `Open*` | Algemene instroom zonder actieve bankkoppeling of specifieke kenmerken. |
| `Open nieuwe bedrijven` | Nieuwe klanten na relevant kwartaal. |
| `Maandelijkse klant` | Klant met maandelijkse administratie. |
| `Portal werkt niet: CSV uitvragen` | Portaal of koppeling werkt niet; CSV nodig. |
| `Portal werkt niet: opnieuw koppelen` | Klant moet opnieuw inloggen/koppelen. |
| `Gegevens gereed` | Bankkoppeling actief; gegevens klaar voor verwerking. |
| `Toegewezen / In uitvoering` | Werk is toegewezen of wordt uitgevoerd. |
| `2 maanden geboekt` | Eerste twee maanden geboekt, derde volgt. |
| `Berekening compleet` | BTW-berekening afgerond. |
| `Controleproces` | Interne controle. |
| `Factuur en mail verzonden` | Aangifte afgerond, klant geïnformeerd en gefactureerd. |
| `Betaalt niet` | Werkzaamheden pauzeren wegens betalingsachterstand. |
| `Geen BTW nodig dit kwartaal` | Geen aangifte of andere boekhouder rondt af. |

### Automatische mailing

Als een BTW-deal naar `Toegewezen / In uitvoering` gaat, kan automatisch een mail naar de klant worden verstuurd. Belangrijk: deze mailing hoort alleen tijdens de BTW-maand plaats te vinden, niet bij vooruitboeken.

---

## 13. Jaarrekening-pipeline

De Jaarrekening-pipeline beheert het samenstellen, controleren en afronden van jaarrekeningen. De jaarrekening is een spil in het systeem.

### Belangrijke afhankelijkheden

| Koppeling | Betekenis |
|---|---|
| BTW -> Jaarrekening | Afgeronde BTW-kwartalen bepalen of de jaarrekening naar `Deels geboekt` of `Q1 tot Q4 geboekt` kan. |
| Jaarrekening -> IB | Als jaarrekening klaar of niet nodig is, kan IB verder. |
| IB -> Jaarrekening | Als IB wacht op JR, kan JR automatisch prioriteit krijgen. |
| Jaarrekening -> VPB | Als JR `Gecontroleerd & Gefactureerd` is, kan VPB naar `VPB kan gemaakt worden`. |

### Beginstages / routeerfactoren

Bij het aanmaken van een jaarrekeningdeal kijkt de backend onder andere naar:

- intensiteit van de klant;
- of het contact een jaarklant is;
- of er BTW-deals gekoppeld zijn;
- of het bedrijf nieuw is in het boekjaar;
- of de klant zelf een berekening maakt/levert.

### Typische stages

| Stage | Betekenis |
|---|---|
| `Open*` | Algemene instroomfase. |
| `Open nieuwe bedrijven` | Bedrijf is na het boekjaar aangemaakt. |
| `Maandelijkse klant` | Klant heeft maandelijkse werkzaamheden. |
| `Zonder BTW (jaarklant)` | Jaarklant zonder BTW-deals. |
| `Zonder BTW (geen jaarklant)` | Geen jaarklant en geen BTW-deals. |
| `Gegevens gereed` | Gegevens zijn compleet. |
| `Gegevens gereed prioriteit` | Jaarrekening heeft prioriteit, bijvoorbeeld omdat IB wacht. |
| `Deels geboekt` | Een deel van de BTW-kwartalen is geboekt. |
| `Q1 tot Q4 geboekt` | Alle BTW-kwartalen zijn geboekt. |
| `Jaarwerk in uitvoering` / `JR toegewezen / uitvoering` | Jaarrekening wordt uitgewerkt. |
| `Extra gegevens uitgevraagd` | Aanvullende info nodig. |
| `Gecontroleerd & Gefactureerd` | Jaarrekening is klaar en gefactureerd; kan IB/VPB activeren. |
| `Geen JR` | Geen jaarrekening nodig. |
| `Betaalt niet` | Geen werkzaamheden tot betaling is voldaan. |

---

## 14. Inkomstenbelasting-pipeline (`IB`)

De IB-pipeline beheert particuliere en ondernemers-IB-aangiftes. Deals worden automatisch aangemaakt vanuit Klantenbestand zodra het product `Inkomstenbelasting` aanwezig is.

### Belangrijkste voorwaarden

| Voorwaarde | Waarom belangrijk |
|---|---|
| Geldige machtiging / VIG | Zonder machtiging kan aangifte niet goed worden opgehaald/ingediend. |
| Jaarrekeningen afgerond | Voor IB moeten relevante jaarrekeningen van gekoppelde bedrijven klaar zijn of niet nodig zijn. |
| Typeform ingevuld | Kan nodig zijn voor ontbrekende IB-informatie. |
| Nieuw contact | Kan leiden tot stage `Open nieuwe klanten`. |

### Machtiging

Properties zoals `machtiging_actief` en `machtiging_ontvangen` bepalen mede de stage.

| Situatie | Mogelijke stage |
|---|---|
| Machtiging ontbreekt | `Open*`. |
| Machtiging actief en jaarrekeningen af | `Machtiging actief & JR af`. |
| Machtiging actief en Typeform ingevuld | `Machtiging actief & Typeform ingevuld`. |
| Machtiging actief, jaarrekeningen af en Typeform ingevuld | `IB gereed om te maken`. |

### Koppeling met Jaarrekening

- Zodra jaarrekeningen afgerond en gefactureerd zijn, checkt het systeem of de IB verder kan.
- Als IB alleen nog wacht op jaarrekening, kan de jaarrekeningdeal naar een prioriteitsstage worden verplaatst.

---

## 15. VPB-pipeline

De VPB-pipeline beheert de vennootschapsbelasting per bedrijf en boekjaar. Deze pipeline is sterk gekoppeld aan de Jaarrekening-pipeline.

### Belangrijke trigger

```text
Jaarrekening-deal van hetzelfde bedrijf en jaar komt op `Gecontroleerd & Gefactureerd`
-> gekoppelde VPB-deal gaat naar `VPB kan gemaakt worden` of krijgt prioriteit.
```

### Veelvoorkomende VPB-stages

| Stage | Betekenis |
|---|---|
| `Geen VPB` | Niet van toepassing of vrijgesteld. |
| `Betaalt niet` | Proces stopt wegens betalingsachterstand. |
| `Open*` | Algemene startstage. |
| `Open nieuwe bedrijven` | Bedrijf is recent gestart of na jaar aangemaakt. |
| `CSV` | Gegevens via CSV. |
| `VPB kan gemaakt worden` | JR is klaar; VPB kan worden opgesteld. |
| `In uitvoering` | VPB wordt opgesteld/gecontroleerd. |
| `Klaar voor controle` | Interne controlefase. |
| `Verstuurd naar klant + gefactureerd` | Klant heeft aangifte ontvangen en factuur is verzonden. |
| `VPB ingediend` | Aangifte is ingediend. |
| `Gedeponeerd` | Jaarrekening is gedeponeerd bij KvK; proces afgerond. |

---

## 16. Externe software-klanten

Sommige klanten werken in eigen boekhoudsoftware. Dat wijkt af van standaard Brand-portaalprocessen.

### Typen softwareklanten

| Type | Wat Brand doet | Pipelines |
|---|---|---|
| `Software controle` | Klant boekt zelf, Brand controleert periodiek. | Externe software: BTW, JR, VPB. |
| `Software volledige service` | Brand boekt volledig in software van klant. | Externe software: BTW, JR, VPB + Externe software: Volledige service. |

### Externe software: Volledige service

Deze pipeline volgt het maandelijkse boekhoudwerk voor klanten waarbij Brand volledig in de software van de klant werkt.

Belangrijke regels:

- Voor elke klant wordt per maand een deal aangemaakt.
- Intensiteit bepaalt de instroomstage: `Wekelijks`, `Maandelijks` of `Per kwartaal`.
- De maanddeal doorloopt stages zoals `Info uitgevraagd`, `Info ontvangen`, `In uitvoering`, `Compleet`.
- Als drie maanddeals van hetzelfde kwartaal op `Compleet` staan, wordt de gekoppelde BTW-deal automatisch naar `Berekening compleet` verplaatst.

---

## 17. Klantsoorten en klantstromen

Brand onderscheidt klantgroepen op basis van hoe de administratie wordt aangeleverd en verwerkt.

### Hoofdgroepen uit klantsoortenoverzicht

| Klantsoort | Verantwoordelijkheid / team | Kenmerken | Rol Brand |
|---|---|---|---|
| Softwarepakketklanten | Otto met team. | Klanten die werken met tools zoals Mollie, Moneybird, Exact Online, e-Boekhouden en bankkoppelingen. | Brand verwerkt en begeleidt de administratie, onder andere in ECAT. |
| Portaal-/CSV-klanten | Regulier boekhoudingsteam. | Vaak oudere of minder digitaal vaardige klanten; aanlevering via CSV of portaal. | Brand verwerkt administratie via CSV-exporten en portaal. |
| Softwareklanten | Klant doet veel zelf; Brand ondersteunt. | Klant voert administratie grotendeels zelf uit, bijvoorbeeld in Moneybird. | Brand helpt vooral bij jaarrekening en BTW-aangifte/controle. Deze groep lijkt op termijn te worden omgezet of uitgefaseerd. |

### Salesklantstromen

| Klantstroom | Betekenis | Beleidsrichting |
|---|---|---|
| `100% Portaal` / Brand-portaalklant | Klant gebruikt Brand-portaal volledig. Brand verzorgt boekhouding voor BTW, JR, VPB en/of IB. | Voorkeursgroep; efficiënt, schaalbaar en gestandaardiseerd. |
| `Controle software klanten` | Klant boekt zelf in externe software; Brand controleert. | Geen focus voor nieuwe klanten; liever overhalen naar Brand-portaal. |
| `Pakketklanten klein` | 1-2 entiteiten in externe software met minimaal aantal uren per maand. | Alleen rendabel vanaf voldoende maandelijkse afname. |
| `Pakketklanten maandelijks` | Boekhouding voor 1-3 dagen per maand per entiteit in externe software. | Voor grotere/groeiende klanten met behoefte aan inzicht. |
| `Pakketklanten wekelijks` | Wekelijkse inzet voor grotere klanten. | Kan binnen dienstverlening passen, zolang het geen detachering wordt. |
| `Pakketklant too big` | 3-5 dagen per week of op externe locatie. | Niet gewenst; Brand is geen detacheringsbedrijf. |

### Waarom Brand-portaal voorkeur heeft

- Gestandaardiseerde werkwijze.
- Betere schaalbaarheid.
- Brand verwerkt vanaf het begin alles zelf.
- Minder discussie over correcties in externe software.
- Bankkoppeling vereenvoudigt aanlevering en planning.
- Bonnen/facturen kunnen via app of webdesk worden aangeleverd.
- Dashboard en inzicht voor klant.
- Betere aansluiting tussen BTW-verwerking en jaarrekening.

---

## 18. Onboardingproces

Onboarding is bedoeld om na sales een volledig en juist beeld te krijgen van de administratie en de klantverwachtingen.

### Introductie onboardinggesprek

Doelen:

- Klant bedanken en doel van gesprek uitleggen.
- Uitleggen dat onboarding meer context geeft dan alleen salesnotities en e-mails.
- Aangeven wie de administratie coördineert/uitvoert.
- Communicatie loopt via `hallo@brandboekhouders.nl`, maar komt bij de juiste verantwoordelijke terecht.
- Samenvatten wat al bekend is en klant laten aanvullen of corrigeren.

### Administratie verleden

Uitvragen:

- Hoe administratie tot nu toe is gevoerd:
  - zelf;
  - Excel;
  - boekhouder/accountant;
  - boekhoudpakket.
- Welke stukken al zijn ontvangen:
  - jaarrekeningen;
  - IB-aangiftes;
  - VPB-aangiftes;
  - OB/BTW-aangiftes.
- Welke stukken ontbreken.
- Toegang tot boekhoudpakket of Excel-sheet indien relevant.

### Administratie heden

Uitvragen en toelichten:

- Wat valt op in bankmutaties?
- Welke punten staan in salesnotities?
- Hoe werkt het portaal?
- Hoe moeten bonnen en facturen worden aangeleverd?
- Boekingen gebeuren primair op basis van bonnen.
- Bij ontbrekende bonnen kan een inschatting worden gemaakt, maar onzekerheden komen terug in vragen bij conceptstukken.
- Zakelijke kosten via privérekening moeten worden aangeleverd via portaal of eventueel per mail.

### Inkomstenbelasting tijdens onboarding

Uitvragen:

- Verzorgt Brand de IB-aangifte van vorig jaar en/of huidig jaar?
- Is er een doorlopende machtiging actief, inclusief fiscale partner?
- Vooraf ingevulde gegevens zijn alleen beschikbaar bij tijdige machtiging.
- Als machtiging niet tijdig actief was, moet de VIG nog eenmalig handmatig worden aangeleverd.

---

## 19. Belangrijke termen en properties

| Term / property | Betekenis |
|---|---|
| `Dossier` | Overkoepelende klantmap waarin contacten, companies en deals samenkomen. |
| `Driehoekstructuur` | Deal, contact en company moeten onderling correct gekoppeld zijn. |
| `Line item` | Product/dienst op een deal, zoals BTW, JR, IB, VPB. Moet uit Product Library komen. |
| `Product Library` | HubSpot-bibliotheek met standaardproducten. Alleen deze worden betrouwbaar herkend door automatiseringen. |
| `Software/Portaal/CSV` | Bepaalt via welke werkwijze/pipeline de klant verwerkt wordt. |
| `Intensiteit` | Hoe vaak of intensief de administratie wordt verwerkt, bijvoorbeeld maandelijks, wekelijks of per kwartaal. |
| `Voertaal` | Taal van communicatie en documenten. |
| `Lead Source Wiecher` | Oorspronkelijke leadbron voor salesanalyse. |
| `Bankkoppeling` | Koppeling met zakelijke rekening; cruciaal voor BTW en portaalverwerking. |
| `VIG` / machtiging | Machtiging voor vooraf ingevulde gegevens / inkomstenbelasting. |
| `Typeform` | Formulier dat aanvullende IB-informatie kan opleveren. |
| `Geen [dienst] nodig` | Stage om automatisch aangemaakte maar irrelevante productdeals correct af te sluiten. |
| `Betaalt niet` | Stage waarin werkzaamheden worden gepauzeerd vanwege betalingsachterstand. |
| `Dummy company` | Extra company om productdeals gescheiden te houden wanneer meerdere contactpersonen hetzelfde product willen, bijvoorbeeld IB. |
| `Gecontroleerd & Gefactureerd` | Belangrijke eind-/triggerstage, vooral bij jaarrekening richting IB/VPB. |
| `Berekening compleet` | Stage waarin berekening gereed is, bijvoorbeeld BTW. |
| `Customer Service-deal` | Deal voor uitzonderingen zoals achterstallig werk of diensten buiten standaardpakket. |

---

## 20. Rechtsvormen en fiscale termen

| Term | Betekenis voor Brand-processen |
|---|---|
| `EZ` / eenmanszaak | Eén eigenaar, vaak starter/zzp'er. IB en mogelijk BTW/JR relevant. |
| `VOF` | Samenwerkingsverband met meerdere vennoten. Eén company kan meerdere contactpersonen hebben. |
| `BV` | Besloten vennootschap. Vaak VPB, jaarrekening en mogelijk DGA/IB-context. |
| `Holding` | BV die aandelen houdt in werkmaatschappij; vaak onderdeel van holding-WM-structuur. |
| `Werkmaatschappij` / `WM` | Operationele BV waarin bedrijfsactiviteiten plaatsvinden. |
| `Holding-WM structuur` | Holding bezit werkmaatschappij. Administratief meerdere entiteiten; deals en companies gescheiden houden. |
| `BTW` | Omzetbelasting; vaak per kwartaal. |
| `IB` | Inkomstenbelasting; relevant voor ondernemers en particulieren. |
| `VPB` | Vennootschapsbelasting; relevant voor BV's en sommige rechtspersonen. |
| `JR` | Jaarrekening. Belangrijke schakel richting IB en VPB. |
| `OB` | Omzetbelasting, vaak synoniem gebruikt met BTW-aangifte. |
| `ICP/OSS` | Internationale BTW-context bij intracommunautaire prestaties of EU-afstandsverkopen. |
| `Nulaangifte` | Alleen passend als er echt geen omzet en kosten zijn in een kwartaal. |
| `BTW verlegd` | BTW wordt naar opdrachtgever verlegd; vaak bouwsector. |
| `BTW vrijgesteld` | Geen BTW over bepaalde omzet, bijvoorbeeld zorg; kan invloed hebben op aftrek en aangifte. |

---

## 21. Sector- en klantcontext

Gebruik deze context alleen als de code of beschrijving daarom vraagt.

| Context | Relevantie |
|---|---|
| Horeca | Vaak veel transacties en verschillende BTW-percentages; intake met Wiecher genoemd in salesmateriaal. |
| Bouw | Regelmatig BTW-verlegd; extra nauwkeurigheid nodig. |
| Zorg | Vaak deels of volledig BTW-vrijgesteld; toch kan BTW-aangifte nodig zijn. |
| E-commerce | Kan ICP/OSS en buitenlandse omzet bevatten. |
| Niet-Nederlandstalige klanten | Meer communicatie/vertaling en begeleiding nodig; beïnvloedt sales/prijscontext, maar niet automatisch code. |
| Grotere klanten | Werken vaker in externe software zoals Exact Online en hebben meer behoefte aan rapportages/inzichten. |

---

## 22. Hoe bedrijfscontext gebruiken bij codebeschrijving

Wanneer code een HubSpot-object bewerkt:

- `contact` betekent meestal de persoon waarmee gecommuniceerd wordt.
- `company` betekent de juridische entiteit/het bedrijf waarop administratie en productdeals draaien.
- `deal` kan salesdeal, klantenbestanddeal of productdeal zijn; benoem altijd welke pipeline.
- `dossier` betekent overkoepelende klantmap.

Wanneer code deals aanmaakt:

- Beschrijf welk product of proces de deal vertegenwoordigt.
- Beschrijf op welk niveau de deal wordt aangemaakt: contactniveau of companyniveau.
- Controleer of line items, jaar/kwartaal/maand en `Software/Portaal/CSV` relevant zijn.

Wanneer code dealstages wijzigt:

- Beschrijf welke bedrijfsstatus hiermee wordt weergegeven.
- Benoem of dit een handmatige status, triggerstatus, werkstatus of eindstatus is.
- Benoem vervolgautomatiseringen, bijvoorbeeld:
  - salesdeal akkoord -> Klantenbestand;
  - Klantenbestand actief -> productdeals;
  - BTW afgerond -> Jaarrekening voortgang;
  - Jaarrekening klaar -> IB/VPB voortgang;
  - drie maanddeals compleet -> BTW berekening compleet.

Wanneer code validaties bevat:

- Koppel deze aan bedrijfsrisico's:
  - ontbrekende driehoek -> geen betrouwbare productdeals;
  - handmatig line item -> product niet herkend;
  - verkeerde property -> verkeerde pipeline;
  - ontbrekende bankkoppeling -> BTW niet werk-klaar;
  - ontbrekende VIG -> IB niet klaar.

Wanneer code mails/reminders verstuurt:

- Controleer of de trigger bij sales, BTW, onboarding of portaal hoort.
- Benoem dat automatische communicatie afhankelijk is van correcte naamvelden, contactgegevens en timing.
- Let op dat sommige mails alleen in specifieke periodes horen, zoals BTW-maand.

---

## 23. Voorbeeldformuleringen voor codebeschrijvingen

### Voorbeeld 1 - productdeals aanmaken

> Deze functie vertaalt de hoofddeal in het Klantenbestand naar operationele productdeals. Op basis van de line items, de driehoekstructuur en de property `Software/Portaal/CSV` bepaalt de backend welke deals moeten bestaan voor BTW, Jaarrekening, IB, VPB of externe software. De functie is afhankelijk van correcte HubSpot-koppelingen en producten uit de Product Library. Als een product handmatig is toegevoegd of de company/contact-koppeling ontbreekt, kunnen productdeals ontbreken of in de verkeerde pipeline terechtkomen.

### Voorbeeld 2 - BTW-stage bepalen

> Deze functie bepaalt of een BTW-deal werk-klaar is. De belangrijkste businessvoorwaarde is de bankkoppeling: bij een actieve koppeling kan de deal naar `Gegevens gereed`, terwijl een verlopen of ontbrekende koppeling de deal in een open- of herstelstage houdt. Daarmee voorkomt de automatisering dat een BTW-aangifte wordt opgepakt zonder actuele bankdata.

### Voorbeeld 3 - Jaarrekening activeert VPB

> Deze automatisering koppelt de afronding van de jaarrekening aan de VPB-pipeline. Zodra de jaarrekening van hetzelfde bedrijf en boekjaar op `Gecontroleerd & Gefactureerd` staat, wordt de VPB-deal zichtbaar werk-klaar gemaakt door deze naar `VPB kan gemaakt worden` te verplaatsen of prioriteit te geven. De jaarrekening fungeert hier als voorwaarde voor de fiscale vervolgstap.

### Voorbeeld 4 - onboardinggegevens

> Deze module ondersteunt de overgang van salesinformatie naar uitvoerbare klantadministratie. De onboardingcontext is bedoeld om te controleren hoe de administratie historisch is gevoerd, welke stukken ontbreken, hoe bonnen en facturen via het portaal worden aangeleverd en of IB-machtigingen of privébetaalde zakelijke kosten nog aandacht vragen.

---

## 24. Belangrijkste foutpatronen die code kan voorkomen

1. Productdeals ontbreken omdat line items niet uit de Product Library komen.
2. Verkeerde productpipeline door foutieve `Software/Portaal/CSV`.
3. Workflows lopen niet omdat Contact, Company en Deal niet als driehoek gekoppeld zijn.
4. BTW-deal staat onterecht werk-klaar terwijl bankkoppeling ontbreekt of verlopen is.
5. IB-deal wordt te vroeg opgepakt zonder actieve VIG/machtiging of afgeronde jaarrekening.
6. VPB wordt niet geactiveerd omdat de jaarrekening niet correct op `Gecontroleerd & Gefactureerd` staat.
7. Meerdere entiteiten worden samengevoegd terwijl ze administratief gescheiden moeten blijven.
8. Holding en werkmaatschappij worden in verkeerde volgorde of met verkeerde IDs gebruikt.
9. Automatische mails gebruiken verkeerde aanhef door foutieve voornaam/achternaamvelden.
10. Uitzonderingen zoals achterstallig werk ontbreken in onboarding of Customer Service.

---

## 25. Bronbestanden waarop deze context is gebaseerd

Deze context is samengesteld uit de volgende aangeleverde documenten:

- `Handboek Pipeline.pdf` - HubSpot-structuur, Sales Pipeline, Klantenbestand, productpipelines, BTW, Jaarrekening, IB, VPB en externe softwarelogica.
- `Belangrijkste_inzichten_Handboek_Pipeline.pdf` - compacte samenvatting van automatiseringsfocus, triggers en afhankelijkheden.
- `Handboek Sales(1).pdf` - salesafspraken, rollen, dealstages, HubSpot-invoerregels en akkoord verwerken.
- `Belangrijkste_inzichten_Handboek_Sales.pdf` en/of `Handboek Sales.pdf` - compacte samenvatting van salesautomatiseringen en invoerregels.
- `Draaiboek onboarding.docx` - onboardinggesprek, administratie verleden/heden, portaal, IB en machtigingen.
- `Sales Presentatie Nieuwe Prijzen (1).pdf` - bedrijfsintroductie, klantstromen, Brand-portaalvoorkeur, externe pakketcontext en salescontext.
- `overzicht_klantsoorten_brandboekhouding.docx` - klantgroepen, verantwoordelijkheden, systemen en werkwijze.
