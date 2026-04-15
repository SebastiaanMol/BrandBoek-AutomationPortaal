# Wefact -- Debtor Sync and Invoicing

## What it does

The Wefact module keeps debtor (company) records in Wefact synchronised with HubSpot companies. When a company is created or updated in HubSpot, a webhook triggers the upsert endpoint, which looks up the debtor in Wefact by HubSpot company ID (stored as a custom field) or debtor code, and either creates or updates the record. After creating a new debtor, the Wefact debtor code is written back to the HubSpot company.

A separate nightly scheduled job (`openstaand_bedrag_sync`) reconciles outstanding invoice amounts: it fetches all open invoices from Wefact, aggregates amounts per debtor, and writes the totals back to the corresponding HubSpot company's `openstaand_bedrag` property and contact's `totaal_openstaand_bedrag` property.

## Key files

- `app/API/wefact.py` -- Router with Wefact endpoints (prefix: `/wefact`)
- `app/service/wefact/wefact.py` -- Debtor CRUD: `upsert_debtor_from_hubspot`, `_debtor_show_by_hubspot_id`, `_debtor_show_by_code`, `list_invoices`
- `app/service/wefact/openstaand_bedrag.py` -- Nightly outstanding-amount sync: `update_openstaande_bedragen` (called by APScheduler)
- `app/main.py` -- APScheduler cron job setup in `lifespan` context manager

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/wefact/hubspot/upsert_debtor` | Create or update a Wefact debtor from HubSpot company data |
| GET | `/wefact/hubspot/test_list` | Test-only: look up a debtor by HubSpot ID (no side effects) |

## How the upsert works

1. Look up the debtor in Wefact using the HubSpot company record ID (stored in a custom field).
2. If found and the name + HubSpot ID already match, return `noop` (no changes needed).
3. If found but data differs, update the debtor record.
4. If not found, create a new debtor in Wefact with the company details.
5. On creation, write the new Wefact debtor code back to the HubSpot company's `wefact_company_id` property.

## How the nightly sync works

1. Fetch all invoices from Wefact with the configured status filter.
2. Group invoices by debtor and compute the total outstanding amount per debtor.
3. For each debtor, look up the corresponding HubSpot company by `wefact_company_id`.
4. Update the company's `openstaand_bedrag` property with the computed total.
5. Also update the primary contact's `totaal_openstaand_bedrag`.

## How to extend

### Adding new debtor fields to sync

1. Add the new field to the `WefactDebtorUpsert` Pydantic model in `app/schemas/classes.py`.
2. Pass it through the `upsert_debtor_from_hubspot` function in `app/service/wefact/wefact.py`.
3. Include it in the Wefact API payload (the `_wefact_post` helper handles the HTTP call).

### Changing the sync schedule

Set `OPENSTAAND_SYNC_DAILY_AT` to a new time in HH:MM format (24h, Amsterdam timezone). Set `OPENSTAAND_SYNC_ENABLED` to `false` to disable the job entirely.

## Configuration

| Variable | Purpose |
|---|---|
| `WEFACT_API_KEY` | Wefact API authentication key |
| `WEFACT_API_URL` | Wefact API endpoint (default: `https://api.mijnwefact.nl/v2/`) |
| `OPENSTAAND_SYNC_ENABLED` | Enable/disable nightly outstanding-amount sync (`true`/`false`) |
| `OPENSTAAND_SYNC_DAILY_AT` | Time for the nightly sync in HH:MM format (default: `03:00`) |
| `WEFACT_INVOICE_STATUS` | Invoice status filter for the sync job |
| `HUBSPOT_OPEN_AMOUNT_FIELD` | HubSpot company property for outstanding amount (default: `openstaand_bedrag`) |
| `CONTACT_OPEN_AMOUNT_FIELD` | HubSpot contact property for outstanding amount (default: `totaal_openstaand_bedrag`) |
