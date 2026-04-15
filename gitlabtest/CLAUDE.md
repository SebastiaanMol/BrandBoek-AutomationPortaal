# CLAUDE.md - Project Guidance for Claude Code

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
    typeform/        # Typeform webhook handlers (IB typeform sync + client onboarding)
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
- **VA (Voorlopige Aanslag) pipelines**: `app/service/operations/va_pipelines/` contains two modules — `va_ib.py` (contact-focused, individual income tax returns; checks `jaarklant`, `bedrijfsvorm`, bank connection, machtiging) and `va_vpb.py` (company-focused, corporate tax; routes deals through VAT outcome stages like `VA = 0`, `Negatief resultaat`). Shared helpers are in `utils.py`.
- **Schemas**: `app/schemas/classes.py` contains all Pydantic request models. Lead models (`TrustooLead`, `OfferteLead`, `LigoLead`, `SolvariLead`, `CalendlyLead`) normalize external webhook payloads. Deal/pipeline models (`NewDeal`, `NewPipeline`, `AssignStageRequest`) validate internal API requests. `WefactDebtorUpsert` drives debtor syncs.

## Onboarding Typeform Handler

**Endpoint**: `POST /typeform/onboarding` — receives webhooks from four client onboarding Typeforms (same HMAC-SHA256 signature check as the IB Typeform endpoint).

**Module**: `app/service/typeform/onboarding.py`

**Four form variants** (detected by `form_id` against env vars):

| Env var | Client type | Structure |
|---------|------------|-----------|
| `ONBOARDING_FORM_ID_NEW_EZ` | New client | EZ/VOF |
| `ONBOARDING_FORM_ID_NEW_BV` | New client | BV/Holding |
| `ONBOARDING_FORM_ID_EXISTING_EZ` | Existing client | EZ/VOF |
| `ONBOARDING_FORM_ID_EXISTING_BV` | Existing client | BV/Holding |

**Processing flow** (per submission):
1. Extract HubSpot company ID from the first form field (bedrijfs-ID). Handles Typeform scientific notation (e.g. `5.31e+10` → `"53100000000"`).
2. Find the best-matching contact on the company: single contact → direct; multiple → match by email → name → fallback to first.
3. Update HubSpot **contact** properties (new-client forms only): personal details, BSN, geboortedatum, fiscal partner info, ib_toelichting.
4. Update HubSpot **company** properties (all forms): KVK, RSIN, BTW number, bedrijfsvorm, auto, BTW-soorten (multi-select), bankrekeningen, etc. Always sets `onboarding_typeform = "Ingevuld"`.
5. Create a deal in the **loonadministratie pipeline** if the client answered "Ja" to the loonadministratie question.
6. Upload all file attachments + a PDF summary to **SharePoint** (dossier folder → contact folder → year folder → `Onboarding Typeform/`).

**Key details**:
- EZ forms ask "BTW-plichtig?" (direct lookup); BV forms ask "BTW-vrijgesteld?" (inverse lookup).
- `btw_soorten` is a multi-select assembled from: EU type + verlegde omzet (BV only) + vrijgestelde omzet (EZ only) + buiten EU.
- Loonadministratie pipeline: ID `651277`, stage `2217038`, amount `100`.
- SharePoint site path: env var `TYPEFORM_SHAREPOINT_SITE_PATH` (default `/sites/Clients`). Year folder: `TYPEFORM_SHAREPOINT_YEAR_FOLDER` (default `2025`).

## Properties Handlers

`app/service/properties/` handles HubSpot property webhook events. Each file is a standalone async handler:

| File | Responsibility |
|------|----------------|
| `bankkoppeling_contact.py` | Sync "no active bank connection" flag to contact based on linked companies |
| `btw_assignment.py` | Propagate BTW inspector/owner assignment across quarters |
| `dossier_to_deal.py` | Cascade dossier property changes (structuur) to all BTW pipeline deals |
| `ib_jr_owners.py` | Sync JR booker/owner checkboxes on IB deals |
| `ib_kan_gemaakt_worden.py` | Check prerequisites for IB submission (machtiging, bankkoppeling, contact data) |
| `jr_pipeline.py` | Route JR deals between pipeline stages based on quarter booking and software flags |
| `machtiging_actief.py` | Evaluate PowerPlay authorization status including expiry windows |

## Error Handling

- **HubSpot repository** (`app/repository/hubspot.py`) raises `HubSpotAPIError` for API failures and `HubSpotNotFoundError` for missing objects/associations. Exceptions are also captured to Sentry before re-raising.
- **Wefact service** (`app/service/wefact/wefact.py`) raises `WefactError` for HTTP errors, API-level errors, and missing config. Lookup functions (`debtor_show_by_hubspot_id`) catch and return `None` on failure.
- All custom exceptions are defined in `app/exceptions.py`: `HubSpotError` (base), `HubSpotNotFoundError`, `HubSpotAPIError`, `SalesLeadError`, `WefactError`.
- Services generally let exceptions propagate; background tasks should catch and log to avoid crashing the worker.

## Testing

- Test directory: `tests/`
- Framework: pytest with `asyncio_mode = "auto"`
- HTTP testing: use `httpx.AsyncClient` with the FastAPI app
- Mock external calls: patch `app.repository.hubspot` functions and `app.service.rate_limiter.call_hubspot_api`
- Coverage config excludes `scripts/`

## Environment Variables

All vars loaded from `.env` via python-dotenv. See `.env.example` for the full list.

| Variable | Purpose |
|----------|---------|
| `HS_ACCESS_TOKEN` | HubSpot OAuth token |
| `BRAND_API_KEY` | Shared secret for `X-API-Key` header auth |
| `SENTRY_DSN` | Sentry error tracking |
| `WEFACT_API_KEY` | Wefact API authentication |
| `WEFACT_API_URL` | Wefact base URL (default: `https://api.mijnwefact.nl/v2/`) |
| `CLOCKIFY_API_KEY` | Clockify client provisioning |
| `FACTUURSTUREN_API_KEY` | Factuursturen lead source |
| `SOLVARI_KEY` | Solvari lead ingestion |
| `OPENSTAAND_SYNC_ENABLED` | Enable/disable nightly outstanding-amount sync |
| `OPENSTAAND_SYNC_DAILY_AT` | Scheduled run time (e.g. `03:00`) |
| `LOG_LEVEL` | Logging verbosity (`INFO`, `DEBUG`, etc.) |

## Important Notes

- `scripts/` contains one-off data migration tools (Wefact matching, Clockify imports). They are NOT part of the running application and are excluded from linting and coverage.
- The HubSpot SDK client is a singleton created in `app/hubspot_client.py`.
- Sentry is configured at module level in `app/main.py` for error tracking.
- Deployment: Railway via GitLab CI/CD. `dev` branch -> development, `main` branch -> production.
