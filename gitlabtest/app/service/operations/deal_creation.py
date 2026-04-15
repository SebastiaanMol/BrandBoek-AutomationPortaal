from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

import sentry_sdk
from hubspot.crm.deals.exceptions import ApiException

import app.repository.hubspot as hubspot_calls
import app.service.operations.hubspot as service_hubspot
from app.exceptions import HubSpotAPIError
from app.service.operations.constants import IB_DOORLOPENDE_MACHTIGING_PIPELINE_ID
from app.service.operations.constants import IB_PIPELINE_ID
from app.service.operations.constants import NEEDED_COMPANY_PROPS
from app.service.operations.constants import NEEDED_CONTACT_PROPS
from app.service.operations.constants import NEEDED_DEAL_PROPS
from app.service.operations.find_correct_stage import find_correct_stage
from app.service.properties.btw_assignment import BTW_ASSIGNMENT_PROPS
from app.service.properties.btw_assignment import find_latest_btw_assignment
from app.service.rate_limiter import call_hubspot_api
from app.utils import build_deal_properties_map
from app.utils import props_of

logger = logging.getLogger(__name__)


DUTCH_MONTHS = [
    "",
    "januari",
    "februari",
    "maart",
    "april",
    "mei",
    "juni",
    "juli",
    "augustus",
    "september",
    "oktober",
    "november",
    "december",
]


async def create_new_deal(deal_id: int) -> dict[str, Any]:
    """
    Creates a new deal in HubSpot based on the provided deal ID in the corresponding pipelines.
    Returns a dict summary of what happened. Raise exceptions on failure (endpoint will translate).
    """
    logger.info("new_deal:start deal_id=%s", deal_id)
    deal_date = datetime.now()

    try:
        # Fetch independent inputs concurrently
        line_items_task = asyncio.create_task(
            service_hubspot.get_line_items_info(deal_id)
        )
        cont_pipes_task = asyncio.create_task(
            service_hubspot.get_continuous_pipelines()
        )
        contact_task = asyncio.create_task(
            call_hubspot_api(hubspot_calls.get_contact_id, deal_id)
        )
        company_task = asyncio.create_task(
            call_hubspot_api(hubspot_calls.get_company_id, deal_id)
        )
        owner_task = asyncio.create_task(service_hubspot.get_owner_id(deal_id))

        (
            line_items_info,
            continuous_pipelines,
            contact_id,
            company_id,
            owner_id,
        ) = await asyncio.gather(
            line_items_task, cont_pipes_task, contact_task, company_task, owner_task
        )

        if not company_id:
            msg = f"Company not found for deal_id={deal_id}"
            logger.error("new_deal:error %s", msg)
            raise ValueError(msg)

        # Fetch company info to check software_portaal_pakket
        company_info = await call_hubspot_api(
            hubspot_calls.get_company_info, company_id, properties=NEEDED_COMPANY_PROPS
        )
        client_type = (
            (company_info.properties or {}).get("software_portaal_pakket") or ""
        ).strip() or None

        # Decide which pipelines to use
        if client_type in ["Pakket groot", "Software"]:
            # Fetch the pakket/software pipelines instead of continuous
            pakket_pipelines = await service_hubspot.get_controle_pipelines()
            pipelines_to_use = pakket_pipelines
        else:
            pipelines_to_use = continuous_pipelines

        # Match products to pipelines
        product_names = service_hubspot.get_product_name(line_items_info)
        matched_pipelines, _products = service_hubspot.match_product_to_pipeline(
            product_names, pipelines_to_use
        )

        deals_map = await service_hubspot.fetch_all_company_deals_with_props(
            company_id, NEEDED_DEAL_PROPS
        )
        contact_deals = await service_hubspot.fetch_all_contact_deals_with_props(
            contact_id, NEEDED_DEAL_PROPS
        )

        # company_deals are just the keys of the map (strings)
        company_deals = list(deals_map.keys())

        deal_properties = build_deal_properties_map(deals_map)

        contact_deal_properties: dict[str, Any] = {
            did: {
                "pipeline_id": props_of(obj).get("pipeline"),
                "dealstage": props_of(obj).get("dealstage"),
                "year": str(props_of(obj).get("year") or ""),
            }
            for did, obj in contact_deals.items()
        }

        contact_exists_map: dict[tuple[str, str | None], str] = {}
        for did, rec in contact_deal_properties.items():
            ckey = (rec["pipeline_id"], rec["year"] or None)
            contact_exists_map.setdefault(ckey, did)

        exists_map: dict[tuple[str | None, ...], str] = {}
        for did, rec in deal_properties.items():
            ekey: tuple[str | None, ...] = (
                rec["pipeline_id"],
                rec["year"],
                rec["quarter"] or None,
                rec["maand"] or None,
            )
            exists_map.setdefault(ekey, did)

        # Delegate
        response = await handle_pipelines(
            matched_pipelines,
            line_items_info,
            deal_properties,
            deal_id,
            contact_id,
            company_id,
            company_info,
            owner_id,
            deal_date,
            company_deals,
            contact_exists_map,
            exists_map,
        )

        logger.info("new_deal:success deal_id=%s", deal_id)

        return {
            "ok": True,
            "deal_id": deal_id,
            "company_id": company_id,
            "contact_id": contact_id,
            "pipelines": [
                service_hubspot.serialize_pipeline(p) for p in matched_pipelines
            ],
            "result": response if isinstance(response, dict) else str(response),
        }

    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception("new_deal:failure deal_id=%s error=%s", deal_id, e)
        raise


async def process_monthly_pipeline(
    pipeline: Any,
    pipeline_label: str,
    fitting_months: list[dict[str, Any]],
    deal_properties: dict[str, Any],
    deal_id: int,
    contact_id: int | str,
    company_id: int | str,
    owner_id: int | str | None,
    amount: str | None,
    deal_date: datetime,
    all_deals: list[str],
    company: Any,
    current_deal: dict[str, Any],
    contact: Any,
    exists_map: dict[tuple[str | None, ...], str],
    line_item_info: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Monthly pipelines (Externe software: Volledige service):
    - Update if (pipeline_id, year, month) exists; else create (compute stage now).
    - `fitting_months` is a list of {"year": int, "month": int}.
    - Uses exists_map with keys: (pipeline_id, year_str, month_str)
    """

    line_item_label = service_hubspot.clean_pipeline_label(pipeline.label)

    pid = str(pipeline.id)
    deal_inputs = []  # collect to batch create later

    for fitting in fitting_months:
        year_str = str(fitting["year"])
        month_int = int(fitting["month"])
        month_str = f"{month_int:02d}"  # zero-pad for stable keys/sorting

        # Derive quarter from month
        q_num = (month_int - 1) // 3 + 1
        quarter_str = f"Q{q_num}"

        # Build "Maand" property
        maand = DUTCH_MONTHS[month_int]
        maand_property = maand

        # Single-call existence check via exists_map
        corr_deal_id = exists_map.get((pid, year_str, quarter_str, maand))
        if corr_deal_id:
            logger.info(
                f"Already in {pipeline.label} {year_str}-{month_str}: updating amount"
            )
            await update_deal_amount_in_new_pipeline(
                corr_deal_id, line_item_label, line_item_info, deal_properties
            )
            continue

        # Create only if needed → compute stage now
        dealstage = await find_correct_stage(
            deal_id,
            pipeline,
            year_str,
            company_id,
            contact_id,
            all_deals,
            company,
            current_deal,
            contact,
            deal_properties,
            month_str,
        )

        # Naming mirrors quarterly signature but with month
        dealname = await service_hubspot.create_dealname(
            pipeline_label, contact, company, year_str, quarter_str, month_str
        )

        # Pass year, month, *and* quarter into the builder
        deal_input = service_hubspot.build_deal_input(
            contact_id,
            company_id,
            owner_id,
            pipeline,
            dealname,
            amount,
            dealstage,
            deal_date,
            year_str,
            quarter_str,
            maand_property,
        )

        deal_inputs.append(deal_input)

    return deal_inputs


async def process_btw_pipeline(
    pipeline: Any,
    pipeline_label: str,
    btw_fitting_pipelines: list[dict[str, Any]],
    deal_properties: dict[str, Any],
    deal_id: int,
    contact_id: int | str,
    company_id: int | str,
    owner_id: int | str | None,
    amount: str | None,
    deal_date: datetime,
    all_deals: list[str],
    company: Any,
    current_deal: dict[str, Any],
    contact: Any,
    exists_map: dict[tuple[str | None, ...], str],
    line_item_info: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """BTW: update if (pipeline_id,year,quarter) exists; else create (compute stage now)."""
    line_item_label = service_hubspot.clean_pipeline_label(pipeline.label)

    btw_assignment_deals = await service_hubspot.fetch_all_company_deals_with_props(
        company_id, BTW_ASSIGNMENT_PROPS
    )

    pid = str(pipeline.id)
    deal_inputs = []  # Collect all deal inputs to batch create later

    for fitting in btw_fitting_pipelines:
        year_str, quarter_str = str(fitting["year"]), str(fitting["quarter"])
        latest_btw_assignment = find_latest_btw_assignment(
            btw_assignment_deals, year_str, quarter_str
        )
        controleur = (
            latest_btw_assignment.get("controleur") if latest_btw_assignment else None
        )
        btw_owner_id = (
            latest_btw_assignment.get("hubspot_owner_id")
            if latest_btw_assignment
            else None
        )

        # Single-call existence check via exists_map
        corr_deal_id = exists_map.get((pid, year_str, quarter_str, None))

        if corr_deal_id:
            logger.info(
                f"Already in {pipeline.label} {year_str} {quarter_str}: updating amount"
            )
            await update_deal_amount_in_new_pipeline(
                corr_deal_id, line_item_label, line_item_info, deal_properties
            )
            continue

        # Create only if needed → compute stage now
        dealstage = await find_correct_stage(
            deal_id,
            pipeline,
            year_str,
            company_id,
            contact_id,
            all_deals,
            company,
            current_deal,
            contact,
            deal_properties,
            quarter_str,
        )
        dealname = await service_hubspot.create_dealname(
            pipeline_label, contact, company, year_str, quarter_str
        )
        deal_input = service_hubspot.build_deal_input(
            contact_id,
            company_id,
            btw_owner_id or owner_id,
            pipeline,
            dealname,
            amount,
            dealstage,
            deal_date,
            year_str,
            quarter_str,
            controleur=controleur,
        )
        deal_inputs.append(deal_input)
    return deal_inputs


async def process_yearly_pipeline(
    pipeline: Any,
    pipeline_label: str,
    fitting: dict[str, Any],
    deal_properties: dict[str, Any],
    deal_id: int,
    contact_id: int | str,
    company_id: int | str,
    owner_id: int | str | None,
    amount: str | None,
    deal_date: datetime,
    all_deals: list[str],
    company: Any,
    current_deal: dict[str, Any],
    contact: Any,
    contact_exists_map: dict[tuple[str, str | None], str],
    exists_map: dict[tuple[str | None, ...], str],
    line_items_info: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Yearly pipelines: update if (pipeline_id,year) exists; else create (compute stage now)."""
    line_item_label = service_hubspot.clean_pipeline_label(pipeline.label)

    year_str = str(fitting["year"])
    pid = str(pipeline.id)

    # --- IB: avoid duplicates → search by contact+year ---
    if "inkomstenbelasting" in pipeline_label.lower():
        if pid == IB_PIPELINE_ID:
            # Look in exists_map for ANY deal in IB pipeline with same year.
            corr_deal_id = contact_exists_map.get((pid, year_str))

            if corr_deal_id:
                logger.info(
                    f"[IB SKIP] contact {contact_id} already has IB for {year_str}"
                )
                return None

        elif pid == IB_DOORLOPENDE_MACHTIGING_PIPELINE_ID:
            # Only one doorlopende machtiging per contact, regardless of year
            corr_deal_id = next(
                (did for (p, _y), did in contact_exists_map.items() if p == pid), None
            )

            if corr_deal_id:
                logger.info(
                    f"[IB CONT SKIP] contact {contact_id} already has IB doorlopende machtiging"
                )
                return None

        dealstage = await find_correct_stage(
            deal_id,
            pipeline,
            year_str,
            company_id,
            contact_id,
            all_deals,
            company,
            current_deal,
            contact,
            deal_properties,
        )

        dealname = await service_hubspot.create_dealname(
            pipeline_label, contact, company, year_str
        )

        if pid == IB_DOORLOPENDE_MACHTIGING_PIPELINE_ID:
            deal_input = service_hubspot.build_deal_input(
                contact_id,
                company_id,
                owner_id,
                pipeline,
                dealname,
                amount,
                dealstage,
                deal_date,
                None,
            )
        else:
            deal_input = service_hubspot.build_deal_input(
                contact_id,
                company_id,
                owner_id,
                pipeline,
                dealname,
                amount,
                dealstage,
                deal_date,
                year_str,
            )
        return deal_input

    # --- Jaarrekening / VPB / other yearly: search by company+year ---
    corr_deal_id = exists_map.get((pid, year_str, None, None))

    if corr_deal_id:
        logger.info(f"Already in {pipeline.label} {year_str}: updating amount")
        await update_deal_amount_in_new_pipeline(
            corr_deal_id, line_item_label, line_items_info, deal_properties
        )
        return None

    dealstage = await find_correct_stage(
        deal_id,
        pipeline,
        year_str,
        company_id,
        contact_id,
        all_deals,
        company,
        current_deal,
        contact,
        deal_properties,
    )

    dealname = await service_hubspot.create_dealname(
        pipeline_label, contact, company, year_str
    )

    return service_hubspot.build_deal_input(
        contact_id,
        company_id,
        owner_id,
        pipeline,
        dealname,
        amount,
        dealstage,
        deal_date,
        year_str,
    )


async def handle_pipelines(
    matched_pipelines: list[Any],
    line_items_info: list[dict[str, Any]],
    deal_properties: dict[str, Any],
    deal_id: int,
    contact_id: int | str,
    company_id: int | str,
    company: Any,
    owner_id: int | str | None,
    deal_date: datetime,
    all_deals: list[str],
    contact_exists_map: dict[tuple[str, str | None], str],
    exists_map: dict[tuple[str | None, ...], str],
) -> Any:
    contact = await call_hubspot_api(
        hubspot_calls.get_contact_info, contact_id, properties=NEEDED_CONTACT_PROPS
    )
    current_deal = deal_properties.get(str(deal_id), {})

    deal_inputs = []  # Collect all deal inputs to batch create later
    for pipeline in matched_pipelines:
        amount = next(
            (
                item["price"]
                for item in line_items_info
                if str(item["name"].split("-")[0].strip()) in pipeline.label
            ),
            None,
        )

        if "Volledige service" in pipeline.label:
            monthly_fitting = service_hubspot.get_correct_monthly_pipelines(deal_date)
            monthly_deals = await process_monthly_pipeline(
                pipeline,
                pipeline.label,
                monthly_fitting,
                deal_properties,
                deal_id,
                contact_id,
                company_id,
                owner_id,
                amount,
                deal_date,
                all_deals,
                company,
                current_deal,
                contact,
                exists_map,
                line_items_info,
            )
            if monthly_deals:
                deal_inputs.extend(monthly_deals)

        elif "BTW - Q" in pipeline.label or "Administratie" in pipeline.label:
            btw_fitting = service_hubspot.get_correct_btw_pipelines(deal_date)
            btw_deals = await process_btw_pipeline(
                pipeline,
                pipeline.label,
                btw_fitting,
                deal_properties,
                deal_id,
                contact_id,
                company_id,
                owner_id,
                amount,
                deal_date,
                all_deals,
                company,
                current_deal,
                contact,
                exists_map,
                line_items_info,
            )
            if btw_deals:
                deal_inputs.extend(btw_deals)
        else:
            yearly = service_hubspot.get_correct_yearly_pipelines(
                deal_date, pipeline.label
            )
            for fitting in yearly:
                deal_input = await process_yearly_pipeline(
                    pipeline,
                    pipeline.label,
                    fitting,
                    deal_properties,
                    deal_id,
                    contact_id,
                    company_id,
                    owner_id,
                    amount,
                    deal_date,
                    all_deals,
                    company,
                    current_deal,
                    contact,
                    contact_exists_map,
                    exists_map,
                    line_items_info,
                )
                if deal_input:
                    deal_inputs.append(deal_input)

    # Batch create all deals at once
    if deal_inputs:
        logger.info(f"Creating {len(deal_inputs)} deals in batch")
        await call_hubspot_api(hubspot_calls.batch_create_deals_sync, deal_inputs)
    return None


async def update_deal_amount_in_new_pipeline(
    corr_deal_id: int | str,
    pipeline_label: str,
    line_item_info: list[dict[str, Any]],
    deal_properties: dict[str, Any],
) -> Any | None:
    """Gives the correct input to update deal amount in Hubspot

    Args:
        sales_deal_id (int): deal id from the deal in the sales pipeline, does not change the amount of this deal
        corr_deal_id (int): deal id from the deal in the corresponding pipeline, changes the amount of this deal
        pipeline_label (str): name of the line_item that corresponds to the pipeline (e.g. "VPB", "BTW - Q")
    """

    try:
        # Gets our hubspot

        # Finds the correct line item amount corresponding to the pipeline and updates the deal amount
        current_amount = deal_properties.get(str(corr_deal_id), {}).get("amount", "0")
        for item in line_item_info:
            if pipeline_label in item["name"]:
                logger.info(
                    f"Current amount for deal {corr_deal_id} in {pipeline_label} is: {current_amount}, line item amount is: {item['price']}"
                )
                if str(item["price"]) == current_amount:
                    logger.info(
                        f"Deal {corr_deal_id} in {pipeline_label} already has correct amount: {current_amount}"
                    )
                    return None
                return await call_hubspot_api(
                    hubspot_calls.update_deal_properties,
                    corr_deal_id,
                    {"amount": str(item["price"])},
                )

    except Exception as e:
        sentry_sdk.capture_exception(e)
        msg = f"Update Deal Amount error: {e}"
        raise HubSpotAPIError(msg) from e
    return None


async def create_deal_with_retry(deal_input: Any) -> Any:
    """This function attempts to create a deal in HubSpot with retry logic for rate limits.

    Args:
        deal_input (SimplePublicObjectInputForCreate): The input data for creating the deal.

    Returns:
        The response from the HubSpot API if successful.
    """

    # Constants for retry
    MAX_RETRIES = 5
    BASE_DELAY = 2

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return await call_hubspot_api(hubspot_calls.create_deal, deal_input)
        except ApiException as e:
            if e.status in {429, "429"}:
                delay = BASE_DELAY * attempt
                logger.warning(f"Rate limit hit. Retry #{attempt} in {delay} seconds.")
                await asyncio.sleep(delay)
            else:
                raise
    msg = "Too many retries due to HubSpot rate limits."
    raise HubSpotAPIError(msg)
