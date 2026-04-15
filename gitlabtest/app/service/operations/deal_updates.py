from __future__ import annotations

import asyncio
import logging
from typing import Any
from typing import Literal

import sentry_sdk
from hubspot.crm.deals import BatchInputSimplePublicObjectBatchInput
from hubspot.crm.deals import SimplePublicObjectBatchInput
from hubspot.crm.objects import SimplePublicObjectInput

import app.repository.hubspot as hubspot_calls
import app.service.operations.hubspot as service_hubspot
from app.exceptions import HubSpotAPIError
from app.service.operations.constants import BTW_BEREKENING_COMPLEET_STAGE
from app.service.operations.constants import CONTINUOUS_PIPELINE_IDS
from app.service.operations.constants import DM_KLANT_HAAKT_AF_STAGE
from app.service.operations.constants import NEEDED_COMPANY_PROPS
from app.service.operations.constants import NEEDED_CONTACT_PROPS
from app.service.operations.constants import NEEDED_DEAL_PROPS
from app.service.operations.constants import SALES_PIPELINE_ID
from app.service.operations.constants import VOLLEDIGE_SERVICE_COMPLETE_STAGE
from app.service.operations.find_correct_stage import find_correct_stage
from app.service.rate_limiter import call_hubspot_api
from app.utils import props_of

logger = logging.getLogger(__name__)


def _deal_pipeline_id(deal_obj: Any) -> str | None:
    # HubSpot uses "pipeline" (string id). Some SDKs expose "hs_pipeline" or "pipelineId".
    props = getattr(deal_obj, "properties", {}) or {}
    return (
        str(
            props.get("pipeline")
            or props.get("hs_pipeline")
            or props.get("pipelineId")
            or ""
        )
        or None
    )


def _compute_new_deal_name(
    old_deal_name: str,
    new_name: str,
    part: Literal["contact", "company"],
) -> str:
    """Compute the updated deal name after a contact or company rename.

    Deal names follow the pattern ``<pipeline>: <contact name> - <company name>``.
    Depending on which part changed and which delimiters are present, the
    replacement logic differs:

    * ``contact``: replaces the segment between ``:`` and ``-`` (the contact name).
    * ``company``: replaces the segment after ``-`` (the company name).
    """
    start = old_deal_name.find(":")
    end = old_deal_name.rfind("-")
    has_colon = ":" in old_deal_name
    has_dash = "-" in old_deal_name

    if part == "contact":
        if has_colon and has_dash and start < end:
            return old_deal_name[: start + 2] + new_name + old_deal_name[end - 1 :]
        if not has_colon and not has_dash:
            return new_name
        if end < start:
            return old_deal_name[: start + 2] + new_name
        return new_name + old_deal_name[end - 1 :]
    # company
    if has_colon and has_dash and start < end:
        return old_deal_name[: end + 2] + new_name
    if not has_colon and not has_dash:
        return new_name
    if end < start:
        return old_deal_name
    return old_deal_name[: end + 2] + new_name


async def _update_deal_names(
    deal_ids: list[str],
    new_name: str,
    part: Literal["contact", "company"],
) -> None:
    """Batch-fetch deal names, compute replacements, and batch-update in one pass.

    Args:
        deal_ids: HubSpot deal IDs whose names should be updated.
        new_name: The new contact or company name to embed.
        part: Which segment of the deal name to replace.
    """
    if not deal_ids:
        return

    deals = await call_hubspot_api(
        hubspot_calls.batch_get_deals_info, deal_ids, ["dealname"]
    )

    updates: list[SimplePublicObjectBatchInput] = []
    for deal in deals:
        old_deal_name = (deal.properties or {}).get("dealname") or ""
        new_deal_name = _compute_new_deal_name(old_deal_name, new_name, part)
        if new_deal_name != old_deal_name:
            updates.append(
                SimplePublicObjectBatchInput(
                    id=str(deal.id), properties={"dealname": new_deal_name}
                )
            )

    if not updates:
        return

    batch_payload = BatchInputSimplePublicObjectBatchInput(inputs=updates)
    await call_hubspot_api(hubspot_calls.batch_update_deals, batch_payload)
    logger.info("Updated deal names for %d deals (%s rename)", len(updates), part)


async def contact_change(contact_id: int) -> None:
    """Change the deal names of all deals associated with a contact whose name changed.

    Args:
        contact_id (int): contact id from hubspot
    """

    logger.info(f"Contact ID: {contact_id}")
    try:
        deal_ids, contact_info = await asyncio.gather(
            call_hubspot_api(hubspot_calls.get_deals_for_contact, contact_id),
            call_hubspot_api(hubspot_calls.get_contact_info, contact_id),
        )
        new_contact_name = (
            contact_info.properties["firstname"]
            + " "
            + contact_info.properties["lastname"]
        )
        await _update_deal_names(deal_ids, new_contact_name, "contact")

    except Exception as e:
        sentry_sdk.capture_exception(e)
        msg = f"Changing deal names error: {e}"
        raise HubSpotAPIError(msg) from e


async def company_change(company_id: int) -> None:
    """Change the deal names of all deals associated with a company whose name changed.

    Args:
        company_id (int): company id from hubspot
    """

    logger.info(f"Company ID: {company_id}")
    try:
        deal_ids, company_info = await asyncio.gather(
            call_hubspot_api(hubspot_calls.get_deals_for_company, company_id),
            call_hubspot_api(hubspot_calls.get_company_info, company_id),
        )
        new_company_name = company_info.properties["name"]
        await _update_deal_names(deal_ids, new_company_name, "company")

    except Exception as e:
        sentry_sdk.capture_exception(e)
        msg = f"Changing deal names error: {e}"
        raise HubSpotAPIError(msg) from e


async def check_correct_stage(company_id: str) -> None:

    # 1) One-shot: all company deals with the props we need
    deals_map = await service_hubspot.fetch_all_company_deals_with_props(
        company_id, NEEDED_DEAL_PROPS
    )

    # 2) Build deal_properties dict once
    deal_properties: dict[str, Any] = {}
    for did, obj in deals_map.items():
        p = props_of(obj)

        deal_properties[str(did)] = {
            "pipeline_id": p.get("pipeline"),
            "dealstage": p.get("dealstage"),
            "beginner": (p.get("beginner_stage") == "true"),
            "year": str(p.get("year") or ""),
            "quarter": str(p.get("quarter") or ""),
            "won_dtm": p.get("won_dtm"),
            "entered_btw_csv_a": p.get("hs_v2_date_entered_1047755303"),
            "entered_btw_csv_b": p.get("hs_v2_date_entered_1090656291"),
            "entered_btw_csv_c": p.get("hs_v2_date_entered_1162445750"),
            "entered_jr_zelf_a": p.get("hs_v2_date_entered_1086412193"),
            "entered_jr_zelf_b": p.get("hs_v2_date_entered_1012525422"),
        }

    # 3) Find the Sales deal (no extra calls)
    sales_deal_id = None
    for did, rec in deal_properties.items():
        if rec["pipeline_id"] == SALES_PIPELINE_ID:
            sales_deal_id = did
            break

    if not sales_deal_id:
        logger.warning(
            "No Sales deal found for company %s; skipping check_correct_stage",
            company_id,
        )
        return

    # 4) Fetch company + contact once (with props your handlers need)
    company = await call_hubspot_api(
        hubspot_calls.get_company_info, company_id, properties=NEEDED_COMPANY_PROPS
    )
    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, sales_deal_id)
    contact = await call_hubspot_api(
        hubspot_calls.get_contact_info, contact_id, properties=NEEDED_CONTACT_PROPS
    )

    # 5) Collect deals that actually need correction (continuous pipelines + beginner=true)
    candidates: list[str] = [
        did
        for did, rec in deal_properties.items()
        if rec["pipeline_id"] in CONTINUOUS_PIPELINE_IDS and rec["beginner"] is True
    ]

    if not candidates:
        logger.info(
            "No beginner deals in continuous pipelines for company %s", company_id
        )
        return

    # 6) Fetch each needed pipeline once, cache by id
    unique_pids = {deal_properties[did]["pipeline_id"] for did in candidates}
    pipeline_cache = {}

    async def fetch_pipeline(pid: str) -> None:
        pipeline_cache[pid] = await call_hubspot_api(
            hubspot_calls.get_pipeline_by_id, pid
        )

    await asyncio.gather(*[fetch_pipeline(pid) for pid in unique_pids])

    # 7) Compute correct stages (pure) and collect batch updates
    updates: list[SimplePublicObjectInput] = []

    for did in candidates:
        rec = deal_properties[did]
        pipeline = pipeline_cache.get(rec["pipeline_id"])
        if not pipeline:
            logger.warning(
                "Missing pipeline %s for deal %s; skipping", rec["pipeline_id"], did
            )
            continue

        # compute target stage using pre-fetched snapshot only
        target_stage = await find_correct_stage(
            deal_id=int(sales_deal_id),
            pipeline=pipeline,
            company_id=company_id,
            contact_id=contact_id,
            current_deal=deal_properties.get(sales_deal_id, {}),
            all_deals=list(deals_map.keys()),
            year=(rec["year"] or None),
            quarter=(rec["quarter"] or None),
            company=company,
            contact=contact,
            deal_properties=deal_properties,
        )
        if not target_stage:
            continue

        # Only update if different
        if str(rec["dealstage"]) != str(target_stage.id):
            logger.info(
                "Updating deal %s stage %s -> %s",
                did,
                rec["dealstage"],
                target_stage.id,
            )
            updates.append(
                SimplePublicObjectBatchInput(
                    id=str(did), properties={"dealstage": str(target_stage.id)}
                )
            )

    if not updates:
        logger.info("No stage updates required for company %s", company_id)
        return

    # 8) Batch update the stages (single API call)
    batch_payload = BatchInputSimplePublicObjectBatchInput(inputs=updates)
    await call_hubspot_api(hubspot_calls.batch_update_deals, batch_payload)
    logger.info("Updated %d deals for company %s", len(updates), company_id)


async def move_btw_q_deal_volledige_service(deal_id: int) -> dict[str, Any]:
    """This function checks if there are 3 completed deals in the Volledige service pipeline
    for the same quarter and year as the provided deal_id.

    Args:
        deal_id (int): The ID of the deal to check against.

    Returns:
        A dictionary with the updated BTW - Q deal ID and its new stage if an update was made.
    """

    (
        current_deal_info,
        pipeline_deals,
    ) = await service_hubspot.get_company_pipeline_deals(deal_id)

    current_quarter = current_deal_info.properties.get("quarter")
    current_year = current_deal_info.properties.get("year")

    btw_deal = await service_hubspot.get_corresponding_btw_deal(str(deal_id))
    btw_deal_id = btw_deal[0].id  # type: ignore[attr-defined]

    quarterly_complete_deals = []
    for deal in pipeline_deals:
        if (
            deal.properties.get("year") == current_year
            and deal.properties.get("quarter") == current_quarter
            and deal.properties.get("dealstage") == VOLLEDIGE_SERVICE_COMPLETE_STAGE
        ):
            quarterly_complete_deals.append(deal.properties.get("hs_object_id"))

    if len(quarterly_complete_deals) >= 3:
        await call_hubspot_api(
            hubspot_calls.update_deal_properties,
            btw_deal_id,
            {"dealstage": BTW_BEREKENING_COMPLEET_STAGE},
        )
        logger.info(
            f"Updated BTW - Q deal {btw_deal_id} to stage 'Berekening Compleet'"
        )
        return {"Updated BTW - Q deal": btw_deal_id, "to stage": "Berekening Compleet"}

    logger.info(
        "Did not update BTW - Q deal. Since not all 3 Volledige service deals completed"
    )
    return {
        "message": "Did not update BTW - Q deal. Not all 3 Volledige service deals completed"
    }


async def update_doorlopende_machtiging_deal(deal_id: int) -> dict[str, Any] | None:
    """This function updates a doorlopende machtiging deal if klantbestand deal moves to 'Klant haakt af' stage."""

    dm_deal_id = await service_hubspot.get_doorlopende_machtiging_deal(deal_id)

    if dm_deal_id:
        await call_hubspot_api(
            hubspot_calls.update_deal_properties,
            dm_deal_id,
            {"dealstage": DM_KLANT_HAAKT_AF_STAGE},
        )
        logger.info(
            f"Updated doorlopende machtiging deal {dm_deal_id} to stage 'Geen IB: klant haakt af'"
        )

        return {
            "Updated doorlopende machtiging deal": dm_deal_id,
            "to stage": "Geen IB: klant haakt af",
        }
    return None
