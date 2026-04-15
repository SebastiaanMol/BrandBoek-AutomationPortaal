# Scheduled Jobs

## Overview

The application uses [APScheduler](https://apscheduler.readthedocs.io/) (AsyncIOScheduler) to run background cron jobs. The scheduler is configured in the `lifespan` context manager in `app/main.py`, which means it starts when the FastAPI application boots and shuts down gracefully when the application stops.

## Current jobs

### Openstaand Bedrag Sync

**Schedule:** Daily at 03:00 (Amsterdam timezone, configurable)

**What it does:** Reconciles outstanding invoice amounts between Wefact and HubSpot.

1. Fetches all open invoices from Wefact (filtered by configured status).
2. Groups invoices by debtor and computes the total outstanding amount.
3. For each debtor, looks up the HubSpot company by `wefact_company_id`.
4. Updates the company's `openstaand_bedrag` property with the computed total.
5. Updates the primary contact's `totaal_openstaand_bedrag` property.

**Implementation:** `app/service/wefact/openstaand_bedrag.py` -> `update_openstaande_bedragen()`

**Parameters passed by the scheduler:**
- `status`: Invoice status filter from `WEFACT_INVOICE_STATUS` env var
- `include_zero`: `True` (also update companies with zero outstanding)
- `batch_size`: 100 (companies processed per batch)
- `sleep_seconds`: 0.2 (delay between batches)
- `dry_run`: `False`
- `debug_sample`: 0 (no sampling; process all)
- `update_contacts`: `True`

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `OPENSTAAND_SYNC_ENABLED` | `true` | Set to `false` to disable the nightly job |
| `OPENSTAAND_SYNC_DAILY_AT` | `03:00` | Time in HH:MM (24h) format, Amsterdam timezone |
| `WEFACT_INVOICE_STATUS` | (empty) | Invoice status filter passed to Wefact API |

## How to add a new scheduled job

1. Create the async function in the appropriate service module.
2. In `app/main.py`, inside the `lifespan` function, add a new job to the scheduler:

```python
scheduler.add_job(
    your_new_function,
    CronTrigger(hour=8, minute=0),  # runs daily at 08:00 Amsterdam time
    kwargs={"param1": "value1"},
    id="your_job_id",
    replace_existing=True,
)
```

3. Add environment variables for enabling/disabling and configuring the schedule (follow the pattern of `OPENSTAAND_SYNC_ENABLED` / `OPENSTAAND_SYNC_DAILY_AT`).
4. Log the job registration so it is visible on startup.

## Startup behaviour

The scheduler is created with `timezone="Europe/Amsterdam"`. The rate-limiter worker is also started during lifespan via `asyncio.create_task(api_worker())`. Both are shut down on application exit.

If `OPENSTAAND_SYNC_ENABLED` is `false`, the scheduler is not started and no cron jobs run.
