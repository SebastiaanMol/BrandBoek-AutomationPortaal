from __future__ import annotations

import logging
import re
from datetime import date
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from hubspot.crm.line_items import BatchReadInputSimplePublicObjectId
from hubspot.crm.line_items import SimplePublicObjectInputForCreate

import app.repository.hubspot as hubspot_calls
from app.constants import DEAL_TO_COMPANY_ASSOC_TYPE
from app.constants import DEAL_TO_CONTACT_ASSOC_TYPE
from app.hubspot_client import client
from app.service.operations.constants import JAARREKENING_PIPELINE_ID
from app.service.rate_limiter import call_hubspot_api

logger = logging.getLogger(__name__)


async def get_associated_line_items(deal_id: int) -> Any:
    """Retrieves object ids from a response

    Args:
        deal_id (int): Deal ID from HubSpot.

    Returns:
        list: List of line item objects.
    """

    api_response = await call_hubspot_api(hubspot_calls.get_line_items, deal_id)
    object_ids = [{"id": str(result.to_object_id)} for result in api_response.results]
    return await call_hubspot_api(hubspot_calls.get_line_items_by_id, object_ids)


async def get_line_items_info(deal_id: int) -> list[dict[str, str]]:
    """Gets the name and amount of a line item

    Args:
        deal_id (int): deal id from hubspot

    Returns:
        list: list with dictionaries containing all the product names and prices
    """
    line_items = await get_associated_line_items(deal_id)
    product_ids = get_product_id(line_items)
    return await call_hubspot_api(get_products, product_ids)


def get_product_id(line_items: Any) -> list[dict[str, str]]:
    """Retrieves product ids from object ids

    Args:
        line_items (list): list with all the object ids of line items

    Returns:
        list: list with all the product ids
    """

    product_ids = []

    # Retrieves product ids from corresponding object ids
    for item in line_items.results:
        product_ids.append({"id": str(item.properties["hs_product_id"])})

    return product_ids


def get_products(product_ids: list[dict[str, str]]) -> list[dict[str, str]]:
    """MAKES A CALL TO HUBSPOT API
    Uses product ids to retrieve product data - Name and Price

    Args:
        product_ids (list): list with all the product ids

    Returns:
        list: list consisting dictionaries containing all the product names and prices
    """

    # Retrieves product data from corresponding product ids
    batch_read_input_simple_public_object_id = BatchReadInputSimplePublicObjectId(
        properties_with_history=[], inputs=product_ids, properties=[]
    )
    api_response = client.crm.products.batch_api.read(
        batch_read_input_simple_public_object_id=batch_read_input_simple_public_object_id,
        archived=False,
    )

    # Retrieves product name and price
    products = []
    for item in api_response.results:
        products.append(
            {
                "name": str(item.properties["name"]),
                "price": str(item.properties["price"]),
            }
        )

    return products


def get_product_name(products: list[dict[str, str]]) -> list[dict[str, str]]:
    """Strips all the information down to what we need to know - only product name and price

    Args:
        products (list): list with all the product names and prices coupled

    Returns:
        list: list with dictionaries containing the stripped product names and prices
    """

    names_only = []

    # Strips the product names down
    for product in products:
        name = product["name"]
        n = len(name) - 1

        while n > 0:
            if name[n] == "-":
                # last '-' found
                break
            n -= 1

        if n > 0:
            name = name[: n - 1]

        names_only.append({"name": name.strip(), "price": product["price"]})

    return names_only


def match_product_to_pipeline(
    product_names: list[dict[str, str]], pipelines: list[Any]
) -> tuple[list[Any], list[dict[str, str]]]:
    """Finds matches between products and active pipelines.

    Special case:
        - If pipeline.label == "Volledige service", match products
          that start with "Volledige service" (even if they include
          suffixes like "W", "M", or "Q").

    Args:
        product_names (list): List of dicts with product names and prices.
        pipelines (list): List of active pipelines.

    Returns:
        tuple: (matching_pipelines, matching_products)
    """
    matching_pipelines = []
    products = []
    for product in product_names:
        product_name = product["name"].strip()

        for pipeline in pipelines:
            # --- Special case for "Volledige service" ---
            if "Volledige service" in pipeline.label:
                # Match any product starting with "volledige service"
                # (e.g. "Volledige service W", "Volledige service M", "Volledige service Q")
                if product_name.startswith("Volledige service"):
                    matching_pipelines.append(pipeline)
                    logger.info(f"Matched '{product['name']}' → {pipeline.label}")

            elif "Administratie zonder BTW" in pipeline.label:
                if product_name.startswith("Administratie zonder BTW"):
                    matching_pipelines.append(pipeline)
                    logger.info(f"Matched '{product['name']}' → {pipeline.label}")

            elif "Administratie - M" in pipeline.label:
                if product_name.startswith(("Administratie - M", "Admin -")):
                    matching_pipelines.append(pipeline)
                    logger.info(f"Matched '{product['name']}' → {pipeline.label}")

            # --- Normal substring match for others ---
            elif product_name in pipeline.label:
                matching_pipelines.append(pipeline)
                logger.info(f"Matched '{product['name']}' → {pipeline.label}")

            # Add product if not already listed
            if product not in products:
                products.append({"name": product["name"], "price": product["price"]})

    return matching_pipelines, products


def build_deal_properties(deal_info: Any) -> dict[str, Any]:
    """Extracts minimal props we need, **without** fetching the pipeline label.
    Returns pipeline_id (string), and year/quarter.
    """
    return {
        "pipeline_id": deal_info.properties.get("pipeline"),
        "year": deal_info.properties.get("year"),
        "quarter": deal_info.properties.get("quarter"),
    }


def build_deal_input(
    contact_id: int | str,
    company_id: int | str,
    owner_id: int | str | None,
    pipeline: Any,
    dealname: str | None,
    amount: str | float | None,
    dealstage: Any,
    deal_date: datetime,
    year: int | str | None,
    quarter: str | None = None,
    month: int | str | None = None,
    controleur: str | None = None,
    btw_2_maanden_geboekt_vorig_kwartaal: str | None = None,
) -> Any:
    """Builds the SimplePublicObjectInputForCreate for a new deal.

    Args:
        contact_id (str): The ID of the contact associated with the deal.
        company_id (str): The ID of the company associated with the deal.
        owner_id (str): The ID of the owner of the deal.
        pipeline (Pipeline): The pipeline object to which the deal belongs.
        dealname (str): The name of the deal.
        amount (float): The amount of the deal.
        dealstage (DealStage): The deal stage object for the deal.
        deal_date (datetime): The date of the deal.
        year (int): The year of the deal.
        quarter (str, optional): The quarter of the deal. Defaults to None.
        controleur (str, optional): The ID of the controleur associated with the deal. Defaults to None.

    Returns:
        SimplePublicObjectInputForCreate: The input object for creating a new deal.
    """

    properties = {
        "amount": str(amount),
        "dealname": str(dealname),
        "pipeline": str(pipeline.id),
        "closedate": int(deal_date.timestamp() * 1000),
        "dealstage": str(dealstage.id),
        "hubspot_owner_id": str(owner_id) if owner_id is not None else None,
        "controleur": str(controleur) if controleur is not None else None,
        "btw_2_maanden_geboekt_vorig_kwartaal": str(
            btw_2_maanden_geboekt_vorig_kwartaal
        )
        if btw_2_maanden_geboekt_vorig_kwartaal is not None
        else None,
    }
    if year is not None:
        properties["year"] = str(year)
    if quarter is not None:
        properties["quarter"] = str(quarter)
    if month is not None:
        properties["maand"] = str(month)

    return SimplePublicObjectInputForCreate(
        associations=[
            {
                "to": {"id": str(contact_id)},
                "types": [
                    {
                        "associationCategory": "HUBSPOT_DEFINED",
                        "associationTypeId": DEAL_TO_CONTACT_ASSOC_TYPE,
                    }
                ],
            },
            {
                "to": {"id": str(company_id)},
                "types": [
                    {
                        "associationCategory": "HUBSPOT_DEFINED",
                        "associationTypeId": DEAL_TO_COMPANY_ASSOC_TYPE,
                    }
                ],
            },
        ],
        properties=properties,
    )


async def create_dealname(
    pipeline_label: str,
    contact_info: Any,
    company_info: Any,
    year: int | str,
    quarter: str | None = None,
    month: int | str | None = None,
) -> str | None:
    """Creates a deal name based on the pipeline label and associated information.

    Args:
        pipeline_label (str): The label of the pipeline.
        contact_id (str): The ID of the contact associated with the deal.
        company_id (str): The ID of the company associated with the deal.
        year (int): The year of the deal.

    Returns:
        str: The formatted deal name.
    """
    # Get contact name
    firstname = contact_info.properties.get("firstname") or ""
    lastname = contact_info.properties.get("lastname") or ""
    contact_name = f"{firstname} {lastname}".strip()

    # Get company name
    company_name = company_info.properties.get("name")

    pipeline_label = re.sub(r"[^\w\s-]", "", pipeline_label).strip()

    if pipeline_label == "Inkomstenbelasting":
        return f"Inkomstenbelasting - {year}: {contact_name}"
    if "Inkomstenbelasting doorlopende machtiging" in pipeline_label:
        return f"Inkomstenbelasting doorlopende machtiging: {contact_name}"
    if "VPB" in pipeline_label:
        return f"VPB - {year}: {contact_name} - {company_name}"
    if "Jaarrekening" in pipeline_label:
        return f"Jaarrekening - {year}: {contact_name} - {company_name}"
    if "BTW - Q" in pipeline_label:
        return f"BTW - {quarter} {year}: {contact_name} - {company_name}"
    if "Administratie zonder BTW" in pipeline_label:
        return f"Administratie zonder BTW - {quarter} {year}: {contact_name} - {company_name}"
    if "Administratie - M" in pipeline_label:
        return f"Administratie - M - {quarter} {year}: {contact_name} - {company_name}"
    if "Volledige service" in pipeline_label:
        return f"Volledige service - {month}/{year}: {contact_name} - {company_name}"
    return None


def get_correct_yearly_pipelines(
    now: datetime | None, pipeline_label: str, tz: str = "Europe/Amsterdam"
) -> list[dict]:
    """
    Determines the correct yearly pipelines based on the local deal date.
    Returns only years from 2025 onward (inclusive).
    """

    tzinfo = ZoneInfo(tz)
    now = now.astimezone(tzinfo) if now else datetime.now(tzinfo)
    d = now.date()  # only use date part to avoid time-of-day edge cases

    year = d.year
    month = d.month
    pipelines: list[dict] = []

    if "doorlopende machtiging" in pipeline_label.lower():
        pipelines = [{"year": year}]
    elif "Inkomstenbelasting" in pipeline_label:
        if month < 9:  # before September → include previous + current year
            pipelines = [{"year": year}, {"year": year - 1}]
        else:  # from September onward → current year only
            pipelines = [{"year": year}]

    elif "Jaarrekening" in pipeline_label:
        if month < 10:
            pipelines = [{"year": year}, {"year": year - 1}]
        else:
            pipelines = [{"year": year}]

    elif "VPB" in pipeline_label:
        if month < 11:
            pipelines = [{"year": year}, {"year": year - 1}]
        else:
            pipelines = [{"year": year}]

    # ✅ Filter: keep only 2025 and later
    return [p for p in pipelines if p["year"] >= 2025]


def get_correct_btw_pipelines(
    now: datetime | None = None, tz: str = "Europe/Amsterdam"
) -> list[dict[str, Any]]:
    """
    Determine BTW quarter pipelines based on *local* Amsterdam date.
    Returns only Q4 2025 and later.
    """
    tzinfo = ZoneInfo(tz)
    now = now.astimezone(tzinfo) if now else datetime.now(tzinfo)
    d = now.date()  # use date logic to avoid time-of-day edge cases

    year = d.year

    # Define date windows (end-exclusive), all in local calendar dates
    windows: list[dict[str, Any]] = [
        {"q": "Q1", "start": date(year - 1, 10, 1), "end": date(year, 5, 1), "y": year},
        {
            "q": "Q1",
            "start": date(year, 10, 1),
            "end": date(year + 1, 5, 1),
            "y": year + 1,
        },
        # Q4 of the previous year remains valid until Jan 31 of the new year
        {
            "q": "Q4",
            "start": date(year - 1, 10, 1),
            "end": date(year, 2, 1),
            "y": year - 1,
        },
        {"q": "Q2", "start": date(year, 1, 1), "end": date(year, 8, 1), "y": year},
        {"q": "Q3", "start": date(year, 1, 1), "end": date(year, 11, 1), "y": year},
        {"q": "Q4", "start": date(year, 1, 1), "end": date(year + 1, 2, 1), "y": year},
    ]

    hits = [
        {"quarter": w["q"], "year": w["y"]}
        for w in windows
        if w["start"] <= d < w["end"]
    ]

    # Keep only Q4 2025 and later
    return [
        h
        for h in hits
        if (h["year"] > 2025) or (h["year"] == 2025 and h["quarter"] == "Q4")
    ]


def get_correct_monthly_pipelines(
    now: datetime | None = None,
    tz: str = "Europe/Amsterdam",
    cutoff_year: int = 2025,
    cutoff_month: int = 10,
) -> list[dict]:
    """
    Determine the monthly pipeline based on the *local* Amsterdam date.
    Returns a single item: [{"year": YYYY, "month": M}] for the current local month,
    but only if it is >= the cutoff (inclusive).

    Cutoff defaults to 2025-10 to match your "Q4 2025 and later" quarterly rule.
    Adjust `cutoff_year` / `cutoff_month` if you need a different boundary.

    Example return: [{"year": 2025, "month": 10}]
    """
    tzinfo = ZoneInfo(tz)
    now = now.astimezone(tzinfo) if now else datetime.now(tzinfo)
    d = now.date()  # avoid time-of-day edge cases

    y, m = d.year, d.month

    # Pass the cutoff only if (y, m) >= (cutoff_year, cutoff_month)
    if (y, m) < (cutoff_year, cutoff_month):
        return []

    return [{"year": y, "month": m}]


async def get_NEW_jaarrekening_deals(payload: Any) -> str:
    """
    Gets the deal ID of the deal in the pipeline with id 746430534 associated with the same company as the given deal.

    Args:
        payload (NewDeal): The payload containing the deal ID.

    Returns:
        str: The deal ID if found, otherwise an empty string.
    """

    deal_id = str(payload.deal_id)
    deal_info = await call_hubspot_api(
        hubspot_calls.get_deal_info, deal_id, properties=["year", "beginner_stage"]
    )
    btw_year = deal_info.properties.get("year")
    beginner_stage = deal_info.properties.get("beginner_stage")

    # 🚨 Exit early if beginner_stage is not 'true'
    if beginner_stage != "true":
        logger.info(f"Deal {deal_id} has beginner_stage={beginner_stage}, skipping.")
        return ""

    # Get associated company
    company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)
    if not company_id:
        logger.error(f"No company associated with deal {deal_id}")
        return ""

    # Get all deals for the company
    deals = await call_hubspot_api(hubspot_calls.get_deals_for_company, company_id)
    if not deals:
        logger.info(f"No deals found for company {company_id}")
        return ""

    # Batch-fetch all deals and find the one in the Jaarrekening pipeline
    deals_info = (
        await call_hubspot_api(
            hubspot_calls.batch_get_deals_info, deals, ["pipeline", "year"]
        )
        or []
    )
    for other_deal in deals_info:
        if (
            other_deal.properties.get("pipeline") == JAARREKENING_PIPELINE_ID
            and other_deal.properties.get("year") == btw_year
        ):
            return str(other_deal.id)

    return ""
