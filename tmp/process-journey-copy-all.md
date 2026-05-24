# Procesreis Copy Pilot

DRY_RUN_ONLY: dit bestand is alleen een voorstel en schrijft niets terug naar Supabase.

## Algemene regel

Een procesreis wordt alleen doorgetrokken naar een vervolgstap wanneer de exacte property, waarde, dealstage, workflowtrigger of codekoppeling bewezen is. Zonder bewijs stopt de procesreis bij de laatst bewezen systeemupdate.

## Create new deal naar New create deal

ID: `8a9ef9d2-9bf8-469c-8107-647c28ac03ba`

### oude naam

Create new deal naar New create deal

### nieuwe naam

Salesdeal aanmaken

### oude tekst

Zodra "Create new deal" gebeurt, voert het systeem automatisch de vervolgstap "New create deal (POST /operations/hubspot/create_new_deal)" uit. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer de HubSpot-workflow "Create new deal" start, geeft HubSpot het werk automatisch door aan de verwerking "New create deal".

De verwerking maakt of werkt de salesdeal bij op basis van de gegevens die HubSpot op dat moment kent. Zo blijft de eerste commerciële opvolging gekoppeld aan de juiste contactpersoon, company en dealcontext.

Dit vermindert handmatig werk, terwijl uitzonderingen of ontbrekende gegevens zichtbaar blijven voor controle. Een vervolgproces wordt alleen gekoppeld als de volgende trigger expliciet uit workflowdata of code blijkt.

## Procesreis bijwerken

ID: `5a8fb81e-e06c-49b8-a362-d4e6527f5476`

### oude naam

Procesreis bijwerken

### nieuwe naam

VPB status bijwerken

### oude tekst

Zodra "VPB ingediend -> VA VPB deal aanpassen" gebeurt, voert het systeem automatisch de vervolgstap "Vpb finished webhook (POST /properties/vpb/finished_webhook)" uit. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer de workflow "VPB ingediend -> VA VPB deal aanpassen" aangeeft dat een VPB-stap is afgerond, roept HubSpot de verwerking "Vpb finished webhook" aan.

De verwerking werkt de gekoppelde VPB-deal bij, zodat in HubSpot zichtbaar blijft dat de VPB-stap is afgerond en de fiscale status actueel blijft.

Medewerkers hoeven vooral nog in te grijpen bij ontbrekende gegevens, foutieve koppelingen of uitzonderingen. Een vervolgproces wordt alleen gekoppeld wanneer de exacte vervolgstap uit code of workflowdata blijkt.

## Procesreis bijwerken

ID: `f8164cda-51b2-4f80-ae49-cf58a4c9eda8`

### oude naam

Procesreis bijwerken

### nieuwe naam

WeFact debiteur bijwerken

### oude tekst

Zodra "Upsert WeFact client" gebeurt, voert het systeem automatisch de vervolgstap "Upsert wefact debtor from hubspot (POST /wefact/hubspot/upsert_debtor)" uit. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer een klant of bedrijf in HubSpot klaarstaat om in WeFact te worden aangemaakt of bijgewerkt, start de workflow "Upsert WeFact client".

De verwerking neemt de relevante klant- en bedrijfsgegevens uit HubSpot over en werkt de debiteur in WeFact bij. Zo blijven de debiteurgegevens voor facturatie actueel zonder dat dezelfde klantgegevens opnieuw handmatig hoeven te worden ingevoerd.

Na afloop blijft HubSpot het startpunt voor de klantrelatie en is WeFact bijgewerkt voor facturatie. Controle blijft vooral nodig bij uitzonderingen, ontbrekende gegevens of foutieve koppelingen.

## Procesreis bijwerken

ID: `985abece-c1ee-48f9-92d4-9ec4c9ec2ef6`

### oude naam

Procesreis bijwerken

### nieuwe naam

IB status bijwerken

### oude tekst

Zodra "Update IB kan gemaakt worden property" gebeurt, voert het systeem automatisch de vervolgstap "Update ib deal (POST /properties/update_ib_kan_gemaakt_worden)" uit. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer de HubSpot-workflow "Update IB kan gemaakt worden property" start, roept HubSpot de verwerking "Update ib deal" aan.

De verwerking werkt de status van de gekoppelde IB-deal bij, zodat in HubSpot zichtbaar blijft of de inkomstenbelastingaangifte verder kan worden opgepakt. Dit is belangrijk omdat IB-werk afhankelijk kan zijn van machtiging/VIG, afgeronde jaarrekeningen en aanvullende klantinformatie.

Controle blijft nodig bij uitzonderingen of ontbrekende gegevens. Een vervolgproces wordt alleen gekoppeld wanneer uit de code of workflowdata blijkt welke exacte property, waarde of dealstage daarna een nieuwe workflow start.

## Procesreis bijwerken

ID: `d46b8208-feea-423c-87d4-9675ffc23f1c`

### oude naam

Procesreis bijwerken

### nieuwe naam

Betaalt niet status herstellen

### oude tekst

Zodra "Revert betaalt niet when deal leaves "Betaalt niet" in sales pipeline" gebeurt, voert het systeem automatisch de vervolgstap "Reset betaalt niet (POST /operations/hubspot/reset_betaalt_niet)" uit. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer een deal de fase "Betaalt niet" verlaat, start de workflow "Revert betaalt niet when deal leaves "Betaalt niet" in sales pipeline".

De verwerking "Reset betaalt niet" herstelt de betaalstatus op de gekoppelde HubSpot-deal, zodat de klant of deal niet onterecht als betalingsblokkade blijft staan.

Medewerkers hoeven vooral nog in te grijpen bij ontbrekende gegevens, foutieve koppelingen of uitzonderingen. Een volgende stap is alleen gekoppeld wanneer de trigger daarvan expliciet is aangetoond.

## Procesreis bijwerken

ID: `1c61e63c-7723-42da-b718-3c020a3507f7`

### oude naam

Procesreis bijwerken

### nieuwe naam

KvK gegevens ophalen

### oude tekst

Zodra "Ophalen KvK gegevens" gebeurt, voert het systeem automatisch de vervolgstap "Kvk sync company (POST /kvk/hubspot/sync_company)" uit. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer HubSpot bedrijfsgegevens via de workflow "Ophalen KvK gegevens" wil verrijken, geeft HubSpot het werk door aan de verwerking "Kvk sync company".

De verwerking haalt KvK-informatie op en werkt de beschikbare companygegevens in HubSpot bij. Daardoor blijven bedrijfsgegevens zoals naam, rechtsvorm of KvK-gerelateerde kenmerken beter bruikbaar voor klantdossiers en vervolgautomatiseringen.

Medewerkers hoeven vooral nog in te grijpen bij ontbrekende gegevens, foutieve koppelingen of uitzonderingen. Er is geen bewezen automatische vervolgstap gevonden in deze voorsteltekst.

## Contactgegevens bijwerken

ID: `591ec9ed-cd29-4fdc-be62-b86d81f80642`

### oude naam

Contactgegevens bijwerken

### nieuwe naam

Contactgegevens bijwerken

### oude tekst

Zodra "Name Change of Contact" gebeurt, voert het systeem automatisch de vervolgstap "Contact change endpoint (POST /operations/hubspot/contact/updating_dealname)" uit. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer de workflow "Name Change of Contact" ziet dat contactgegevens zijn gewijzigd, wordt de verwerking "Contact change verwerking" aangeroepen.

De verwerking gebruikt de actuele contactinformatie om gekoppelde HubSpot-gegevens, zoals dealnamen of herkenbare klantgegevens, bij te werken. Zo blijven contact, deal en klantdossier makkelijker herkenbaar voor medewerkers.

Hierdoor blijft de status actueel zonder dat medewerkers deze stap standaard handmatig hoeven over te nemen. Een vervolgproces wordt alleen gekoppeld wanneer de trigger daarvan bewezen is.

## Jaarrekening prioriteit bijwerken

ID: `e87aeffe-34cd-4e1e-8543-d4bdc48b71d8`

### oude naam

Jaarrekening prioriteit bijwerken

### nieuwe naam

Jaarrekening prioriteit bijwerken

### oude tekst

Zodra duidelijk is dat een jaarrekening extra prioriteit nodig heeft, werkt het systeem automatisch de prioriteit bij. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer de workflow "Move JR deals based on priority from IB" ziet dat een jaarrekening invloed heeft op IB-werk, roept HubSpot de verwerking "Jr prio from ib" aan.

De verwerking werkt de prioriteit of status van de gekoppelde jaarrekeningdeal bij. Daardoor ziet het team in HubSpot welke jaarrekening extra aandacht nodig heeft omdat een IB-aangifte daarop kan wachten.

Dit vermindert handmatig werk, terwijl uitzonderingen of ontbrekende gegevens zichtbaar blijven voor controle. Een volgende stap is alleen gekoppeld wanneer de trigger daarvan expliciet is aangetoond.

## Procesfase bepalen

ID: `1d269213-c283-4ba2-81d6-4644369fb2f5`

### oude naam

Procesfase bepalen

### nieuwe naam

BTW procesfase bijwerken

### oude tekst

Zodra de benodigde klant- of dossiergegevens veranderen, bepaalt het systeem automatisch welke procesfase passend is. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer in HubSpot zichtbaar wordt dat een BTW-stap of kwartaalstatus is afgerond, start de workflow "Deels geboekt en Q1 tot Q4 geboekt automatisering".

De verwerking bepaalt welke BTW-deal of welk volgende kwartaal bijgewerkt moet worden. Zo blijft de administratie aan de juiste periode gekoppeld en ziet het team in HubSpot of de BTW-aangifte verder kan worden opgepakt.

Een volgende procesreis wordt pas gekoppeld wanneer de exacte property of dealstage als starttrigger van een andere workflow is bewezen.

## Procesfase bepalen

ID: `adb97cd2-db11-4367-a16b-b394de646a63`

### oude naam

Procesfase bepalen

### nieuwe naam

Klanttype en beginfase controleren

### oude tekst

Zodra de benodigde klant- of dossiergegevens veranderen, bepaalt het systeem automatisch welke procesfase passend is. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer het klanttype in HubSpot verandert, start de workflow "Customer Type changes -> Check Beginner Stage".

De verwerking "Check correct stage" controleert of de gekoppelde deal nog in de juiste beginfase staat. Dat helpt voorkomen dat een klant in de verkeerde start- of onboardingfase blijft staan.

Medewerkers hoeven vooral nog in te grijpen bij ontbrekende gegevens, foutieve koppelingen of uitzonderingen. Een volgende procesreis wordt pas gekoppeld wanneer de exacte trigger is aangetoond.

## Machtiging verwerken

ID: `8c2250b9-8632-49c1-8247-926428113e06`

### oude naam

Machtiging verwerken

### nieuwe naam

Machtiging verwerken

### oude tekst

Zodra de machtiging van een klant verandert, werkt het systeem automatisch de bijbehorende dossiers bij. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer de machtigingsinformatie van een klant verandert, start de workflow "Correct Stage IB".

De verwerking controleert of de gekoppelde IB-deal nog in de juiste fase staat. Daarbij is vooral relevant of de machtiging/VIG actief is en of andere voorwaarden, zoals jaarrekeningen of aanvullende klantinformatie, compleet zijn.

Zo blijft in HubSpot zichtbaar of de IB-aangifte nog wacht op machtiging of verder kan worden opgepakt.

## Procesfase bepalen

ID: `cfffb025-4fb3-4247-85da-00edfef45ba9`

### oude naam

Procesfase bepalen

### nieuwe naam

Machtiging verwerken

### oude tekst

Zodra de benodigde klant- of dossiergegevens veranderen, bepaalt het systeem automatisch welke procesfase passend is. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer de machtigingsinformatie van een klant verandert, start de workflow "Correct Stage IB".

De verwerking controleert of de gekoppelde IB-deal nog in de juiste fase staat. Daarbij is vooral relevant of de machtiging/VIG actief is en of andere voorwaarden, zoals jaarrekeningen of aanvullende klantinformatie, compleet zijn.

Zo blijft in HubSpot zichtbaar of de IB-aangifte nog wacht op machtiging of verder kan worden opgepakt.

## Machtiging verwerken

ID: `2888d512-ea67-4956-ae02-b896b217134f`

### oude naam

Machtiging verwerken

### nieuwe naam

Machtiging verwerken

### oude tekst

Zodra de machtiging van een klant verandert, werkt het systeem automatisch de bijbehorende dossiers bij. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer de machtigingsinformatie op contactniveau verandert, start de workflow "Copy Machtiging contact property naar deal".

De verwerking zet de actuele machtigingsstatus door naar de gekoppelde deal. Daardoor is de fiscale machtigingsinformatie niet alleen op het contact, maar ook in de relevante deal zichtbaar voor medewerkers en vervolgcontroles.

Een vervolgstap wordt alleen gekoppeld wanneer uit code of workflowdata blijkt welke property of dealstage daarna een nieuwe workflow start.

## Jaarrekening prioriteit bijwerken

ID: `59283312-23d3-4a2a-a8b7-c3a613423b69`

### oude naam

Jaarrekening prioriteit bijwerken

### nieuwe naam

Jaarrekening prioriteit bijwerken

### oude tekst

Zodra duidelijk is dat een jaarrekening extra prioriteit nodig heeft, werkt het systeem automatisch de prioriteit bij. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer de workflow "Check for prio in JR pipeline" ziet dat een jaarrekening invloed heeft op IB-werk, roept HubSpot de verwerking "Jr prio if ib ready except jr" aan.

De verwerking werkt de prioriteit of status van de gekoppelde jaarrekeningdeal bij. Daardoor ziet het team in HubSpot welke jaarrekening extra aandacht nodig heeft omdat een IB-aangifte daarop kan wachten.

Dit vermindert handmatig werk, terwijl uitzonderingen of ontbrekende gegevens zichtbaar blijven voor controle. Een volgende stap is alleen gekoppeld wanneer de trigger daarvan expliciet is aangetoond.

## BTW vervolgkwartaal bijwerken

ID: `de4d3633-3495-4e2a-abab-396cf5614fb2`

### oude naam

BTW vervolgkwartaal bijwerken

### nieuwe naam

BTW kwartaalstatus bijwerken

### oude tekst

Zodra de BTW van de afgelopen twee maanden als geboekt wordt gemarkeerd, werkt het systeem automatisch het volgende kwartaal bij. Controleer voor het opslaan of de naam en beschrijving correct zijn ingevuld.

### nieuwe tekst

Wanneer in HubSpot zichtbaar wordt dat een BTW-stap of kwartaalstatus is afgerond, start de workflow "'BTW 2 maanden geboekt' instellen".

De verwerking bepaalt welke BTW-deal of welk volgende kwartaal bijgewerkt moet worden. Zo blijft de administratie aan de juiste periode gekoppeld en ziet het team in HubSpot of de BTW-aangifte verder kan worden opgepakt.

Een volgende procesreis wordt pas gekoppeld wanneer de exacte property of dealstage als starttrigger van een andere workflow is bewezen.

## BTW vervolgkwartaal bijwerken

ID: `d71f578e-83f1-4710-b4aa-55fde1d3896c`

### oude naam

BTW vervolgkwartaal bijwerken

### nieuwe naam

BTW kwartaalstatus bijwerken

### oude tekst

Zodra de BTW van de afgelopen twee maanden als geboekt wordt gemarkeerd, werkt het systeem automatisch het volgende kwartaal bij.

### nieuwe tekst

Wanneer in HubSpot zichtbaar wordt dat een BTW-stap of kwartaalstatus is afgerond, start de workflow "'BTW 2 maanden geboekt' instellen".

De verwerking bepaalt welke BTW-deal of welk volgende kwartaal bijgewerkt moet worden. Zo blijft de administratie aan de juiste periode gekoppeld en ziet het team in HubSpot of de BTW-aangifte verder kan worden opgepakt.

Een volgende procesreis wordt pas gekoppeld wanneer de exacte property of dealstage als starttrigger van een andere workflow is bewezen.
