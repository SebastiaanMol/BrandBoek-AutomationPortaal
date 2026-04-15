from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets
from typing import Any

import sentry_sdk
from fastapi import APIRouter
from fastapi import BackgroundTasks
from fastapi import HTTPException
from fastapi import Request
from fastapi import Security
from fastapi.security import HTTPBasic
from starlette.status import HTTP_401_UNAUTHORIZED

from app.auth import get_api_key
from app.schemas.classes import CalendlyLead
from app.schemas.classes import LigoLead
from app.schemas.classes import MigrateDealsRequest
from app.schemas.classes import OfferteLead
from app.schemas.classes import SolvariLead
from app.schemas.classes import TrustooLead
from app.schemas.classes import TypeformWebhook
from app.service.sales.sales import add_lead_to_hubspot
from app.service.sales.sales import format_ligo_email
from app.service.sales.split_pipelines import migrate_or_copy_deals_between_pipelines
from app.service.sales.typeform import process_typeform_lead

API_KEY = os.getenv("BRAND_API_KEY")
SOLVARI_KEY = os.getenv("SOLVARI_KEY")
TYPEFORM_WEBHOOK_SECRET = os.getenv("TYPEFORM_WEBHOOK_SECRET")

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/sales",
    tags=["sales"],
    responses={404: {"description": "Not found"}},
)


@router.post("/leads/hubspot/trustoo")
async def leads_trustoo(
    lead: TrustooLead,
    background_tasks: BackgroundTasks,
    api_key: str = Security(get_api_key),
) -> dict[str, str]:
    logger.info(f"Trustoo Lead: {lead}")
    background_tasks.add_task(add_lead_to_hubspot, lead, "trustoo")
    return {"message": "Trustoo lead queued"}


# Security setup
security = HTTPBasic()


@router.post("/leads/hubspot/offerte.nl")
async def leads_offerte_nl(
    request: Request, lead: OfferteLead
) -> dict[str, Any] | None:
    auth_header = request.headers.get("Authorization")

    # 🔍 Log de header, zelfs als hij None is
    logger.info(f"Authorization header: {auth_header}")

    if not auth_header or not auth_header.startswith("Basic "):
        raise HTTPException(
            status_code=401, detail="Missing or invalid Basic Auth header"
        )

    # Decodeer Base64
    try:
        encoded = auth_header.split(" ")[1]
        decoded = base64.b64decode(encoded).decode("utf-8")  # Format: ":<password>"
        _username, password = decoded.split(":", 1) if ":" in decoded else ("", "")
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.warning(f"Failed to decode auth header: {e}")
        raise HTTPException(
            status_code=401, detail="Malformed Basic Auth header"
        ) from None

    # Controleer wachtwoord
    if API_KEY is None or not secrets.compare_digest(password, API_KEY):
        raise HTTPException(status_code=403, detail="Invalid Basic Auth password")

    logger.info(f"Offerte.nl Lead ontvangen: {lead}")
    return await add_lead_to_hubspot(lead, "offerte.nl")


@router.post("/leads/hubspot/ligo")
async def leads_ligo(
    lead: LigoLead, api_key: str = Security(get_api_key)
) -> dict[str, Any] | None:
    logger.info(f"Ligo Lead: {lead}")
    properties = format_ligo_email(lead.raw_email_data)
    return await add_lead_to_hubspot(properties, "ligo")


@router.post("/leads/hubspot/solvari", status_code=201)
async def leads_solvari(lead: SolvariLead) -> dict[str, bool]:
    if lead.secret != SOLVARI_KEY:
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED, detail="Invalid API secret"
        )
    logger.info(f"Solvari Lead: {lead}")
    await add_lead_to_hubspot(lead, "solvari")
    return {"success": True}


@router.post("/leads/hubspot/calendly", status_code=202)
async def leads_calendly(
    request: Request,
    lead: CalendlyLead,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    raw_body = await request.body()
    logger.info("Calendly raw payload: %s", raw_body.decode("utf-8"))

    event_type = lead.event or (lead.payload.event if lead.payload else None)
    logger.info(f"Calendly webhook event: {event_type}")

    if event_type != "invitee.created":
        return {"message": f"Ignored Calendly event: {event_type}"}

    background_tasks.add_task(add_lead_to_hubspot, lead, "calendly")
    return {"message": "Calendly invitee.created queued"}


@router.post("/leads/hubspot/typeform", status_code=202)
async def leads_typeform(
    request: Request,
    lead: TypeformWebhook,
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    raw_body = await request.body()
    logger.info("Typeform raw payload: %s", raw_body.decode("utf-8"))

    if TYPEFORM_WEBHOOK_SECRET:
        signature_header = request.headers.get("Typeform-Signature", "")
        if not signature_header.startswith("sha256="):
            raise HTTPException(status_code=401, detail="Missing Typeform signature")
        expected = base64.b64encode(
            hmac.new(
                TYPEFORM_WEBHOOK_SECRET.encode(),
                raw_body,
                hashlib.sha256,
            ).digest()
        ).decode()
        if not secrets.compare_digest(signature_header[7:], expected):
            raise HTTPException(status_code=401, detail="Invalid Typeform signature")

    if lead.event_type != "form_response":
        return {"message": f"Ignored Typeform event: {lead.event_type}"}

    background_tasks.add_task(process_typeform_lead, lead)
    return {"message": "Typeform form_response queued"}


@router.post("/migrate_deals")
async def migrate_deals(
    req: MigrateDealsRequest, api_key: str = Security(get_api_key)
) -> dict[str, Any]:
    """
    Move or copy all deals in specific stage labels from one pipeline to another,
    matching by stage LABEL. Dry-run by default.
    """
    try:
        return await migrate_or_copy_deals_between_pipelines(
            source_pipeline_id=req.source_pipeline_id,
            dest_pipeline_id=req.dest_pipeline_id,
            stage_labels_to_include=req.stage_labels_to_include,
            mode=req.mode,
            dry_run=req.dry_run,
        )
    except AssertionError as ae:
        raise HTTPException(status_code=400, detail=str(ae)) from ae
