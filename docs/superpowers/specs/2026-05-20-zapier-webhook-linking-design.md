# Zapier Webhook Linking Design

## Doel

Zapier Zaps moeten als losse read-only automations kunnen meedoen in procesreizen wanneer ze via een webhook aantoonbaar een backend automation aanroepen.

De koppeling wordt niet direct definitief gemaakt. Ook bij een exacte webhook-match verschijnt Zapier eerst als koppel-suggestie die een gebruiker moet bevestigen. Pas na bevestiging mag Zapier zichtbaar onderdeel worden van een procesreis.

## Scope

Wel:

- Detecteer Zapier -> backend suggesties via exacte webhook-path matching.
- Gebruik bestaande velden:
  - `automatiseringen.webhook_paths` op Zapier records.
  - `automatiseringen.endpoints` of GitLab endpointmetadata op backend records.
- Sla matches op als suggesties in de bestaande flow-link/suggestie infrastructuur.
- Toon in de redenering dat het bewijs een webhook-match is.
- Laat bevestigde links later door bestaande procesreislogica worden meegenomen.

Niet:

- Geen Zapier API-write of wijziging in Zapier.
- Geen automatische definitieve koppeling zonder review.
- Geen matching op alleen naam, categorie, systeem of AI-inschatting.
- Geen secrets, headers of request payloads tonen.
- Geen nieuwe database-entiteiten als bestaande suggestietabellen voldoende zijn.

## Bestaande Basis

De Zapier JSON-import schrijft Zapier Zaps al weg als automations met:

- `source = "zapier"`
- `categorie = "Zapier Zap"`
- `webhook_paths = [...]`
- `import_status = "approved"`

De bestaande `detect-flow-links` edge function heeft al een webhook-matcher:

```text
source.webhook_paths -> target.endpoints
```

Die basis is goed. De aanscherping is dat Zapier expliciet als bron wordt ondersteund, dat de redenering duidelijker wordt, en dat de UI/procesreis pas na bevestiging verdergaat.

## Matchingregels

Een Zapier-link mag worden voorgesteld wanneer:

1. De bronautomation `source = "zapier"` heeft.
2. De bronautomation minimaal een `webhook_path` heeft.
3. De doelautomation een backend/GitLab automation is met een endpoint.
4. Een webhook-path exact eindigt op of gelijk is aan het endpoint.

Voorbeeld:

```text
Zapier webhook path: /sales/leads/hubspot/trustoo
Backend endpoint:    /sales/leads/hubspot/trustoo
```

Resultaat:

```text
from: Zapier Zap
to: GitLab/backend automation
confidence: 1.0
reasoning: Webhook-match: Zapier roept endpoint /sales/leads/hubspot/trustoo aan.
confirmed: false
```

## Reviewflow

Nieuwe Zapier webhook-matches blijven suggesties:

- `confirmed = false`
- `rejected = false`
- zichtbaar bij bestaande koppel-/flow-suggesties

De gebruiker kan bevestigen of afwijzen. Alleen bevestigde links worden gebruikt als hard bewijs voor procesreizen.

## Procesreisgedrag

Voor bevestiging:

- Zapier staat als losse automation in de automationslijst.
- De webhook-match mag als suggestie zichtbaar zijn.
- De procesreis wordt nog niet automatisch uitgebreid met Zapier.

Na bevestiging:

- De procesreis mag Zapier als start- of tussenstap opnemen.
- Copy blijft functioneel:
  - "Zapier geeft gegevens door aan de backendverwerking."
  - technische endpointdetails blijven in Logica/Technische trace.

## Bewijslabels

Gebruik duidelijke labels:

- `Webhook-match` voor exacte Zapier webhook -> backend endpoint.
- `Procesvolgorde` alleen wanneer volgorde is afgeleid.
- `AI-suggestie` alleen voor zachte suggesties, nooit automatisch bevestigd.

## Error Handling

- Als Zapier geen `webhook_paths` heeft: geen suggestie.
- Als backend geen endpoint heeft: geen suggestie.
- Als meerdere backend automations hetzelfde endpoint hebben: maak meerdere suggesties, maar laat de gebruiker bevestigen.
- Als dezelfde suggestie al bestaat: niet dupliceren.
- Als een suggestie eerder is afgewezen: niet opnieuw automatisch terugzetten als actief.

## Testplan

- Unit/source test: Zapier is een expliciete bron voor webhook-suggesties.
- Unit/source test: Zapier webhook-match blijft `confirmed = false`.
- Unit/source test: reasoning bevat `Webhook-match`.
- Integratie/live check:
  - Run detect-flow-links in webhook/all mode.
  - Controleer dat Zapier -> backend suggesties verschijnen.
  - Bevestig een suggestie.
  - Controleer dat de bevestigde link in een procesreis kan worden gebruikt.

## Open Beslissing

We kiezen nu expliciet voor optie A:

Exacte Zapier webhook-matches worden eerst suggesties ter bevestiging. Ze worden niet automatisch definitief gekoppeld.
