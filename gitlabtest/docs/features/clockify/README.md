# Clockify -- Client Sync

## What it does

The Clockify module provisions and updates clients in Clockify when a company is created or renamed in HubSpot. A HubSpot workflow triggers the upsert webhook, which looks up the Clockify client by HubSpot record ID (stored in the client's `note` field). If a matching client exists, it updates the name and unarchives it if needed. If no match is found, it creates a new Clockify client with a standard set of projects and tasks.

The module also applies its own client-side rate limiting (~33 req/s) to stay under Clockify's 50 req/s API cap.

## Key files

- `app/API/clockify.py` -- Router with the upsert endpoint (prefix: `/clockify`)
- `app/service/clockify/clockify.py` -- All Clockify logic: client lookup, create, update, archive/unarchive, project and task provisioning, rate limiting

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/clockify/hubspot/upsert_client` | Create or update a Clockify client from a HubSpot company webhook |

## How the upsert works

1. Search for existing Clockify clients by name (exact match, case-insensitive).
2. Check if any client has a `note` field matching the HubSpot record ID.
3. **If found and active**: update the client name if it differs.
4. **If found but archived**: unarchive the client and update the name.
5. **If not found**: create a new client with the company name and HubSpot record ID in the note. Then create standard projects with predefined tasks.

## How to extend

### Adding new standard projects/tasks for new clients

Modify the project and task creation logic in `app/service/clockify/clockify.py`. The module creates projects and tasks immediately after creating a new client. Add your new project/task definitions to the relevant creation functions.

### Changing the workspace

Update the `WORKSPACE_ID` constant in `app/service/clockify/clockify.py`.

## Configuration

| Variable | Purpose |
|---|---|
| `CLOCKIFY_API_KEY` | Clockify API key for authentication |
