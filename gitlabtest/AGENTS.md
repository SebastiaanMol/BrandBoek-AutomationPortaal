# AGENTS.md - Project Guidance

This file mirrors `CLAUDE.md` so different coding agents can consume the same project instructions.

## Overview

FastAPI automation service for Brand Boekhouders. Receives HubSpot webhooks and orchestrates deal pipelines (BTW, IB, VPB, Jaarrekening), ingests leads from external sources (Trustoo, Offerte.nl, Ligo, Solvari), syncs debtors to Wefact, provisions Clockify clients, and runs a nightly outstanding-amount reconciliation job.

## Architecture

```
app/
  API/             # FastAPI routers - thin HTTP layer, auth, request validation
  service/         # Business logic grouped by domain
    operations/    # Deal pipeline orchestration (create, move, betaalt-niet, BTW routing)
    sales/         # Lead ingestion and formatting
    wefact/        # Wefact debtor sync + nightly openstaand bedrag job
    clockify/      # Clockify client provisioning
    properties/    # HubSpot property webhook handlers (dossier sync, IB/JR/VPB logic, machtiging)
    rate_limiter.py # Shared async queue with per-second/10s limits for HubSpot API
  repository/      # Thin wrappers around external APIs (HubSpot SDK, Wefact REST, Clockify REST)
  schemas/         # Pydantic models
  auth.py          # X-API-Key header validation
  main.py          # App factory, router registration, APScheduler lifespan
scripts/           # One-off migration/data-fix tools - NOT part of the running application
```

## Common Commands

```bash
mise run dev          # Start dev server (uvicorn --reload on :8000)
mise run lint         # ruff check .
mise run format       # ruff format .
mise run typecheck    # mypy app/
mise run test         # pytest
mise run check        # All quality checks combined
```

Without mise: prefix commands with `uv run` (e.g. `uv run pytest`).

## Key Patterns

- **Rate limiter**: All HubSpot calls go through `call_hubspot_api(sync_func, *args)` in `app/service/rate_limiter.py`. It wraps sync SDK calls in an async queue with dual token-bucket limiters (8/s, 80/10s), automatic 429 retry with exponential backoff, and per-call timeout protection.
- **Authentication**: `app/auth.py` provides a `get_api_key` dependency. Routers apply it via `dependencies=[Security(get_api_key)]` or per-endpoint. The key comes from the `BRAND_API_KEY` env var, checked against the `X-API-Key` header.
- **Background tasks**: Long-running operations use FastAPI `BackgroundTasks` (e.g. betaalt-niet, dossier updates). The nightly openstaand-bedrag sync uses APScheduler configured in the lifespan context manager in `app/main.py`.
- **Pipeline IDs**: HubSpot pipeline and stage IDs are hardcoded as constants at the top of service modules. When adding new pipelines, add their IDs to the relevant module constants.
- **VA (Voorlopige Aanslag) pipelines**: `app/service/operations/va_pipelines/` contains dedicated modules for VA IB and VA VPB deal lifecycle management.

## Testing

- Test directory: `tests/` (may not exist yet - being set up)
- Framework: pytest with `asyncio_mode = "auto"`
- HTTP testing: use `httpx.AsyncClient` with the FastAPI app
- Mock external calls: patch `app.repository.hubspot` functions and `app.service.rate_limiter.call_hubspot_api`
- Coverage config excludes `scripts/`

## Important Notes

- `scripts/` contains one-off data migration tools (Wefact matching, Clockify imports). They are NOT part of the running application and are excluded from linting and coverage.
- The HubSpot SDK client is a singleton created in `app/hubspot_client.py`.
- Sentry is configured at module level in `app/main.py` for error tracking.
- Environment variables are loaded from `.env` via python-dotenv. See `.env.example` for all required vars.
- Deployment: Railway via GitLab CI/CD. `dev` branch -> development, `main` branch -> production.
- Update docs when behavior, endpoints, or operational constraints change materially. Relevant docs usually live under `docs/`, especially `docs/architecture.md` and `docs/features/*/README.md`.
