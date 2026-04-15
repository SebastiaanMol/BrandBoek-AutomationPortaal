from __future__ import annotations

import logging
from datetime import datetime
from datetime import timedelta
from datetime import timezone
from typing import Any

import sentry_sdk

import app.repository.hubspot as hubspot_calls
from app.constants import DOSSIER_OBJECT_TYPE
from app.service.operations.constants import BTW_Q2_2025_PIPELINE_ID
from app.service.operations.constants import BTW_Q3_2025_PIPELINE_ID
from app.service.rate_limiter import call_hubspot_api

logger = logging.getLogger(__name__)


async def get_companies_associated_to_dossier(dossier_id: str) -> list[str]:
    """Retrieves all companies associated with a dossier via the rate limiter.

    Args:
        dossier_id (str): The ID of the dossier to retrieve associated companies for.

    Returns:
        list[str]: A list of company IDs associated with the dossier.
    """
    company_ids: list[str] = await call_hubspot_api(
        hubspot_calls.get_associated_objects, DOSSIER_OBJECT_TYPE, dossier_id, "company"
    )
    logger.info(f"Found associated companies for dossier {dossier_id}: {company_ids}")
    return company_ids


async def get_deals_associated_with_company(company_id: str) -> list[str]:
    """Gets all deals associated with a company via the rate limiter.

    Args:
        company_id (str): The ID of the company to retrieve associated deals for.

    Returns:
        list[str]: A list of deal IDs associated with the company.
    """
    return await call_hubspot_api(
        hubspot_calls.get_associated_objects, "company", company_id, "deal"
    )


async def update_btw_deal(
    deal_id: str, target_property: str, target_property_value: str
) -> Any | None:
    """Updates a deal in the BTW pipelines with a specific property value.

    Each HubSpot API call is individually routed through the rate limiter.

    Args:
        deal_id (str): The ID of the deal to update.
        target_property (str): The property to update.
        target_property_value (str): The value to set for the property.

    Returns:
        Any | None: The response from the HubSpot API after updating the deal, or None.
    """
    try:
        deal = await call_hubspot_api(
            hubspot_calls.get_deal_info, deal_id, properties=["pipeline"]
        )
        if (
            deal.properties["pipeline"] != BTW_Q2_2025_PIPELINE_ID
            and deal.properties["pipeline"] != BTW_Q3_2025_PIPELINE_ID
        ):
            logger.info(f"Skipping deal {deal_id} because it's not in a BTW pipeline")
            return None

        api_response = await call_hubspot_api(
            hubspot_calls.update_deal_properties,
            deal_id,
            {target_property: target_property_value},
        )
        logger.info(f"Deal {deal_id} updated successfully.")
        return api_response
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception(f"Exception when updating deal {deal_id}: {e}")
        return None


async def update_current_btw_deal(
    deal_id: str, target_property: str, target_property_value: str
) -> Any | None:
    """MAKES CALL TO HUBSPOT API
    Updates a deal in the BTW pipeline **only if** its year/quarter is current or in the future,
    and only if the property value differs from the target value.

    Args:
        deal_id (str): ID of the deal to update.
        target_property (str): The property to update.
        target_property_value (str): The value to set.

    Returns:
        ApiResponse or None
    """

    try:
        # Get relevant properties from the deal, including the target property itself
        properties_to_fetch = ["year", "quarter", "pipeline", target_property]
        deal = await call_hubspot_api(
            hubspot_calls.get_deal_info, deal_id, properties=properties_to_fetch
        )

        if deal.properties["pipeline"] != BTW_Q3_2025_PIPELINE_ID:
            logger.info(f"Skipping deal {deal_id} because it's not in a BTW pipeline")
            return None

        # Skip update if property already set correctly
        current_value = deal.properties.get(target_property)
        if current_value == target_property_value:
            logger.info(
                f"Skipping deal {deal_id} because {target_property} is already set to the desired value."
            )
            return None

        deal_year = int(deal.properties.get("year", 0))
        # Safely handle missing or malformed quarter
        deal_quarter = int(deal.properties.get("quarter", "Q0")[1:])

        # CET is UTC+1 (without daylight saving)
        CET = timezone(timedelta(hours=1))

        # Determine current year and quarter
        now = datetime.now(CET)
        current_year = now.year
        current_quarter = (now.month - 1) // 3 + 1

        # Only update if the deal is for the current or a future quarter
        if (deal_year < current_year) or (
            deal_year == current_year and deal_quarter < current_quarter
        ):
            logger.info(
                f"Skipping deal {deal_id} - it's for past quarter/year (Q{deal_quarter} {deal_year})."
            )
            return None

        # Update the property
        properties = {target_property: target_property_value}
        api_response = await call_hubspot_api(
            hubspot_calls.update_deal_properties, deal_id, properties
        )

        logger.info(f"Deal {deal_id} updated successfully.")
        return api_response

    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception(f"Exception when updating deal {deal_id}: {e}")
        return None


async def get_dossier_property_value(
    dossier_id: str, properties: list[str]
) -> Any | None:
    """Retrieves a dossier object with the requested properties via the rate limiter.

    Args:
        dossier_id (str): The ID of the dossier to retrieve the property from.
        properties (list[str]): The properties to retrieve.

    Returns:
        Any | None: The raw dossier object (with .properties), or None on error.
    """
    try:
        return await call_hubspot_api(
            hubspot_calls.get_dossier_object, dossier_id, properties
        )
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception(f"Unexpected error fetching dossier {dossier_id}: {e}")
        return None


async def get_dossier_associated_with_company(company_id: str) -> str | None:
    """Retrieves the dossier associated with a company via the rate limiter.

    Args:
        company_id (str): The ID of the company to retrieve the associated dossier for.

    Returns:
        str | None: The ID of the first associated dossier if found, otherwise None.
    """
    try:
        dossier_ids: list[str] = await call_hubspot_api(
            hubspot_calls.get_associated_objects,
            "companies",
            company_id,
            DOSSIER_OBJECT_TYPE,
        )
        return str(dossier_ids[0]) if dossier_ids else None
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception(f"Error retrieving dossier for company {company_id}: {e}")
        return None
