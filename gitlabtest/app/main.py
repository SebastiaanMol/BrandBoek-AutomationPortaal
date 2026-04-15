from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import sentry_sdk
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi import Request
from fastapi import Security
from fastapi.responses import JSONResponse
from sentry_sdk.integrations.logging import LoggingIntegration

from app.API import clockify
from app.API import kvk
from app.API import operations
from app.API import portal
from app.API import properties
from app.API import sales
from app.API import typeform
from app.API import wefact
from app.auth import get_api_key
from app.exceptions import HubSpotError
from app.exceptions import HubSpotNotFoundError
from app.exceptions import SalesLeadError
from app.exceptions import WefactError
from app.logging_config import setup_logging
from app.service.rate_limiter import api_worker
from app.service.wefact.openstaand_bedrag import WEFACT_INVOICE_STATUS
from app.service.wefact.openstaand_bedrag import update_openstaande_bedragen
from app.utils import parse_daily_time

# Load environment variables early so logging config can read LOG_LEVEL from .env.
load_dotenv()

# Setup logging
# LOG_LEVEL can be set in env; defaults to INFO
LOG_LEVEL_NAME = os.getenv("LOG_LEVEL", "INFO").upper()
LOG_LEVEL = logging.getLevelName(LOG_LEVEL_NAME)
if isinstance(LOG_LEVEL, str):  # unknown level name fallback
    LOG_LEVEL = logging.INFO

setup_logging(LOG_LEVEL)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    asyncio.create_task(api_worker())

    scheduler = AsyncIOScheduler(timezone="Europe/Amsterdam")
    enabled = os.getenv("OPENSTAAND_SYNC_ENABLED", "true").lower() in (
        "1",
        "true",
        "yes",
    )
    if enabled:
        daily_at = os.getenv("OPENSTAAND_SYNC_DAILY_AT", "03:00")
        hour, minute = parse_daily_time(daily_at)
        scheduler.add_job(
            update_openstaande_bedragen,
            CronTrigger(hour=hour, minute=minute),
            kwargs={
                "status": (WEFACT_INVOICE_STATUS or None),
                "include_zero": True,
                "batch_size": 100,
                "sleep_seconds": 0.2,
                "dry_run": False,
                "debug_sample": 0,
                "update_contacts": True,
            },
            id="openstaand_bedrag_sync",
            replace_existing=True,
        )
        scheduler.start()
        logging.info(
            "Scheduled openstaand_bedrag sync daily at %02d:%02d.", hour, minute
        )
    else:
        logging.info("Openstaand_bedrag sync disabled via OPENSTAAND_SYNC_ENABLED.")

    logging.info("Lifespan startup complete")
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)
    logging.info("Lifespan shutdown complete")


SENTRY_DSN = os.getenv("SENTRY_DSN")

# Setup Sentry
sentry_sdk.init(
    dsn=SENTRY_DSN,
    traces_sample_rate=1.0,
    profiles_sample_rate=1.0,
    enable_tracing=True,
    integrations=[LoggingIntegration(level=logging.INFO, event_level=None)],
)

# Create ONE FastAPI app
app = FastAPI(lifespan=lifespan)


@app.exception_handler(HubSpotNotFoundError)
async def hubspot_not_found_handler(
    request: Request, exc: HubSpotNotFoundError
) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(HubSpotError)
async def hubspot_error_handler(request: Request, exc: HubSpotError) -> JSONResponse:
    sentry_sdk.capture_exception(exc)
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(SalesLeadError)
async def sales_lead_error_handler(
    request: Request, exc: SalesLeadError
) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.exception_handler(WefactError)
async def wefact_error_handler(request: Request, exc: WefactError) -> JSONResponse:
    sentry_sdk.capture_exception(exc)
    logger = logging.getLogger(__name__)
    logger.exception(
        "Wefact integration error on %s %s", request.method, request.url.path
    )
    return JSONResponse(status_code=502, content={"detail": "Wefact integration error"})


logger = logging.getLogger(__name__)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    sentry_sdk.capture_exception(exc)
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# Include routes
app.include_router(sales.router)
app.include_router(portal.router)
app.include_router(operations.router)
app.include_router(properties.router)
app.include_router(clockify.router)
app.include_router(wefact.router)
app.include_router(kvk.router)
app.include_router(typeform.router)


# Test Sentry endpoint
@app.get("/sentry-debug", dependencies=[Security(get_api_key)])
async def trigger_error() -> float:
    logging.info("Division by zero, TEST")
    return 1 / 0
