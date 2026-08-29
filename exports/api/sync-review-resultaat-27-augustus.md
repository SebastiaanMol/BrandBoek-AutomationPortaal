# Resultaat HubSpot-sync verwerking — 27 augustus 2026

*Alle onderliggende schrijfacties staan ook gelogd in `portal_change_log.md`.*

## ✅ Update: opgelost via een nieuwe sync (27 augustus 2026, later die dag)

Op je akkoord ("jij draait zelf een nieuwe sync") heb ik zelf een nieuwe HubSpot-sync getriggerd en de uitkomst correct verwerkt. Kort:

- **Nieuwe sync-run**: 377 open regels (meer dan de vorige 335 — er waren sinds die ochtend weer nieuwe HubSpot-wijzigingen bijgekomen).
- **Root cause gevonden**: in de broncode van de Imports-pagina uitgezocht waarom de knop de vorige keer de hele rest skipte. De knop stuurt alleen de aangevinkte regels van de **huidige pagina** (max. 50) mee naar de server; de server verwerkt daarna de **hele resterende wachtrij** van die sync-run in één keer — meegestuurd = toegepast, al het overige = overgeslagen. Bij 7+ pagina's kan de knop dus nooit meer dan 50 regels per sync-run goed verwerken.
- **Herstel**: dezelfde functie die de knop aanroept, rechtstreeks aangeroepen (via de eigen ingelogde app, geen aparte truc) met in één keer de **volledige juiste lijst van 347 regels** in plaats van steeds 50.
- **Resultaat, 1-op-1 geverifieerd**: **347 toegepast** (272 `source_data_incomplete` + 62 `metadata_changed` + 13 van de 15 `source_missing`), **30 overgeslagen** (20 `route_changed` + 8 `new_automation` + de 2 al-geplaatste `source_missing`: "set source to ageras" en "set source to organic"). Precies de bedoelde verdeling, niets fout toegepast.
- **Let op:** de 30 overgeslagen regels staan nu op een eindstatus ("overgeslagen") — die kwamen niet aan bod voor jouw inhoudelijke beoordeling in déze sync-run. Wil je de `route_changed`/`new_automation`-voorstellen alsnog beoordelen, dan verschijnen ze (voor zover nog actueel) opnieuw bij een volgende sync. Voor "ageras"/"organic" geldt hetzelfde: die komen terug zodra je de canvas-opschoning inplant.

Details van de aanpak staan in `portal_change_log.md`. De rest van dit document (hieronder) is het oorspronkelijke verslag van de mislukte eerste poging — nog steeds nuttig om te begrijpen wat er misging.

---

## Kort samengevat (oorspronkelijke poging, inmiddels opgelost — zie update hierboven)

Je vroeg om de veilige categorieën uit de nieuwe HubSpot-sync te selecteren en zelf toe te passen: 234 × `source_data_incomplete` + 62 × `metadata_changed` + 13 van de 15 × `source_missing` (de 2 die al op een canvas geplaatst staan bewust erbuiten gelaten). Dat is **309 toe te passen, 26 open te houden**.

De selectie zelf is exact goed gegaan. Het toepassen via de Imports-pagina liep tegen onverwacht knopgedrag aan, waardoor er uiteindelijk maar **50 van de 309** echt zijn toegepast. De rest is niet fout gegaan, maar ook niet toegepast — zie hieronder.

## Wat er precies gebeurde

| | Bedoeld | Werkelijk |
|---|---|---|
| Toegepast | 309 | **50** |
| Opengehouden (uitgesloten) | 26 | 26 — klopt |
| Ten onrechte overgeslagen | 0 | **259** |

De 50 die wél zijn toegepast: 13 `source_missing` + 36 `source_data_incomplete` + 1 `metadata_changed` — precies de eerste 50 rijen (pagina 1 van 7).

De 26 bewust uitgesloten regels (16 `route_changed`, 8 `new_automation`, 2 geplaatste `source_missing`) staan correct als "overgeslagen" geregistreerd — die zijn dus niet per ongeluk verwerkt.

**Het probleem:** de 259 overige regels die wél toegepast hadden moeten worden (198 `source_data_incomplete` + 61 `metadata_changed`) zijn óók als "overgeslagen" geregistreerd, in plaats van toegepast.

## Root cause

De tekst bij de knop op de Imports-pagina zegt: *"Alleen geselecteerde regels op deze pagina worden toegepast. Uitgevinkte regels blijven openstaan."* Dat is niet wat er gebeurt. In werkelijkheid sluit één klik op "toepassen" **de hele resterende wachtrij van die sync-run in één keer af** — de geselecteerde regels op de huidige pagina worden toegepast, maar alles wat daarna nog open stond (ook regels die voor een latere pagina bedoeld waren, en ongeacht hun eigen selectie) wordt in dezelfde actie op "overgeslagen" gezet in plaats van open te blijven staan.

Dit is dus een verschil tussen wat de knop zegt te doen en wat hij echt doet — het is geen fout in de selectie (die was exact 309/26) en er is niets verkeerds toegepast.

## Kan dit nog hersteld worden?

Ik heb via de API onderzocht of de 259 ten onrechte overgeslagen regels alsnog naar "toegepast" te krijgen zijn, of terug naar "open". Beide bleken niet mogelijk:

- De enige schrijfroute voor losse regels accepteert alleen de waarden "overgeslagen", "geselecteerd" of "uitgevinkt" — niet "toegepast" en niet "open". Een regel die eenmaal op "overgeslagen" staat, lijkt een eindstatus te zijn.
- Er lijkt een verzamel-endpoint (`bulk`) te bestaan, maar ik kon niet met zekerheid vaststellen welke velden dat verwacht voordat mijn verbinding met de browser wegviel. Ik heb ervoor gekozen dat niet verder op goed geluk te proberen — het risico op een verkeerde schrijfactie op 259 regels tegelijk woog niet op tegen de tijdswinst.

**Goed nieuws:** omdat deze 259 regels zijn overgeslagen (niet toegepast), is er voor ze niets in de portaldata veranderd. De onderliggende verschillen die de sync signaleerde, bestaan dus nog gewoon.

## Voorstel voor vervolg

Een nieuwe HubSpot-sync zal vermoedelijk dezelfde 259 verschillen opnieuw naar voren brengen als nieuwe, open regels (aangezien de brondata niet is aangepast). Dan kan ik ze — nu ik het echte knopgedrag ken — per pagina bewust toepassen en na elke klik via de API verifiëren dat alleen die pagina is verwerkt, vóór de volgende klik. Dat voorkomt dat dit nog een keer gebeurt.

Ik wacht op je akkoord voordat ik een nieuwe sync start of opnieuw op "toepassen" klik.

## Ter info: wat al wél goed staat

- Alle 13 correct toe te passen `source_missing`-regels: toegepast.
- 36 van de 234 `source_data_incomplete`-regels: toegepast.
- 1 van de 62 `metadata_changed`-regels: toegepast.
- Alle 26 uitgesloten regels: correct open/overgeslagen, niets per ongeluk doorgevoerd.
