from __future__ import annotations

import logging

from fastapi import APIRouter
from fastapi import Security

from app.auth import get_api_key
from app.repository.hubspot import update_bank_connection_status
from app.schemas.classes import Administration
from app.service.rate_limiter import call_hubspot_api

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/portal",
    tags=["portal"],
    responses={404: {"description": "Not found"}},
    dependencies=[Security(get_api_key)],
)


@router.post("/hubspot/bank_connection_status")
async def change_bank_connection_status(
    administration: Administration,
) -> dict[str, str]:
    """
    This function changes the bank connection status of a company in hubspot. In hubspot there is a workflow that then updates the status for all deals after the company status is changed
    """
    logger.info(f"Administration: {administration}")

    response = await call_hubspot_api(
        update_bank_connection_status,
        administration.reference_id,
        administration.bank_connection_status,
    )
    return {"message": "success", "hubspot_response": str(response)}
