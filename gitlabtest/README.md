# Brand Boekhouders Automations

FastAPI service that automates operations across HubSpot, Wefact, and Clockify for Brand Boekhouders. It handles lead ingestion from multiple sources, deal pipeline orchestration (BTW, IB, VPB, Jaarrekening), debtor synchronisation with Wefact, Clockify client provisioning, and nightly outstanding-amount reconciliation.

## Architecture

The application follows a **3-layer design**:

```
app/API/          -> FastAPI routers (request validation, auth, HTTP concerns)
app/service/      -> Business logic (orchestration, transformations, rules)
app/repository/   -> External API clients (HubSpot SDK, Wefact REST, Clockify REST)
```

All HubSpot calls pass through a shared **rate limiter** (`app/service/rate_limiter.py`) that enforces per-second and per-10-second caps, retries on 429 responses, and guards against hung calls.

See [`docs/architecture.md`](docs/architecture.md) for the full data-flow and deployment diagram.

## API Routers

| Prefix | Module | Purpose |
|---|---|---|
| `/sales` | `app/API/sales.py` | Lead ingestion from Trustoo, Offerte.nl, Ligo, Solvari; deal migration |
| `/operations` | `app/API/operations.py` | Deal pipeline automation: create deals, update amounts, betaalt-niet flows, BTW routing |
| `/properties` | `app/API/properties.py` | HubSpot property webhooks: dossier-to-deal sync, stage assignment, IB/VPB/JR pipeline logic, machtiging actief |
| `/portal` | `app/API/portal.py` | Bank connection status updates from client portal |
| `/clockify` | `app/API/clockify.py` | Clockify client upsert from HubSpot company webhooks |
| `/wefact` | `app/API/wefact.py` | Wefact debtor upsert from HubSpot company webhooks |

## Setup

### Prerequisites

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (package manager)
- [mise](https://mise.jdx.dev/) (optional, for task runner)

### Quick Start

```bash
cp .env.example .env        # fill in your API keys
uv sync                     # install dependencies
mise run dev                 # start dev server on :8000
```

Without mise:

```bash
uv run uvicorn app.main:app --reload --port 8000
```

### Docker

```bash
docker compose up --build   # runs on localhost:8000
```

## Development Commands

All tasks are defined in `mise.toml`:

| Command | Description |
|---|---|
| `mise run dev` | Start dev server with hot reload |
| `mise run lint` | Run ruff linter |
| `mise run format` | Auto-format code with ruff |
| `mise run typecheck` | Run mypy type checker |
| `mise run test` | Run pytest suite |
| `mise run check` | Run all quality checks (lint + format + typecheck + test) |
| `mise run precommit` | Run all pre-commit hooks |

## Deployment

Deployment uses **Railway** via **GitLab CI/CD**:

- Push to `dev` branch deploys to the **development** environment
- Push to `main` branch deploys to **production**

The CI pipeline runs lint, format check, mypy, and pytest before every deployment. See `.gitlab-ci.yml` for the full configuration.

## Authentication

All endpoints (except lead-specific auth like Offerte.nl Basic Auth and Solvari secret) require an API key passed via the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-key-here" https://your-domain/operations/hubspot/owner?deal_id=123
```

The key is validated against the `BRAND_API_KEY` environment variable in `app/auth.py`.

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Purpose |
|---|---|
| `HS_ACCESS_TOKEN` | HubSpot private app token |
| `BRAND_API_KEY` | API key for authenticating requests |
| `SENTRY_DSN` | Sentry error tracking |
| `WEFACT_API_KEY` | Wefact invoicing API key |
| `CLOCKIFY_API_KEY` | Clockify time tracking API key |
| `SOLVARI_KEY` | Solvari lead webhook secret |
| `OPENSTAAND_SYNC_ENABLED` | Enable/disable nightly outstanding amount sync |
| `OPENSTAAND_SYNC_DAILY_AT` | Time (HH:MM, 24h) for the nightly sync job |
| `LOG_LEVEL` | Logging level (default: INFO) |

## Documentation

Full documentation is available in the [`docs/`](docs/) directory. Start with [`docs/README.md`](docs/README.md) for an index of all topics.
