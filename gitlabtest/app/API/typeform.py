import json
import logging

import sentry_sdk
from fastapi import APIRouter
from fastapi import BackgroundTasks
from fastapi import HTTPException
from fastapi import Request
from starlette.status import HTTP_202_ACCEPTED
from starlette.status import HTTP_403_FORBIDDEN

from app.service.typeform.onboarding import process_onboarding_webhook
from app.service.typeform.typeform import TYPEFORM_SIGNATURE_HEADER
from app.service.typeform.typeform import process_typeform_webhook
from app.service.typeform.typeform import verify_signature

router = APIRouter(
    prefix="/typeform",
    tags=["typeform"],
    responses={404: {"description": "Not found"}},
)


@router.post("/webhook", status_code=HTTP_202_ACCEPTED)
async def typeform_webhook(request: Request, background_tasks: BackgroundTasks):
    raw_body = await request.body()
    signature = request.headers.get(TYPEFORM_SIGNATURE_HEADER)

    if not verify_signature(signature, raw_body):
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="Invalid Typeform signature",
        )

    payload = json.loads(raw_body.decode("utf-8"))
    background_tasks.add_task(_process_typeform_webhook_task, payload)
    return {"status": "accepted"}


def _process_typeform_webhook_task(payload: dict):
    try:
        result = process_typeform_webhook(payload)
        logging.info("Processed Typeform webhook: %s", result)
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        logging.exception("Typeform webhook processing failed.")


@router.post("/onboarding", status_code=HTTP_202_ACCEPTED)
async def typeform_onboarding_webhook(
    request: Request, background_tasks: BackgroundTasks
):
    raw_body = await request.body()
    signature = request.headers.get(TYPEFORM_SIGNATURE_HEADER)

    if not verify_signature(signature, raw_body):
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN,
            detail="Invalid Typeform signature",
        )

    payload = json.loads(raw_body.decode("utf-8"))
    background_tasks.add_task(_process_onboarding_webhook_task, payload)
    return {"status": "accepted"}


def _process_onboarding_webhook_task(payload: dict):
    try:
        result = process_onboarding_webhook(payload)
        logging.info("Processed onboarding Typeform webhook: %s", result)
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        logging.exception("Onboarding Typeform webhook processing failed.")
