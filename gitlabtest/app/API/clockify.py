from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Security

from app.auth import get_api_key
from app.schemas.classes import ClockifyCompanyUpsert
from app.service.clockify.clockify import upsert_client_from_hubspot

router = APIRouter(
    prefix="/clockify",
    tags=["clockify"],
    responses={404: {"description": "Not found"}},
    dependencies=[Security(get_api_key)],
)


@router.post("/hubspot/upsert_client")
async def upsert_clockify_client_from_hubspot(
    payload: ClockifyCompanyUpsert,
) -> dict[str, Any]:
    """
    Upsert a Clockify client from HubSpot webhook.
    - If a client with the HubSpot record id (stored in note) exists, update its name and unarchive.
    - Otherwise, create a new client with the standard projects/tasks.
    """
    status, reason = upsert_client_from_hubspot(
        str(payload.record_id), payload.company_name
    )
    if status == "error":
        raise HTTPException(
            status_code=500, detail=reason or "Clockify client upsert failed"
        )
    return {
        "status": status,
        "record_id": payload.record_id,
        "company_name": payload.company_name,
    }
