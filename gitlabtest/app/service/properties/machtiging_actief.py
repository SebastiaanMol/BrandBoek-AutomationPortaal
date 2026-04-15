from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC
from datetime import date
from datetime import datetime
from typing import Any

import app.repository.hubspot as hubspot_calls
from app.service.operations.constants import IB_PIPELINE_ID
from app.service.rate_limiter import call_hubspot_api
from app.utils import props_of
from app.utils import to_int

PROP_CONTACT = "machtiging_fiscaal_online_doorlopend"
PROP_PARTNER = "fiscaal_partner_machtiging_fo_doorlopend"
PROP_DEAL = "machtiging_actief"
ACTIVE_STATUS = "geactiveerd"

LABEL_CONTACT_ACTIVE_NO_PARTNER = "Contact actief, geen partner"
LABEL_CONTACT_AND_PARTNER_ACTIVE = "Contact en Partner actief"
LABEL_CONTACT_ACTIVE_PARTNER_NOT = "Contact actief, partner niet actief"
LABEL_CONTACT_NOT_ACTIVE_PARTNER_WEL = "Contact niet actief, partner wel"
LABEL_BOTH_NOT_ACTIVE = "Beide niet actief"
LABEL_VIG_ONTVANGEN = "VIG ontvangen"

STATE_CONTACT_ACTIVE_NO_PARTNER = "contact_active_no_partner"
STATE_CONTACT_AND_PARTNER_ACTIVE = "contact_and_partner_active"
STATE_CONTACT_ACTIVE_PARTNER_NOT = "contact_active_partner_not"
STATE_PARTNER_ACTIVE_CONTACT_NOT = "partner_active_contact_not"
STATE_BOTH_NOT_ACTIVE = "both_not_active"

logger = logging.getLogger(__name__)


def _is_active_status(value: str | None) -> bool:
    return str(value or "").strip().lower() == ACTIVE_STATUS


def _is_partner_known(value: str | None) -> bool:
    v = str(value or "").strip().lower()
    return bool(v) and v not in {"onbekend", "unknown", "nvt", "niet van toepassing"}


def _extract_deal_year(props: dict[str, Any]) -> int | None:
    year = to_int(props.get("year"))
    if year:
        return year

    closedate = props.get("closedate")
    if str(closedate or "").isdigit():
        try:
            return datetime.fromtimestamp(int(str(closedate)) / 1000, tz=UTC).year
        except Exception:
            return None

    created = props.get("createdate")
    if str(created or "").isdigit():
        try:
            return datetime.fromtimestamp(int(str(created)) / 1000, tz=UTC).year
        except Exception:
            return None

    return None


def _history_entries(contact_obj: Any, property_name: str) -> list[Any]:
    container = getattr(contact_obj, "properties_with_history", None) or {}
    entries = container.get(property_name) or []
    return list(entries)


def _entry_value(entry: Any) -> str | None:
    if isinstance(entry, dict):
        return entry.get("value")
    return getattr(entry, "value", None)


def _entry_timestamp(entry: Any) -> Any:
    if isinstance(entry, dict):
        return entry.get("timestamp")
    return getattr(entry, "timestamp", None)


def _to_datetime(ts: Any) -> datetime | None:
    if ts is None:
        return None
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, date):
        return datetime(ts.year, ts.month, ts.day, tzinfo=UTC)

    s = str(ts).strip()
    if not s:
        return None

    if s.isdigit():
        try:
            return datetime.fromtimestamp(int(s) / 1000, tz=UTC)
        except Exception:
            return None

    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=UTC)
        return dt
    except Exception:
        return None


def _value_before_cutoff(
    contact_obj: Any, property_name: str, cutoff: date
) -> str | None:
    cutoff_dt = datetime(cutoff.year, cutoff.month, cutoff.day, tzinfo=UTC)
    latest: tuple[datetime, str] | None = None
    for entry in _history_entries(contact_obj, property_name):
        value = _entry_value(entry)
        dt = _to_datetime(_entry_timestamp(entry))
        if value is None or dt is None:
            continue
        if dt >= cutoff_dt:
            continue
        if latest is None or dt > latest[0]:
            latest = (dt, str(value))
    return latest[1] if latest else None


def _is_active_before_cutoff(
    contact_obj: Any, props: dict[str, Any], property_name: str, cutoff: date
) -> bool:
    value_before_cutoff = _value_before_cutoff(contact_obj, property_name, cutoff)
    return _is_active_status(value_before_cutoff)


def _state_for_effective_status(
    contact_effective_active: bool,
    partner_effective_active: bool,
    partner_known: bool,
) -> str:
    if contact_effective_active:
        if partner_known:
            if partner_effective_active:
                return STATE_CONTACT_AND_PARTNER_ACTIVE
            return STATE_CONTACT_ACTIVE_PARTNER_NOT
        return STATE_CONTACT_ACTIVE_NO_PARTNER

    if partner_known and partner_effective_active:
        return STATE_PARTNER_ACTIVE_CONTACT_NOT
    return STATE_BOTH_NOT_ACTIVE


def _extract_options(property_meta: dict[str, Any]) -> list[dict[str, str]]:
    opts = property_meta.get("options") or []
    clean: list[dict[str, str]] = []
    for o in opts:
        label = str(o.get("label") or "").strip()
        value = str(o.get("value") or "").strip()
        if label and value:
            clean.append({"label": label, "value": value})
    return clean


def _find_value_by_exact_label(options: list[dict[str, str]], label: str) -> str | None:
    wanted = label.strip().lower()
    for o in options:
        if o["label"].strip().lower() == wanted:
            return o["value"]
    return None


def _find_value_by_predicate(
    options: list[dict[str, str]], predicate: Callable[[str], bool]
) -> str | None:
    for o in options:
        if predicate(o["label"].strip().lower()):
            return o["value"]
    return None


def _resolve_target_value(
    state: str,
    options: list[dict[str, str]],
    current_value: str | None,
) -> str | None:
    active_values = {
        _find_value_by_exact_label(options, LABEL_CONTACT_ACTIVE_NO_PARTNER),
        _find_value_by_exact_label(options, LABEL_CONTACT_AND_PARTNER_ACTIVE),
    }
    active_values.discard(None)

    if state == STATE_CONTACT_ACTIVE_NO_PARTNER:
        return _find_value_by_exact_label(options, LABEL_CONTACT_ACTIVE_NO_PARTNER)

    if state == STATE_CONTACT_AND_PARTNER_ACTIVE:
        return _find_value_by_exact_label(options, LABEL_CONTACT_AND_PARTNER_ACTIVE)

    if state == STATE_CONTACT_ACTIVE_PARTNER_NOT:
        value = _find_value_by_exact_label(options, LABEL_CONTACT_ACTIVE_PARTNER_NOT)
        if value:
            return value
        value = _find_value_by_predicate(
            options,
            lambda label: (
                "contact actief" in label
                and "partner" in label
                and "niet actief" in label
            ),
        )
        if value:
            return value

    if state == STATE_PARTNER_ACTIVE_CONTACT_NOT:
        value = _find_value_by_exact_label(
            options, LABEL_CONTACT_NOT_ACTIVE_PARTNER_WEL
        )
        if value:
            return value
        value = _find_value_by_predicate(
            options,
            lambda label: (
                "contact niet actief" in label
                and ("partner wel" in label or "partner actief" in label)
            ),
        )
        if value:
            return value

    value = _find_value_by_exact_label(options, LABEL_BOTH_NOT_ACTIVE)
    if value:
        return value

    value = _find_value_by_predicate(
        options,
        lambda label: "beide" in label and "niet actief" in label,
    )
    if value:
        return value

    value = _find_value_by_predicate(
        options,
        lambda label: (
            "niet actief" in label
            and _find_value_by_exact_label(options, label) not in active_values
        ),
    )
    if value:
        return value

    # Final fallback: if already non-active, keep it. Otherwise clear the property.
    if current_value and current_value not in active_values:
        return current_value
    return ""


def _is_vig_ontvangen_current_value(
    current_value: str, options: list[dict[str, str]]
) -> bool:
    v = str(current_value or "").strip().lower()
    if not v:
        return False
    if v == LABEL_VIG_ONTVANGEN.lower():
        return True
    vig_option_value = _find_value_by_exact_label(options, LABEL_VIG_ONTVANGEN)
    return bool(vig_option_value and v == vig_option_value.strip().lower())


async def sync_ib_deal_machtiging_actief(deal_id: int | str) -> dict[str, Any]:
    deal = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        int(deal_id),
        properties=["pipeline", "year", "closedate", "createdate", PROP_DEAL],
    )
    deal_props = props_of(deal)
    pipeline_id = str(deal_props.get("pipeline") or "").strip()
    if pipeline_id != IB_PIPELINE_ID:
        logger.info(
            "[machtiging_actief] Skip deal=%s: pipeline=%s is not IB (%s)",
            deal_id,
            pipeline_id,
            IB_PIPELINE_ID,
        )
        return {
            "message": "Deal is not in IB pipeline; no action taken.",
            "deal_id": str(deal_id),
            "pipeline": pipeline_id,
        }

    deal_year = _extract_deal_year(deal_props)
    if not deal_year:
        logger.info(
            "[machtiging_actief] Skip deal=%s: could not determine deal year", deal_id
        )
        return {
            "message": "Deal year could not be determined; no action taken.",
            "deal_id": str(deal_id),
        }
    cutoff = date(deal_year, 12, 1)
    logger.info(
        "[machtiging_actief] Start deal=%s year=%s cutoff=%s",
        deal_id,
        deal_year,
        cutoff.isoformat(),
    )

    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, int(deal_id))
    contact = await call_hubspot_api(
        hubspot_calls.get_contact_info_with_history,
        int(contact_id),
        [PROP_CONTACT, PROP_PARTNER],
        [PROP_CONTACT, PROP_PARTNER],
    )
    contact_props = props_of(contact)
    partner_raw = contact_props.get(PROP_PARTNER)
    partner_known = _is_partner_known(partner_raw)

    contact_value_before_cutoff = _value_before_cutoff(contact, PROP_CONTACT, cutoff)
    partner_value_before_cutoff = _value_before_cutoff(contact, PROP_PARTNER, cutoff)

    contact_effective_active = _is_active_before_cutoff(
        contact, contact_props, PROP_CONTACT, cutoff
    )
    partner_effective_active = partner_known and _is_active_before_cutoff(
        contact, contact_props, PROP_PARTNER, cutoff
    )
    state = _state_for_effective_status(
        contact_effective_active=contact_effective_active,
        partner_effective_active=partner_effective_active,
        partner_known=partner_known,
    )
    logger.info(
        "[machtiging_actief] deal=%s contact=%s before_cutoff contact=%r partner=%r partner_known=%s state=%s",
        deal_id,
        contact_id,
        contact_value_before_cutoff,
        partner_value_before_cutoff,
        partner_known,
        state,
    )

    property_meta = await call_hubspot_api(
        hubspot_calls.get_property, "deals", PROP_DEAL
    )
    options = _extract_options(property_meta)
    current_value = str(deal_props.get(PROP_DEAL) or "")
    if _is_vig_ontvangen_current_value(current_value, options):
        logger.info(
            "[machtiging_actief] Skip deal=%s: current value is VIG ontvangen", deal_id
        )
        return {
            "message": "Current machtiging_actief is 'VIG ontvangen'; no action taken.",
            "deal_id": str(deal_id),
            "value": current_value,
        }

    target_value = _resolve_target_value(state, options, current_value)
    if target_value is None:
        logger.warning(
            "Could not resolve target value for deal %s state=%s options=%s",
            deal_id,
            state,
            [o["label"] for o in options],
        )
        return {
            "message": "Could not resolve a target machtiging value; no action taken.",
            "deal_id": str(deal_id),
            "state": state,
        }

    if current_value == target_value:
        logger.info(
            "[machtiging_actief] deal=%s unchanged current=%r target=%r state=%s",
            deal_id,
            current_value,
            target_value,
            state,
        )
        return {
            "message": "machtiging_actief already up to date.",
            "deal_id": str(deal_id),
            "value": target_value,
            "state": state,
            "cutoff": cutoff.isoformat(),
        }

    await call_hubspot_api(
        hubspot_calls.update_deal_properties,
        int(deal_id),
        {PROP_DEAL: target_value},
    )
    logger.info(
        "[machtiging_actief] deal=%s updated old=%r new=%r state=%s",
        deal_id,
        current_value,
        target_value,
        state,
    )
    return {
        "message": "machtiging_actief updated.",
        "deal_id": str(deal_id),
        "old_value": current_value,
        "new_value": target_value,
        "state": state,
        "cutoff": cutoff.isoformat(),
    }


async def sync_contact_ib_deals_machtiging_actief(
    contact_id: int | str,
) -> dict[str, Any]:
    """
    Contact-driven sync:
    1) Fetch all deals for the contact first.
    2) Filter IB deals.
    3) Recompute machtiging_actief for each IB deal.
    """
    deal_ids = await call_hubspot_api(
        hubspot_calls.get_deals_for_contact, str(contact_id)
    )
    if not deal_ids:
        return {
            "message": "No deals associated with contact; no action taken.",
            "contact_id": str(contact_id),
            "ib_deals_found": 0,
        }

    deals = (
        await call_hubspot_api(
            hubspot_calls.batch_get_deals_info,
            deal_ids,
            ["pipeline"],
        )
        or []
    )
    ib_deal_ids = [
        str(getattr(d, "id", ""))
        for d in deals
        if str(props_of(d).get("pipeline") or "") == IB_PIPELINE_ID
    ]
    ib_deal_ids = [d for d in ib_deal_ids if d]

    if not ib_deal_ids:
        return {
            "message": "No IB deals associated with contact; no action taken.",
            "contact_id": str(contact_id),
            "ib_deals_found": 0,
        }

    results = []
    updated = 0
    skipped_vig = 0
    errors = 0

    for did in ib_deal_ids:
        try:
            result = await sync_ib_deal_machtiging_actief(did)
            results.append(result)
            msg = str(result.get("message") or "").lower()
            if "updated" in msg:
                updated += 1
            if "vig ontvangen" in msg:
                skipped_vig += 1
        except Exception as exc:
            errors += 1
            logger.exception(
                "Failed syncing machtiging_actief for IB deal %s (contact %s)",
                did,
                contact_id,
            )
            results.append({"deal_id": did, "error": str(exc)})

    return {
        "message": "Processed IB deals for contact.",
        "contact_id": str(contact_id),
        "ib_deals_found": len(ib_deal_ids),
        "updated": updated,
        "skipped_vig_ontvangen": skipped_vig,
        "errors": errors,
        "results": results,
    }
