# Architecture Overview

## 3-Layer Design

The application is organised into three layers with strict dependency direction:

```
HTTP Request
    |
    v
+------------------+
|   API Layer      |   app/API/*.py
|   (Routers)      |   FastAPI routers: validation, auth, HTTP status codes
+------------------+
    |
    v
+------------------+
|  Service Layer   |   app/service/*/*.py
|  (Business Logic)|   Orchestration, transformation, domain rules
+------------------+
    |
    v
+------------------+
|  Repository Layer|   app/repository/*.py
|  (External APIs) |   HubSpot SDK, Wefact REST, Clockify REST
+------------------+
```

**Rules:**
- Routers never call repository functions directly (they go through services).
- Services coordinate multiple repository calls and contain all business logic.
- Repository functions are thin wrappers: one function = one external API call.

## Data Flow

A typical webhook request flows like this:

1. HubSpot fires a webhook to a FastAPI endpoint (e.g. `/properties/update-dossier-deals`).
2. The router validates the `X-API-Key` header and the request body (Pydantic model).
3. The router calls a service function, often via `BackgroundTasks` for long operations.
4. The service function calls `call_hubspot_api(repo_func, *args)` for each HubSpot interaction.
5. `call_hubspot_api` enqueues the synchronous HubSpot SDK call into the shared rate-limiter queue.
6. Workers pick up calls, respect the 8/s and 80/10s token-bucket limits, and execute them in a thread pool.
7. On 429 responses, the worker retries with exponential backoff.
8. Results flow back through the service to the router, which returns an HTTP response.

## Key Components

| Component | Location | Purpose |
|---|---|---|
| FastAPI app factory | `app/main.py` | Creates the app, registers routers, sets up lifespan (scheduler + rate-limiter workers) |
| HubSpot client singleton | `app/hubspot_client.py` | Single `HubSpot` SDK instance used by all repository functions |
| Rate limiter | `app/service/rate_limiter.py` | Async queue with dual token-bucket (aiolimiter), retry, timeout, cooldown |
| Auth dependency | `app/auth.py` | `get_api_key` FastAPI dependency for `X-API-Key` header validation |
| Pydantic schemas | `app/schemas/classes.py` | Request/response models shared across routers |

## Property Webhook Pattern

The `/properties/*` router contains several HubSpot workflow callbacks that are intentionally asynchronous from the caller's perspective:

- Expensive syncs are queued with `BackgroundTasks` so HubSpot receives a fast 200 response.
- The background task then uses `call_hubspot_api(...)` for every HubSpot interaction, so webhook bursts still go through the shared limiter.
- Batch HubSpot reads must be chunked to 100 inputs, which is the current HubSpot batch limit.

Example: the IB `jr_boekers` planning sync reads an IB deal, traverses contact -> companies -> same-year Jaarrekening deals, maps JR owners onto allowed checkbox options, and writes the aggregated value back to the IB deal.

## Deployment

```
GitLab repo
    |
    +-- push to `dev`  -->  GitLab CI  -->  Railway (development)
    |
    +-- push to `main` -->  GitLab CI  -->  Railway (production)
```

The CI pipeline (`.gitlab-ci.yml`) runs four stages:

1. **lint** -- `ruff check`, `ruff format --check`, `mypy`
2. **test** -- `pytest`
3. **development** -- Deploy to Railway dev (only on `dev` branch)
4. **production** -- Deploy to Railway production (only on `main` branch)

The Docker image uses `python:3.12-slim` with `uv` for dependency management. The entrypoint runs uvicorn on port 80.

## Scheduled Jobs

The `lifespan` context manager in `app/main.py` starts:

- **Rate-limiter workers** -- `asyncio.create_task(api_worker())` to process the HubSpot call queue.
- **APScheduler** -- A single cron job (`openstaand_bedrag_sync`) that runs the Wefact outstanding-amount reconciliation at a configurable daily time (default 03:00 Amsterdam time). Controlled by `OPENSTAAND_SYNC_ENABLED` and `OPENSTAAND_SYNC_DAILY_AT` environment variables.
