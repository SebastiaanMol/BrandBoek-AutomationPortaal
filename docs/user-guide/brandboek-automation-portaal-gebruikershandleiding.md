# Gebruikershandleiding BrandBoek Automation Portaal

Versie: 1.0  
Datum: 6 juli 2026  
Doelgroep: collega-gebruikers van Brand Boekhouders  
Beheerder handleiding: `[vul interne eigenaar in]`  
Portaal-URL: `[vul productie-URL in]`

## 1. Introductie & Toegang

### Doel van het portaal

Het BrandBoek Automation Portaal is een intern portaal voor inzicht in processen, automations, imports, pipelines, analyses, systemen en eigenaarschap. Het portaal helpt om snel te zien welke automatiseringen bestaan, waar ze bij horen, welke brondata is gevonden en waar beheeracties nodig zijn.

Gebruik het portaal voor:

- het opzoeken van bestaande automations;
- het controleren van bronwijzigingen uit HubSpot of GitLab;
- het bekijken van procesreizen en procesviews;
- het analyseren van pipelines, errors en bronkwaliteit;
- het raadplegen van systemen, eigenaren en Brandy.

### Systeemeisen

Het portaal werkt het beste op een laptop of desktop met een moderne browser.

Aanbevolen browsers:

- Google Chrome;
- Microsoft Edge.

Mobiel gebruik is mogelijk voor raadplegen, maar voor beheeracties zoals Imports controleren of procesviews bekijken is een groter scherm aanbevolen.

### Inloggen

1. Open de portaal-URL: `[vul productie-URL in]`.
2. Log in met het interne account dat toegang heeft tot het portaal.
3. Wacht tot het dashboard opent.

Als tweestapsverificatie actief is, volg dan de extra stap in het inlogscherm. Gebruik alleen de officiële interne loginmethode.

### Uitloggen

1. Kijk linksonder in de zijbalk.
2. Klik op het gebruikersprofiel of op `Sign out`.
3. Sluit de browser als op een gedeelde computer is gewerkt.

### Wachtwoord wijzigen of herstellen

Gebruik de normale interne wachtwoordprocedure van Brand Boekhouders. Als het portaal geen herstelmail toont of de login niet werkt, neem contact op met `[vul supportcontact in]`.

## 2. Navigatie & Basis

### Dashboard

Het dashboard is het startpunt van het portaal. Hier staan samenvattingen, waarschuwingen en signalen die helpen bepalen waar aandacht nodig is.

![Dashboard overzicht](assets/dashboard-overzicht.png)

Let vooral op:

- open signalen of waarschuwingen;
- automations met fouten;
- proces- of bronkwaliteitssignalen;
- overzichten per systeem of status.

### Zijbalk

De zijbalk links is de hoofdroute door het portaal.

Belangrijkste onderdelen:

- `Dashboard`: algemeen overzicht;
- `Automations`: alle automations en details;
- `Procesreis`: procesreizen en conceptprocesreizen;
- `Imports`: bronwijzigingen controleren en toepassen;
- `Systemen & Eigenaren`: overzicht van systemen, eigenaren en gekoppelde automations;
- `Procesviewer`: procesviews en processtatus;
- `Pipelines`: HubSpot-pipelines en handmatige processen;
- `Analysis`: analyses en bronkwaliteit;
- `Brandy`: vraag- en analyseomgeving;
- `Settings`: integraties en synchronisatie-instellingen.

### Breadcrumbs

Bovenin de pagina staat waar je bent in het portaal. Gebruik deze kruimelroute om te controleren of je op de juiste pagina zit.

### Notificaties

Rechtsboven staat de notificatiebel. Nieuwe meldingen staan open totdat ze zijn bekeken. Gelezen meldingen worden apart bewaard.

### Rollen en rechten

Wat een gebruiker kan zien of wijzigen hangt af van het account. In deze handleiding wordt uitgegaan van een collega-gebruiker met normale toegang. Als een knop of pagina ontbreekt, kan dat door rechten komen.

Neem bij twijfel contact op met `[vul supportcontact in]`.

## 3. Kernfuncties Stap Voor Stap

### Automations bekijken

Gebruik `Automations` om bestaande automatiseringen te zoeken, filteren en openen.

![Automations overzicht](assets/automations-overzicht.png)

Stappen:

1. Klik in de zijbalk op `Automations`.
2. Gebruik zoeken of filters om een automation te vinden.
3. Klik op een automation om de detailpagina te openen.

Resultaat: de detailpagina toont de beschrijving, bron, status, systemen, stappen en technische context van de automation.

### Automationdetails openen

![Automation detail](assets/automation-detail.png)

Gebruik de detailpagina om te begrijpen wat een automation doet.

Controleer vooral:

- naam en status;
- doel of beschrijving;
- trigger;
- systemen;
- stappen of acties;
- webhook- of endpointinformatie;
- gekoppelde broninformatie.

Aandachtspunt: pas informatie alleen aan als zeker is dat de wijziging klopt. Handmatige tekst in het portaal kan bewust afwijken van automatisch opgehaalde brondata.

### Imports controleren

Gebruik `Imports` om wijzigingen uit bronnen zoals HubSpot of GitLab te controleren.

![Imports overzicht](assets/imports-overzicht.png)

Stappen:

1. Klik in de zijbalk op `Imports`.
2. Controleer het aantal open bronwijzigingen.
3. Gebruik filters zoals bron, type of selectie.
4. Open een automationgroep om de losse punten te bekijken.
5. Vink alleen de punten aan die verwerkt mogen worden.
6. Klik onderaan op `X geselecteerde regels toepassen`.

Belangrijk: bulkselectie geldt alleen voor de huidige pagina. Pas niet zomaar alles toe.

Typen importregels:

- `Nieuw`: nieuwe automation gevonden;
- `Gewijzigd`: echte bronwijziging gevonden;
- `Webhook gewijzigd`: route of webhook is veranderd;
- `Brondata incompleet`: bron mist nuttige informatie;
- `Niet meer gevonden`: automation staat in het portaal, maar is niet meer teruggevonden in de bron.

Bronwaarschuwingen maken geen nieuwe automation aan. Ze registreren dat de brondata onvolledig of verdacht is.

### Synchroniseren vanuit Imports

Op de Imports-pagina staan knoppen zoals `HubSpot synchroniseren` en `GitLab synchroniseren`.

Gebruik deze knoppen alleen als nieuwe brondata gecontroleerd moet worden.

Wat er gebeurt:

1. Het portaal haalt de nieuwste data uit de bron op.
2. De brondata wordt vergeleken met het portaal.
3. Nieuwe of gewijzigde punten verschijnen in Imports.
4. Oude dubbele of achterhaalde reviewregels worden automatisch opgeruimd.

Als synchroniseren mislukt, controleer dan eerst Settings of neem contact op met de beheerder.

### Procesreis gebruiken

De pagina `Procesreis` toont procesreizen en procesmatige samenhang tussen stappen, automations en bronnen.

![Procesreis overzicht](assets/procesreis-overzicht.png)

Stappen:

1. Klik op `Procesreis`.
2. Kies een bestaande procesreis of conceptprocesreis.
3. Open de details om stappen, bewijs en gekoppelde automations te bekijken.

Gebruik dit scherm vooral om te begrijpen hoe een proces loopt en welke automations erin meedoen.

### Procesviewer openen

De `Procesviewer` toont procesviews, processtatus en kwaliteit per pipeline of proces.

![Procesviewer overzicht](assets/procesviewer-overzicht.png)

Stappen:

1. Klik op `Procesviewer`.
2. Zoek of filter op pipeline of proces.
3. Open een viewer om de procesflow te bekijken.
4. Controleer processtatus, kwaliteit, errors en gekoppelde automations.

Processtatussen kunnen helpen bepalen of een proces al is ingericht, in review staat of akkoord is.

### Pipelines bekijken

De pagina `Pipelines` toont HubSpot-pipelines en handmatige processen buiten HubSpot.

![Pipelines overzicht](assets/pipelines-overzicht.png)

Stappen:

1. Klik op `Pipelines`.
2. Zoek of filter op pipeline.
3. Open een pipeline om stages en gekoppelde informatie te bekijken.

Gebruik dit scherm om inzicht te krijgen in dealstages, actieve pipelines en procesdekking.

### Analysis raadplegen

De pagina `Analysis` bevat analyses over bronkwaliteit, webhooks, endpoints, errors en procesdekking.

![Analyse overzicht](assets/analyse-overzicht.png)

Stappen:

1. Klik op `Analysis`.
2. Bekijk de signalen en tabellen.
3. Gebruik de informatie om risico's, fouten of ontbrekende koppelingen te herkennen.

Dit scherm is vooral bedoeld om trends en aandachtspunten te vinden. Voor acties ga je meestal naar Automations, Imports of Procesviewer.

### Systemen & Eigenaren gebruiken

Deze pagina helpt om te zien welke systemen bestaan, wie eigenaar is en welke automations eraan gekoppeld zijn.

![Systemen en eigenaren overzicht](assets/systemen-eigenaren-overzicht.png)

Stappen:

1. Klik op `Systemen & Eigenaren`.
2. Zoek op systeem, eigenaar of automation.
3. Open details als meer context nodig is.

Gebruik dit overzicht bij vragen als: wie beheert dit systeem, of welke automations hangen aan dit systeem?

### Brandy gebruiken

Brandy is de vraag- en analyseomgeving binnen het portaal.

![Brandy overzicht](assets/brandy-overzicht.png)

Stappen:

1. Klik op `Brandy`.
2. Stel een concrete vraag over een automation, proces of bron.
3. Controleer het antwoord met de gekoppelde portaalinformatie.

Voor goede antwoorden:

- noem de pipeline, automation of bron zo specifiek mogelijk;
- vraag door als het antwoord te algemeen is;
- controleer belangrijke beslissingen altijd in het portaal zelf.

### Settings en integraties bekijken

Settings bevat instellingen en integraties, zoals HubSpot, GitLab, Zapier en Typeform.

![Settings integraties](assets/settings-integraties.png)

Stappen:

1. Klik onderaan de zijbalk op `Settings`.
2. Bekijk de integratiekaart die relevant is.
3. Controleer status, sync-knoppen of foutmeldingen.

Let op: instellingen kunnen invloed hebben op imports en synchronisaties. Wijzig alleen instellingen als dat binnen je rol past.

## 4. Verplichte Velden en Invoer

Algemene invoerregels:

- gebruik duidelijke namen;
- vul verplichte velden voordat je opslaat;
- gebruik filters om grote lijsten kleiner te maken;
- controleer datum- en statusvelden voordat je wijzigingen opslaat;
- upload of plak geen tokens, wachtwoorden of geheime sleutels in vrije tekstvelden.

Bij Imports:

- selecteer alleen regels die bewust verwerkt mogen worden;
- controleer bij `Webhook gewijzigd` altijd de oude en nieuwe waarde;
- laat twijfelachtige bronwaarschuwingen openstaan en vraag hulp.

## 5. Foutmeldingen en Probleemoplossing

### Ik kan niet inloggen

Controleer:

1. Is de portaal-URL correct?
2. Gebruik je het juiste interne account?
3. Werkt je wachtwoord of 2FA?
4. Probeer Chrome of Edge.

Blijft het probleem bestaan, neem contact op met `[vul supportcontact in]`.

### De pagina blijft leeg of laadt langzaam

Probeer:

1. Ververs de pagina.
2. Controleer je internetverbinding.
3. Gebruik Chrome of Edge.
4. Log uit en opnieuw in.

Als alleen een specifieke pagina leeg blijft, noteer de pagina en meld dit aan de beheerder.

### Een sync mislukt

Controleer:

1. Of de juiste integratie in `Settings` beschikbaar is.
2. Of er geen melding staat over ontbrekende tokens of rechten.
3. Of de fout alleen bij één bron optreedt.

Voer dezelfde sync niet herhaaldelijk uit als dezelfde fout terugkomt. Meld het probleem met bronnaam en tijdstip.

### Ik zie onverwacht veel importregels

Gebruik filters om te controleren welk type regels openstaat.

Let op:

- meerdere punten kunnen bij dezelfde automation horen;
- bronwaarschuwingen zijn niet altijd directe acties;
- oude of dubbele regels horen automatisch opgeschoond te worden na een nieuwe sync.

Meld het als het aantal plotseling sterk stijgt of als dezelfde automation onlogisch vaak terugkomt.

### Ik kan een automation niet vinden

Probeer:

1. Zoek op een kort deel van de naam.
2. Zoek op bron of systeem.
3. Controleer of filters actief zijn.
4. Kijk of de automation misschien onder een andere naam uit de bron is geïmporteerd.

### Brandy geeft een te algemeen antwoord

Stel de vraag specifieker.

Voorbeeld:

Niet ideaal:

```text
Wanneer gaat BTW verder?
```

Beter:

```text
Welke voorwaarden moet een BTW-deal hebben om van Open naar Gegevens gereed te gaan?
```

Controleer belangrijke antwoorden altijd met de onderliggende automation- of procesinformatie.

## 6. Veelgestelde Vragen

### Moet alles in Imports worden toegepast?

Nee. Imports is een controlelijst. Pas alleen regels toe die bewust akkoord zijn.

### Wat betekent Brondata incompleet?

De bron heeft niet genoeg informatie geleverd om alles volledig te beoordelen. Dit is een waarschuwing, geen automatische fout.

### Worden handmatige teksten overschreven door sync?

Bestaande handmatige portaalteksten horen niet automatisch overschreven te worden door sync. Nieuwe automations kunnen wel eenmalig automatisch worden gevuld.

### Kan ik op mobiel werken?

Raadplegen kan, maar beheeracties zijn beter op desktop of laptop.

### Waar staan nieuwe automations na toepassen?

Nieuwe goedgekeurde automations verschijnen in `Automations`.

### Waarom zie ik andere knoppen dan een collega?

Dat kan komen door rollen, rechten of actieve filters.

## 7. Support

Neem contact op met `[vul supportcontact in]` bij:

- loginproblemen;
- ontbrekende rechten;
- terugkerende sync-fouten;
- onverwacht veel importregels;
- twijfel over het toepassen van wijzigingen;
- ontbrekende of onjuiste data.

Vermeld bij een melding:

- welke pagina is gebruikt;
- wat je probeerde te doen;
- welke foutmelding zichtbaar was;
- het tijdstip;
- eventueel een screenshot zonder gevoelige gegevens.

## 8. Versiebeheer

| Versie | Datum | Wijziging | Auteur |
| --- | --- | --- | --- |
| 1.0 | 6 juli 2026 | Eerste gebruikershandleiding voor collega-gebruikers | `[vul auteur in]` |

Controleer bij gebruik altijd of de handleidingdatum past bij de huidige versie van het portaal.
