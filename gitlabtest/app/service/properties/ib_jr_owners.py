from __future__ import annotations

import logging
from collections import defaultdict
from typing import Any

import app.repository.hubspot as hubspot_calls
from app.exceptions import HubSpotNotFoundError
from app.service.operations.constants import IB_PIPELINE_ID
from app.service.operations.constants import JAARREKENING_PIPELINE_IDS
from app.service.rate_limiter import call_hubspot_api

logger = logging.getLogger(__name__)

# Internal name of the HubSpot deal property on the IB deal that should show the
# JR owners. This is a multi-checkbox property whose options are a planning subset
# of the JR users.
IB_JR_OWNER_SUMMARY_PROPERTY = "jr_boekers"
HUBSPOT_BATCH_LIMIT = 100


def _chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[index : index + size] for index in range(0, len(items), size)]


def _owner_display_name(owner: Any) -> str:
    first_name = str(getattr(owner, "first_name", "") or "").strip()
    last_name = str(getattr(owner, "last_name", "") or "").strip()
    full_name = f"{first_name} {last_name}".strip()
    if full_name:
        return full_name

    email = str(getattr(owner, "email", "") or "").strip()
    if email:
        return email

    return str(getattr(owner, "id", "") or "Onbekend")


async def _get_allowed_owner_options() -> dict[str, tuple[str, str]]:
    property_meta = await call_hubspot_api(
        hubspot_calls.get_property, "deals", IB_JR_OWNER_SUMMARY_PROPERTY
    )
    raw_options = property_meta.get("options", []) or []
    option_by_value = {
        str(option.get("value") or "").strip(): str(
            option.get("label") or option.get("value") or ""
        ).strip()
        for option in raw_options
        if str(option.get("value") or "").strip()
    }
    option_value_by_label = {
        label.lower(): value for value, label in option_by_value.items() if label
    }

    owners = await call_hubspot_api(hubspot_calls.get_active_owners)
    allowed_owner_options: dict[str, tuple[str, str]] = {}
    for owner in owners or []:
        owner_id = str(getattr(owner, "id", "") or "").strip()
        if not owner_id:
            continue

        display_name = _owner_display_name(owner)
        if owner_id in option_by_value:
            allowed_owner_options[owner_id] = (owner_id, option_by_value[owner_id])
            continue

        option_value = option_value_by_label.get(display_name.lower())
        if option_value:
            allowed_owner_options[owner_id] = (option_value, display_name)

    return allowed_owner_options


async def _get_contact_id_for_deal(deal_id: str) -> str | None:
    try:
        contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, deal_id)
    except HubSpotNotFoundError:
        logger.info("[IB-JR-OWNERS] Deal %s has no associated contact", deal_id)
        return None

    return str(contact_id)


async def _build_jr_owner_summary(contact_id: str, year: str) -> dict[str, Any]:
    company_ids = await call_hubspot_api(
        hubspot_calls.get_companies_for_contact, contact_id
    )
    company_ids = [str(company_id) for company_id in company_ids if str(company_id)]
    if not company_ids:
        return {
            "property_value": "",
            "owner_names": [],
            "companies": 0,
            "matched_jr_deals": 0,
            "owners": 0,
        }

    companies = await call_hubspot_api(
        hubspot_calls.batch_get_companies_info, company_ids, ["name"]
    )
    company_names = {
        str(company.id): str(
            getattr(company, "properties", {}).get("name") or company.id
        )
        for company in companies or []
    }

    all_deal_ids: set[str] = set()
    company_to_deal_ids: dict[str, set[str]] = {}
    for company_id in company_ids:
        deal_ids = await call_hubspot_api(
            hubspot_calls.get_deals_for_company, company_id
        )
        normalized_deal_ids = {
            str(deal_id) for deal_id in deal_ids or [] if str(deal_id)
        }
        company_to_deal_ids[company_id] = normalized_deal_ids
        all_deal_ids.update(normalized_deal_ids)

    if not all_deal_ids:
        return {
            "property_value": "",
            "owner_names": [],
            "companies": len(company_ids),
            "matched_jr_deals": 0,
            "owners": 0,
        }

    deals: list[Any] = []
    for deal_id_chunk in _chunked(sorted(all_deal_ids), HUBSPOT_BATCH_LIMIT):
        chunk_deals = await call_hubspot_api(
            hubspot_calls.batch_get_deals_info,
            deal_id_chunk,
            ["pipeline", "year", "hubspot_owner_id"],
        )
        deals.extend(chunk_deals or [])
    jr_deals_by_company: dict[str, list[Any]] = defaultdict(list)
    for deal in deals or []:
        props = getattr(deal, "properties", {}) or {}
        if str(props.get("pipeline") or "") not in JAARREKENING_PIPELINE_IDS:
            continue
        if str(props.get("year") or "") != year:
            continue

        deal_id = str(getattr(deal, "id", "") or "")
        if not deal_id:
            continue

        for company_id, company_deal_ids in company_to_deal_ids.items():
            if deal_id in company_deal_ids:
                jr_deals_by_company[company_id].append(deal)

    owner_cache: dict[str, str] = {}
    selected_option_values: set[str] = set()
    matched_jr_deals = 0
    skipped_owner_ids: set[str] = set()
    allowed_owner_options = await _get_allowed_owner_options()

    for company_id in sorted(
        jr_deals_by_company,
        key=lambda cid: str(company_names.get(cid) or cid).lower(),
    ):
        for deal in jr_deals_by_company[company_id]:
            matched_jr_deals += 1
            owner_id = str(
                (getattr(deal, "properties", {}) or {}).get("hubspot_owner_id") or ""
            ).strip()
            if not owner_id:
                continue

            if owner_id not in allowed_owner_options:
                logger.warning(
                    "[IB-JR-OWNERS] Skipping owner %s on JR deal %s because it is not an allowed value for %s",
                    owner_id,
                    getattr(deal, "id", None),
                    IB_JR_OWNER_SUMMARY_PROPERTY,
                )
                skipped_owner_ids.add(owner_id)
                continue

            option_value, owner_label = allowed_owner_options[owner_id]
            owner_cache[owner_id] = owner_label
            selected_option_values.add(option_value)

    return {
        "property_value": ";".join(sorted(selected_option_values)),
        "owner_names": sorted({owner_cache[owner_id] for owner_id in owner_cache}),
        "companies": len(company_ids),
        "matched_jr_deals": matched_jr_deals,
        "owners": len(selected_option_values),
        "skipped_owners": len(skipped_owner_ids),
    }


async def sync_ib_jr_owner_summary(ib_deal_id: str) -> dict[str, Any]:
    ib_deal = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        ib_deal_id,
        properties=["pipeline", "year"],
    )
    if str(ib_deal.properties.get("pipeline") or "") != IB_PIPELINE_ID:
        logger.info("[IB-JR-OWNERS] Deal %s is not an IB deal", ib_deal_id)
        return {"updated": False, "reason": "not_ib_pipeline", "property_value": ""}

    year = str(ib_deal.properties.get("year") or "").strip()
    if not year:
        logger.info("[IB-JR-OWNERS] IB %s has no year", ib_deal_id)
        await call_hubspot_api(
            hubspot_calls.update_deal_properties,
            ib_deal_id,
            properties={IB_JR_OWNER_SUMMARY_PROPERTY: ""},
        )
        return {"updated": True, "reason": "missing_year", "property_value": ""}

    contact_id = await _get_contact_id_for_deal(ib_deal_id)
    if not contact_id:
        await call_hubspot_api(
            hubspot_calls.update_deal_properties,
            ib_deal_id,
            properties={IB_JR_OWNER_SUMMARY_PROPERTY: ""},
        )
        return {"updated": True, "reason": "missing_contact", "property_value": ""}

    result = await _build_jr_owner_summary(contact_id, year)
    await call_hubspot_api(
        hubspot_calls.update_deal_properties,
        ib_deal_id,
        properties={IB_JR_OWNER_SUMMARY_PROPERTY: result["property_value"]},
    )
    logger.info(
        "[IB-JR-OWNERS] IB %s owners updated to %r",
        ib_deal_id,
        result["property_value"],
    )
    return {"updated": True, **result}


async def sync_related_ib_jr_owner_summaries_from_jr(
    jr_deal_id: str,
) -> dict[str, Any]:
    jr_deal = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        jr_deal_id,
        properties=["pipeline", "year"],
    )
    if str(jr_deal.properties.get("pipeline") or "") not in JAARREKENING_PIPELINE_IDS:
        logger.info("[IB-JR-OWNERS] Deal %s is not a JR deal", jr_deal_id)
        return {"updated_ib_deals": 0, "reason": "not_jr_pipeline"}

    year = str(jr_deal.properties.get("year") or "").strip()
    if not year:
        logger.info("[IB-JR-OWNERS] JR %s has no year", jr_deal_id)
        return {"updated_ib_deals": 0, "reason": "missing_year"}

    contact_id = await _get_contact_id_for_deal(jr_deal_id)
    if not contact_id:
        return {"updated_ib_deals": 0, "reason": "missing_contact"}

    deal_ids = await call_hubspot_api(hubspot_calls.get_deals_for_contact, contact_id)
    deal_ids = [str(deal_id) for deal_id in deal_ids or [] if str(deal_id)]
    if not deal_ids:
        return {"updated_ib_deals": 0, "reason": "no_contact_deals"}

    deals: list[Any] = []
    for deal_id_chunk in _chunked(deal_ids, HUBSPOT_BATCH_LIMIT):
        chunk_deals = await call_hubspot_api(
            hubspot_calls.batch_get_deals_info,
            deal_id_chunk,
            ["pipeline", "year"],
        )
        deals.extend(chunk_deals or [])

    updated_ib_deals = 0
    for deal in deals or []:
        props = getattr(deal, "properties", {}) or {}
        if str(props.get("pipeline") or "") != IB_PIPELINE_ID:
            continue
        if str(props.get("year") or "") != year:
            continue

        await sync_ib_jr_owner_summary(str(deal.id))
        updated_ib_deals += 1

    return {"updated_ib_deals": updated_ib_deals, "reason": "ok"}
