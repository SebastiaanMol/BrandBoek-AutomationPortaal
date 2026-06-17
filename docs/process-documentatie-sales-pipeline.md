# Procesdocumentatie - Sales Pipeline

## 1. Managementsamenvatting

**Procesnaam:**  
Sales Pipeline

**Doel van het proces:**  
De Sales Pipeline beschrijft hoe een commerciële lead of deal wordt opgevolgd vanaf eerste contact of offerte-start tot klantconversie, verlies, geen contact of persoonlijke behandeling. Het proces geeft management inzicht in waar opvolging plaatsvindt, welke routes tot klant worden geleid, waar deals uitvallen en welke handmatige uitzonderingen buiten de normale hoofdflow bestaan.

**Korte uitleg van de procesview:**  
Deze procesview laat zien hoe de Sales Pipeline verloopt vanaf start/offerte of eerste mailcontact tot eindstatussen zoals `Naar klantenbestand`, `Verloren`, `GEEN CONTACT`, `Disqualified` of `TaxMate`. De view bestaat uit swimlanes, processtappen, routes, beslismomenten, gekoppelde/gerelateerde automations en een handmatig uitzonderingsblok voor persoonlijke behandeling.

**Belangrijkste inzicht voor management:**  
De Sales Pipeline is geen simpele lineaire pipeline. Het proces bestaat uit meerdere opvolgstromen: telefonisch/mailcontact, no-show opvolging, offerte/chase, maandelijkse warmhoudmomenten, acceptatie met of zonder BTW en persoonlijke uitzonderingsbehandeling. Het belangrijkste bestuurlijke aandachtspunt is dat veel routes handmatig gemodelleerd zijn en dat de automations wel gerelateerd zijn aan de Sales Pipeline, maar in de opgeslagen process state niet als directe canvas-links zijn vastgelegd.

**Status procesdocumentatie:**

* Status: technisch bewezen op basis van opgeslagen ProcessState; inhoudelijke procesvalidatie door proceseigenaar blijft nodig.
* Laatst bijgewerkt: 2026-06-17
* Bron: opgeslagen ProcessState voor pipeline `802700718`, pipeline stages en automation database.

---

## 2. Scope van het proces

**Binnen scope:**

* Sales-opvolging vanaf start/offerte of eerste mailcontact.
* Telefonische opvolging bij geen gehoor.
* Route naar mailcontact eerste lijn.
* Fysieke afspraak, no-show en no-show chase.
* Offerte opstellen, offerte opvolging en akkoord.
* Warmhouden tot specifieke opvolgmaand.
* Acceptatie met of zonder BTW.
* Verlies-, disqualified-, geen-contact- en TaxMate-eindroutes.
* Persoonlijke handmatige behandeling door specifieke medewerkers.

**Buiten scope:**

* Uitvoering van de daadwerkelijke salesgesprekken.
* Juridische/contractuele inhoud van offertes.
* Onboarding na overdracht naar klantenbestand.
* Volledige technische inhoud van elke HubSpot/Zapier automation.
* Performance-rapportage of conversieanalyse per stage.

**Startpunt:**  
Het proces start vanuit een start-event en het beslismoment `Start doormiddel van offerte`. Deals kunnen starten via `Offerte verstuurd` of `Mail verstuurd`, afhankelijk van hoe de deal de pipeline binnenkomt.

**Eindpunt:**  
Het proces is afgerond wanneer een deal naar een eindstatus gaat: `Naar klantenbestand`, `Verloren`, `GEEN CONTACT`, `Disqualified`, `TaxMate`, `Offerte geaccepteerd start` of `Offerte geaccepteerd start - met BTW`. De status/output wordt bewezen door de opgeslagen processtap en de route in de ProcessState.

**Betrokken systemen:**

* HubSpot
* Zapier
* Outlook
* Facebook Lead Ads
* Typeform
* Google Ads
* WeFact
* Supabase
* Procesviewer / Proces Editor
* Handmatige werkzaamheden door salesmedewerkers

---

## 3. Procesmodel-bron

**Bronmodel:**  
Deze documentatie is gebaseerd op de opgeslagen process state van de Procesviewer/Proces Editor voor de Sales Pipeline.

**Belangrijkste modelelementen:**

* Steps: 71 processtappen, events, gateways en terminate-events.
* Connections: 90 routes tussen stappen.
* Automations: 40 gerelateerde automations uit de automation database.
* Attachments: 0 opgeslagen BPMN attachments.
* Artifacts: 1 manual exception block.
* Lanes: Sales en Klantrelaties zijn zichtbaar gebruikt in deze process state.
* Flow links: geen opgeslagen flow links.

**Belangrijke documentatieregel:**  
De tekstdocumentatie volgt de opgeslagen process state. Als de visual en de tekst afwijken, moet het opgeslagen procesmodel worden gecontroleerd.

---

## 4. Swimlanes en verantwoordelijkheden

| Swimlane | Rol/team | Verantwoordelijkheid in dit proces |
| --- | --- | --- |
| Sales | Sales team | Hoofdverantwoordelijk voor contact, opvolging, offerte, no-show, chase, akkoord en eindstatussen. |
| Klantrelaties | Eerste lijn / klantrelatie-opvolging | Behandelt `Mail contact eerste lijn` wanneer de route vanuit gehoor/contact naar eerste-lijns opvolging loopt. |

Niet actief of niet zichtbaar gebruikt in deze opgeslagen process state: Marketing, Onboarding, Boekhouding en Management.

---

## 5. Normale procesflow

1. **Start**
   Het proces start bij het start-event in de Sales-lane. Daarna volgt het beslismoment `Start doormiddel van offerte`.

2. **Start doormiddel van offerte**
   Als het proces via een offerte start, loopt de route naar `Offerte verstuurd` en daarna naar `Mail verstuurd`. Anders kan het proces direct bij `Mail verstuurd` verdergaan.

3. **Mail verstuurd en gehoor**
   Na `Mail verstuurd` volgt het beslismoment `Gehoor`. Bij gehoor/contact kan het proces door naar `Mail contact eerste lijn`. Bij geen gehoor volgt de reeks `Geen gehoor 1` tot en met `Geen gehoor 4`, met meerdere `Gehoor?`-beslissingen.

4. **Geen contact of eerste-lijns contact**
   Als er na meerdere pogingen geen contact ontstaat, loopt de route naar `GEEN CONTACT` en daarna naar een verlies/terminate-route. Als er wel contact ontstaat, gaat de route naar `Mail contact eerste lijn`.

5. **Fysieke afspraak en show/no-show**
   Vanuit `Mail contact eerste lijn` gaat de route naar `Fysieke afspraak gemaakt`. Daarna beslist `Show/No show` of de deal via `No show` en `No show chase` wordt opgevolgd, of dat de inhoudelijke salesroute verdergaat.

6. **Interne beoordeling en offerte**
   De route loopt via `Interne beoordeling` en `Optie voor taxmate?`. Mogelijke uitkomsten zijn `Disqualified`, `TaxMate`, `Offerte opgesteld en verzonden` of verdere offerte-opvolging.

7. **Offerte opvolging**
   Na `Offerte opgesteld en verzonden` volgt `Reactie?`. Bij reactie/akkoord gaat de route naar `Akkoord`. Bij geen of latere reactie loopt de route via `Chase 1`, `Chase 2.5`, `Chase 3.8`, `Chase 4.14` en `Chase Laatste Keer`.

8. **Warmhouden en opvolgmaand**
   Als de deal later moet worden opgevolgd, loopt de route naar `Geaccepteerd warm houden`, `Opvolg maand?` en een maandstage van januari tot en met december 2026. Daarna volgt `Klant opnieuw benaderen in specifieke maand`.

9. **Akkoord en klantconversie**
   Na `Akkoord` of na herbenadering volgt `Akkoord?`. Bij akkoord loopt de deal naar `Akkoord met of zonder BTW`, daarna naar `Offerte geaccepteerd start` of `Offerte geaccepteerd start - met BTW`, en uiteindelijk naar `Naar klantenbestand`.

10. **Eindstatussen**
   Het proces eindigt bij klantconversie, verlies, geen contact, disqualified of TaxMate. Persoonlijke behandeling is apart gemodelleerd als handmatige uitzondering en is niet onderdeel van de verplichte hoofdroute.

---

## 6. Stapdocumentatie

| ID | Stapnaam | Type | Lane/team | Doel | Trigger | Input | Actie | Output | Systeem | Status bewijs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | Start | start | Sales | Proces starten | Nieuwe of bestaande deal wordt in de salesflow opgepakt | Deal/context | Startpunt bepalen | Route naar startbeslissing | Procesviewer | Bewezen |
| S02 | Start doormiddel van offerte | decision | Sales | Bepalen of de deal via offerte start | Start-event | Dealstage/context | Route kiezen | Offerte-route of mail-route | Procesviewer/HubSpot | Bewezen, inhoudelijk valideren |
| S03 | Offerte verstuurd | task | Sales | Vastleggen dat offerte al verstuurd is | Offerte-start | Offerte/deal | Deal doorzetten naar mail/opvolging | Mail verstuurd | HubSpot | Bewezen |
| S04 | Mail verstuurd | task | Sales | Eerste mailopvolging registreren | Start of offerte verstuurd | Dealgegevens | Mail/opvolging uitvoeren | Beslissing `Gehoor` | HubSpot/Outlook | Bewezen |
| S05 | Gehoor | decision | Sales | Bepalen of contact is ontstaan | Mail verstuurd | Contactreactie | Beslissen over opvolgroute | Eerste lijn of geen-gehoor route | Handmatig/HubSpot | Te valideren |
| S06 | Geen gehoor 1 | task | Sales | Eerste geen-gehoor opvolging | Geen gehoor | Deal/contactgegevens | Telefonische/mail opvolging | Nieuwe `Gehoor?` beslissing | HubSpot/Zapier/Outlook | Bewezen |
| S07 | Geen gehoor 2 | task | Sales | Tweede geen-gehoor opvolging | Nog geen gehoor | Deal/contactgegevens | Opvolging uitvoeren | Nieuwe `Gehoor?` beslissing | HubSpot/Zapier/Outlook | Bewezen |
| S08 | Geen gehoor 3 | task | Sales | Derde geen-gehoor opvolging | Nog geen gehoor | Deal/contactgegevens | Opvolging uitvoeren | Nieuwe `Gehoor?` beslissing | HubSpot/Zapier/Outlook | Bewezen |
| S09 | Geen gehoor 4 | task | Sales | Laatste geen-gehoor poging | Nog geen gehoor | Deal/contactgegevens | Laatste opvolging uitvoeren | Contact of geen-contact route | HubSpot/Zapier/Outlook | Bewezen |
| S10 | GEEN CONTACT | task | Sales | Vastleggen dat contact niet gelukt is | Geen gehoor na opvolging | Contactpogingen | Deal markeren als geen contact | Verliesroute | HubSpot | Bewezen |
| S11 | Mail contact eerste lijn | task | Klantrelaties | Eerste-lijns contact opvolgen | Gehoor/contact | Klantreactie | Mailcontact behandelen | Fysieke afspraak | HubSpot/Outlook | Bewezen |
| S12 | Fysieke afspraak gemaakt | task | Sales | Afspraak registreren | Eerste-lijns contact succesvol | Afspraakgegevens | Afspraak plannen/vastleggen | Show/no-show beslissing | HubSpot | Bewezen |
| S13 | Show/No show | decision | Sales | Bepalen of afspraak doorging | Afspraakmoment | Aanwezigheid/uitkomst | Route kiezen | No-show chase of vervolg | Handmatig/HubSpot | Te valideren |
| S14 | No show | task | Sales | No-show registreren | Klant komt niet opdagen | Afspraakstatus | No-show vastleggen | No-show chase | HubSpot | Bewezen |
| S15 | No show chase | task | Sales | No-show opvolgen | No-show | Deal/contactgegevens | Chase uitvoeren | Begin BTW maand of chase-route | HubSpot | Bewezen |
| S16 | Begin BTW maand? | decision | Sales | Bepalen of BTW-maand opvolging nodig is | No-show chase of chase-route | Datum/context | Route kiezen | Chase begin BTW maand of chase 1 | Handmatig | Te valideren |
| S17 | Chase begin BTW maand | task | Sales | BTW-maand opvolging voorbereiden | Begin BTW maand van toepassing | Deal/datum | Chase uitvoeren | Begin BTW maand gemaild | HubSpot/Outlook | Bewezen |
| S18 | Begin BTW maand gemaild | task | Sales | Vastleggen dat BTW-maandmail is verzonden | Chase begin BTW maand | Mail/deal | Mail verzenden/registreren | Contactbeslissing | HubSpot/Outlook | Bewezen |
| S19 | Chase 1 | task | Sales | Eerste offerte/chase opvolging | Geen reactie of alternatieve route | Deal/offerte | Chase uitvoeren | Contactbeslissing | HubSpot/Zapier | Bewezen |
| S20 | Chase 2.5 | task | Sales | Tweede chase opvolging | Geen contact na chase 1 | Deal/offerte | Chase uitvoeren | Contactbeslissing | HubSpot/Zapier | Bewezen |
| S21 | Chase 3.8 | task | Sales | Derde chase opvolging | Geen contact na chase 2.5 | Deal/offerte | Chase uitvoeren | Contactbeslissing | HubSpot/Zapier | Bewezen |
| S22 | Chase 4.14 | task | Sales | Vierde chase opvolging | Geen contact na chase 3.8 | Deal/offerte | Chase uitvoeren | Contactbeslissing | HubSpot/Zapier | Bewezen |
| S23 | Chase Laatste Keer | task | Sales | Laatste chase poging | Geen contact na chase 4.14 | Deal/offerte | Laatste opvolging uitvoeren | Contactbeslissing | HubSpot/Zapier | Bewezen |
| S24 | Contact? | decision | Sales | Bepalen of contact is ontstaan tijdens chase | Chase of BTW-mail | Contactreactie | Route kiezen | Interesse of volgende chase | Handmatig/HubSpot | Te valideren |
| S25 | Interesse? | decision | Sales | Bepalen of klant interesse heeft | Contact na chase | Klantreactie | Route kiezen | Fysieke afspraak of verloren | Handmatig | Te valideren |
| S26 | Interne beoordeling | decision | Sales | Intern beoordelen of deal door moet | Fysieke afspraak of offertecontact | Dealkwaliteit/context | Beslissen | Offerte, TaxMate of Disqualified | Handmatig | Te valideren |
| S27 | Optie voor taxmate? | decision | Sales | Bepalen of TaxMate-route geldt | Interne beoordeling | Klantprofiel | Route kiezen | TaxMate of Disqualified | Handmatig | Te valideren |
| S28 | Disqualified | task | Sales | Deal afwijzen | Niet passend of geen vervolg | Beoordeling | Disqualified vastleggen | Verloren/eindroute | HubSpot | Bewezen |
| S29 | TaxMate | task | Sales | Deal naar TaxMate-route brengen | TaxMate geschikt | Beoordeling | TaxMate status vastleggen | Verloren/eindroute | HubSpot | Bewezen |
| S30 | Offerte opgesteld en verzonden | task | Sales | Offerte formeel versturen | Positieve beoordeling | Offertegegevens | Offerte opstellen/verzenden | Reactie? | HubSpot/Zapier | Bewezen |
| S31 | Reactie? | decision | Sales | Bepalen of klant reageert | Offerte verzonden | Reactie/status | Route kiezen | Akkoord, chase of warmhouden | Handmatig/HubSpot | Te valideren |
| S32 | Akkoord | task | Sales | Akkoord registreren | Positieve reactie | Akkoord/offerte | Deal op akkoord zetten | WeFact klant aanmaken | HubSpot | Bewezen |
| S33 | WeFact klant aanmaken | task | Sales | Klantadministratie voorbereiden | Akkoord | Klant/offertegegevens | Klant aanmaken | Akkoord met/zonder BTW | WeFact/HubSpot | Te valideren |
| S34 | Geaccepteerd warm houden | task | Sales | Deal warmhouden tot later moment | Reactie maar latere start | Klantafspraak/maand | Warmhoudstatus vastleggen | Opvolg maand? | HubSpot | Bewezen |
| S35 | Opvolg maand? | decision | Sales | Bepalen in welke maand klant opnieuw benaderd wordt | Warmhouden | Afgesproken maand | Route naar maandstage | Maandstage 2026 | Handmatig | Te valideren |
| S36 | Januari 26 t/m December 26 | task | Sales | Maandplanning voor herbenadering | Opvolg maand gekozen | Maandkeuze | Deal in maandbucket plaatsen | Klant opnieuw benaderen | HubSpot | Bewezen |
| S37 | Klant opnieuw benaderen in specifieke maand | task | Sales | Klant opnieuw opvolgen | Bereikte opvolgmaand | Deal/context | Contact opnemen | Akkoord? | Handmatig/HubSpot | Te valideren |
| S38 | Akkoord? | decision | Sales | Bepalen of herbenadering akkoord oplevert | Herbenadering | Reactie klant | Route kiezen | Akkoord of verloren | Handmatig | Te valideren |
| S39 | Verloren | terminate | Sales | Proces afsluiten als verloren | Negatieve uitkomst | Reden verlies | Deal afsluiten | Eindstatus verloren | HubSpot | Bewezen |
| S40 | Akkoord met of zonder BTW | decision | Sales | Bepalen type geaccepteerde offerte | Akkoord/WeFact | BTW-status | Route kiezen | Start met of zonder BTW | Handmatig/HubSpot | Te valideren |
| S41 | Offerte geaccepteerd start | task | Sales | Start zonder BTW vastleggen | Akkoord zonder BTW | Offerte/deal | Accepted status zetten | Naar klantenbestand | HubSpot | Bewezen |
| S42 | Offerte geaccepteerd start - met BTW | task | Sales | Start met BTW vastleggen | Akkoord met BTW | Offerte/deal | Accepted status zetten | Naar klantenbestand | HubSpot | Bewezen |
| S43 | Naar klantenbestand | terminate | Sales | Overdracht naar klantadministratie | Offerte geaccepteerd | Klantgegevens | Klant doorzetten | Proces afgerond | HubSpot/klantenbestand | Bewezen |
| S44 | Persoonlijke behandeling | task | Sales | Individuele opvolging door medewerker | Handmatig gekozen | Deal/context | Medewerker pakt klant exclusief op | Tijdelijke eigenaar | Handmatig | Bewezen als manual block, inhoudelijk valideren |

---

## 7. Routes en beslislogica

| Van stap | Naar stap | Route type | Conditie | Betekenis | Handmatig? |
| --- | --- | --- | --- | --- | --- |
| Start | Start doormiddel van offerte | main | Proces start | Bepalen of de deal via offerte start | Ja, gemodelleerd |
| Start doormiddel van offerte | Offerte verstuurd | main | Offerte-start | Deal komt via offerte binnen | Ja, gemodelleerd |
| Start doormiddel van offerte | Mail verstuurd | main | Geen offerte-start | Deal start met mailopvolging | Ja, gemodelleerd |
| Offerte verstuurd | Mail verstuurd | main | Offerte is verstuurd | Mailopvolging na offerte | Ja, gemodelleerd |
| Mail verstuurd | Gehoor | main | Mail verstuurd | Contactstatus bepalen | Nee |
| Gehoor | Geen gehoor 1 | main | Geen gehoor | Eerste geen-gehoor opvolging | Ja, gemodelleerd |
| Geen gehoor 1 | Gehoor? | main | Eerste poging gedaan | Opnieuw contactstatus bepalen | Ja, gemodelleerd |
| Gehoor? | Geen gehoor 2/3/4 | main | Nog geen gehoor | Verdere opvolgpogingen | Ja, gemodelleerd |
| Gehoor?/Geen gehoor route | Mail contact eerste lijn | main | Wel contact | Naar eerste-lijns contact | Ja, gemodelleerd |
| Geen gehoor 4 | Geen contact-route | main | Geen contact na pogingen | Deal eindigt als geen contact | Ja, gemodelleerd |
| Mail contact eerste lijn | Fysieke afspraak gemaakt | main | Contact succesvol | Afspraak plannen | Ja, gemodelleerd |
| Fysieke afspraak gemaakt | Show/No show | main | Afspraakmoment | Show/no-show beslissen | Nee |
| Show/No show | No show | main | Klant verschijnt niet | No-show registreren | Nee |
| No show | No show chase | main | No-show geregistreerd | No-show opvolgen | Nee |
| No show chase | Begin BTW maand? | main | No-show chase gedaan | Bepalen BTW-maand opvolging | Ja, gemodelleerd |
| Begin BTW maand? | Chase begin BTW maand | main | BTW-maand relevant | BTW-maand chase starten | Ja, gemodelleerd |
| Begin BTW maand? | Chase 1 | main | Geen BTW-maandroute | Normale chase starten | Ja, gemodelleerd |
| Chase 1/2.5/3.8/4.14/Laatste Keer | Contact? | main | Chase uitgevoerd | Contactstatus bepalen | Ja, gemodelleerd |
| Contact? | Interesse? | main | Contact ontstaan | Interesse bepalen | Ja, gemodelleerd |
| Interesse? | Fysieke afspraak gemaakt | main | Interesse | Afspraakroute opnieuw starten | Ja, gemodelleerd |
| Interesse? | Verloren | main | Geen interesse | Proces verliezen | Ja, gemodelleerd |
| Interne beoordeling | Offerte opgesteld en verzonden | main | Positieve beoordeling | Offertefase starten | Ja, gemodelleerd |
| Interne beoordeling | Optie voor taxmate? | main | Alternatieve beoordeling | TaxMate/disqualified bepalen | Ja, gemodelleerd |
| Optie voor taxmate? | Disqualified | main | Niet passend | Afwijzen | Ja, gemodelleerd |
| Optie voor taxmate? | TaxMate | main | TaxMate-route | Naar TaxMate status | Ja, gemodelleerd |
| Offerte opgesteld en verzonden | Reactie? | main | Offerte verzonden | Reactie bepalen | Ja, gemodelleerd |
| Reactie? | Akkoord | main | Positieve reactie | Akkoord registreren | Ja, gemodelleerd |
| Reactie? | Chase 1 | main | Geen reactie | Offerte opvolgen | Ja, gemodelleerd |
| Reactie? | Geaccepteerd warm houden | main | Later opvolgen | Warmhoudroute | Ja, gemodelleerd |
| Geaccepteerd warm houden | Opvolg maand? | main | Warmhouden actief | Maand kiezen | Ja, gemodelleerd |
| Opvolg maand? | Januari 26 t/m December 26 | main | Maand gekozen | Deal parkeren tot maand | Ja, gemodelleerd |
| Maandstage | Klant opnieuw benaderen in specifieke maand | main | Opvolgmaand bereikt | Opnieuw contact opnemen | Ja, gemodelleerd |
| Klant opnieuw benaderen in specifieke maand | Akkoord? | main | Herbenadering gedaan | Akkoord bepalen | Ja, gemodelleerd |
| Akkoord? | Akkoord | main | Akkoord | Door naar akkoordroute | Ja, gemodelleerd |
| Akkoord? | Verloren | main | Geen akkoord | Proces verliezen | Ja, gemodelleerd |
| Akkoord | WeFact klant aanmaken | main | Akkoord vastgelegd | Klant aanmaken | Ja, gemodelleerd |
| WeFact klant aanmaken | Akkoord met of zonder BTW | main | Klant klaar voor start | BTW-route bepalen | Ja, gemodelleerd |
| Akkoord met of zonder BTW | Offerte geaccepteerd start - met BTW | main | Met BTW | Start met BTW | Ja, gemodelleerd |
| Akkoord met of zonder BTW | Offerte geaccepteerd start | main | Zonder BTW | Start zonder BTW | Ja, gemodelleerd |
| Offerte geaccepteerd start | Naar klantenbestand | main | Accepted status | Overdracht naar klantenbestand | Ja, gemodelleerd |
| Offerte geaccepteerd start - met BTW | Naar klantenbestand | main | Accepted met BTW | Overdracht naar klantenbestand | Ja, gemodelleerd |

**Route types:**

* `main`: hoofdroute. In deze saved state zijn alle routes als `main` opgeslagen.
* `optional`: niet gebruikt in deze saved state.
* `end`: niet gebruikt als route type; eindes zijn gemodelleerd met terminate-stappen.

---

## 8. Automations en systeemacties

In de opgeslagen process state staan geen directe `autoLinks`; de gerelateerde Sales Pipeline automations zijn dus nog niet als canvas-koppeling bewezen. Onderstaande tabel bevat de belangrijkste automationgroepen uit de automation database die aan de Sales Pipeline gerelateerd zijn.

| Automation | Gekoppeld aan | Trigger | Actie | Systeem/endpoint | Output | Bewijsstatus |
| --- | --- | --- | --- | --- | --- | --- |
| Automatische Mail naar Klant | Mail/opvolging | HubSpot deal activeert Zap | Mail naar klant verzenden | Zapier, HubSpot, Outlook | Klantmail | Gerelateerd, canvas-koppeling ontbreekt |
| Geen gehoor 1: Telefonische mail | Geen gehoor 1 | Deal in geen-gehoor fase | Telefonische mail/opvolging | Zapier, HubSpot, Outlook | Opvolgmail | Gerelateerd, canvas-koppeling ontbreekt |
| Geen gehoor 2: Telefonische mail | Geen gehoor 2 | Deal in tweede geen-gehoor fase | Telefonische mail/opvolging | Zapier, HubSpot, Outlook | Opvolgmail | Gerelateerd, canvas-koppeling ontbreekt |
| Geen gehoor 3: Telefonische mail | Geen gehoor 3 | Deal in derde geen-gehoor fase | Telefonische mail/opvolging | Zapier, HubSpot, Outlook | Opvolgmail | Gerelateerd, canvas-koppeling ontbreekt |
| Geen gehoor 4: Telefonische mail | Geen gehoor 4 | Deal in vierde geen-gehoor fase | Telefonische mail/opvolging | Zapier, HubSpot, Outlook | Opvolgmail | Gerelateerd, canvas-koppeling ontbreekt |
| Deal from 'No show' to 'No show chase' | No show route | HubSpot deal activeert Zap | Deal verplaatsen/opvolgen | Zapier, HubSpot | No-show chase | Gerelateerd, canvas-koppeling ontbreekt |
| Deal from 'Offerte opgesteld en verzonden' to 'Chase 1' | Offerte/chase route | HubSpot deal activeert Zap | Deal naar chase brengen | Zapier, HubSpot | Chase 1 | Gerelateerd, canvas-koppeling ontbreekt |
| Default-dtm van maken van afspraak | Fysieke afspraak | HubSpot workflow | Datum/tijdmoment bijwerken | HubSpot | DTM afspraak | Gerelateerd, canvas-koppeling ontbreekt |
| Default-DTM gemiste fysieke afspraak | No show | HubSpot workflow | Gemiste afspraakdatum bijwerken | HubSpot | DTM no-show | Gerelateerd, canvas-koppeling ontbreekt |
| default-Won DTM | Akkoord/klant | HubSpot workflow | Won datum vastleggen | HubSpot | Won DTM | Gerelateerd, canvas-koppeling ontbreekt |
| Set Deal Property: Activiteit Sales Deal Stage - Dynamic | Sales dealstage | HubSpot workflow | Deal-property bijwerken | HubSpot | Activiteit/stage property | Gerelateerd, canvas-koppeling ontbreekt |
| Set Deal Property: Activiteit Sales Deal Stage - Default | Sales dealstage | HubSpot workflow | Deal-property standaard zetten | HubSpot | Activiteit/stage property | Gerelateerd, canvas-koppeling ontbreekt |
| Create sales note in new sales pipeline | Sales Pipeline | HubSpot workflow | Salesnotitie aanmaken | HubSpot | Notitie | Gerelateerd, canvas-koppeling ontbreekt |
| Taal sync vanuit sales pipeline naar contact | Sales Pipeline | HubSpot workflow | Taal synchroniseren naar contact | HubSpot | Contacttaal bijgewerkt | Gerelateerd, canvas-koppeling ontbreekt |
| Facebook Leads / Typeform lead Zaps | Lead-invoer | Nieuw leadformulier | Deal/contact aanmaken of verrijken | Zapier, Facebook Lead Ads, Typeform, HubSpot | Nieuwe salesdeal | Gerelateerd, deels actief/deels uitgeschakeld |

**Technische opmerkingen:**

* Er zijn 40 gerelateerde automations gevonden.
* De automation database bevat zowel actieve als uitgeschakelde automations.
* `autoLinks` in de opgeslagen process state is leeg. De visuele koppeling tussen automation en route moet dus nog expliciet worden vastgelegd als dit nodig is voor bewijsvoering.
* Belangrijke systemen: HubSpot, Zapier, Outlook, Facebook Lead Ads, Typeform en Google Ads.

---

## 9. Attachments en contextobjecten

| Object | Type | Gekoppeld aan | Betekenis |
| --- | --- | --- | --- |
| Geen opgeslagen attachments | n.v.t. | n.v.t. | In deze ProcessState zijn geen BPMN attachments opgeslagen. |

Attachments veranderen de procesflow niet, maar geven extra context, bewijs of documentatie bij een stap of route. Voor deze Sales Pipeline is dit onderdeel nog leeg.

---

## 10. Altijd beschikbare handmatige acties

Deze acties zijn niet onderdeel van de verplichte hoofdroute. Ze zijn beschikbaar wanneer een medewerker of klantinteractie daarom vraagt.

| Actie | Wanneer beschikbaar? | Wie mag dit oppakken? | Effect op normale flow | Lock-regel | Vrijgave-regel |
| --- | --- | --- | --- | --- | --- |
| Persoonlijke behandeling door medewerker | Mogelijk vanuit elke pipeline stage | Specifieke medewerker: Tom, Wessel, Wicher, Fleur of Rogier | Normale behandeling wordt tijdelijk buiten de hoofdflow geplaatst | Andere medewerkers pakken deze klant niet op zolang deze hier staat | De gekozen medewerker geeft de klant vrij of zet hem terug in normale opvolging |

**Beschrijving:**  
Het manual exception block heet `Altijd beschikbare handmatige actie` en bevat de persoonlijke stappen `Tom persoonlijk`, `Wessel persoonlijk`, `Wicher persoonlijk`, `Fleur persoonlijk` en `Rogier persoonlijk`. De opgeslagen beschrijving luidt: persoonlijke behandeling door medewerker; andere medewerkers pakken deze klant niet op zolang deze hier staat. Dit voorkomt dubbele acties, tegenstrijdige communicatie en verlies van context. De gekozen medewerker is tijdelijk eigenaar van de opvolging.

---

## 11. Uitzonderingen en risico's

| Situatie | Risico | Gevolg | Maatregel | Eigenaar |
| --- | --- | --- | --- | --- |
| Veel handmatig gemodelleerde routes | Condities zijn visueel duidelijk, maar niet overal technisch bewezen | Onzekerheid over exacte automatische trigger | Per route valideren met HubSpot workflow/Zapier bewijs | Sales operations / developer |
| `autoLinks` is leeg | Automations zijn niet direct gekoppeld aan canvasroutes | Management ziet proces, maar automation-bewijs is minder hard | Belangrijkste automations koppelen aan routes in Proces Editor | Developer / proceseigenaar |
| Persoonlijke behandeling buiten hoofdflow | Deal kan blijven hangen bij medewerker | Vertraging of onduidelijke eigenaar | Lock- en vrijgave-regel expliciet hanteren | Sales teamlead |
| Meerdere verlies/terminate-routes | Verliesredenen kunnen door elkaar lopen | Rapportage op uitval wordt minder scherp | Verliesreden per route/stap vastleggen | Sales operations |
| Maandelijkse warmhoudstappen | Deals kunnen lang geparkeerd blijven | Vergeten opvolging | Controle op maandbucket en herbenadering | Sales team |
| Typeform/Facebook lead automations deels uitgeschakeld | Lead-invoer kan afhankelijk zijn van actieve/inactieve bronnen | Onvolledig startpuntbeeld | Alleen actieve leadbronnen opnemen in definitieve procesvalidatie | Marketing/Sales operations |

---

## 12. Validatie en bewijs

| Onderdeel | Bron | Status | Opmerking |
| --- | --- | --- | --- |
| Processtappen | ProcessState / pipeline stages | Bewezen | 71 stappen in opgeslagen state. |
| Routes | Connections | Bewezen als visual | 90 routes opgeslagen; condities moeten inhoudelijk worden gevalideerd. |
| Automations | Automation database / HubSpot / Zapier | Te valideren | 40 gerelateerde automations, maar geen directe `autoLinks` in ProcessState. |
| Manual blocks | Artifacts | Bewezen | 1 manual exception block met 5 persoonlijke stappen. |
| Attachments | ProcessState attachments | Niet aanwezig | Geen opgeslagen attachments. |
| Flow links | ProcessState flow_links | Niet aanwezig | Geen flow links opgeslagen. |
| Swimlanes | ProcessState steps | Bewezen | Sales en Klantrelaties gebruikt. |

---

## 13. Vragen voor proceseigenaar

1. Klopt het startpunt `Start doormiddel van offerte`, inclusief de routes naar `Offerte verstuurd` en `Mail verstuurd`?
2. Zijn de beslismomenten `Gehoor`, `Gehoor?`, `Contact?`, `Interesse?`, `Reactie?`, `Akkoord?` en `Akkoord met of zonder BTW` compleet?
3. Welke routecondities moeten expliciet als label op de lijnen worden gezet?
4. Welke HubSpot/Zapier automations moeten hard aan een route worden gekoppeld?
5. Welke automations zijn actief genoeg om als bewezen procesbewijs te gelden?
6. Wat is exact het beleid voor `GEEN CONTACT`, `Disqualified`, `TaxMate` en `Verloren`?
7. Wanneer wordt een deal in `Geaccepteerd warm houden` geplaatst?
8. Wie bewaakt de maandstappen januari tot en met december 2026?
9. Wanneer mag een persoonlijke behandeling terug naar de normale flow?
10. Moeten `Tom/Wessel/Wicher/Fleur/Rogier persoonlijk` als persoonlijke lock-stappen blijven bestaan of als algemene `Persoonlijke behandeling` worden samengevoegd?

---

## 14. Verbeteradvies

**Sterke punten van de procesview:**

* De Sales Pipeline is veel rijker gemodelleerd dan een standaard HubSpot stage-lijst.
* Belangrijke beslismomenten en eindroutes zijn zichtbaar gemaakt.
* De persoonlijke uitzonderingsbehandeling is correct buiten de verplichte hoofdroute geplaatst.
* De warmhoudroute per maand maakt duidelijk waar latere opvolging plaatsvindt.
* De viewer/editor bevat genoeg structuur om verder te valideren richting MVP.

**Verbeterpunten:**

* Voeg route-labels toe aan beslissingen, bijvoorbeeld `wel gehoor`, `geen gehoor`, `akkoord`, `geen akkoord`, `met BTW`, `zonder BTW`.
* Koppel de belangrijkste automations expliciet aan canvasroutes zodat automation-bewijs zichtbaar wordt.
* Controleer of alle 90 routes nog nodig zijn en of sommige routegroepen simpeler kunnen.
* Voeg attachments/notities toe bij onduidelijke beslismomenten zoals `Interne beoordeling`, `Optie voor taxmate?` en `Begin BTW maand?`.
* Valideer met de proceseigenaar of alle persoonlijke stappen nog actueel zijn.
* Maak verliesredenen explicieter zodat management beter ziet waarom deals uitvallen.

**Aanbevolen vervolgstap:**  
Plan een procesreview met de Sales-proceseigenaar. Gebruik deze documentatie naast de Procesviewer. Werk daarna eerst route-labels en automation-koppelingen bij, omdat die het meeste bijdragen aan bestuurlijke duidelijkheid en technisch bewijs.
