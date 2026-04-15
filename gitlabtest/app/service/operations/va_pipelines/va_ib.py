from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import logging
import os
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

import app.repository.hubspot as hubspot_calls
from app.service.operations.constants import (
    BTW_CONTROLE_PIPELINE_IDS as BTW_PIPELINE_IDS,
)
from app.service.operations.constants import IB_PIPELINE_ID
from app.service.operations.constants import VA_IB_PIPELINE_ID
from app.service.operations.find_correct_stage import stage_by_label
from app.service.operations.va_pipelines import utils as va_utils
from app.service.rate_limiter import api_worker
from app.service.rate_limiter import call_hubspot_api
from app.utils import props_of
from app.utils import result_after as _result_after

logger = logging.getLogger(__name__)

# --- Static HubSpot references ------------------------------------------------
BTW_LAST_QUARTER = "Q4"
ALLOWED_MACHTIGING_VALUES = {
    "Contact actief, geen partner",
    "Contact en Partner actief",
}
IB_STAGE_LABEL_DONE = "Akkoord en ingediend"
VA_STAGE_LABEL_READY = "Klaar voor IB"
VA_STAGE_LABEL_INGEDIEND = "IB ingediend"
REQUIRED_BTW_QUARTER_FLAGS = {
    "Q1 geboekt",
    "Q2 geboekt",
    "Q3 geboekt",
    "Q4 geboekt",
}
CONTACT_ASSOCIATION_TYPE_ID = 3  # HubSpot defined contact<->deal association

# --- Runtime configuration ----------------------------------------------------
VA_IB_STAGE_ID = "1224177961"
VA_IB_DEALNAME_PREFIX = "Voorlopige Aanslag IB"
ALLOW_CONTACTS_WITHOUT_EZ = os.getenv(
    "VA_IB_ALLOW_EMPTY_EZ", "false"
).strip().lower() in {"1", "true", "yes"}
BATCH_SIZE = int(os.getenv("VA_IB_BATCH_SIZE", "80"))
CONTACT_PROPERTY_LIST = ["firstname", "lastname", "email", "jaarklant"]
COMPANY_PROPERTY_LIST = ["bv_ez", "bedrijfsvorm", "bankkoppeling_status"]
CONTACT_PREREQ_PROP = "jaarklant"
ALLOWED_BEDRIJFSVORM = {
    "Eenmanszaak/ZZP",
    "VOF/Maatschap",
    "Inkomstenbelasting Aangifte / Particulier",
}
ALLOWED_BANK_STATUS = {"Actief", "Verloopt binnenkort"}
BTW_COMPANY_CHUNK_SIZE = int(os.getenv("VA_IB_BTW_COMPANY_CHUNK", "50"))
_result_list = va_utils.result_list
_result_props = va_utils.result_props
_result_id = va_utils.result_id
_chunked = va_utils.chunked
_normalize_kwartalen = va_utils.normalize_kwartalen


@dataclass
class IBCandidate:
    deal_id: str
    contact_id: str | None
    year: str
    dealname: str
    owner_id: str | None
    machtiging_status: str | None
    klaar_om_ib: str | None
    typeform_ingevuld: str | None
    ib_dealstage: str | None


# --------------------------------------------------------------------------- #
# Helper utilities
# --------------------------------------------------------------------------- #


def _ensure_config(pipeline_id: str | None, stage_id: str | None) -> tuple[str, str]:
    pid = pipeline_id or VA_IB_PIPELINE_ID
    sid = stage_id or VA_IB_STAGE_ID
    if not pid or not sid:
        msg = "VA_IB_PIPELINE_ID and VA_IB_STAGE_ID must be configured (env or function args)."
        raise RuntimeError(msg)
    return pid, sid


def _contact_display_name(contact: Any, contact_id: str) -> str:
    props = va_utils.result_props(contact)
    first = (props.get("firstname") or "").strip()
    last = (props.get("lastname") or "").strip()
    if first or last:
        return " ".join(part for part in [first, last] if part)
    return f"Contact {contact_id}"


def _build_dealname(contact: Any, contact_id: str, year: str) -> str:
    prefix = VA_IB_DEALNAME_PREFIX
    name = _contact_display_name(contact, contact_id)
    return f"{prefix} {year} - {name}"


async def _load_existing_va_pairs(year: str, pipeline_id: str) -> set[tuple[str, str]]:
    existing: set[tuple[str, str]] = set()
    after: str | None = None
    body = {
        "filter_groups": [
            {
                "filters": [
                    {
                        "propertyName": "pipeline",
                        "operator": "EQ",
                        "value": pipeline_id,
                    },
                    {"propertyName": "year", "operator": "EQ", "value": year},
                ]
            }
        ],
        "properties": [],
        "limit": 100,
    }

    search_calls = 0
    while True:
        search_calls += 1
        if after:
            body["after"] = after
        elif "after" in body:
            body.pop("after")

        resp = await call_hubspot_api(hubspot_calls.search_deals, body)
        page_results = va_utils.result_list(resp)
        deal_ids = [va_utils.result_id(raw) for raw in page_results]
        if deal_ids:
            contact_map = await call_hubspot_api(
                hubspot_calls.batch_get_contacts_for_deals, deal_ids
            )
            for contacts in contact_map.values():
                for contact_id in contacts or []:
                    if contact_id:
                        existing.add((contact_id, year))

        after = _result_after(resp)
        if not after:
            break

    logger.info(
        "[VA-IB] Existing VA search calls=%s pairs=%s", search_calls, len(existing)
    )
    return existing


async def _load_btw_completion_map(
    year: str, target_company_ids: set[str]
) -> dict[str, bool]:
    ready: dict[str, bool] = {}
    if not target_company_ids:
        return ready

    company_list = [str(cid) for cid in target_company_ids if cid]
    search_calls = 0

    for chunk in va_utils.chunked(company_list, BTW_COMPANY_CHUNK_SIZE):
        if not chunk:
            continue

        filters = [
            {
                "propertyName": "pipeline",
                "operator": "IN",
                "values": list(BTW_PIPELINE_IDS),
            },
            {"propertyName": "year", "operator": "EQ", "value": year},
            {"propertyName": "quarter", "operator": "EQ", "value": "Q4"},
            {"propertyName": "associations.company", "operator": "IN", "values": chunk},
        ]

        body = {
            "filter_groups": [{"filters": filters}],
            "properties": ["geboekte_kwartalen"],
            "limit": 100,
        }

        resp = await call_hubspot_api(hubspot_calls.search_deals, body)
        search_calls += 1
        page_results = va_utils.result_list(resp)
        if not page_results:
            continue

        deal_ids = [va_utils.result_id(raw) for raw in page_results]
        company_map = await call_hubspot_api(
            hubspot_calls.batch_get_companies_for_deals, deal_ids
        )
        props_map: dict[str, dict[str, Any]] = {}
        for raw in page_results:
            props_map[va_utils.result_id(raw)] = va_utils.result_props(raw)

        for deal_id, companies in company_map.items():
            props = props_map.get(deal_id, {})
            booked = va_utils.normalize_kwartalen(props.get("geboekte_kwartalen"))
            full = REQUIRED_BTW_QUARTER_FLAGS.issubset(booked)
            for company_id in companies or []:
                if company_id not in target_company_ids:
                    continue
                if company_id not in ready:
                    ready[company_id] = full
                logger.debug(
                    "[VA-IB] BTW readiness company=%s deal=%s booked=%s full=%s",
                    company_id,
                    deal_id,
                    booked,
                    full,
                )

        if len(ready) == len(target_company_ids):
            break

    logger.info(
        "[VA-IB] BTW readiness chunk searches=%s resolved=%s/%s (chunk_size=%s)",
        search_calls,
        len(ready),
        len(target_company_ids),
        BTW_COMPANY_CHUNK_SIZE,
    )
    return ready


async def handle_ib_prereq_change(ib_deal_id: int | str) -> dict[str, Any]:
    """
    When IB prereq properties change, move the VA IB deal to 'Klaar voor IB'
    if all prereqs are met and the VA deal is currently 'Open'.
    """
    ib_info = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        ib_deal_id,
        properties=[
            "year",
            "machtiging_actief",
            "jaarrekeningen_klaar_om_ib_te_maken",
            "ib_typeform_ingevuld",
            "dealstage",
        ],
    )
    ib_props = props_of(ib_info)
    year = str(ib_props.get("year") or "").strip()
    if not year:
        return {"message": "IB deal missing year; no action taken."}

    prereqs_met = (
        ib_props.get("machtiging_actief") in ALLOWED_MACHTIGING_VALUES
        and str(ib_props.get("jaarrekeningen_klaar_om_ib_te_maken") or "").lower()
        == "true"
        and str(ib_props.get("ib_typeform_ingevuld") or "").lower() == "true"
    )
    if not prereqs_met:
        return {"message": "IB prereqs not met; no action taken."}

    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, ib_deal_id)

    body = {
        "filter_groups": [
            {
                "filters": [
                    {
                        "propertyName": "pipeline",
                        "operator": "EQ",
                        "value": VA_IB_PIPELINE_ID,
                    },
                    {"propertyName": "year", "operator": "EQ", "value": year},
                    {
                        "propertyName": "associations.contact",
                        "operator": "EQ",
                        "value": str(contact_id),
                    },
                ]
            }
        ],
        "properties": ["dealstage"],
        "limit": 1,
    }
    resp = await call_hubspot_api(hubspot_calls.search_deals, body)
    results = _result_list(resp)
    if not results:
        return {"message": "No VA IB deal found for contact/year; no action taken."}

    va_deal = results[0]
    va_props = props_of(va_deal)
    current_stage = str(va_props.get("dealstage") or "")
    va_id = _result_id(va_deal)
    if not va_id:
        return {"message": "VA IB deal missing id; no action taken."}

    va_pipeline = await call_hubspot_api(
        hubspot_calls.get_pipeline_by_id, VA_IB_PIPELINE_ID
    )
    stage_open = stage_by_label(va_pipeline, "Open")
    stage_ready = stage_by_label(va_pipeline, "Klaar voor IB")
    if not stage_ready:
        return {"message": "Target stage 'Klaar voor IB' not found; no action taken."}

    if stage_open and current_stage and current_stage != str(stage_open.id):
        return {"message": "VA IB deal not in 'Open'; no action taken."}

    await call_hubspot_api(
        hubspot_calls.update_deal_properties,
        va_id,
        {"dealstage": str(stage_ready.id)},
    )
    return {"message": f"VA IB deal {va_id} moved to 'Klaar voor IB'."}


async def handle_ib_finished(ib_deal_id: int | str) -> dict[str, Any]:
    """
    When the IB deal is finished, move the VA IB deal to 'IB ingediend'.
    """
    ib_info = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        ib_deal_id,
        properties=["year"],
    )
    ib_props = props_of(ib_info)
    year = str(ib_props.get("year") or "").strip()
    if not year:
        return {"message": "IB deal missing year; no action taken."}

    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, ib_deal_id)

    body = {
        "filter_groups": [
            {
                "filters": [
                    {
                        "propertyName": "pipeline",
                        "operator": "EQ",
                        "value": VA_IB_PIPELINE_ID,
                    },
                    {"propertyName": "year", "operator": "EQ", "value": year},
                    {
                        "propertyName": "associations.contact",
                        "operator": "EQ",
                        "value": str(contact_id),
                    },
                ]
            }
        ],
        "properties": ["dealstage"],
        "limit": 1,
    }
    resp = await call_hubspot_api(hubspot_calls.search_deals, body)
    results = _result_list(resp)
    if not results:
        return {"message": "No VA IB deal found for contact/year; no action taken."}

    va_deal = results[0]
    va_props = props_of(va_deal)
    current_stage = str(va_props.get("dealstage") or "")
    va_id = _result_id(va_deal)
    if not va_id:
        return {"message": "VA IB deal missing id; no action taken."}

    va_pipeline = await call_hubspot_api(
        hubspot_calls.get_pipeline_by_id, VA_IB_PIPELINE_ID
    )
    stage_ingediend = stage_by_label(va_pipeline, VA_STAGE_LABEL_INGEDIEND)
    if not stage_ingediend:
        return {"message": "Target stage 'IB ingediend' not found; no action taken."}

    if current_stage == str(stage_ingediend.id):
        return {"message": "VA IB deal already at 'IB ingediend'."}

    await call_hubspot_api(
        hubspot_calls.update_deal_properties,
        va_id,
        {"dealstage": str(stage_ingediend.id)},
    )
    return {"message": f"VA IB deal {va_id} moved to 'IB ingediend'."}


async def handle_va_ib_finished(va_deal_id: int | str) -> dict[str, Any]:
    """
    When VA IB deal is finished, update the related IB deal property va_ingediend=true.
    """
    va_info = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        va_deal_id,
        properties=["year"],
    )
    va_props = props_of(va_info)
    year = str(va_props.get("year") or "").strip()
    if not year:
        return {"message": "VA IB deal missing year; no action taken."}

    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, va_deal_id)

    body = {
        "filter_groups": [
            {
                "filters": [
                    {
                        "propertyName": "pipeline",
                        "operator": "EQ",
                        "value": IB_PIPELINE_ID,
                    },
                    {"propertyName": "year", "operator": "EQ", "value": year},
                    {
                        "propertyName": "associations.contact",
                        "operator": "EQ",
                        "value": str(contact_id),
                    },
                ]
            }
        ],
        "properties": ["va_ingediend"],
        "limit": 1,
    }
    resp = await call_hubspot_api(hubspot_calls.search_deals, body)
    results = _result_list(resp)
    if not results:
        return {"message": "No IB deal found for contact/year; no action taken."}

    ib_deal = results[0]
    ib_id = _result_id(ib_deal)
    if not ib_id:
        return {"message": "IB deal missing id; no action taken."}

    await call_hubspot_api(
        hubspot_calls.update_deal_properties,
        ib_id,
        {"va_ingediend": "true"},
    )
    return {"message": f"IB deal {ib_id} updated with va_ingediend=true."}


async def _fetch_contact_company_map(
    contact_ids: Iterable[str], batch_size: int
) -> dict[str, list[str]]:
    mapping: dict[str, list[str]] = {}
    id_list = [str(cid) for cid in contact_ids if cid]
    if not id_list:
        return mapping

    for chunk in va_utils.chunked(id_list, batch_size):
        chunk_map = await call_hubspot_api(
            hubspot_calls.batch_get_companies_for_contacts, chunk
        )
        logger.debug(
            "[VA-IB] association batch (contacts→companies) chunk=%s size=%s result_keys=%s",
            len(chunk),
            len(chunk_map),
            list(chunk_map.keys())[:5],
        )
        for cid in chunk:
            mapping[cid] = list(chunk_map.get(cid) or [])
    return mapping


async def _batch_fetch_entity_info(
    ids: Iterable[str],
    batch_size: int,
    api_func: Any,
    properties: list[str],
    label: str,
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    id_list = [str(i) for i in ids if i]
    if not id_list:
        return result

    for chunk in va_utils.chunked(id_list, batch_size):
        items = await call_hubspot_api(api_func, chunk, properties)
        logger.debug(
            "[VA-IB] %s batch chunk=%s returned=%s", label, len(chunk), len(items or [])
        )
        for obj in items or []:
            result[str(getattr(obj, "id", ""))] = obj
    return result


async def _batch_fetch_contact_info(
    contact_ids: Iterable[str], batch_size: int
) -> dict[str, Any]:
    return await _batch_fetch_entity_info(
        contact_ids,
        batch_size,
        hubspot_calls.batch_get_contacts_info,
        CONTACT_PROPERTY_LIST,
        "contact",
    )


async def _batch_fetch_company_info(
    company_ids: Iterable[str], batch_size: int
) -> dict[str, Any]:
    return await _batch_fetch_entity_info(
        company_ids,
        batch_size,
        hubspot_calls.batch_get_companies_info,
        COMPANY_PROPERTY_LIST,
        "company",
    )


async def _fetch_ib_candidates(year: str, limit: int | None) -> list[IBCandidate]:
    collected: list[IBCandidate] = []
    after: str | None = None

    if limit is not None and limit <= 0:
        return collected

    filter_groups = [
        {
            "filters": [
                {"propertyName": "pipeline", "operator": "EQ", "value": IB_PIPELINE_ID},
                {"propertyName": "year", "operator": "EQ", "value": year},
                {
                    "propertyName": "machtiging_actief",
                    "operator": "IN",
                    "values": list(ALLOWED_MACHTIGING_VALUES),
                },
            ]
        }
    ]

    search_calls = 0
    while True:
        search_calls += 1
        page_limit = min(100, (limit - len(collected))) if limit is not None else 100
        body = {
            "filter_groups": filter_groups,
            "properties": [
                "dealname",
                "year",
                "hubspot_owner_id",
                "machtiging_actief",
                "jaarrekeningen_klaar_om_ib_te_maken",
                "ib_typeform_ingevuld",
                "dealstage",
            ],
            "limit": page_limit,
        }
        if after:
            body["after"] = after

        resp = await call_hubspot_api(hubspot_calls.search_deals, body)
        results = va_utils.result_list(resp)

        if not results:
            break

        for raw in results:
            props = va_utils.result_props(raw)
            deal_year = str(props.get("year") or "").strip()
            if not deal_year:
                continue
            candidate = IBCandidate(
                deal_id=va_utils.result_id(raw),
                contact_id=None,
                year=deal_year,
                dealname=props.get("dealname") or "",
                owner_id=(str(props.get("hubspot_owner_id")).strip() or None),
                machtiging_status=props.get("machtiging_actief"),
                klaar_om_ib=props.get("jaarrekeningen_klaar_om_ib_te_maken"),
                typeform_ingevuld=props.get("ib_typeform_ingevuld"),
                ib_dealstage=props.get("dealstage"),
            )
            collected.append(candidate)

            if limit is not None and len(collected) >= limit:
                return collected

        after = _result_after(resp)
        if not after:
            break

    logger.info(
        "[VA-IB] IB candidate search: %s calls, %s records, limit=%s",
        search_calls,
        len(collected),
        limit,
    )
    return collected


def _contact_has_required_btw(
    matching_company_ids: list[str],
    contact_is_jaarklant: bool,
    btw_status_map: dict[str, bool],
) -> tuple[bool, str, str]:
    if not matching_company_ids:
        return False, "no_company", "contact has no eligible companies"
    if contact_is_jaarklant:
        return True, "jaarklant", "jaarklant bypass BTW check"
    for company_id in matching_company_ids:
        if not btw_status_map.get(company_id):
            return (
                False,
                "missing_btw",
                f"Company {company_id} missing BTW Q1-Q4 booking",
            )
    return (
        True,
        "ok",
        f"{len(matching_company_ids)} companies satisfied BTW requirement",
    )


def _pick_va_stage(
    candidate: IBCandidate,
    default_stage_id: str,
    va_ready_stage_id: str | None,
    va_ingediend_stage_id: str | None,
    ib_done_stage_id: str | None,
    contact_is_jaarklant: bool,
    all_banks_good: bool,
    jaarklant_stage_id: str | None,
    jaarklant_geg_stage_id: str | None,
) -> str:
    """
    Decide the target VA stage for a candidate IB deal.
    - If IB is already at 'Akkoord en ingediend' -> VA 'IB ingediend'
    - Else if all prereqs are true -> VA 'Klaar voor IB'
    - Else if jaarklant -> route to jaarklant stages
    - Else -> default_stage_id
    """
    is_done = ib_done_stage_id and str(candidate.ib_dealstage or "") == str(
        ib_done_stage_id
    )
    prereqs_met = (
        (candidate.machtiging_status in ALLOWED_MACHTIGING_VALUES)
        and str(candidate.klaar_om_ib or "").lower() == "true"
        and str(candidate.typeform_ingevuld or "").lower() == "true"
    )

    if is_done and va_ingediend_stage_id:
        return va_ingediend_stage_id
    if prereqs_met and va_ready_stage_id:
        return va_ready_stage_id
    if contact_is_jaarklant:
        if all_banks_good and jaarklant_geg_stage_id:
            return jaarklant_geg_stage_id
        if jaarklant_stage_id:
            return jaarklant_stage_id
    return default_stage_id


# --------------------------------------------------------------------------- #
# Public entrypoint
# --------------------------------------------------------------------------- #


async def fill_va_ib_pipeline(
    year: int | str,
    *,
    dry_run: bool = True,
    limit: int | None = None,
    pipeline_id: str | None = None,
    stage_id: str | None = None,
) -> dict[str, Any]:
    year_str = str(year)
    pipeline_id, stage_id = _ensure_config(pipeline_id, stage_id)
    va_pipeline = await call_hubspot_api(hubspot_calls.get_pipeline_by_id, pipeline_id)
    va_ready_stage = stage_by_label(va_pipeline, VA_STAGE_LABEL_READY)
    va_jaarklant_stage = stage_by_label(va_pipeline, "Jaarklanten")
    va_jaarklant_geg_stage = stage_by_label(va_pipeline, "Jaarklanten gegevens gereed")
    va_ingediend_stage = stage_by_label(va_pipeline, VA_STAGE_LABEL_INGEDIEND)
    va_ready_stage_id = getattr(va_ready_stage, "id", None) or stage_id
    va_ingediend_stage_id = getattr(va_ingediend_stage, "id", None) or stage_id
    va_jaarklant_stage_id = getattr(va_jaarklant_stage, "id", None)
    va_jaarklant_geg_stage_id = getattr(va_jaarklant_geg_stage, "id", None)

    ib_pipeline = await call_hubspot_api(
        hubspot_calls.get_pipeline_by_id, IB_PIPELINE_ID
    )
    ib_done_stage = stage_by_label(ib_pipeline, IB_STAGE_LABEL_DONE)
    ib_done_stage_id = getattr(ib_done_stage, "id", None)

    logger.info("Fetching IB deals for year %s", year_str)
    candidates = await _fetch_ib_candidates(year_str, limit)
    logger.info(
        "Found %s IB deals with active mandate for year %s", len(candidates), year_str
    )

    stats: dict[str, Any] = {
        "year": year_str,
        "dry_run": dry_run,
        "ib_deals_considered": 0,
        "unique_contact_year": 0,
        "duplicate_contact_year": 0,
        "contacts_without_company": 0,
        "contacts_without_ez": 0,
        "already_in_va": 0,
        "missing_btw_history": 0,
        "ready_for_creation": 0,
        "created": 0,
        "errors": 0,
    }

    if not candidates:
        return stats

    deal_contact_map = await call_hubspot_api(
        hubspot_calls.batch_get_contacts_for_deals,
        [c.deal_id for c in candidates],
    )
    for candidate in candidates:
        if candidate.contact_id:
            continue
        contacts = deal_contact_map.get(candidate.deal_id) or []
        if contacts:
            candidate.contact_id = contacts[0]

    missing_contact_errors = sum(
        1 for candidate in candidates if not candidate.contact_id
    )
    if missing_contact_errors:
        stats["errors"] += missing_contact_errors
        logger.warning(
            "Skipped %s IB deals due to missing contact associations after batch fetch.",
            missing_contact_errors,
        )

    candidates = [c for c in candidates if c.contact_id]
    if not candidates:
        logger.warning("No IB deals left after resolving contacts; aborting.")
        return stats

    contact_ids = sorted({str(c.contact_id) for c in candidates if c.contact_id})
    contact_company_map = await _fetch_contact_company_map(contact_ids, BATCH_SIZE)
    company_ids = {
        company_id
        for company_list in contact_company_map.values()
        for company_id in company_list
    }
    btw_ready_map = await _load_btw_completion_map(year_str, company_ids)
    logger.info(
        "Loaded BTW readiness for %s/%s companies", len(btw_ready_map), len(company_ids)
    )
    existing_pairs = await _load_existing_va_pairs(year_str, pipeline_id)
    company_info_map = await _batch_fetch_company_info(company_ids, BATCH_SIZE)
    contact_info_map = await _batch_fetch_contact_info(contact_ids, BATCH_SIZE)

    processed_pairs: set[tuple[str, str]] = set()
    deal_payloads: list[dict[str, Any]] = []
    created_per_stage: dict[str, int] = {}

    for candidate in candidates:
        stats["ib_deals_considered"] += 1
        contact_id = candidate.contact_id
        if not contact_id:
            stats["errors"] += 1
            logger.warning("Skipping IB deal %s: missing contact.", candidate.deal_id)
            continue

        key = (contact_id, candidate.year)
        if key in processed_pairs:
            stats["duplicate_contact_year"] += 1
            continue
        processed_pairs.add(key)
        stats["unique_contact_year"] += 1

        if key in existing_pairs:
            stats["already_in_va"] += 1
            logger.info(
                "Contact %s already has VA IB deal for %s",
                contact_id,
                candidate.year,
            )
            continue

        company_props_list: list[tuple[str, dict[str, Any]]] = []
        for cid in contact_company_map.get(contact_id, []):
            info = company_info_map.get(cid)
            props = va_utils.result_props(info) if info else {}
            if (props.get("bedrijfsvorm") or "").strip() in ALLOWED_BEDRIJFSVORM:
                company_props_list.append((cid, props))

        if not company_props_list:
            stats["contacts_without_company"] += 1
            logger.info(
                "Skipping contact %s (%s): no eligible companies.",
                contact_id,
                candidate.year,
            )
            continue

        contact_info = contact_info_map.get(contact_id)
        contact_props = va_utils.result_props(contact_info)
        contact_is_jaarklant = (
            str(contact_props.get(CONTACT_PREREQ_PROP) or "").lower() == "true"
        )

        matching_company_ids = [cid for cid, _ in company_props_list]
        all_banks_good = all(
            (props.get("bankkoppeling_status") or "").strip() in ALLOWED_BANK_STATUS
            for _, props in company_props_list
        )

        btw_ok, btw_reason, btw_message = _contact_has_required_btw(
            matching_company_ids,
            contact_is_jaarklant,
            btw_ready_map,
        )
        if not btw_ok:
            if btw_reason == "no_company":
                stats["contacts_without_company"] += 1
            else:
                stats["missing_btw_history"] += 1
            logger.info(
                "Skipping contact %s (%s): %s",
                contact_id,
                candidate.year,
                btw_message,
            )
            continue

        stats["ready_for_creation"] += 1
        existing_pairs.add(key)

        target_stage_id = _pick_va_stage(
            candidate,
            stage_id,
            va_ready_stage_id,
            va_ingediend_stage_id,
            ib_done_stage_id,
            contact_is_jaarklant,
            all_banks_good,
            va_jaarklant_stage_id,
            va_jaarklant_geg_stage_id,
        )

        if dry_run:
            logger.info(
                "[DRY-RUN] Would create VA IB deal for contact %s (year %s, IB deal %s) at stage %s",
                contact_id,
                candidate.year,
                candidate.deal_id,
                target_stage_id,
            )
            continue

        properties = {
            "pipeline": pipeline_id,
            "dealstage": target_stage_id,
            "year": candidate.year,
            "dealname": _build_dealname(contact_info, contact_id, candidate.year),
        }
        if candidate.owner_id:
            properties["hubspot_owner_id"] = candidate.owner_id

        associations = [
            {
                "to": {"id": str(contact_id)},
                "types": [
                    {
                        "associationCategory": "HUBSPOT_DEFINED",
                        "associationTypeId": CONTACT_ASSOCIATION_TYPE_ID,
                    }
                ],
            }
        ]

        deal_payloads.append(
            {
                "properties": properties,
                "associations": associations,
            }
        )
        created_per_stage[target_stage_id] = (
            created_per_stage.get(target_stage_id, 0) + 1
        )

    if not dry_run and deal_payloads:
        for chunk in _chunked(deal_payloads, BATCH_SIZE):
            try:
                await call_hubspot_api(hubspot_calls.batch_create_deals_sync, chunk)
                stats["created"] += len(chunk)
                logger.info("[VA-IB] Created %s VA IB deals (chunk).", len(chunk))
            except Exception:
                stats["errors"] += len(chunk)
                logger.exception("[VA-IB] Failed to batch create %s deals", len(chunk))
        if stats["created"]:
            logger.info(
                "[VA-IB] Created %s deals by stage: %s",
                stats["created"],
                ", ".join(f"{sid}={cnt}" for sid, cnt in created_per_stage.items()),
            )

    return stats


# --------------------------------------------------------------------------- #
# CLI helper
# --------------------------------------------------------------------------- #


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Populate the VA IB pipeline based on IB + BTW prerequisites."
    )
    parser.add_argument(
        "--year", required=True, type=int, help="Tax year to target (e.g. 2025)."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N IB deals (useful for testing).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Create deals. Omit for a dry-run.",
    )
    parser.add_argument(
        "--allow-empty-ez",
        action="store_true",
        help="Allow contacts without EZ companies or BTW deals to pass condition 2.",
    )
    return parser.parse_args()


async def _run_cli() -> None:
    args = _parse_args()
    global ALLOW_CONTACTS_WITHOUT_EZ  # CLI override
    if args.allow_empty_ez:
        ALLOW_CONTACTS_WITHOUT_EZ = True

    worker = asyncio.create_task(api_worker())
    try:
        stats = await fill_va_ib_pipeline(
            args.year,
            dry_run=not args.apply,
            limit=args.limit,
        )
        print(json.dumps(stats, indent=2))
    finally:
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
    asyncio.run(_run_cli())
