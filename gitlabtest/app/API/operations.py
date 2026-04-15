from __future__ import annotations

import csv
import io
import logging
from typing import Any

import sentry_sdk
from fastapi import APIRouter
from fastapi import BackgroundTasks
from fastapi import HTTPException
from fastapi import Security
from fastapi.responses import StreamingResponse

import app.repository.hubspot as hubspot_calls
import app.service.operations.hubspot as service_hubspot
from app.auth import get_api_key
from app.schemas.classes import CompanyUpdateDealName
from app.schemas.classes import ContactUpdateDealName
from app.schemas.classes import NewDeal
from app.schemas.classes import UpdateDossierModel
from app.schemas.classes import VATDeal
from app.service.operations.betaalt_niet import reset_all_from_betaalt_niet
from app.service.operations.betaalt_niet import set_all_to_betaalt_niet
from app.service.operations.btw_bankconnection import route_btw_by_deal_id_and_update
from app.service.operations.operations import company_change
from app.service.operations.operations import contact_change
from app.service.operations.operations import create_new_deal
from app.service.operations.operations import move_btw_q_deal_volledige_service
from app.service.operations.operations import update_deal_amount_in_new_pipeline
from app.service.operations.operations import update_doorlopende_machtiging_deal
from app.service.rate_limiter import call_hubspot_api

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/operations",
    tags=["operations"],
    responses={404: {"description": "Not found"}},
    dependencies=[Security(get_api_key)],
)


@router.get("/hubspot/owner")
async def get_owner_id(deal_id: int) -> dict[str, Any]:
    response = await service_hubspot.get_owner_id(deal_id)
    if not response:
        raise HTTPException(status_code=404, detail="Owner not found")
    return response  # type: ignore[return-value]


@router.post("/hubspot/new_pipeline/deal/amount")
async def update_deal_amount(
    sales_deal_id: str, corr_deal_id: str, pipeline_label: str
) -> dict[str, Any]:
    logger.info(
        f"Sales Deal ID: {sales_deal_id}, Corresponding Deal ID: {corr_deal_id}, Pipeline Label: {pipeline_label}"
    )
    result = await update_deal_amount_in_new_pipeline(
        corr_deal_id, pipeline_label, [], {}
    )
    return result or {}


@router.post("/hubspot/contact/updating_dealname")
async def contact_change_endpoint(
    contact_id: ContactUpdateDealName, background_tasks: BackgroundTasks
):
    background_tasks.add_task(_contact_change_task, contact_id.contact_id)
    return {
        "message": f"Dealname update scheduled for contact {contact_id.contact_id}."
    }


@router.post("/hubspot/company/updating_dealname")
async def company_change_endpoint(
    company_id: CompanyUpdateDealName, background_tasks: BackgroundTasks
):
    background_tasks.add_task(_company_change_task, company_id.company_id)
    return {
        "message": f"Dealname update scheduled for company {company_id.company_id}."
    }


@router.post("/hubspot/dossiers/{contact_id}")
async def update_dossier(contact_id: str, model: UpdateDossierModel) -> dict[str, Any]:

    associated_dossiers = await call_hubspot_api(
        hubspot_calls.get_object_to_dossier_associations, "contact", contact_id
    )
    dossier_id = associated_dossiers.results[0].to_object_id

    return await call_hubspot_api(hubspot_calls.update_dossier, dossier_id, model)


@router.post("/hubspot/deal/delete_vat_deal")
async def delete_vat_deal_endpoint(vat_deal: VATDeal) -> dict[str, str]:
    vat_deal_response = await service_hubspot.get_deal_in_vat_pipeline(
        str(vat_deal.deal_id), vat_deal.pipeline_label
    )
    if not vat_deal_response.results:
        raise HTTPException(
            status_code=200,
            detail=f"No VAT deal found in {vat_deal.pipeline_label} associated to deal id: {vat_deal.deal_id}",
        )

    vat_deal_id = vat_deal_response.results[0].properties["hs_object_id"]
    await call_hubspot_api(hubspot_calls.delete_deal, vat_deal_id)
    return {"deal with id": vat_deal_id, "deleted": "success"}


@router.post("/hubspot/workflows/pipeline_usage")
async def check_pipeline_usage(pipeline_label: str) -> StreamingResponse:
    results = await service_hubspot.search_workflows(pipeline_label)

    # Create CSV in memory
    output = io.StringIO()
    writer = csv.DictWriter(
        output, fieldnames=["workflow_id", "workflow_name", "found_keywords"]
    )
    writer.writeheader()
    for row in results:
        writer.writerow(row)

    # Reset pointer and stream as file
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=workflow_pipeline_usage.csv"
        },
    )


@router.get("/hubspot/active_pipelines")
async def active_pipelines() -> list[dict[str, Any]]:
    """
    Returns a list of active pipelines in the HubSpot account.
    """
    pipelines = await service_hubspot.get_active_pipelines()
    return [p.to_dict() for p in pipelines]


async def _set_betaalt_niet_task(deal_id: str) -> None:
    try:
        await set_all_to_betaalt_niet(deal_id)
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception("Error processing betaalt_niet task for deal %s", deal_id)


async def _contact_change_task(contact_id: int):
    try:
        await contact_change(contact_id)
    except Exception as e:
        sentry_sdk.capture_exception(e)


async def _company_change_task(company_id: int):
    try:
        await company_change(company_id)
    except Exception as e:
        sentry_sdk.capture_exception(e)


@router.post("/hubspot/betaalt_niet")
async def set_betaalt_niet(
    deal_id: NewDeal, background_tasks: BackgroundTasks
) -> dict[str, str]:
    """
    Sets all deals associated with the same company as the given deal to "Betaalt niet" stage.

    Args:
        deal_id (str): The ID of the deal to process.

    Returns:
        dict: Confirmation message.
    """
    background_tasks.add_task(_set_betaalt_niet_task, str(deal_id.deal_id))
    return {
        "message": f"Task started: setting all deals for company of deal {deal_id.deal_id} to 'Betaalt niet'."
    }


@router.post("/hubspot/reset_betaalt_niet")
async def reset_betaalt_niet(deal_id: NewDeal) -> dict[str, str]:
    """
    Resets all deals associated with the same company as the given deal from "Betaalt niet" stage to their previous stage.

    Args:
        deal_id (str): The ID of the deal to process.

    Returns:
        dict: Confirmation message.
    """
    await reset_all_from_betaalt_niet(str(deal_id.deal_id))
    return {
        "message": f"All deals for company of deal {deal_id} reset from 'Betaalt niet'."
    }


@router.post("/get_company_deals")
async def get_company_deals(company_id: str) -> dict[str, Any]:
    """
    Returns all deals associated with a given company ID.
    """
    return await call_hubspot_api(hubspot_calls.get_deals_for_company, company_id)


@router.post("/hubspot/clone_pipeline")
async def clone_pipeline(old_pipeline_id: str, pipeline_label: str) -> dict[str, Any]:
    # TODO: Error with StageID
    """
    Clones a pipeline with the given label.
    """
    return await call_hubspot_api(
        service_hubspot.clone_pipeline, old_pipeline_id, pipeline_label
    )


@router.post("/hubspot/create_new_deal")
async def new_create_deal(deal_id: NewDeal) -> dict[str, str]:
    """
    Creates a new deal in HubSpot.
    """
    try:
        await create_new_deal(deal_id.deal_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"message": "New deal created successfully"}


@router.post("/hubspot/put_active_deals_in_new_deal")
async def put_active_deals_in_new_deal() -> dict[str, Any]:
    """
    Puts all active deals into a new deal in the specified pipeline.
    """
    return await service_hubspot.put_deals_in_new_deal()  # type: ignore[call-arg]


@router.post("/hubspot/btw_dealstage_based_on_bank_connection")
async def btw_dealstage_based_on_bank_connection(deal_id: NewDeal) -> dict[str, str]:
    await route_btw_by_deal_id_and_update(deal_id.deal_id)
    return {"message": f"BTW deal {deal_id.deal_id} processed successfully."}


@router.post("/hubspot/berekening_compleet")
async def berekening_compleet(deal_id: NewDeal) -> dict[str, str]:
    await move_btw_q_deal_volledige_service(deal_id.deal_id)
    return {"message": "Check if BTW - Q deal is moved to Berekening Compleet."}


@router.post("/hubspot/move_dm_deal_to_geen_ib")
async def move_dm_deal_to_geen_ib(deal_id: NewDeal) -> dict[str, str]:
    await update_doorlopende_machtiging_deal(deal_id.deal_id)
    return {"message": f"DM deal {deal_id.deal_id} moved to Geen IB: klant haakt af."}
