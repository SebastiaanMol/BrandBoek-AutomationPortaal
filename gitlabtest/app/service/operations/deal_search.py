from __future__ import annotations

import logging
from typing import Any

from hubspot.crm.line_items import PublicObjectSearchRequest

import app.repository.hubspot as hubspot_calls
from app.service.operations.constants import CONTROLE_BTW_Q_PIPELINE_ID
from app.service.operations.constants import IB_DOORLOPENDE_MACHTIGING_PIPELINE_ID
from app.service.operations.constants import IB_PIPELINE_ID
from app.service.operations.pipelines import get_pipeline_info
from app.service.rate_limiter import call_hubspot_api
from app.utils import props_of
from app.utils import result_after
from app.utils import result_id
from app.utils import result_list

logger = logging.getLogger(__name__)


async def check_deal_name_already_in_pipeline(
    pipeline: Any, deal_id: int
) -> tuple[bool, str] | None:
    """Checks if dealname is already in pipeline

    Args:
        pipeline (list): list with all the properties of the pipeline
        deal_id (int): deal id from hubspot

    Returns:
        bool: true if dealname is already in pipeline, false if not
        str: the dealname
    """

    company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)
    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, deal_id)
    contact_info = await call_hubspot_api(hubspot_calls.get_contact_info, contact_id)
    company_info = await call_hubspot_api(hubspot_calls.get_company_info, company_id)

    # Makes contact and company names
    first_contact_name = (
        contact_info.properties["firstname"] + " " + contact_info.properties["lastname"]
    )
    first_company_name = "" if company_id is None else company_info.properties["name"]

    if "inkomstenbelasting" not in pipeline.label.lower().strip():
        new_deal_name = (
            pipeline.label + ": " + first_contact_name + " - " + first_company_name
        )
    else:
        new_deal_name = pipeline.label + ": " + first_contact_name

    # Filters if a deal is already in the pipeline
    public_object_search_request = PublicObjectSearchRequest(
        limit=100,
        after="0",
        sorts=[],
        properties=[],
        filter_groups=[
            {
                "filters": [
                    {
                        "value": f"{pipeline.id}",
                        "propertyName": "pipeline",
                        "operator": "EQ",
                    },
                    {
                        "value": f"{new_deal_name}",
                        "propertyName": "dealname",
                        "operator": "EQ",
                    },
                ]
            }
        ],
    )

    api_response = await call_hubspot_api(
        hubspot_calls.search_object, public_object_search_request
    )

    # If dealname is not in pipeline, return false
    if not api_response.results:
        logger.info(f"dealname not in {pipeline.label}")
        return False, new_deal_name

    # If dealname is in pipeline, return true
    if api_response.results[0].properties["pipeline"] == pipeline.id:
        logger.info(f"dealname already in {pipeline.label}")
        return True, new_deal_name
    return None


async def company_already_in_pipeline(pipeline: Any, deal_id: int) -> Any | bool:
    """Checks if a company already has a deal in a pipeline

    Args:
        pipeline (list): list with all the properties of the pipeline
        deal_id (int): deal id from hubspot

    Returns:
        bool: true if company already has a deal in pipeline, false if not
    """

    company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)

    if company_id is None:
        logger.error(f"company not found: error, {deal_id}")
    else:
        first_company_id = company_id

    # Filters if a deal is already in the pipeline
    public_object_search_request = PublicObjectSearchRequest(
        limit=100,
        after=0,
        sorts=[],
        properties=["amount"],
        filter_groups=[
            {
                "filters": [
                    {
                        "value": f"{pipeline.id}",
                        "propertyName": "pipeline",
                        "operator": "CONTAINS_TOKEN",
                    },
                    {
                        "value": f"{first_company_id}",
                        "propertyName": "associations.company",
                        "operator": "CONTAINS_TOKEN",
                    },
                ]
            }
        ],
    )

    api_response_company_in_pipeline = await call_hubspot_api(
        hubspot_calls.search_object, public_object_search_request
    )

    if len(api_response_company_in_pipeline.results) > 0:
        logger.info(f"company already in {pipeline.label}")
        return api_response_company_in_pipeline
    logger.info(f"company not in {pipeline.label}")
    return False


async def check_company_and_year(pipeline: Any, company_id: str) -> None:

    if not company_id:
        logger.error("Company is not found")

    # Filters if a deal is already in the pipeline
    public_object_search_request = PublicObjectSearchRequest(
        limit=100,
        after=0,
        sorts=[],
        properties=["amount"],
        filter_groups=[
            {
                "filters": [
                    {
                        "value": f"{pipeline.id}",
                        "propertyName": "pipeline",
                        "operator": "CONTAINS_TOKEN",
                    },
                    {
                        "value": f"{company_id}",
                        "propertyName": "associations.company",
                        "operator": "CONTAINS_TOKEN",
                    },
                ]
            }
        ],
    )

    await call_hubspot_api(hubspot_calls.search_object, public_object_search_request)


async def get_deal_in_vat_pipeline(deal_id: str, pipeline_label: str) -> Any:
    """Associates deals by company in Hubspot

    Args:
        deal_id (str): deal id from hubspot
        pipeline_label (str): pipeline label from hubspot

    Returns:
        associate deals by company in Hubspot
    """

    company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)
    pipeline_results = await get_pipeline_info(pipeline_label)
    if pipeline_results is None:
        msg = f"Pipeline '{pipeline_label}' not found"
        raise ValueError(msg)
    pipeline_id = pipeline_results.id

    # Filters if a deal is already in the pipeline
    public_object_search_request = PublicObjectSearchRequest(
        limit=100,
        after=0,
        sorts=[],
        properties=[],
        filter_groups=[
            {
                "filters": [
                    {
                        "value": str(pipeline_id),
                        "propertyName": "pipeline",
                        "operator": "EQ",
                    },
                    {
                        "value": str(company_id),
                        "propertyName": "associations.company",
                        "operator": "EQ",
                    },
                ]
            }
        ],
    )

    return await call_hubspot_api(
        hubspot_calls.search_object, public_object_search_request
    )


async def search_deal_exists_company_year(
    company_id: str, pipeline_id: str, year_str: str
) -> str | None:
    """Return deal ID if yearly deal exists for company/pipeline/year, else None."""
    req = PublicObjectSearchRequest(
        limit=1,
        properties=[],
        filter_groups=[
            {
                "filters": [
                    {
                        "propertyName": "pipeline",
                        "operator": "EQ",
                        "value": str(pipeline_id),
                    },
                    {"propertyName": "year", "operator": "EQ", "value": str(year_str)},
                    {
                        "propertyName": "associations.company",
                        "operator": "EQ",
                        "value": str(company_id),
                    },
                ]
            }
        ],
    )
    resp = await call_hubspot_api(hubspot_calls.search_object, req)
    return resp.results[0].id if getattr(resp, "results", []) else None


async def search_deal_exists_company_year_quarter(
    company_id: str, pipeline_id: str, year_str: str, quarter_str: str
) -> str | None:
    """Return deal ID if quarterly (BTW) deal exists for company/pipeline/year/quarter, else None."""
    req = PublicObjectSearchRequest(
        limit=1,
        properties=[],
        filter_groups=[
            {
                "filters": [
                    {
                        "propertyName": "pipeline",
                        "operator": "EQ",
                        "value": str(pipeline_id),
                    },
                    {"propertyName": "year", "operator": "EQ", "value": str(year_str)},
                    {
                        "propertyName": "quarter",
                        "operator": "EQ",
                        "value": str(quarter_str),
                    },
                    {
                        "propertyName": "associations.company",
                        "operator": "EQ",
                        "value": str(company_id),
                    },
                ]
            }
        ],
    )
    resp = await call_hubspot_api(hubspot_calls.search_object, req)
    return resp.results[0].id if getattr(resp, "results", []) else None


async def search_ib_for_contact_year(
    contact_id: str, year_str: str, ib_pipeline_id: str = IB_PIPELINE_ID
) -> bool:
    """Return True if an IB deal exists for contact/year, else False."""
    req = PublicObjectSearchRequest(
        limit=1,
        properties=[],
        filter_groups=[
            {
                "filters": [
                    {
                        "propertyName": "pipeline",
                        "operator": "EQ",
                        "value": ib_pipeline_id,
                    },
                    {"propertyName": "year", "operator": "EQ", "value": year_str},
                    {
                        "propertyName": "associations.contact",
                        "operator": "EQ",
                        "value": str(contact_id),
                    },
                ]
            }
        ],
    )
    resp = await call_hubspot_api(hubspot_calls.search_object, req)
    return bool(resp and getattr(resp, "results", []))


async def _fetch_all_deals_by_association(
    association_type: str,
    entity_id: str | int,
    properties: list[str],
    page_size: int = 100,
) -> dict[str, Any]:
    """Paginate all deals associated with an entity and return deal_id -> result mapping."""
    results: dict[str, Any] = {}
    after = None
    filters = [
        {
            "propertyName": f"associations.{association_type}",
            "operator": "EQ",
            "value": str(entity_id),
        }
    ]

    while True:
        body: dict[str, Any] = {
            "filter_groups": [{"filters": filters}],
            "properties": properties,
            "limit": page_size,
        }
        if after:
            body["after"] = after

        resp = await call_hubspot_api(hubspot_calls.search_deals, body)

        for item in result_list(resp):
            deal_id = result_id(item)
            results[deal_id] = item

        after = result_after(resp)
        if not after:
            break

    return results


async def fetch_all_company_deals_with_props(
    company_id: str | int, properties: list[str], page_size: int = 100
) -> dict[str, Any]:
    """Fetch all deals for a company; returns deal_id -> result mapping."""
    return await _fetch_all_deals_by_association(
        "company", company_id, properties, page_size
    )


async def fetch_all_contact_deals_with_props(
    contact_id: str | int, properties: list[str], page_size: int = 100
) -> dict[str, Any]:
    """Fetch all deals for a contact; returns deal_id -> result mapping."""
    return await _fetch_all_deals_by_association(
        "contact", contact_id, properties, page_size
    )


async def get_company_pipeline_deals(deal_id: int) -> tuple[Any, list[Any]]:
    company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)
    current_deal_info = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        deal_id,
        properties=["pipeline", "dealstage", "year", "quarter", "maand"],
    )

    company_deals = await fetch_all_company_deals_with_props(
        company_id, ["pipeline", "dealstage", "year", "quarter", "maand"]
    )

    iterable = company_deals.values()

    # Filter deals to only those matching the pipeline of the first deal
    filtered_deals = []
    for deal in iterable:
        if props_of(deal).get("pipeline") == props_of(current_deal_info).get(
            "pipeline"
        ):
            filtered_deals.append(deal)

    return current_deal_info, filtered_deals


async def get_corresponding_btw_deal(deal_id: str) -> list[str]:
    """MAKES CALL TO HUBSPOT API
    Retrieves all deal IDs associated with a given company.

    Args:
        company_id (str): The ID of the company to retrieve deals for.

    Returns:
        List[str]: A list of deal IDs associated with the company.
    """
    company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)

    current_deal_info = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        deal_id,
        properties=["pipeline", "dealstage", "year", "quarter", "company"],
    )

    company_deals = await fetch_all_company_deals_with_props(
        company_id,
        ["pipeline", "dealstage", "year", "quarter"],
    )

    iterable = company_deals.values()

    # Filter: fixed pipeline + same year + same quarter
    filtered_deal = []
    for deal in iterable:
        deal_props = props_of(deal)
        curr_props = props_of(current_deal_info)
        if (
            deal_props.get("pipeline") == CONTROLE_BTW_Q_PIPELINE_ID
            and deal_props.get("year") == curr_props.get("year")
            and deal_props.get("quarter") == curr_props.get("quarter")
        ):
            filtered_deal.append(deal)

    return filtered_deal


async def get_doorlopende_machtiging_deal(sales_deal_id: int) -> str | None:
    """Get deal in doorlopende machtiging pipeline from sales_deal_id.

    Args:
        sales_deal_id (int): ID of the sales deal

    Returns:
        dm_deal_id (str): ID of the doorlopende machtiging deal if found, else None
    """

    # Get contact ID from sales deal
    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, sales_deal_id)
    logger.info(f"Contact ID for sales deal {sales_deal_id}: {contact_id}")

    # Get deals for contact
    contact_deals = await fetch_all_contact_deals_with_props(
        contact_id, ["pipeline", "dealstage"]
    )

    iterable = contact_deals.values()
    logger.info(
        f"Iterating over deals to find doorlopende machtiging deal: {len(iterable)} deals found"
    )

    dm_deal_id: str | None = None
    for deal in iterable:
        deal_props = props_of(deal)
        if deal_props.get("pipeline") == IB_DOORLOPENDE_MACHTIGING_PIPELINE_ID:
            dm_deal_id = deal.id
            break

    return dm_deal_id
