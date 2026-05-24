# Zapier JSON Import Design

## Doel

Importeer de Zaps uit `zapfile.json` als losse automations in het portaal. Zapier wordt daarmee een derde automationbron naast HubSpot en GitLab. Elke Zap blijft read-only en kan later evidence-based onderdeel worden van een procesreis.

## Uitgangspunt

Het Zapier-exportbestand bevat `metadata` en een lijst `zaps`. Elke Zap heeft een eigen `id`, `title`, `status` en een `nodes` object met trigger-, actie-, zoek-, filter-, branch-, delay-, webhook- en AI-stappen.

Het bestand bevat ook gevoelige waarden, zoals headers, API keys, auth-velden en soms grote email- of promptteksten. Die ruwe data mag niet ongefilterd in normale portaalcopy terechtkomen.

## Importmodel

Elke Zap wordt geimporteerd als een eigen record in `automatiseringen`.

Vaste velden:

- `source = "zapier"`
- `categorie = "Zapier Zap"`
- `external_id = zap.id`
- `naam = zap.title`
- `status = "Actief"` bij Zapier `status = "on"`, anders `"Uitgeschakeld"`
- `systemen = ["Zapier", ...apps uit de nodes]`
- `stappen = functionele samenvatting van de nodes`
- `webhook_paths = veilige paden uit webhook-URLs`
- `import_proposal.read_only = true`

De import is idempotent: dezelfde Zap opnieuw importeren werkt bestaande Zapier-records bij in plaats van dubbele automations aan te maken.

## Procesreis-koppeling

Een Zapier Zap is niet automatisch een volledige procesreis. Een Zap is een automationblok dat in een procesreis kan vallen wanneer daar bewijs voor is.

Mogelijke bewijssoorten:

- HubSpot trigger in Zapier, bijvoorbeeld dealstage of property change.
- Typeform trigger in Zapier, bijvoorbeeld nieuwe formulierinzending.
- Outlook trigger in Zapier, bijvoorbeeld nieuwe mail of kalenderafspraak.
- Webhookactie naar een bekend backend endpoint.
- HubSpot write/update vanuit Zapier.
- Duidelijke parent-child volgorde binnen `nodes`.

De procesreis mag later bijvoorbeeld zo lezen:

```text
HubSpot status verandert
-> Zapier Zap start
-> Zapier filtert, zoekt, verrijkt of stuurt door
-> eventueel backend webhook
-> eventueel HubSpot update
-> vervolgproces alleen als de exacte trigger bewezen is
```

Er wordt geen vervolgproces gekoppeld op basis van aannames. De bestaande regel blijft leidend: alleen doortrekken wanneer property, waarde, dealstage, workflowtrigger, webhook of codekoppeling bewezen is.

## Veiligheid en redactie

De importer moet gevoelige velden strippen of maskeren voordat data in `automatiseringen` of `import_proposal` terechtkomt.

Altijd verwijderen of maskeren:

- `headers`
- `X-API-Key`
- `Authorization`
- `token`
- `secret`
- `password`
- `auth`
- grote email bodies en AI prompts in normale overzichtstekst

Technische details mogen alleen in een technische laag of `Logica`-achtige details verschijnen, en dan zonder secrets.

## Functionele copy

Normale gebruikerscopy moet uitleggen wat de Zap functioneel doet.

Voorbeelden:

- Een HubSpot dealstage-trigger wordt: "Deze Zap start wanneer een HubSpot-deal een specifieke fase bereikt."
- Een Typeform-trigger wordt: "Deze Zap start wanneer een Typeform-formulier wordt ingevuld."
- Een webhookactie wordt: "Zapier geeft de gegevens door aan een backendverwerking."
- Een Outlook-mailactie wordt: "Zapier verstuurt of maakt een mail op basis van de opgehaalde klantgegevens."

Ruwe technische namen zoals `HubSpotCLIAPI@1.14.0`, `WebHookCLIAPI@1.0.29`, `POST`, endpointnamen en action ids horen niet in de hoofdtekst, tenzij de gebruiker expliciet technische details opent.

## Eerste implementatiescope

De eerste versie hoeft geen Zapier OAuth of live API te gebruiken. De bron is een lokaal JSON-bestand of handmatige upload.

Eerste versie doet wel:

- JSON-bestand parsen.
- Zaps omzetten naar losse automation-records.
- Secrets strippen.
- Apps, stappen, triggers, statussen en webhook paths samenvatten.
- Records idempotent upserten.
- Drie representatieve Zaps testen in het portaal.

Eerste versie doet nog niet:

- Zapier API OAuth.
- Automatisch periodiek synchroniseren.
- Zaps aanpassen of beheren.
- Onbewezen procesreis-koppelingen afdwingen.

## Teststrategie

Automatische tests:

- Parser herkent `zaps[].nodes`.
- Elke Zap wordt een apart automation payload.
- Zapier `on/off` status wordt correct gemapt.
- Secrets worden verwijderd.
- Webhook paths worden veilig geextraheerd.
- Functionele staplabels bevatten geen ruwe `CLIAPI@` namen in hoofdvelden.
- Idempotente import gebruikt `source = "zapier"` en `external_id`.

Handmatige test:

- Importeer `zapfile.json`.
- Controleer 3 Zaps:
  - een Trustoo lead Zap met webhook.
  - een "Geen gehoor" Zap met HubSpot, branch/filter en Outlook.
  - een Typeform of AI-gerelateerde Zap met veel stappen.
- Controleer of ze als losse automations zichtbaar zijn.
- Controleer of ze niet automatisch in verkeerde procesreizen worden gekoppeld.
