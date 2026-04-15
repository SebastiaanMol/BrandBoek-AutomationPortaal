from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from fastapi import BackgroundTasks
from fastapi import Security

import app.repository.hubspot as hubspot_calls
import app.service.operations.hubspot as service_hubspot
import app.service.operations.operations as service_operations
from app.auth import get_api_key
from app.schemas.classes import AssignStageRequest
from app.schemas.classes import CompanyBankkoppelingPayload
from app.schemas.classes import CompanyGeboekteKwartalenPayload
from app.schemas.classes import CompanyUpdateDealName
from app.schemas.classes import ContactIdPayload
from app.schemas.classes import IBDealContactPayload
from app.schemas.classes import NewDeal
from app.schemas.classes import NextQuarterPrev2MUpdate
from app.schemas.classes import UpdateYearPayload
from app.service.operations.btw_bankconnection import (
    update_next_quarter_prev2m_from_webhook,
)
from app.service.operations.va_pipelines import va_ib as va_ib_module
from app.service.operations.va_pipelines import va_vpb as va_vpb_module
from app.service.properties.bankkoppeling_contact import (
    sync_bedrijven_zonder_bankkoppeling,
)
from app.service.properties.btw_assignment import (
    sync_future_btw_assignments_from_finished_deal,
)
from app.service.properties.ib_jr_owners import sync_ib_jr_owner_summary
from app.service.properties.ib_jr_owners import (
    sync_related_ib_jr_owner_summaries_from_jr,
)
from app.service.properties.ib_kan_gemaakt_worden import (
    route_ib_deal_after_typeform_and_machtiging,
)
from app.service.properties.ib_kan_gemaakt_worden import update_ib_kan_gemaakt_worden
from app.service.properties.jr_pipeline import bump_related_jr_from_ib
from app.service.properties.jr_pipeline import bump_this_jr_if_ib_ready_except_jr
from app.service.properties.jr_pipeline import sync_jr_priority_dot_from_ib
from app.service.properties.jr_pipeline import update_jr_stage_from_btw_geboekt
from app.service.properties.machtiging_actief import (
    sync_contact_ib_deals_machtiging_actief,
)
from app.service.properties.machtiging_actief import sync_ib_deal_machtiging_actief
from app.service.rate_limiter import call_hubspot_api
from app.utils import get_year_from_date

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix="/properties",
    tags=["properties"],
    responses={404: {"description": "Not found"}},
    dependencies=[Security(get_api_key)],
)


@router.post("/assign_correct_stage")
async def assign_correct_stage(
    payload: AssignStageRequest, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    background_tasks.add_task(service_hubspot.process_stage_assignment_async, payload)
    return {"message": "Stage assignment enqueued", "payload": payload}


@router.post("/update_vpb_deals_when_jr_updated")
async def set_vpb_prio(payload: NewDeal) -> dict[str, Any]:
    return await service_hubspot.set_vpb_prio(payload)


@router.post("/get_property/{object_type}")
async def get_property(object_type: str, property: str) -> dict[str, Any]:

    property_data = await call_hubspot_api(
        hubspot_calls.get_property, object_type, property
    )
    return {"property": property_data}


@router.post("/update_ib_kan_gemaakt_worden")
async def update_ib_deal(
    jr_deal_id: NewDeal, background_tasks: BackgroundTasks
) -> dict[str, str]:

    background_tasks.add_task(update_ib_kan_gemaakt_worden, str(jr_deal_id.deal_id))
    return {
        "message": f"IB kan gemaakt worden update scheduled for JR deal {jr_deal_id.deal_id}"
    }


@router.post("/jr_prio_from_ib")
async def jr_prio_from_ib(ib_deal_id: NewDeal) -> dict[str, str]:

    await bump_related_jr_from_ib(str(ib_deal_id.deal_id))
    return {"message": f"Related JR deals checked for IB deal {ib_deal_id}"}


@router.post("/jr_priority_dot_from_ib_typeform")
async def jr_priority_dot_from_ib_typeform(ib_deal_id: NewDeal) -> dict[str, Any]:
    result = await sync_jr_priority_dot_from_ib(str(ib_deal_id.deal_id))
    return {
        "message": f"Related JR deals priority sync checked for IB deal {ib_deal_id}",
        "updated": result["updated"],
        "matched": result["matched"],
    }


@router.post("/ib/prereqs_webhook")
async def ib_prereqs_webhook(ib_deal: NewDeal) -> dict[str, Any]:
    """
    Webhook: when IB prereq properties change, move the VA IB deal to
    'Klaar voor IB' if all prereqs are satisfied and the VA deal is currently 'Open'.
    """
    await sync_ib_deal_machtiging_actief(ib_deal.deal_id)
    return await va_ib_module.handle_ib_prereq_change(ib_deal.deal_id)


@router.post("/ib/machtiging_actief_webhook")
async def ib_machtiging_actief_webhook(ib_deal: NewDeal) -> dict[str, Any]:
    """
    Recompute deal.machtiging_actief from contact mandate status + activation dates.
    Active outcomes are only allowed when activation happened before Dec 1 of deal year.
    """
    return await sync_ib_deal_machtiging_actief(ib_deal.deal_id)


@router.post("/ib/machtiging_actief_contact_webhook")
async def ib_machtiging_actief_contact_webhook(
    contact: ContactIdPayload,
) -> dict[str, Any]:
    """
    Contact-driven webhook:
    fetch IB deals for the contact first, then recompute machtiging_actief per IB deal.
    """
    return await sync_contact_ib_deals_machtiging_actief(contact.contact_id)


@router.post("/ib/route_after_typeform_and_machtiging")
async def ib_route_after_typeform_and_machtiging(
    payload: IBDealContactPayload,
) -> dict[str, Any]:
    """
    Route an IB deal after typeform + machtiging updates by checking same-year JR deals
    for the associated contact.
    """
    return await route_ib_deal_after_typeform_and_machtiging(
        deal_id=payload.deal_id,
        contact_id=payload.contact_id,
    )


@router.post("/ib/finished_webhook")
async def ib_finished_webhook(ib_deal: NewDeal) -> dict[str, Any]:
    """Webhook: when an IB deal is finished, move the VA IB deal to 'IB ingediend'."""
    return await va_ib_module.handle_ib_finished(ib_deal.deal_id)


@router.post("/btw/finished_webhook")
async def btw_finished_webhook(
    btw_deal: NewDeal, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    """
    Webhook: when a BTW deal is finished, copy its controleur / owner
    to later BTW deals for the same company.
    """
    background_tasks.add_task(
        sync_future_btw_assignments_from_finished_deal, str(btw_deal.deal_id)
    )
    return {
        "message": f"BTW assignment propagation scheduled for deal {btw_deal.deal_id}",
        "deal_id": str(btw_deal.deal_id),
    }


@router.post("/ib/sync_jr_owners_same_year")
async def ib_sync_jr_owners_same_year(
    ib_deal: NewDeal, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    """Sync the IB multi-user property for same-year JR deal owners."""
    background_tasks.add_task(sync_ib_jr_owner_summary, str(ib_deal.deal_id))
    return {
        "message": f"IB JR owner sync scheduled for deal {ib_deal.deal_id}",
        "deal_id": str(ib_deal.deal_id),
    }


@router.post("/va_ib/finished_webhook")
async def va_ib_finished_webhook(va_deal: NewDeal) -> dict[str, Any]:
    """Webhook: when a VA IB deal is finished, mark the IB deal's va_ingediend=true."""
    return await va_ib_module.handle_va_ib_finished(va_deal.deal_id)


@router.post("/vpb/finished_webhook")
async def vpb_finished_webhook(vpb_deal: NewDeal) -> dict[str, Any]:
    """Webhook: when a VPB deal is finished, move the VA VPB deal to 'VPB ingediend'."""
    return await va_vpb_module.handle_vpb_finished(vpb_deal.deal_id)


@router.post("/va_vpb/finished_webhook")
async def va_vpb_finished_webhook(va_deal: NewDeal) -> dict[str, Any]:
    """Webhook: when a VA VPB deal is finished, mark the VPB deal's va_ingediend=true."""
    return await va_vpb_module.handle_va_vpb_finished(va_deal.deal_id)


@router.post("/jr_prio_if_ib_ready_except_jr")
async def jr_prio_if_ib_ready_except_jr(jr_deal_id: NewDeal) -> dict[str, str]:

    await bump_this_jr_if_ib_ready_except_jr(str(jr_deal_id.deal_id))
    return {"message": f"JR deal {jr_deal_id} checked if IB is ready-except-JR"}


@router.post("/jr/sync_related_ib_jr_owners_same_year")
async def jr_sync_related_ib_jr_owners_same_year(
    jr_deal: NewDeal, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    """Sync related IB deals when a JR owner or year changes."""
    background_tasks.add_task(
        sync_related_ib_jr_owner_summaries_from_jr, str(jr_deal.deal_id)
    )
    return {
        "message": f"Related IB JR owner sync scheduled for JR deal {jr_deal.deal_id}",
        "deal_id": str(jr_deal.deal_id),
    }


@router.post("/check_correct_stage")
async def check_correct_stage(company_id: CompanyUpdateDealName) -> dict[str, str]:
    """This function checks if the deals in the test pipelines have the correct deal stage
    If not it changes the deal stage"""

    await service_operations.check_correct_stage(str(company_id.company_id))
    return {
        "message": f"Checked and updated deals for company {company_id.company_id} if necessary."
    }


@router.post("/btw/update_next_quarter_prev2m")
async def update_next_quarter_prev2m(
    payload: NextQuarterPrev2MUpdate,
) -> dict[str, str]:
    """
    Looks up the company's next-quarter BTW deal and updates
    'btw_2_maanden_geboekt_vorige_maand' based on the webhook value.
    """

    await update_next_quarter_prev2m_from_webhook(
        company_id=str(payload.company_id),
        pipeline_id=str(payload.pipeline_id),
        src_year=payload.year,
        src_quarter=payload.quarter,
        src_value=payload.value,
    )
    return {
        "message": (
            f"Updated next-quarter deal for company {payload.company_id} "
            f"using {payload.year}Q{payload.quarter} value."
        )
    }


@router.post("/update_jr_stage_from_btw_geboekt")
async def geboekte_kwartalen(
    payload: CompanyGeboekteKwartalenPayload,
) -> dict[str, str]:
    """
    Trigger JR priority bump based on a company's 'geboekte_kwartalen' property.
    Expects: { "company_id": "...", "year": "...", "geboekte_kwartalen": [...] }
    """

    await update_jr_stage_from_btw_geboekt(
        company_id=payload.company_id,
        year=payload.year,
        geboekte_kwartalen=payload.geboekte_kwartalen,
    )
    return {
        "message": f"Checked JR deals for company {payload.company_id} year {payload.year}."
    }


@router.post("/update_year")
async def update_year(payload: UpdateYearPayload) -> dict[str, str]:
    """Update the 'year' property of a deal based on its creation date.

    Args:
        create_date: The creation date of the deal in timestamp format.
        deal_id: The ID of the deal to update.

    Returns:
        dict: A message indicating the result of the operation.
    """

    year = get_year_from_date(payload.create_date)
    await call_hubspot_api(
        hubspot_calls.update_deal_properties, payload.deal_id, {"year": year}
    )
    return {"message": f"Updated year to {year} for deal {payload.deal_id}."}


@router.post("/bankkoppeling/sync_bedrijven_zonder_bankkoppeling_webhook")
async def sync_bedrijven_zonder_bankkoppeling_webhook(
    payload: CompanyBankkoppelingPayload,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    """Webhook triggered when a company's bankkoppeling_status changes.

    Finds all contacts associated with the company and updates the
    bedrijven_zonder_bankkoppeling property on each contact with a
    newline-separated list of company names (across all their associated
    companies) that do not have an active bank connection.
    """
    background_tasks.add_task(sync_bedrijven_zonder_bankkoppeling, payload.company_id)
    return {
        "message": "bedrijven_zonder_bankkoppeling sync enqueued.",
        "company_id": payload.company_id,
    }
