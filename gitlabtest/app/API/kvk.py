import asyncio
import logging
import os
from typing import Union

from dotenv import load_dotenv
from fastapi import APIRouter
from fastapi import BackgroundTasks
from fastapi import HTTPException
from fastapi import Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel
from starlette.status import HTTP_401_UNAUTHORIZED

from app.service.kvk.kvk import sync_company_from_kvk
from app.service.rate_limiter import API_QUEUE

load_dotenv()
API_KEY = os.getenv("BRAND_API_KEY")
MAX_QUEUE_SIZE = int(os.getenv("KVK_MAX_HUBSPOT_QUEUE_SIZE", "2000"))
api_key_header = APIKeyHeader(name="X-API-Key")
logger = logging.getLogger(__name__)
_kvk_in_progress: set[str] = set()
_kvk_lock = asyncio.Lock()


def get_api_key(api_key_header: str = Security(api_key_header)):
    if api_key_header == API_KEY:
        return api_key_header
    raise HTTPException(
        status_code=HTTP_401_UNAUTHORIZED, detail="Invalid or missing API Key"
    )


class KvkCompanyWebhookPayload(BaseModel):
    company_id: Union[str, int]
    kvk_number: Union[str, int] | None = None
    rsin: Union[str, int] | None = None

    def __init__(self, **data):
        if "company_id" not in data:
            if "record_id" in data:
                data["company_id"] = data["record_id"]
            elif "objectId" in data:
                data["company_id"] = data["objectId"]

        if "kvk_number" not in data:
            data["kvk_number"] = (
                data.get("kvknumber") or data.get("kvk_nummer") or data.get("kvkNummer")
            )

        super().__init__(**data)


router = APIRouter(
    prefix="/kvk",
    tags=["kvk"],
    responses={404: {"description": "Not found"}},
    dependencies=[Security(get_api_key)],
)


async def _kvk_sync_task(
    company_id: str, kvk_number: Union[str, int] | None, rsin: Union[str, int] | None
):
    try:
        result = await sync_company_from_kvk(
            company_id=company_id,
            kvk_number=str(kvk_number) if kvk_number is not None else None,
            rsin=str(rsin) if rsin is not None else None,
        )
        logger.info(
            "KVK background sync completed for company_id=%s status=%s",
            company_id,
            result.get("status"),
        )
    except Exception:
        logger.exception("KVK background sync failed for company_id=%s", company_id)
    finally:
        async with _kvk_lock:
            _kvk_in_progress.discard(company_id)


@router.post("/hubspot/sync_company")
async def kvk_sync_company(
    payload: KvkCompanyWebhookPayload, background_tasks: BackgroundTasks
):
    """
    Triggered by HubSpot webhook payload.
    Strict validation:
    - search by kvk_number
    - search by rsin
    - only update when both resolve to the same KVK company
    """
    company_id = str(payload.company_id)
    qsize = API_QUEUE.qsize()

    if qsize >= MAX_QUEUE_SIZE:
        logger.warning(
            "Skipping KVK sync enqueue for company_id=%s due to queue pressure qsize=%s threshold=%s",
            company_id,
            qsize,
            MAX_QUEUE_SIZE,
        )
        return {
            "status": "skipped_queue_pressure",
            "message": "KVK sync skipped due to queue pressure; webhook may retry later.",
            "updated": False,
            "company_id": company_id,
            "hubspot_queue_size": qsize,
        }

    async with _kvk_lock:
        if company_id in _kvk_in_progress:
            return {
                "status": "already_in_progress",
                "message": "KVK sync for this company is already in progress.",
                "updated": False,
                "company_id": company_id,
            }
        _kvk_in_progress.add(company_id)

    background_tasks.add_task(
        _kvk_sync_task,
        company_id,
        payload.kvk_number,
        payload.rsin,
    )
    return {
        "status": "scheduled",
        "message": "KVK sync scheduled.",
        "updated": False,
        "company_id": company_id,
        "hubspot_queue_size": qsize,
    }
