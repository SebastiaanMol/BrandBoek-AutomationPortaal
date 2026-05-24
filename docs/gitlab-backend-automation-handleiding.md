# GitLab Backend Automations Handleiding

Deze handleiding legt in simpele taal uit hoe we GitLab/backend automations herkennen, opslaan en controleren in Automation Navigator.

Belangrijk: `gitlabtest/` is alleen een read-only analysebron. We gebruiken die code om automations te begrijpen, maar we passen de runtime-code daar niet aan.

## Wat Is Een Backend Automation?

Een backend automation is een automatische backend-stap die meestal door HubSpot wordt aangeroepen.

In gewone taal:

```text
HubSpot workflow roept een endpoint aan
↓
backend automation start
↓
backend leest gegevens uit HubSpot
↓
backend bepaalt of berekent iets
↓
backend schrijft nieuwe informatie terug naar HubSpot
↓
HubSpot workflows kunnen daarna weer verdergaan
```

Een backend automation is dus de reken-, beslis- of synchronisatiestap tussen HubSpot workflows.

## Wat Telt Als Eén GitLab Automation?

Een GitLab automation is meestal niet een heel bestand.

Niet dit:

```text
app/API/properties.py
```

Maar dit:

```text
POST /properties/btw/update_next_quarter_prev2m
```

Waarom?

Omdat HubSpot niet een bestand aanroept. HubSpot roept een specifiek endpoint aan. Dat endpoint start één concrete backend worker.

Voorbeeld:

```python
@router.post("/btw/update_next_quarter_prev2m")
async def update_next_quarter_prev2m(...):
    ...
```

Dit is één GitLab automation.

## Minimale Informatie Per GitLab Automation

Elke GitLab endpoint-automation moet minimaal deze informatie hebben:

```text
1. Endpoint
2. HTTP method
3. Handler/functienaam
4. GitLab bestand
5. Trigger
6. Doel
7. Systemen
8. Stappen
9. Simpele uitleg
```

Voorbeeld:

```text
Endpoint:
POST /properties/btw/update_next_quarter_prev2m

Handler:
update_next_quarter_prev2m

Bestand:
app/API/properties.py

Trigger:
HubSpot workflow roept dit endpoint aan.

Doel:
Controleert of de volgende BTW-periode bijgewerkt moet worden.

Schrijft terug:
btw_2_maanden_geboekt = true
```

## Hoe Herkennen We Een GitLab Automation In Broncode?

We zoeken in `gitlabtest/app/API` naar FastAPI routes:

```python
@router.post(...)
@router.get(...)
@router.put(...)
@router.patch(...)
@router.delete(...)
```

Daarbij nemen we ook de router-prefix mee.

Voorbeeld:

```python
router = APIRouter(prefix="/properties")

@router.post("/btw/update_next_quarter_prev2m")
```

Wordt:

```text
POST /properties/btw/update_next_quarter_prev2m
```

## Hoe Ziet Een Goede Flow Eruit?

Een flow bestaat uit meerdere automations samen.

Bijvoorbeeld:

```text
STARTSIGNAL
BTW 2 maanden geboekt

↓
HUBSPOT WORKFLOW
"BTW 2 maanden geboekt instellen"

↓
GITLAB BACKEND AUTOMATION
POST /properties/btw/update_next_quarter_prev2m

↓
BACKEND LOGICA
Leest HubSpot-data en bepaalt welke periode bijgewerkt moet worden

↓
STATE WRITE
btw_2_maanden_geboekt = true

↓
EMITTED SIGNAL
btw_2_maanden_geboekt updated

↓
DOWNSTREAM FLOWS
JR / VPB / VA
```

Belangrijk:

```text
De GitLab automation is alleen het backend-stuk.
De hele keten samen is de flow.
```

## Controle: Zijn Alle GitLab Automations Goed Geëxtraheerd?

Gebruik deze scan om de broncode te analyseren:

```bash
node scripts\analyze-api-endpoint-flows.mjs > tmp\api-endpoint-analysis.json
```

Daarna vergelijk je:

```text
Aantal endpoints in broncode
tegen
Aantal GitLab endpoint-automations in Supabase
```

De belangrijkste vraag is:

```text
Heeft elk FastAPI endpoint uit app/API ook één automation-record in de portal?
```

## Huidige Audit-uitkomst

Laatste audit:

```text
54 endpoints gevonden in gitlabtest/app/API
51 endpoint-automations opgeslagen in Supabase
3 endpoints ontbreken nog
```

De 51 opgeslagen endpoint-automations hebben wel complete kernmetadata:

```text
51 / 51 compleet
```

Dus de kwaliteit van de opgeslagen endpoint-records is goed.

De dekking is nog niet helemaal compleet.

## Ontbrekende Endpoints

Deze endpoints staan wel in de broncode, maar nog niet als GitLab endpoint-automation in de portal:

```text
POST /properties/bankkoppeling/sync_bedrijven_zonder_bankkoppeling_webhook
```

```text
POST /sales/leads/hubspot/typeform
```

```text
POST /typeform/onboarding
```

## Oude GitLab Bestand-records

Er bestaan ook nog oude GitLab records op bestandsniveau.

Voorbeeld:

```text
app/API/properties.py
```

Deze records zijn minder precies.

Voor flows willen we vooral endpoint-records gebruiken:

```text
POST /properties/btw/update_next_quarter_prev2m
```

Vuistregel:

```text
Bestand-record = oud/grof
Endpoint-record = goed/specifiek
```

## Checklist Voor Een Correcte GitLab Automation

Een GitLab automation is goed opgeslagen als je dit kunt beantwoorden:

```text
Waar staat hij?
```

Bijvoorbeeld:

```text
app/API/properties.py
```

```text
Welk endpoint wordt aangeroepen?
```

Bijvoorbeeld:

```text
POST /properties/btw/update_next_quarter_prev2m
```

```text
Welke handler draait?
```

Bijvoorbeeld:

```text
update_next_quarter_prev2m
```

```text
Wat start hem?
```

Bijvoorbeeld:

```text
HubSpot workflow roept endpoint aan
```

```text
Wat doet hij?
```

Bijvoorbeeld:

```text
Leest HubSpot-data en berekent de volgende BTW-status
```

```text
Wat verandert hij?
```

Bijvoorbeeld:

```text
Schrijft nieuwe HubSpot property/state terug
```

```text
Wat gebeurt daarna?
```

Bijvoorbeeld:

```text
Andere HubSpot workflows kunnen starten
```

## Aanbevolen Werkwijze

1. Scan de broncode.
2. Tel alle FastAPI endpoints onder `gitlabtest/app/API`.
3. Vergelijk met GitLab endpoint-automations in Supabase.
4. Los ontbrekende endpoints op via GitLab sync/import.
5. Gebruik endpoint-records voor flows, niet oude bestand-records.
6. Genereer daarna pas opnieuw flow-suggesties.

## GitLab Backendblok Binnen Een Procesreis

In de procesreis tonen we GitLab niet als losse technische endpointnaam, maar als backendblok.

Dat backendblok begint wanneer HubSpot de backend aanroept en eindigt wanneer er nieuwe HubSpot-state terugkomt.

```text
HubSpot workflow roept backend aan
↓
GitLab backendblok start
↓
GitLab automation 1 verwerkt een deel van het werk
↓
GitLab automation 2 verwerkt eventueel een volgende backendstap
↓
HubSpot krijgt nieuwe status terug
```

Belangrijk onderscheid:

```text
Procesreis = het hele verhaal over systemen heen
GitLab backendblok = het backendstuk binnen die procesreis
GitLab automation = één concrete endpoint/worker binnen dat backendblok
Interne functie = uitlegstap binnen een GitLab automation
```

Als één endpoint alleen interne functies aanroept, blijft dat één GitLab automation met meerdere interne stappen.

Als meerdere GitLab endpoint-automations aan dezelfde procesreis gekoppeld zijn, tonen we die samen binnen één GitLab backendblok. Elke automation blijft daarbinnen apart zichtbaar met een eigen mini-funnel:

```text
GitLab automation
- wat start hem?
- wat leest hij?
- wat bepaalt hij?
- wat schrijft hij terug?
- wat gebeurt daarna?
```

Zo blijft de procesreis begrijpelijk, maar verlies je niet welke GitLab automations precies meedoen.

## Simpele Samenvatting

Een GitLab backend automation is:

```text
één endpoint
dat één backend worker start
die iets leest
iets bepaalt
iets terugschrijft
en daardoor vervolgprocessen kan starten
```

Een flow is:

```text
HubSpot signaal
↓
HubSpot workflow
↓
GitLab backend automation
↓
HubSpot state update
↓
volgende HubSpot workflow of ander systeem
```
