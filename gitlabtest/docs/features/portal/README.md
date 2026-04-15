# Portal -- Bank Connection Status

## What it does

The portal module receives updates from the client portal about bank connection status changes. When a client connects or disconnects their bank in the external portal, a webhook fires to this endpoint with the company reference ID and the new status. The module updates the company's `bankkoppeling_status` property in HubSpot. A downstream HubSpot workflow then propagates this status to all deals belonging to that company.

This is used by the operations module to route BTW deals to the correct stage based on whether the bank is connected.

## Key files

- `app/API/portal.py` -- Router with the bank connection endpoint (prefix: `/portal`)
- `app/repository/hubspot.py` -- `update_bank_connection_status` function that writes to HubSpot

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/portal/hubspot/bank_connection_status` | Update a company's bank connection status in HubSpot |

## Request body

```json
{
  "reference_id": "12345678",
  "bank_connection_status": "connected"
}
```

The `reference_id` is the HubSpot company ID. The `bank_connection_status` is a string matching the HubSpot property options (e.g. "connected", "disconnected").

## How to extend

### Adding new portal status fields

1. Add the new property update to `app/repository/hubspot.py` (similar to `update_bank_connection_status`).
2. Add a new Pydantic model or extend `Administration` in `app/schemas/classes.py`.
3. Add a new endpoint in `app/API/portal.py` or extend the existing one.
4. Configure the external portal to send the webhook to the new endpoint.

## Configuration

| Variable | Purpose |
|---|---|
| `HS_ACCESS_TOKEN` | HubSpot API token |
| `BRAND_API_KEY` | API key for webhook authentication |
