from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

import sentry_sdk

import app.repository.hubspot as hubspot_calls
from app.schemas.classes import AssignStageRequest
from app.schemas.classes import NewDeal
from app.service.operations.constants import CONTROLE_VPB_PIPELINE_ID
from app.service.operations.constants import NEEDED_COMPANY_PROPS
from app.service.operations.constants import NEEDED_CONTACT_PROPS
from app.service.operations.constants import NEEDED_DEAL_PROPS
from app.service.operations.constants import SALES_PIPELINE_ID
from app.service.operations.constants import VPB_KAN_GEMAAKT_WORDEN_STAGE
from app.service.operations.constants import VPB_PIPELINE_ID
from app.service.operations.constants import VPB_SOFTWARE_KAN_GEMAAKT_WORDEN_STAGE
from app.service.operations.constants import VPB_STARTING_STAGE_IDS
from app.service.operations.find_correct_stage import find_correct_stage
from app.service.operations.operations import create_new_deal
from app.service.rate_limiter import call_hubspot_api
from app.utils import build_deal_properties_map

logger = logging.getLogger(__name__)


async def get_owner_id(deal_id: int) -> int | None:
    """Gets owner ID associated with a deal.

    Args:
        deal_id (int): Deal ID from HubSpot.

    Returns:
        int: The owner ID, or None if not found.
    """

    deal_info = await call_hubspot_api(hubspot_calls.get_deal_info, deal_id)
    hubspot_owner_id = deal_info.properties.get("hubspot_owner_id")

    if not hubspot_owner_id:
        logger.error(f"Deal has no owner, {deal_id}")
        return None

    return await call_hubspot_api(hubspot_calls.get_owner_id, hubspot_owner_id)


async def process_stage_assignment_async(request: AssignStageRequest) -> None:
    """
    Assigns the correct stage to a HubSpot deal based on the pipeline and deal info.
    """
    try:
        logger.info(
            "▶️ Starting stage assignment: deal=%s pipeline=%s company=%s contact=%s",
            request.deal_id,
            request.pipeline_id,
            request.company_id,
            request.contact_id,
        )

        pipeline = await call_hubspot_api(
            hubspot_calls.get_pipeline_by_id, request.pipeline_id
        )
        logger.debug(
            "Fetched pipeline: id=%s label=%s",
            getattr(pipeline, "id", None),
            getattr(pipeline, "label", None),
        )

        if request.company_id is None:
            msg = "company_id is required for stage assignment"
            raise ValueError(msg)
        if request.contact_id is None:
            msg = "contact_id is required for stage assignment"
            raise ValueError(msg)

        deals_map = await fetch_all_company_deals_with_props(
            request.company_id, NEEDED_DEAL_PROPS
        )
        logger.info(
            "Fetched %d deals for company=%s",
            len(deals_map) if hasattr(deals_map, "__len__") else -1,
            request.company_id,
        )

        # dump a few entries to inspect shape
        for idx, (did, obj) in enumerate(deals_map.items()):
            if idx >= 3:
                break
            logger.debug("Sample deal %s type=%s preview=%r", did, type(obj), obj)

        # company_deals are just the keys of the map (strings)
        company_deals = list(deals_map.keys())

        deal_properties = build_deal_properties_map(deals_map)

        sales_deal_id = None
        for did, rec in deal_properties.items():
            if rec["pipeline_id"] == SALES_PIPELINE_ID:
                sales_deal_id = did
                break
        logger.info("Sales deal candidate=%s", sales_deal_id)

        company = await call_hubspot_api(
            hubspot_calls.get_company_info, request.company_id, NEEDED_COMPANY_PROPS
        )
        contact = await call_hubspot_api(
            hubspot_calls.get_contact_info, request.contact_id, NEEDED_CONTACT_PROPS
        )

        correct_stage = await find_correct_stage(
            int(request.deal_id),
            pipeline,
            request.year,
            request.company_id,
            request.contact_id,
            company_deals,
            company,
            deal_properties.get(str(sales_deal_id))
            if sales_deal_id is not None
            else None,
            contact,
            deal_properties,
            str(request.quarter) if request.quarter is not None else None,
        )

        logger.info(
            "✅ Correct stage resolved for deal=%s: %s (%s)",
            request.deal_id,
            getattr(correct_stage, "label", "?"),
            getattr(correct_stage, "id", None),
        )

        properties = {"dealstage": correct_stage.id}
        await call_hubspot_api(
            hubspot_calls.update_deal_properties, request.deal_id, properties
        )

        logger.info(
            "✅ Deal stage of %s updated to %s", request.deal_id, correct_stage.id
        )

    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception(f"❌ Error updating deal stage for {request.deal_id}: {e}")


async def set_vpb_prio(payload: NewDeal) -> dict[str, str]:
    """Handles the update of VPB deals when a JR deal is updated.

    Args:
        payload (NewDeal): The payload containing the deal ID of the JR deal.
    """

    deal_id = str(payload.deal_id)

    # Step 1: Get the JR deal
    deal = await call_hubspot_api(
        hubspot_calls.get_deal_info, deal_id, properties=["year"]
    )
    vpb_year = deal.properties.get("year")

    # Step 2: Get associated company
    company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)

    # Step 3: Get all company deals
    deals = await call_hubspot_api(hubspot_calls.get_deals_for_company, company_id)

    # Batch-fetch all deals in one API call instead of N+1
    other_deal_ids = [d for d in deals if str(d) != str(deal.id)]
    all_other_deals = await call_hubspot_api(
        hubspot_calls.batch_get_deals_info,
        other_deal_ids,
        ["pipeline", "dealstage", "year"],
    )

    for other_deal in all_other_deals:
        # VPB pipeline ID
        if (
            other_deal.properties["pipeline"]
            in {VPB_PIPELINE_ID, CONTROLE_VPB_PIPELINE_ID}
            and other_deal.properties.get("year") == vpb_year
        ):
            # VPB starting stages
            if other_deal.properties["dealstage"] in VPB_STARTING_STAGE_IDS:
                if other_deal.properties["pipeline"] == VPB_PIPELINE_ID:
                    new_stage = VPB_KAN_GEMAAKT_WORDEN_STAGE
                elif other_deal.properties["pipeline"] == CONTROLE_VPB_PIPELINE_ID:
                    new_stage = VPB_SOFTWARE_KAN_GEMAAKT_WORDEN_STAGE
                await call_hubspot_api(
                    hubspot_calls.update_deal_properties,
                    other_deal.id,
                    {"dealstage": new_stage, "hs_priority": "low"},
                )
                # VPB kan gemaakt worden
                return {
                    "message": f"VPB deal {other_deal.id} updated to stage 1090547731 with priority low"
                }

            await call_hubspot_api(
                hubspot_calls.update_deal_properties,
                other_deal.id,
                {"hs_priority": "low"},
            )
            return {"message": f"VPB deal {other_deal.id} priority set to low"}

    return {
        "message": f"No matching VPB deal found for company {company_id} in year {vpb_year}"
    }


async def put_deals_in_new_deal(function: Callable[..., Any]) -> dict[str, str]:
    """Puts active deals into a new deal, to fill the new pipelines"""

    deal_ids = await call_hubspot_api(function)

    for deal_id in deal_ids:
        logger.info(f"Putting deal {deal_id} in new deal")
        await create_new_deal(deal_id=deal_id)

    return {"status": "Added active deals to new deal"}


# ── Backward-compatible re-exports ──────────────────────────────────────────
from app.service.operations.deal_builder import build_deal_input
from app.service.operations.deal_builder import build_deal_properties
from app.service.operations.deal_builder import create_dealname
from app.service.operations.deal_builder import get_associated_line_items
from app.service.operations.deal_builder import get_correct_btw_pipelines
from app.service.operations.deal_builder import get_correct_monthly_pipelines
from app.service.operations.deal_builder import get_correct_yearly_pipelines
from app.service.operations.deal_builder import get_line_items_info
from app.service.operations.deal_builder import get_NEW_jaarrekening_deals
from app.service.operations.deal_builder import get_product_id
from app.service.operations.deal_builder import get_product_name
from app.service.operations.deal_builder import get_products
from app.service.operations.deal_builder import match_product_to_pipeline
from app.service.operations.deal_search import check_company_and_year
from app.service.operations.deal_search import check_deal_name_already_in_pipeline
from app.service.operations.deal_search import company_already_in_pipeline
from app.service.operations.deal_search import fetch_all_company_deals_with_props
from app.service.operations.deal_search import fetch_all_contact_deals_with_props
from app.service.operations.deal_search import get_company_pipeline_deals
from app.service.operations.deal_search import get_corresponding_btw_deal
from app.service.operations.deal_search import get_deal_in_vat_pipeline
from app.service.operations.deal_search import get_doorlopende_machtiging_deal
from app.service.operations.deal_search import search_deal_exists_company_year
from app.service.operations.deal_search import search_deal_exists_company_year_quarter
from app.service.operations.deal_search import search_ib_for_contact_year
from app.service.operations.dossier import get_companies_associated_to_dossier
from app.service.operations.dossier import get_deals_associated_with_company
from app.service.operations.dossier import get_dossier_associated_with_company
from app.service.operations.dossier import get_dossier_property_value
from app.service.operations.dossier import update_btw_deal
from app.service.operations.dossier import update_current_btw_deal
from app.service.operations.pipelines import clean_pipeline_label
from app.service.operations.pipelines import clone_pipeline
from app.service.operations.pipelines import get_active_pipelines
from app.service.operations.pipelines import get_all_workflows
from app.service.operations.pipelines import get_continuous_pipelines
from app.service.operations.pipelines import get_controle_pipelines
from app.service.operations.pipelines import get_pipeline_and_stage_ids
from app.service.operations.pipelines import get_pipeline_info
from app.service.operations.pipelines import get_workflow_detail_keywords
from app.service.operations.pipelines import search_workflows
from app.service.operations.pipelines import serialize_pipeline

__all__ = [
    "build_deal_input",
    "build_deal_properties",
    "check_company_and_year",
    "check_deal_name_already_in_pipeline",
    "clean_pipeline_label",
    "clone_pipeline",
    "company_already_in_pipeline",
    "create_dealname",
    "fetch_all_company_deals_with_props",
    "fetch_all_contact_deals_with_props",
    "get_NEW_jaarrekening_deals",
    "get_active_pipelines",
    "get_all_workflows",
    "get_associated_line_items",
    "get_companies_associated_to_dossier",
    "get_company_pipeline_deals",
    "get_continuous_pipelines",
    "get_controle_pipelines",
    "get_correct_btw_pipelines",
    "get_correct_monthly_pipelines",
    "get_correct_yearly_pipelines",
    "get_corresponding_btw_deal",
    "get_deal_in_vat_pipeline",
    "get_deals_associated_with_company",
    "get_doorlopende_machtiging_deal",
    "get_dossier_associated_with_company",
    "get_dossier_property_value",
    "get_line_items_info",
    "get_owner_id",
    "get_pipeline_and_stage_ids",
    "get_pipeline_info",
    "get_product_id",
    "get_product_name",
    "get_products",
    "get_workflow_detail_keywords",
    "match_product_to_pipeline",
    "process_stage_assignment_async",
    "put_deals_in_new_deal",
    "search_deal_exists_company_year",
    "search_deal_exists_company_year_quarter",
    "search_ib_for_contact_year",
    "search_workflows",
    "serialize_pipeline",
    "set_vpb_prio",
    "update_btw_deal",
    "update_current_btw_deal",
]
