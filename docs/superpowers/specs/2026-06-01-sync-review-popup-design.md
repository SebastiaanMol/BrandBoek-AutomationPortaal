# Sync Review Popup Design

## Doel

Elke automation-sync voor HubSpot, Zapier, Typeform en GitLab krijgt een reviewstap voordat wijzigingen in het portaal worden toegepast. De gebruiker ziet eerst wat nieuw is, wat wijzigt en welke bronwaarschuwingen ontstaan. Alles staat standaard aangevinkt, maar individuele regels kunnen worden uitgezet.

HubSpot pipelines vallen buiten deze eerste versie. Die sync blijft voorlopig ongewijzigd.

## Gekozen Richting

We bouwen optie 1: preview-first sync.

De sync-flow wordt:

1. Bron ophalen.
2. Verschillen berekenen.
3. Review-popup tonen.
4. Gebruiker kiest regels.
5. Alleen geselecteerde wijzigingen toepassen.

Deze aanpak voorkomt dat bestaande automations stil worden aangepast. De gebruiker houdt controle, terwijl de standaard nog steeds snel blijft: alles staat alvast geselecteerd.

## UX

De popup volgt de goedgekeurde browserpreview:

- Header met bronbadge, sync-preview badge, samenvatting en datum/tijd van de run.
- Metric row met aantallen: geselecteerd, nieuw, gewijzigd, ongewijzigd.
- Filterbalk met "alles selecteren" en filters voor nieuw, gewijzigd en bronwaarschuwing.
- Lijstweergave met vaste kolommen:
  - checkbox
  - automation
  - type wijziging
  - wat verandert er
  - impact
- Footer met uitleg en acties:
  - annuleren
  - geselecteerde wijzigingen toepassen

Alle wijzigingsregels staan standaard aangevinkt. Als een gebruiker een regel uitzet, wordt die wijziging niet toegepast. De regel blijft wel gekoppeld aan de sync-run zodat later zichtbaar blijft dat de bron deze wijziging had gevonden.

## Wijzigingstypes

De reviewlijst ondersteunt minimaal deze types:

- `new_automation`: bronrecord bestaat nog niet in het portaal.
- `metadata_changed`: naam, doel, trigger, categorie, status, systemen of stappen verschillen.
- `route_changed`: webhooks of endpoints verschillen.
- `source_data_incomplete`: procesreis-kritieke brondata ontbreekt.
- `source_missing`: bestaande automation is niet meer gevonden bij de bron.

Voor de gebruiker worden deze vertaald naar gewone labels zoals `Nieuw`, `Gewijzigd`, `Webhook gewijzigd`, `Brondata incompleet` en `Niet meer gevonden`.

## Data Model

Er komt een persistente tabel voor preview-items, bijvoorbeeld `source_sync_change_items`.

Voorstelvelden:

- `id`
- `sync_run_id`
- `source`
- `external_id`
- `automation_id`
- `change_type`
- `status`: `pending`, `applied`, `skipped`
- `title`
- `summary`
- `impact`
- `old_value_sanitized`
- `new_value_sanitized`
- `payload_sanitized`
- `selected_by_default`
- `applied_at`
- `skipped_at`
- `created_at`
- `updated_at`

De bestaande `source_sync_runs` blijft de run-kop. De nieuwe tabel bevat de individuele regels die de popup toont.

## Backend Flow

De vier sync Edge Functions krijgen twee modi:

- `preview`: haalt brondata op, berekent diff-items, schrijft nog geen automation-wijzigingen door.
- `apply`: ontvangt geselecteerde change-item IDs en past alleen die wijzigingen toe.

De bestaande helper `recordPortalOwnedSync` wordt opgesplitst:

- een diff-builder die bestaande bronpayloads vergelijkt met portaldata;
- een preview-writer die change-items opslaat;
- een apply-helper die geselecteerde changes verwerkt.

Nieuwe automations blijven via `automation_import_proposals` lopen. Bestaande source-managed velden worden pas bijgewerkt als de bijbehorende change-item is geselecteerd en toegepast.

## Frontend Flow

De bestaande sync-knoppen blijven op dezelfde plekken staan:

- Instellingen > Externe systemen.
- Imports-pagina waar syncknoppen staan.
- Zapier JSON-import gebruikt dezelfde reviewflow waar mogelijk.

Na klikken op sync:

1. Frontend roept sync aan met `{ mode: "preview" }`.
2. Backend geeft `syncRunId` en change-items terug.
3. Frontend opent `SyncReviewDialog`.
4. Gebruiker laat alles aan of vinkt regels uit.
5. Frontend roept apply aan met geselecteerde IDs.
6. Queries worden geinvalidated: automations, pending imports, findings, integration.

Bij annuleren worden geen wijzigingen toegepast. De preview-run blijft auditbaar als niet-toegepast.

## Security En Sanitizing

De popup toont nooit secrets, tokens, authorization headers, cookies, raw submissions, responses of payloads met klantantwoorden. De bestaande sanitizing-regels blijven leidend en worden hergebruikt voor preview-items.

Voor technische payloads toont de UI alleen compacte, gesanitized samenvattingen. Volledige raw-data blijft bron-specifiek en read-only op detailpagina's.

## Error Handling

Als preview faalt, wordt geen popup geopend en ziet de gebruiker een foutmelding bij de syncknop.

Als apply gedeeltelijk faalt:

- succesvolle items krijgen `applied`;
- mislukte items blijven `pending` of krijgen een foutstatus als we die toevoegen;
- de gebruiker krijgt een duidelijke melding met hoeveel items wel en niet zijn toegepast.

Als een item tijdens apply niet meer geldig is, bijvoorbeeld omdat de automation inmiddels is gewijzigd, wordt die regel niet toegepast en krijgt de gebruiker de melding dat een nieuwe preview nodig is.

## Tests

Backend tests:

- preview maakt change-items zonder bestaande automations direct te muteren.
- apply verwerkt alleen geselecteerde items.
- uitgevinkte items blijven `pending` of `skipped` en wijzigen geen automation.
- nieuwe automations maken importvoorstellen.
- bestaande metadata- en routewijzigingen worden pas toegepast na apply.
- sensitive fields worden gesanitized in preview-items.

Frontend tests:

- sync opent review-popup met lijstregels.
- alle regels staan standaard aangevinkt.
- gebruiker kan regels uitvinken.
- apply stuurt alleen geselecteerde IDs.
- annuleren past niets toe.
- popup toont nieuw, gewijzigd en bronwaarschuwing in scanbare lijstvorm.

Browser checks:

- popup past op desktop.
- lijst scrollt netjes bij veel items.
- footer-acties blijven zichtbaar.
- mobiel heeft geen horizontale overflow.

## Out Of Scope Voor V1

- HubSpot pipelines sync-review.
- Bulk-edit van change-items.
- Complexe merge-conflictoplossing per veld.
- Realtime bronvergelijking terwijl de popup openstaat.
- Procesreis-herbouw direct vanuit de popup.

## Open Besluit Dat Al Genomen Is

De gekozen aanpak is preview-first sync met de list-view popup uit de browserpreview. Alles staat standaard aangevinkt en de gebruiker kan optioneel wijzigingen uitzetten voordat de sync wordt toegepast.
