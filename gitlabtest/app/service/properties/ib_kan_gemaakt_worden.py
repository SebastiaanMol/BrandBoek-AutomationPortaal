from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

import app.repository.hubspot as hubspot_calls
from app.service.operations.constants import IB_PIPELINE_ID
from app.service.operations.constants import JAARREKENING_PIPELINE_IDS
from app.service.rate_limiter import call_hubspot_api

IB_STAGE_WAITING_LABEL = "Machtiging & Typeform"
IB_STAGE_JR_READY_LABEL = "Machtiging & Typeform; JR klaar om te maken"
IB_STAGE_READY_TO_CREATE_LABEL = "IB gereed om te maken"
JR_BLOCKING_STAGE_LABELS = {
    "geen klant meer",
    "betaalt niet",
    "open*",
    "open nieuwe bedrijven",
    "maandelijkse klant",
    "maakt en levert zelf berekening",
    "zonder btw (geen jaarklant)",
    "zonder btw (jaarklant)",
    "bankkoppeling gaat niet terug tot begin jaar",
    "incomplete gegevens gestuurd",
}
HUBSPOT_BATCH_LIMIT = 100
LOONADMINISTRATIE_PIPELINE_ID = "651277"


def _normalize(value: str | None) -> str:
    return str(value or "").strip().lower()


def _stage_id_by_label(pipeline: Any, label: str) -> str | None:
    wanted = _normalize(label)
    for stage in getattr(pipeline, "stages", []) or []:
        if _normalize(getattr(stage, "label", None)) == wanted:
            return str(getattr(stage, "id", "") or "")
    return None


def _blocking_stage_ids_for_pipeline(pipeline: Any) -> set[str]:
    stage_ids: set[str] = set()
    for stage in getattr(pipeline, "stages", []) or []:
        label = _normalize(getattr(stage, "label", None))
        if label in JR_BLOCKING_STAGE_LABELS:
            stage_id = str(getattr(stage, "id", "") or "")
            if stage_id:
                stage_ids.add(stage_id)
    return stage_ids


def _chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


async def update_ib_kan_gemaakt_worden(jr_deal_id: str) -> None:
    # 'Gecontroleerd & Gefactureerd', 'Geen JR'
    VALID_JR_STAGE_IDS = {"1086340947", "1086412189", "1178979636", "1178775815"}

    logger.info(f"[IB Update] Triggered for JR deal {jr_deal_id}")

    # 1. Get Jaarrekening deal info
    jr_deal = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        jr_deal_id,
        properties=["pipeline", "dealstage", "year"],
    )

    jr_year = jr_deal.properties.get("year")
    if not jr_year:
        logger.info(
            f"[IB Update] JR deal {jr_deal_id} has no 'year' property. Skipping."
        )
        return

    # 2. Get contacts associated with this JR deal
    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, jr_deal_id)

    logger.info(f"[IB Update] Processing contact {contact_id}")

    # 3. Get all companies linked to this contact
    company_ids = await call_hubspot_api(
        hubspot_calls.get_companies_for_contact, contact_id
    )

    all_companies_pass = True

    for company_id in company_ids:
        company = await call_hubspot_api(
            hubspot_calls.get_company_info, company_id, properties=["bv_ez"]
        )
        bv_ez = company.properties.get("bv_ez")

        # 4. Get deals for this company
        company_deals = await call_hubspot_api(
            hubspot_calls.get_deals_for_company, company_id
        )

        jr_deal = None
        has_loonadmin = False

        for deal_id in company_deals:
            deal = await call_hubspot_api(
                hubspot_calls.get_deal_info,
                deal_id,
                properties=["pipeline", "dealstage", "year"],
            )

            pipeline_id = deal.properties.get("pipeline")

            if (
                pipeline_id in JAARREKENING_PIPELINE_IDS
                and deal.properties.get("year") == jr_year
            ):
                jr_deal = deal
            elif pipeline_id == LOONADMINISTRATIE_PIPELINE_ID:
                has_loonadmin = True

            # Exit early if we've found both
            if jr_deal and has_loonadmin:
                break

        if bv_ez == "EZ":
            if (
                not jr_deal
                or jr_deal.properties.get("dealstage") not in VALID_JR_STAGE_IDS
            ):
                all_companies_pass = False
                logger.info(
                    f"[IB Update] Company {company_id} (EZ) missing or invalid JR deal"
                )

        elif bv_ez == "BV":
            if not has_loonadmin:
                if (
                    not jr_deal
                    or jr_deal.properties.get("dealstage") not in VALID_JR_STAGE_IDS
                ):
                    all_companies_pass = False
                    logger.info(
                        f"[IB Update] Company {company_id} (BV) has no loonadmin and invalid JR deal"
                    )

    # 5. Find IB deal(s) for the same year for this contact
    ib_deal_ids = await call_hubspot_api(
        hubspot_calls.get_deals_for_contact, contact_id
    )
    ib_deals_info = (
        await call_hubspot_api(
            hubspot_calls.batch_get_deals_info, ib_deal_ids, ["pipeline", "year"]
        )
        if ib_deal_ids
        else []
    ) or []

    for ib_deal in ib_deals_info:
        if ib_deal.properties.get("pipeline") != IB_PIPELINE_ID:
            continue
        if ib_deal.properties.get("year") != jr_year:
            continue

        result = "true" if all_companies_pass else "false"
        await call_hubspot_api(
            hubspot_calls.update_deal_properties,
            ib_deal.id,
            properties={"jaarrekeningen_klaar_om_ib_te_maken": result},
        )
        logger.info(
            f"[IB Update] Set 'jaarrekeningen_klaar_om_ib_te_maken' = '{result}' for IB deal {ib_deal.id}"
        )


async def route_ib_deal_after_typeform_and_machtiging(
    deal_id: int | str,
    contact_id: int | str,
) -> dict[str, Any]:
    deal_id_str = str(deal_id)
    contact_id_str = str(contact_id)

    ib_deal = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        int(deal_id),
        properties=["pipeline", "dealstage", "year"],
    )
    ib_props = getattr(ib_deal, "properties", {}) or {}
    pipeline_id = str(ib_props.get("pipeline") or "")
    if pipeline_id != IB_PIPELINE_ID:
        return {
            "message": "Deal is not in the IB pipeline; no action taken.",
            "deal_id": deal_id_str,
            "pipeline": pipeline_id,
        }

    year = str(ib_props.get("year") or "").strip()
    if not year:
        return {
            "message": "IB deal has no year; no action taken.",
            "deal_id": deal_id_str,
        }

    associated_deal_ids = await call_hubspot_api(
        hubspot_calls.get_deals_for_contact,
        contact_id_str,
    )
    if not associated_deal_ids:
        return {
            "message": "No deals associated with contact; no action taken.",
            "deal_id": deal_id_str,
            "contact_id": contact_id_str,
            "year": year,
        }

    deals: list[Any] = []
    associated_ids = [str(related_deal_id) for related_deal_id in associated_deal_ids]
    for deal_id_chunk in _chunked(associated_ids, HUBSPOT_BATCH_LIMIT):
        chunk_deals = await call_hubspot_api(
            hubspot_calls.batch_get_deals_info,
            deal_id_chunk,
            ["pipeline", "dealstage", "year"],
        )
        deals.extend(chunk_deals or [])

    relevant_jr_deals = []
    for related_deal in deals:
        props = getattr(related_deal, "properties", {}) or {}
        if str(props.get("pipeline") or "") not in JAARREKENING_PIPELINE_IDS:
            continue
        if str(props.get("year") or "").strip() != year:
            continue
        relevant_jr_deals.append(related_deal)

    pipeline_cache: dict[str, Any] = {}
    blocking_stage_cache: dict[str, set[str]] = {}
    has_blocking_jr = False

    for jr_deal in relevant_jr_deals:
        props = getattr(jr_deal, "properties", {}) or {}
        jr_pipeline_id = str(props.get("pipeline") or "")
        jr_stage_id = str(props.get("dealstage") or "")
        if not jr_pipeline_id or not jr_stage_id:
            continue

        if jr_pipeline_id not in pipeline_cache:
            pipeline_cache[jr_pipeline_id] = await call_hubspot_api(
                hubspot_calls.get_pipeline_by_id,
                jr_pipeline_id,
            )
            blocking_stage_cache[jr_pipeline_id] = _blocking_stage_ids_for_pipeline(
                pipeline_cache[jr_pipeline_id]
            )

        if jr_stage_id in blocking_stage_cache.get(jr_pipeline_id, set()):
            has_blocking_jr = True
            break

    ib_pipeline = await call_hubspot_api(
        hubspot_calls.get_pipeline_by_id, IB_PIPELINE_ID
    )
    if not relevant_jr_deals:
        logger.info(
            "[IB Route] No same-year JR deals found for contact %s; routing IB deal %s to %s",
            contact_id_str,
            deal_id_str,
            IB_STAGE_READY_TO_CREATE_LABEL,
        )
        target_label = IB_STAGE_READY_TO_CREATE_LABEL
    else:
        target_label = (
            IB_STAGE_WAITING_LABEL if has_blocking_jr else IB_STAGE_JR_READY_LABEL
        )
    target_stage_id = _stage_id_by_label(ib_pipeline, target_label)
    if not target_stage_id:
        return {
            "message": f"Target IB stage '{target_label}' not found; no action taken.",
            "deal_id": deal_id_str,
            "contact_id": contact_id_str,
            "year": year,
        }

    current_stage_id = str(ib_props.get("dealstage") or "")
    if current_stage_id == target_stage_id:
        return {
            "message": "IB deal already in the correct stage.",
            "deal_id": deal_id_str,
            "contact_id": contact_id_str,
            "year": year,
            "target_stage": target_label,
            "target_stage_id": target_stage_id,
            "jr_deals_checked": len(relevant_jr_deals),
        }

    await call_hubspot_api(
        hubspot_calls.update_deal_properties,
        int(deal_id),
        {"dealstage": target_stage_id},
    )
    logger.info(
        "[IB Route] Updated IB deal %s to stage %s (%s) after checking %s JR deal(s) for contact %s",
        deal_id_str,
        target_label,
        target_stage_id,
        len(relevant_jr_deals),
        contact_id_str,
    )
    return {
        "message": "IB deal stage updated.",
        "deal_id": deal_id_str,
        "contact_id": contact_id_str,
        "year": year,
        "old_stage_id": current_stage_id,
        "new_stage_id": target_stage_id,
        "new_stage": target_label,
        "jr_deals_checked": len(relevant_jr_deals),
        "has_blocking_jr": has_blocking_jr,
    }
