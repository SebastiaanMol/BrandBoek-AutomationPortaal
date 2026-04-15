from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

import app.repository.hubspot as hubspot_calls
import app.service.operations.hubspot as service_hubspot
from app.service.operations.constants import BETAALT_NIET_STAGE_ID
from app.service.operations.constants import NEEDED_COMPANY_PROPS
from app.service.operations.constants import NEEDED_CONTACT_PROPS
from app.service.operations.constants import NEEDED_DEAL_PROPS
from app.service.operations.find_correct_stage import find_correct_stage
from app.service.rate_limiter import call_hubspot_api
from app.utils import build_deal_properties_map


async def set_all_to_betaalt_niet(deal_id: str) -> None:
    company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)
    all_deals = await call_hubspot_api(hubspot_calls.get_deals_for_company, company_id)

    for d in all_deals:
        if str(d) == str(deal_id):
            # Betaalt niet stage ID in sales pipeline
            await call_hubspot_api(
                hubspot_calls.update_deal_properties,
                d,
                {"vorige_stage": BETAALT_NIET_STAGE_ID},
            )
            continue

        # Get current dealstage + pipeline
        deal_info = await call_hubspot_api(
            hubspot_calls.get_deal_info, d, properties=["dealstage", "pipeline"]
        )
        current_stage = deal_info.properties.get("dealstage")
        pipeline_id = deal_info.properties.get("pipeline")

        if not pipeline_id or not current_stage:
            continue

        # Get full pipeline to find the "Betaalt niet" stage ID
        pipeline = await call_hubspot_api(hubspot_calls.get_pipeline_by_id, pipeline_id)
        betaalt_niet_stage = next(
            (s for s in pipeline.stages if s.label == "Betaalt niet"), None
        )

        if not betaalt_niet_stage:
            logger.warning(f"No 'Betaalt niet' stage found in pipeline {pipeline_id}")
            continue

        # Store previous stage, then update to "Betaalt niet"
        await call_hubspot_api(
            hubspot_calls.update_deal_properties,
            d,
            {"vorige_stage": current_stage, "dealstage": betaalt_niet_stage.id},
        )


async def reset_all_from_betaalt_niet(deal_id: str) -> None:
    logger.info(f"Starting reset_all_from_betaalt_niet for deal_id: {deal_id}")
    company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)
    logger.debug(f"Fetched company_id: {company_id} for deal_id: {deal_id}")
    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, deal_id)
    logger.debug(f"Fetched contact_id: {contact_id} for deal_id: {deal_id}")
    company = await call_hubspot_api(
        hubspot_calls.get_company_info, company_id, properties=NEEDED_COMPANY_PROPS
    )
    contact = await call_hubspot_api(
        hubspot_calls.get_contact_info, contact_id, properties=NEEDED_CONTACT_PROPS
    )
    deals_map = await service_hubspot.fetch_all_company_deals_with_props(
        company_id, NEEDED_DEAL_PROPS
    )
    logger.debug(f"Fetched deals_map for company_id: {company_id}")

    company_deals = list(deals_map.keys())
    logger.info(f"Company deals to process: {company_deals}")

    deal_properties = build_deal_properties_map(deals_map)
    current_deal = deal_properties.get(str(deal_id), {})

    for d in company_deals:
        if str(d) == str(deal_id):
            logger.debug(f"Skipping main deal_id: {deal_id}")
            continue

        logger.info(f"Processing deal: {d}")
        deal_info = await call_hubspot_api(
            hubspot_calls.get_deal_info,
            d,
            properties=["dealstage", "vorige_stage", "pipeline", "year", "quarter"],
        )
        current_stage = deal_info.properties.get("dealstage")
        previous_stage = deal_info.properties.get("vorige_stage")
        logger.debug(
            f"Deal {d} current_stage: {current_stage}, previous_stage: {previous_stage}"
        )

        if previous_stage:
            if current_stage == previous_stage:
                logger.info(
                    f"Deal {d} is already at previous stage ({previous_stage}), skipping."
                )
                continue

        if not previous_stage:
            pipeline_id = deal_info.properties.get("pipeline")
            pipeline = await call_hubspot_api(
                hubspot_calls.get_pipeline_by_id, pipeline_id
            )
            year = deal_info.properties.get("year") or None
            quarter = deal_info.properties.get("quarter") or None
            logger.info(
                f"Finding correct previous stage for deal {d} (pipeline_id: {pipeline_id}, year: {year}, quarter: {quarter})"
            )
            previous_stage_obj = await find_correct_stage(
                int(deal_id),
                pipeline,
                year,
                company_id,
                contact_id,
                company_deals,
                company,
                current_deal,
                contact,
                deal_properties,
                quarter,
            )
            previous_stage = previous_stage_obj.id
            logger.info(f"Found starter stage for deal {d}: {previous_stage}")

        logger.info(
            f"Resetting deal {d} from stage {current_stage} to previous stage {previous_stage}"
        )
        await call_hubspot_api(
            hubspot_calls.update_deal_properties, d, {"dealstage": previous_stage}
        )
        logger.info(f"Reset deal {d} to previous stage {previous_stage}")
