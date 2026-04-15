# Operations -- Deal Pipeline Automation

## What it does

The operations module is the core of the deal lifecycle automation. When a deal is won in HubSpot's sales pipeline, this module creates corresponding deals in the continuous pipelines (BTW-Q, Jaarrekening, IB, VPB) based on the company's configuration (rechtsvorm, intensiteit, software pakket). It also handles deal amount synchronisation across pipelines, "betaalt niet" (non-payment) flows that move all company deals to a blocked stage, and BTW deal routing based on bank connection status.

Additionally, the module provides endpoints for pipeline management: cloning pipelines, checking pipeline usage in workflows, and bulk-moving active deals between pipelines.

## Key files

- `app/API/operations.py` -- Router with all operations endpoints (prefix: `/operations`)
- `app/service/operations/operations.py` -- Main orchestration: `create_new_deal`, `contact_change`, `company_change`, `update_deal_amount_in_new_pipeline`, `move_btw_q_deal_volledige_service`, `update_doorlopende_machtiging_deal`
- `app/service/operations/hubspot.py` -- HubSpot-specific helpers: pipeline lookups, stage matching, deal searches, workflow scanning
- `app/service/operations/betaalt_niet.py` -- "Betaalt niet" logic: move all company deals to the blocked stage, remember previous stages, and reset them
- `app/service/operations/btw_bankconnection.py` -- BTW deal routing based on bank connection status; next-quarter prev-2-month updates
- `app/service/operations/find_correct_stage.py` -- Stage-matching logic: given a deal's properties, determine the correct stage in a target pipeline
- `app/service/operations/facturen.py` -- Legacy invoice sync logic (currently not exposed via active endpoints)
- `app/service/operations/va_pipelines/` -- VA (Voorlopige Aanslag) IB and VPB pipeline lifecycle management

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/operations/hubspot/create_new_deal` | Create deals in continuous pipelines from a won sales deal |
| POST | `/operations/hubspot/new_pipeline/deal/amount` | Sync deal amount from sales deal to corresponding pipeline deal |
| POST | `/operations/hubspot/contact/updating_dealname` | Update deal names when contact name changes |
| POST | `/operations/hubspot/company/updating_dealname` | Update deal names when company name changes |
| POST | `/operations/hubspot/dossiers/{contact_id}` | Update a contact's dossier structuur property |
| POST | `/operations/hubspot/deal/delete_vat_deal` | Delete a VAT deal in a specific pipeline |
| POST | `/operations/hubspot/betaalt_niet` | Move all company deals to "Betaalt niet" stage (background task) |
| POST | `/operations/hubspot/reset_betaalt_niet` | Reset all company deals from "Betaalt niet" to previous stage |
| POST | `/operations/hubspot/btw_dealstage_based_on_bank_connection` | Route BTW deal stage based on bank connection status |
| POST | `/operations/hubspot/berekening_compleet` | Move BTW-Q deal to "Berekening Compleet" when conditions are met |
| POST | `/operations/hubspot/move_dm_deal_to_geen_ib` | Move doorlopende machtiging deal to "Geen IB" stage |
| POST | `/operations/hubspot/clone_pipeline` | Clone a pipeline with a new label |
| POST | `/operations/hubspot/workflows/pipeline_usage` | Check which workflows reference a pipeline (returns CSV) |
| GET | `/operations/hubspot/active_pipelines` | List all active pipelines |
| POST | `/operations/hubspot/put_active_deals_in_new_deal` | Bulk-move active deals into new pipeline deals |
| POST | `/operations/get_company_deals` | Get all deals for a company |
| GET | `/operations/hubspot/owner` | Get deal owner info |

## How to extend

### Adding a new pipeline type

1. Add the pipeline ID as a constant in `app/service/operations/operations.py` (e.g. `NEW_PIPELINE_ID = "123456"`).
2. Add the pipeline to `CONTINUOUS_PIPELINE_IDS` if deals should be auto-created on sales deal win.
3. Update the `create_new_deal` function in `operations.py` to include logic for the new pipeline.
4. Add stage-matching rules in `app/service/operations/find_correct_stage.py` if needed.
5. Create a new endpoint in `app/API/operations.py` if the pipeline needs dedicated webhook handling.

### Adding a new "betaalt niet" stage to a pipeline

The betaalt-niet logic in `betaalt_niet.py` dynamically looks up the "Betaalt niet" stage label in each pipeline. As long as your new pipeline has a stage labelled "Betaalt niet", it will be picked up automatically.

## Configuration

| Variable | Purpose |
|---|---|
| `HS_ACCESS_TOKEN` | HubSpot API token used by all repository calls |
| `BRAND_API_KEY` | API key for authenticating incoming webhook requests |
