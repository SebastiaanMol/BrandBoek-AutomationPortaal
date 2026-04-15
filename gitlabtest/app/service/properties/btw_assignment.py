from __future__ import annotations

import logging
from typing import Any

import app.repository.hubspot as hubspot_calls
from app.service.rate_limiter import call_hubspot_api

logger = logging.getLogger(__name__)

BTW_PIPELINE_IDS = {"759381020"}
BTW_FINISHED_STAGE_IDS = {
    "1162621605",
    "1162621606",
}  # Factuur en mail verzonden, Extra vragen/opmerkingen van klant
BTW_ASSIGNMENT_PROPS = [
    "pipeline",
    "dealstage",
    "year",
    "quarter",
    "controleur",
    "hubspot_owner_id",
]


def _props_of(item: Any) -> dict[str, Any]:
    return getattr(item, "properties", None) or (
        item.get("properties", {}) if isinstance(item, dict) else {}
    )


def _normalize_assignment(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _quarter_key(year: Any, quarter: Any) -> tuple[int, int] | None:
    try:
        year_int = int(str(year))
    except (TypeError, ValueError):
        return None

    quarter_raw = str(quarter or "").strip().upper()
    if quarter_raw.startswith("Q"):
        quarter_raw = quarter_raw[1:]

    try:
        quarter_int = int(quarter_raw)
    except (TypeError, ValueError):
        return None

    if quarter_int not in {1, 2, 3, 4}:
        return None
    return year_int, quarter_int


def find_latest_btw_assignment(
    deals_map: dict[str, Any],
    target_year: Any,
    target_quarter: Any,
    *,
    exclude_deal_id: str | None = None,
) -> dict[str, str | None] | None:
    target_key = _quarter_key(target_year, target_quarter)
    if target_key is None:
        return None

    latest_key: tuple[int, int] | None = None
    latest_assignment: dict[str, str | None] | None = None

    for deal_id, obj in deals_map.items():
        if exclude_deal_id is not None and str(deal_id) == str(exclude_deal_id):
            continue

        props = _props_of(obj)
        if str(props.get("pipeline") or "") not in BTW_PIPELINE_IDS:
            continue

        candidate_key = _quarter_key(props.get("year"), props.get("quarter"))
        if candidate_key is None or candidate_key >= target_key:
            continue

        if str(props.get("dealstage") or "") not in BTW_FINISHED_STAGE_IDS:
            continue

        controleur = _normalize_assignment(props.get("controleur"))
        hubspot_owner_id = _normalize_assignment(props.get("hubspot_owner_id"))
        if not controleur and not hubspot_owner_id:
            continue

        if latest_key is None or candidate_key > latest_key:
            latest_key = candidate_key
            latest_assignment = {
                "deal_id": str(deal_id),
                "controleur": controleur,
                "hubspot_owner_id": hubspot_owner_id,
            }

    return latest_assignment


async def sync_future_btw_assignments_from_finished_deal(
    deal_id: int | str,
) -> dict[str, Any]:
    source_deal = await call_hubspot_api(
        hubspot_calls.get_deal_info, deal_id, properties=BTW_ASSIGNMENT_PROPS
    )
    source_props = getattr(source_deal, "properties", {}) or {}

    pipeline_id = str(source_props.get("pipeline") or "")
    if pipeline_id not in BTW_PIPELINE_IDS:
        return {
            "ok": True,
            "deal_id": str(deal_id),
            "message": "Deal is not in a BTW pipeline; no action taken.",
        }

    source_key = _quarter_key(source_props.get("year"), source_props.get("quarter"))
    if source_key is None:
        return {
            "ok": True,
            "deal_id": str(deal_id),
            "message": "Deal is missing a valid year/quarter; no action taken.",
        }

    controleur = _normalize_assignment(source_props.get("controleur"))
    hubspot_owner_id = _normalize_assignment(source_props.get("hubspot_owner_id"))
    if not controleur and not hubspot_owner_id:
        return {
            "ok": True,
            "deal_id": str(deal_id),
            "message": "Finished BTW deal has no controleur or owner to propagate.",
        }

    import app.service.operations.hubspot as service_hubspot

    company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)
    deals_map = await service_hubspot.fetch_all_company_deals_with_props(
        company_id, BTW_ASSIGNMENT_PROPS
    )

    updated_deals: list[str] = []
    for other_deal_id, obj in deals_map.items():
        if str(other_deal_id) == str(deal_id):
            continue

        props = _props_of(obj)
        if str(props.get("pipeline") or "") not in BTW_PIPELINE_IDS:
            continue

        other_key = _quarter_key(props.get("year"), props.get("quarter"))
        if other_key is None or other_key <= source_key:
            continue

        update_props: dict[str, str] = {}
        if controleur and _normalize_assignment(props.get("controleur")) != controleur:
            update_props["controleur"] = controleur
        if (
            hubspot_owner_id
            and _normalize_assignment(props.get("hubspot_owner_id")) != hubspot_owner_id
        ):
            update_props["hubspot_owner_id"] = hubspot_owner_id

        if not update_props:
            continue

        await call_hubspot_api(
            hubspot_calls.update_deal_properties, other_deal_id, update_props
        )
        updated_deals.append(str(other_deal_id))

    logger.info(
        "Propagated BTW assignments from deal %s to %d future BTW deal(s) for company %s",
        deal_id,
        len(updated_deals),
        company_id,
    )
    return {
        "ok": True,
        "deal_id": str(deal_id),
        "company_id": str(company_id),
        "updated_count": len(updated_deals),
        "updated_deals": updated_deals,
    }
