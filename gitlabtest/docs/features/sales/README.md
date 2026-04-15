# Sales -- Lead Ingestion

## What it does

The sales module ingests leads from external sources (Trustoo, Offerte.nl, Ligo, Solvari, Calendly) and creates contacts and deals in HubSpot's sales pipeline. Each source sends data in a different format, so the module normalises the input into a common structure before creating HubSpot records. It also includes a deal migration endpoint for moving deals between pipelines (e.g. when splitting a pipeline into multiple).

Leads are deduplicated: the service searches for existing contacts by email before creating new ones. Each source has its own authentication method (API key header, Basic Auth, or a shared secret).

## Key files

- `app/API/sales.py` -- Router with lead endpoints (prefix: `/sales`)
- `app/service/sales/sales.py` -- Core logic: `add_lead_to_hubspot` (normalise, deduplicate, create contact + deal), `format_ligo_email`, `format_trustoo_questions`
- `app/service/sales/split_pipelines.py` -- `migrate_or_copy_deals_between_pipelines` for bulk pipeline migrations
- `app/schemas/classes.py` -- Pydantic models: `TrustooLead`, `OfferteLead`, `LigoLead`, `SolvariLead`, `MigrateDealsRequest`

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/sales/leads/hubspot/trustoo` | X-API-Key | Ingest Trustoo lead (background task) |
| POST | `/sales/leads/hubspot/offerte.nl` | Basic Auth | Ingest Offerte.nl lead |
| POST | `/sales/leads/hubspot/ligo` | X-API-Key | Ingest Ligo lead (parsed from raw email) |
| POST | `/sales/leads/hubspot/solvari` | Solvari secret in body | Ingest Solvari lead |
| POST | `/sales/leads/hubspot/calendly` | None | Ingest Calendly `invitee.created` webhook |
| POST | `/sales/migrate_deals` | X-API-Key | Migrate deals between pipelines by stage label |

## How to extend

### Adding a new lead source

1. Create a Pydantic model for the new lead format in `app/schemas/classes.py`.
2. Add a new endpoint in `app/API/sales.py` that accepts the model.
3. If the source uses a unique auth scheme, implement it in the endpoint (see the Solvari secret or Offerte.nl Basic Auth patterns).
4. In `app/service/sales/sales.py`, add a formatting function if the source data needs transformation.
5. Call `add_lead_to_hubspot(lead_data, "source_name")` from the endpoint. The function handles contact deduplication and deal creation.
6. For high-volume sources, wrap the call with `BackgroundTasks` (see the Trustoo pattern).

### How lead deduplication works

`add_lead_to_hubspot` searches HubSpot for an existing contact with the same email address. If found, it creates a new deal linked to the existing contact. If not found, it creates both a new contact and a new deal. The source name is stored as a deal property for tracking.

## Configuration

| Variable | Purpose |
|---|---|
| `BRAND_API_KEY` | API key for Trustoo, Ligo, and migration endpoints |
| `SOLVARI_KEY` | Secret key for Solvari webhook authentication |
| `HS_ACCESS_TOKEN` | HubSpot API token for contact/deal creation |
