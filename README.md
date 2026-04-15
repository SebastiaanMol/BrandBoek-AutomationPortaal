# BrandBoek Automation Portaal

## Over het project

Het BrandBoek Automation Portaal is een intern portaal van Brand Boekhouders voor het inzichtelijk maken, beheren en documenteren van processen, automatiseringen, imports, analyses, systemen en eigenaarschap.

Het project ondersteunt kennisborging en overdracht. Het portaal helpt om minder afhankelijk te zijn van losse kennis in hoofden of chats en maakt het eenvoudiger om bestaande automatiseringen te begrijpen, te beheren en verder uit te bouwen.

## Context binnen Brand Boekhouders

Binnen Brand Boekhouders is HubSpot in veel operationele processen de primaire bron. Eenvoudige logica wordt waar mogelijk in HubSpot afgehandeld, terwijl complexere logica en systeemkoppelingen via een interne API verlopen.

Dit portaal moet daarom worden gezien als een interne beheer- en documentatielaag rondom:
- automatiseringen;
- processen;
- systeemrelaties;
- imports en analyses;
- eigenaarschap en beheerinformatie.

## Doel

Het doel van dit project is:
- centrale vastlegging van bestaande automatiseringen;
- beter inzicht in processtromen en systeemafhankelijkheden;
- ondersteuning van analyse en verbeteringen;
- betere overdraagbaarheid richting nieuwe ontwikkelaars of beheerders;
- vermindering van ad-hoc kennisafhankelijkheid.

## Repositorystructuur

De repository bestaat uit de volgende hoofdonderdelen:

```text
.
├── backend/
│   ├── connectors/
│   ├── mapper/
│   ├── main.py
│   └── requirements.txt
├── public/
├── src/
│   ├── components/
│   ├── data/
│   ├── hooks/
│   ├── integrations/
│   ├── lib/
│   ├── pages/
│   ├── test/
│   ├── types/
│   ├── App.tsx
│   └── main.tsx
├── supabase/
├── README.md
└── configuratiebestanden
```

## Frontend

De frontend staat in `src/` en is opgezet als een TypeScript-applicatie met Vite-configuratie.

Belangrijke mappen:
- `src/pages/` bevat de hoofdschermen van de applicatie;
- `src/components/` bevat herbruikbare UI-componenten;
- `src/hooks/` bevat herbruikbare logica;
- `src/types/` bevat TypeScript-typingen;
- `src/integrations/` bevat integraties of koppellaag aan frontendzijde;
- `src/data/` bevat lokale of statische data;
- `src/test/` bevat testgerelateerde code.

## Beschikbare pagina's

In `src/pages/` zijn op dit moment onder meer de volgende pagina’s aanwezig:
- `Dashboard.tsx`
- `AlleAutomatiseringen.tsx`
- `Analyse.tsx`
- `AIUpload.tsx`
- `AuthPage.tsx`
- `BewerkAutomatisering.tsx`
- `Brandy.tsx`
- `Imports.tsx`
- `Instellingen.tsx`
- `NieuweAutomatiseringPage.tsx`
- `Owners.tsx`
- `Processen.tsx`
- `Systems.tsx`

Deze indeling laat zien dat het portaal gericht is op zowel inzicht als beheer. De aanwezigheid van pagina’s voor processen, imports, analyse, systems en owners wijst op een combinatie van operationeel overzicht, documentatie en beheerfunctionaliteit.

## Backend

De backend staat in `backend/` en bevat:
- `main.py` als centraal backend-startpunt;
- `connectors/` voor koppelingen met externe systemen;
- `mapper/` voor vertaallogica of datamapping;
- `requirements.txt` voor Python-dependencies;
- `.env.example` voor backendconfiguratie.

Binnen `backend/connectors/` is in ieder geval een HubSpot-connector aanwezig. Daarmee is bevestigd dat HubSpot niet alleen conceptueel maar ook technisch onderdeel is van deze codebase.

## Integraties

Op basis van de repository en het applicatielandschap zijn de volgende integratiecontexten relevant:
- HubSpot als operationele bron;
- een interne API voor complexere automatiseringslogica;
- ondersteunende systemen zoals Clockify, WeFact, Zapier, Typeform, SharePoint, Jira, Confluence en Zoho Vault binnen het bredere landschap.

Niet elke genoemde applicatie hoeft direct in deze repository te zijn geïmplementeerd. De lijst beschrijft de bekende context waarin dit portaal functioneert.

## Configuratie

In de repository zijn omgevingsbestanden zichtbaar op rootniveau en in de backend. Gevoelige waarden horen niet in commits of openbare documentatie thuis, maar moeten via de afgesproken interne beheerwijze worden gedeeld.

Minimaal vast te leggen configuratiepunten:
- frontend environment variables;
- backend environment variables;
- Supabase-configuratie;
- API-URL’s;
- sleutels of tokens voor externe koppelingen.

## Lokaal draaien

De exacte lokale opstartcommando’s moeten worden gecontroleerd aan de hand van `package.json` en `backend/main.py`.

Tot die verificatie is afgerond, geldt functioneel de volgende opzet:
1. installeer frontend dependencies;
2. start de frontend via de Vite-developmentserver;
3. installeer backend dependencies vanuit `backend/requirements.txt`;
4. start de Python-backend;
5. controleer of frontend, backend en eventuele Supabase-configuratie correct op elkaar zijn aangesloten.

## Documentatieaanpak

Deze README is het startpunt van de overdrachtsdocumentatie. Verdere detaildocumentatie hoort in losse bestanden te staan, bijvoorbeeld:

- `docs/architecture.md`
- `docs/setup.md`
- `docs/frontend-pages.md`
- `docs/backend.md`
- `docs/integrations.md`
- `docs/environment.md`
- `docs/known-issues.md`

## Aanbevolen vervolgdocumentatie

Voor een volledige overdracht moeten nog minimaal de volgende onderdelen worden uitgewerkt:
1. exacte frontend scripts uit `package.json`;
2. exacte backend startinstructies;
3. overzicht van API-routes in `backend/main.py`;
4. uitleg per connector in `backend/connectors/`;
5. uitleg van datamapping in `backend/mapper/`;
6. rol van `supabase/` in authenticatie, opslag of data;
7. per pagina: doel, invoer, output, afhankelijkheden en bekende aandachtspunten;
8. deployment- en beheerinstructies.

## Status

De functionele basis van het project is aanwezig, maar de technische overdrachtsdocumentatie wordt met terugwerkende kracht opgebouwd. Deze README vormt daarvoor de centrale ingang.
