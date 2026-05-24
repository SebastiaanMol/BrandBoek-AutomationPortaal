# Procesreis Copy Pilot

DRY_RUN_ONLY: dit bestand is alleen een voorstel en schrijft niets terug naar Supabase.

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

De verwerking neemt de relevante klant- en bedrijfsgegevens uit HubSpot over en werkt de debiteur in WeFact bij. Daardoor hoeft een medewerker de klantgegevens niet opnieuw handmatig in WeFact over te nemen.

Na afloop blijft HubSpot het startpunt voor de klantrelatie en is WeFact bijgewerkt voor facturatie. Een vervolgproces wordt pas gekoppeld wanneer uit de workflow of code blijkt welke exacte HubSpot-status daarna een nieuwe stap start.

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

De procesreis stopt bij de bewezen HubSpot-update. Een volgende procesreis wordt pas gekoppeld wanneer de exacte property of dealstage als starttrigger van een andere workflow is bewezen.

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

Het systeem werkt de bijbehorende klant- of dossierinformatie bij, zodat duidelijk blijft of Brand de benodigde fiscale gegevens mag gebruiken. Dit is vooral belangrijk voor IB-werk, waar machtiging of VIG kan bepalen of aangifte-informatie compleet is.

Na afloop ziet de medewerker in HubSpot of het dossier verder kan of dat machtiging nog aandacht vraagt. Een vervolgproces wordt alleen gekoppeld als die vervolgstap hard uit de code of workflowdata blijkt.
