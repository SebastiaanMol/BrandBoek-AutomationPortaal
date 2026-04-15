from __future__ import annotations

import logging

import sentry_sdk

from app.service.operations.hubspot import get_companies_associated_to_dossier
from app.service.operations.hubspot import get_deals_associated_with_company
from app.service.operations.hubspot import get_dossier_associated_with_company
from app.service.operations.hubspot import get_dossier_property_value
from app.service.operations.hubspot import update_btw_deal
from app.service.operations.hubspot import update_current_btw_deal

logger = logging.getLogger(__name__)


async def handle_dossier_property_change(
    dossier_id: str, target_property: str, new_value: str
) -> None:
    """Handles the change of a property in a dossier and updates all associated deals in the BTW pipeline.

    Args:
        dossier_id (str): The ID of the dossier.
        target_property (str): The property in the dossier that has changed.
        new_value (str): The new value for the property.
    """

    try:
        # Step 1: Get companies linked to the dossier
        company_ids = await get_companies_associated_to_dossier(dossier_id)
        if not company_ids:
            logger.info(f"No companies associated with dossier {dossier_id}")
            return

        # Step 2: Collect all deals linked to those companies
        all_deal_ids = set()
        for company_id in company_ids:
            deal_ids = await get_deals_associated_with_company(company_id)
            all_deal_ids.update(deal_ids)

        if not all_deal_ids:
            logger.info(f"No deals found for dossier {dossier_id}")
            return

        # Step 3: Update each deal with the new value
        for deal_id in all_deal_ids:
            await update_current_btw_deal(deal_id, target_property, new_value)

        logger.info(
            f"Successfully updated deals in the BTW pipeline for dossier {dossier_id}"
        )

    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception(f"Error updating deals for dossier {dossier_id}: {e}")


async def handle_new_company_association(
    company_id: str, dossier_id: str, target_property: str
) -> None:
    """Handles the association of a new company with a dossier and updates all BTW deals linked to that company.

    Args:
        company_id (str): The ID of the company.
        dossier_id (str): The ID of the dossier.
        target_property (str): The property in the dossier to use for updating deals.
    """

    try:
        # Step 1: Get the value of the property from the dossier
        dossier_value = await get_dossier_property_value(dossier_id, [target_property])
        if dossier_value is None:
            logger.info(
                f"No value found for property '{target_property}' in dossier {dossier_id}"
            )
            return

        # Step 2: Get deals linked to the company
        deal_ids = await get_deals_associated_with_company(company_id)
        if not deal_ids:
            logger.info(f"No deals found for company {company_id}")
            return

        # Step 3: Update each deal with the new value
        for deal_id in deal_ids:
            await update_btw_deal(deal_id, target_property, dossier_value)

    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception(
            f"Error updating deals for company {company_id} using dossier {dossier_id}: {e}"
        )


async def handle_new_deal_association(
    deal_id: str, company_id: str, target_property: str
) -> None:
    """Handles the association of a new deal with a company and updates the BTW deal using the dossier linked to that company.

    Args:
        deal_id (str): The ID of the new deal.
        company_id (str): The ID of the company associated with the deal.
        target_property (str): The property in the dossier to use for updating the deal.
    """

    try:
        # Step 1: Get the dossier linked to the company
        dossier_id = await get_dossier_associated_with_company(company_id)
        if not dossier_id:
            logger.info(f"No dossier associated with company {company_id}")
            return

        # Step 2: Get the property value from the dossier
        dossier_value = await get_dossier_property_value(dossier_id, [target_property])
        if dossier_value is None:
            logger.info(
                f"No value found for property '{target_property}' in dossier {dossier_id}"
            )
            return

        # Step 3: Update the new deal
        await update_btw_deal(deal_id, target_property, dossier_value)

    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception(
            f"Error updating deal {deal_id} using dossier {dossier_id}: {e}"
        )
