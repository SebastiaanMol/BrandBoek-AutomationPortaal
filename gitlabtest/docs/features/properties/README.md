# Properties -- HubSpot Webhook Handlers

## What it does

The properties module handles HubSpot property-change webhooks. When a property changes on a deal, company, or contact in HubSpot, a workflow fires a webhook to one of these endpoints. The module then propagates the change to related records or triggers pipeline stage transitions (e.g. moving a Jaarrekening deal to a priority stage when BTW quarters are booked).

Key automations include:
- **BTW assignment propagation**: When a BTW deal is finished, copy its `controleur` and deal owner (`hubspot_owner_id`) to all later BTW deals for the same company. New BTW deals also inherit these values from the most recent finished BTW deal at creation time.
- **Stage assignment**: Determine and set the correct deal stage based on the deal's current properties.
- **IB "kan gemaakt worden"**: When a Jaarrekening deal reaches a completed stage, check if the IB (income tax) deal is ready to be prepared.
- **IB JR boekers sync**: For an IB deal, derive the `jr_boekers` planning field from the owners of same-year Jaarrekening deals linked through the IB contact's associated companies.
- **JR (Jaarrekening) priority bumps**: When BTW quarters are booked or IB status changes, bump the Jaarrekening deal to a priority stage.
- **Machtiging actief**: Compute the mandate activation status for IB deals based on contact and partner mandate properties and activation dates.
- **VA (Voorlopige Aanslag) pipeline management**: Move VA IB/VPB deals through their lifecycle based on prerequisite completion.
- **VPB priority**: Update VPB deal priority when the related Jaarrekening deal is updated.

## Key files

- `app/API/properties.py` -- Router with all property webhook endpoints (prefix: `/properties`)
- `app/service/properties/btw_assignment.py` -- BTW controleur/owner propagation from finished deals
- `app/service/properties/ib_kan_gemaakt_worden.py` -- IB readiness check based on JR completion
- `app/service/properties/ib_jr_owners.py` -- Sync `jr_boekers` on IB deals from same-year Jaarrekening owners
- `app/service/properties/jr_pipeline.py` -- Jaarrekening priority bumps from BTW and IB status
- `app/service/properties/machtiging_actief.py` -- Mandate activation status computation for IB deals
- `app/service/operations/va_pipelines/va_ib.py` -- VA IB deal lifecycle (prereqs, finished hooks)
- `app/service/operations/va_pipelines/va_vpb.py` -- VA VPB deal lifecycle

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/properties/btw/finished_webhook` | When a BTW deal is finished, propagate its controleur/owner to all later BTW deals for the same company (background) |
| POST | `/properties/assign_correct_stage` | Determine and set correct stage for a deal (background) |
| POST | `/properties/btw_deal_is_booked` | When BTW deal is booked, update related Jaarrekening deal |
| POST | `/properties/update_vpb_deals_when_jr_updated` | Update VPB deal priority from Jaarrekening status |
| POST | `/properties/get_property/{object_type}` | Fetch a HubSpot property definition |
| POST | `/properties/update_ib_kan_gemaakt_worden` | Check if IB deal is ready based on JR completion (background) |
| POST | `/properties/jr_prio_from_ib` | Bump related JR deals when IB deal changes |
| POST | `/properties/ib/prereqs_webhook` | Check IB prerequisites and move VA IB deal if ready |
| POST | `/properties/ib/machtiging_actief_webhook` | Recompute mandate activation status for an IB deal |
| POST | `/properties/ib/machtiging_actief_contact_webhook` | Recompute mandate status for all IB deals of a contact |
| POST | `/properties/ib/finished_webhook` | When IB deal finishes, move VA IB deal to "IB ingediend" |
| POST | `/properties/ib/sync_jr_owners_same_year` | Queue sync of the IB `jr_boekers` planning field from same-year JR deal owners |
| POST | `/properties/va_ib/finished_webhook` | When VA IB deal finishes, mark IB deal's va_ingediend=true |
| POST | `/properties/vpb/finished_webhook` | When VPB deal finishes, move VA VPB deal to "VPB ingediend" |
| POST | `/properties/va_vpb/finished_webhook` | When VA VPB deal finishes, mark VPB deal's va_ingediend=true |
| POST | `/properties/jr_prio_if_ib_ready_except_jr` | Bump JR deal if IB is ready but waiting for JR |
| POST | `/properties/jr/sync_related_ib_jr_owners_same_year` | Queue sync of related IB `jr_boekers` values when a JR owner/year changes |
| POST | `/properties/check_correct_stage` | Check and fix deal stages for all company deals |
| POST | `/properties/btw/update_next_quarter_prev2m` | Update next-quarter BTW deal's "prev 2 months" flag |
| POST | `/properties/update_jr_stage_from_btw_geboekt` | Bump JR stage based on company's booked BTW quarters |
| POST | `/properties/update_year` | Set deal year from creation date |

## JR boekers planning field

The `jr_boekers` deal property is a HubSpot multi-checkbox planning field on the IB deal. It is not a HubSpot user field, so it does not trigger assignment-style notifications.

The sync logic in `app/service/properties/ib_jr_owners.py` works like this:

1. Start from an IB deal and read its `year`.
2. Resolve the IB deal's associated contact.
3. Fetch all companies associated with that contact.
4. Fetch all deals for those companies and filter to Jaarrekening pipelines in the same year.
5. Read each JR deal's `hubspot_owner_id`.
6. Map each active owner onto an allowed `jr_boekers` checkbox option by direct option value match or by matching the option label to the owner's display name.
7. Update the IB deal with the semicolon-separated checkbox values.

Operational notes:
- Both `jr_boekers` endpoints use `BackgroundTasks`, so HubSpot can bulk-enroll records without waiting for the full sync.
- HubSpot batch reads are chunked to 100 inputs to stay within API limits.
- Owners outside the configured `jr_boekers` option subset are skipped and logged.

## How to extend

### Adding a new property webhook handler

1. Create a service function in the appropriate module under `app/service/properties/` (or create a new module).
2. Add a Pydantic model for the payload in `app/schemas/classes.py` if needed.
3. Add the endpoint in `app/API/properties.py` with the `Security(get_api_key)` dependency (already applied at router level).
4. Configure the HubSpot workflow to call the new endpoint on property change.
5. For long-running operations, use `BackgroundTasks` to avoid blocking the webhook response.
6. Update this document when the endpoint list or business behavior changes materially.

### Understanding the machtiging actief logic

The `machtiging_actief.py` module computes a mandate activation status for IB deals by checking:
- Whether the contact's mandate (`machtiging_fiscaal_online_doorlopend`) is "geactiveerd"
- Whether the fiscal partner's mandate is also active (if a partner is known)
- Whether activation happened before December 1 of the deal's year

The result is one of several labels (e.g. "Contact actief, geen partner", "Beide niet actief") stored on the deal's `machtiging_actief` property.

## Configuration

| Variable | Purpose |
|---|---|
| `HS_ACCESS_TOKEN` | HubSpot API token |
| `BRAND_API_KEY` | API key for webhook authentication |
