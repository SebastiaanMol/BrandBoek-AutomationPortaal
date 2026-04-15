from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass
from datetime import date
from typing import Any

import app.repository.hubspot as hubspot_calls
from app.constants import DEAL_TO_COMPANY_ASSOC_TYPE
from app.constants import HUBSPOT_BATCH_SIZE
from app.service.operations.constants import (
    BTW_CONTROLE_PIPELINE_IDS as BTW_PIPELINE_IDS,
)
from app.service.operations.constants import LEGACY_VPB_2024_PIPELINE_ID
from app.service.operations.constants import VA_VPB_PIPELINE_ID
from app.service.operations.constants import VPB_PIPELINE_IDS
from app.service.operations.find_correct_stage import stage_by_label
from app.service.operations.va_pipelines import utils as va_utils
from app.service.rate_limiter import api_worker
from app.service.rate_limiter import call_hubspot_api
from app.utils import props_of
from app.utils import result_after

logger = logging.getLogger(__name__)

# Stage labels
VPB_STAGE_INGEDIEND = "VPB ingediend"  # source VPB pipelines
VA_STAGE_INGEDIEND = "VPB ingediend"  # target VA pipeline
VA_STAGE_EERSTE = "Eerste VPB"
VA_STAGE_VA_NUL = "VA = 0"
VA_STAGE_NEGATIEF = "Negatief resultaat"
VA_STAGE_ZELF = "Zelf VA ingediend"
VA_STAGE_OPEN = "Open"

BATCH_SIZE = HUBSPOT_BATCH_SIZE
BTW_COMPANY_CHUNK_SIZE = 50

_chunked = va_utils.chunked
_result_list = va_utils.result_list
_result_props = va_utils.result_props
_result_id = va_utils.result_id
_parse_date = va_utils.parse_date
_normalize_kwartalen = va_utils.normalize_kwartalen


@dataclass
class VPBCandidate:
    deal_id: str
    company_id: str
    year: str
    dealstage: str | None


async def _fetch_vpb_candidates(year: str, limit: int | None) -> list[VPBCandidate]:
    collected: list[VPBCandidate] = []
    after: str | None = None
    filter_groups = [
        {
            "filters": [
                {
                    "propertyName": "pipeline",
                    "operator": "IN",
                    "values": list(VPB_PIPELINE_IDS),
                },
                {"propertyName": "year", "operator": "EQ", "value": year},
            ]
        }
    ]

    search_calls = 0
    while True:
        search_calls += 1
        body = {
            "filter_groups": filter_groups,
            "properties": ["dealstage", "year"],
            "limit": 100,
        }
        if after:
            body["after"] = after
        resp = await call_hubspot_api(hubspot_calls.search_deals, body)
        results = va_utils.result_list(resp)
        if not results:
            break

        deal_ids = [va_utils.result_id(raw) for raw in results]
        company_map = await call_hubspot_api(
            hubspot_calls.batch_get_companies_for_deals, deal_ids
        )

        for raw in results:
            companies = company_map.get(va_utils.result_id(raw)) or []
            if not companies:
                continue
            props = va_utils.result_props(raw)
            collected.append(
                VPBCandidate(
                    deal_id=va_utils.result_id(raw),
                    company_id=str(companies[0]),
                    year=str(props.get("year") or ""),
                    dealstage=props.get("dealstage"),
                )
            )
            if limit and len(collected) >= limit:
                break
        if limit and len(collected) >= limit:
            break
        after = result_after(resp)
        if not after:
            break

    logger.info(
        "[VA-VPB] VPB candidate search: %s calls, %s records",
        search_calls,
        len(collected),
    )
    return collected


async def _fetch_company_info(company_ids: list[str]) -> dict[str, Any]:
    props = ["name", "bv_ez", "oprichtingsdatum", "verlengd_boekjaar"]
    mapping: dict[str, Any] = {}
    for chunk in va_utils.chunked(company_ids, BATCH_SIZE):
        results = await call_hubspot_api(
            hubspot_calls.batch_get_companies_info, chunk, props
        )
        for obj in results or []:
            mapping[str(getattr(obj, "id", ""))] = obj
    return mapping


async def _companies_with_prev_year_vpb(
    company_ids: set[str], target_year: int
) -> set[str]:
    prev_year = target_year - 1
    if not company_ids:
        return set()

    pipelines = (
        [LEGACY_VPB_2024_PIPELINE_ID] if prev_year == 2024 else list(VPB_PIPELINE_IDS)
    )
    found: set[str] = set()
    for chunk in va_utils.chunked(list(company_ids), BATCH_SIZE):
        filter_groups = [
            {
                "filters": [
                    {"propertyName": "pipeline", "operator": "IN", "values": pipelines},
                    {
                        "propertyName": "associations.company",
                        "operator": "IN",
                        "values": chunk,
                    },
                ]
            }
        ]
        if prev_year != 2024:
            filter_groups[0]["filters"].append(
                {"propertyName": "year", "operator": "EQ", "value": str(prev_year)}
            )
        body = {
            "filter_groups": filter_groups,
            "properties": [],
            "limit": 100,
        }
        resp = await call_hubspot_api(hubspot_calls.search_deals, body)
        results = va_utils.result_list(resp)
        if not results:
            continue
        deal_ids = [va_utils.result_id(r) for r in results]
        company_map = await call_hubspot_api(
            hubspot_calls.batch_get_companies_for_deals, deal_ids
        )
        for comps in company_map.values():
            for cid in comps or []:
                found.add(str(cid))
    return found


async def _existing_va_vpb_companies(company_ids: set[str], year: str) -> set[str]:
    """Batch check which companies already have a VA VPB deal for the given year."""
    if not company_ids:
        return set()
    found: set[str] = set()
    for chunk in _chunked(list(company_ids), BATCH_SIZE):
        body = {
            "filter_groups": [
                {
                    "filters": [
                        {
                            "propertyName": "pipeline",
                            "operator": "EQ",
                            "value": VA_VPB_PIPELINE_ID,
                        },
                        {"propertyName": "year", "operator": "EQ", "value": year},
                        {
                            "propertyName": "associations.company",
                            "operator": "IN",
                            "values": chunk,
                        },
                    ]
                }
            ],
            "properties": [],
            "limit": 100,
        }
        resp = await call_hubspot_api(hubspot_calls.search_deals, body)
        results = _result_list(resp)
        if not results:
            continue
        deal_ids = [_result_id(r) for r in results]
        company_map = await call_hubspot_api(
            hubspot_calls.batch_get_companies_for_deals, deal_ids
        )
        for comps in company_map.values():
            for cid in comps or []:
                found.add(str(cid))
    return found


async def _load_btw_q4_props(
    year: str, target_companies: set[str]
) -> dict[str, dict[str, Any]]:
    ready: dict[str, dict[str, Any]] = {}
    if not target_companies:
        return ready

    for chunk in _chunked(list(target_companies), BTW_COMPANY_CHUNK_SIZE):
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
            "properties": [
                "hoeveel_va_wordt_er_betaald_",
                "is_het_resultaat_redelijk_",
                "wat_is_het_resultaat",
                "is_er_een_va_betaald_",
            ],
            "limit": 100,
        }
        resp = await call_hubspot_api(hubspot_calls.search_deals, body)
        results = _result_list(resp)
        if not results:
            continue
        deal_ids = [_result_id(r) for r in results]
        company_map = await call_hubspot_api(
            hubspot_calls.batch_get_companies_for_deals, deal_ids
        )
        props_map = {
            did: va_utils.result_props(raw)
            for did, raw in zip(deal_ids, results, strict=False)
        }
        for did, companies in company_map.items():
            for cid in companies or []:
                if cid in target_companies and cid not in ready:
                    ready[cid] = props_map.get(did, {})
    logger.info(
        "[VA-VPB] Loaded BTW Q4 props for %s/%s companies",
        len(ready),
        len(target_companies),
    )
    return ready


def _is_first_year(company_props: dict[str, Any], year: int, has_prev: bool) -> bool:
    opr = va_utils.parse_date(company_props.get("oprichtingsdatum"))
    verlengd = (company_props.get("verlengd_boekjaar") or "").strip()
    start_year = date(year, 1, 1)
    start_prev = date(year - 1, 1, 1)

    if opr and opr >= start_year:
        return True
    if opr and opr >= start_prev and verlengd == f"{year - 1} - {year}":
        return True
    return bool(not opr and not has_prev)


def _pick_va_stage(
    *,
    va_pipeline: Any,
    vpb_pipeline: Any,
    company_props: dict[str, Any],
    target_year: int,
    has_prev_year_vpb: bool,
    btw_props: dict[str, Any],
    vpb_stage_id: str | None,
) -> str:
    va_stage_ingediend = stage_by_label(va_pipeline, VA_STAGE_INGEDIEND)
    va_stage_eerste = stage_by_label(va_pipeline, VA_STAGE_EERSTE)
    va_stage_va_nul = stage_by_label(va_pipeline, VA_STAGE_VA_NUL)
    va_stage_negatief = stage_by_label(va_pipeline, VA_STAGE_NEGATIEF)
    va_stage_zelf = stage_by_label(va_pipeline, VA_STAGE_ZELF)
    va_stage_open = stage_by_label(va_pipeline, VA_STAGE_OPEN) or va_pipeline.stages[0]

    vpb_stage_ingediend = stage_by_label(vpb_pipeline, VPB_STAGE_INGEDIEND)
    if (
        vpb_stage_ingediend
        and vpb_stage_id
        and str(vpb_stage_id) == str(vpb_stage_ingediend.id)
    ):
        return getattr(va_stage_ingediend, "id", None) or va_stage_open.id

    if _is_first_year(company_props, target_year, has_prev_year_vpb):
        return getattr(va_stage_eerste, "id", None) or va_stage_open.id

    va_bedrag = btw_props.get("hoeveel_va_wordt_er_betaald_")
    resultaat_redelijk = (btw_props.get("is_het_resultaat_redelijk_") or "").strip()
    resultaat = btw_props.get("wat_is_het_resultaat")
    va_betaald = (btw_props.get("is_er_een_va_betaald_") or "").strip()

    try:
        if va_bedrag is not None and float(str(va_bedrag).replace(",", ".")) == 0.0:
            return getattr(va_stage_va_nul, "id", None) or va_stage_open.id
    except Exception:
        logger.debug("Could not parse hoeveel_va_wordt_er_betaald_: %r", va_bedrag)

    result_val = None
    try:
        if resultaat is not None:
            result_val = float(str(resultaat).replace(",", "."))
    except Exception:
        logger.debug("Could not parse wat_is_het_resultaat: %r", resultaat)

    if (
        resultaat_redelijk.lower() == "ja" and result_val is not None and result_val < 0
    ) or (
        resultaat_redelijk.lower().startswith("nee")
        and "negatief" in resultaat_redelijk.lower()
    ):
        return getattr(va_stage_negatief, "id", None) or va_stage_open.id

    if (
        resultaat_redelijk.lower() == "ja"
        and result_val is not None
        and result_val > 0
        and va_betaald.lower() == "ja"
    ):
        return getattr(va_stage_zelf, "id", None) or va_stage_open.id

    return getattr(va_stage_open, "id", None) or va_pipeline.stages[0].id


async def _existing_va_va_vpb(company_id: str, year: str) -> bool:
    body = {
        "filter_groups": [
            {
                "filters": [
                    {
                        "propertyName": "pipeline",
                        "operator": "EQ",
                        "value": VA_VPB_PIPELINE_ID,
                    },
                    {"propertyName": "year", "operator": "EQ", "value": year},
                    {
                        "propertyName": "associations.company",
                        "operator": "EQ",
                        "value": company_id,
                    },
                ]
            }
        ],
        "limit": 1,
        "properties": ["dealname"],
    }
    resp = await call_hubspot_api(hubspot_calls.search_deals, body)
    return bool(va_utils.result_list(resp))


async def fill_va_vpb_pipeline(
    year: int | str, *, dry_run: bool = True, limit: int | None = None
) -> dict[str, Any]:
    year_str = str(year)
    va_pipeline = await call_hubspot_api(
        hubspot_calls.get_pipeline_by_id, VA_VPB_PIPELINE_ID
    )
    # Use first VPB pipeline to resolve stage labels
    vpb_pipeline = await call_hubspot_api(
        hubspot_calls.get_pipeline_by_id, next(iter(VPB_PIPELINE_IDS))
    )

    logger.info(
        "[VA-VPB] Start fill for year %s dry_run=%s limit=%s", year_str, dry_run, limit
    )

    stats: dict[str, Any] = {
        "year": year_str,
        "dry_run": dry_run,
        "vpb_deals_considered": 0,
        "companies_considered": 0,
        "eligible_companies": 0,
        "already_in_va": 0,
        "ready_for_creation": 0,
        "created": 0,
        "errors": 0,
    }

    candidates = await _fetch_vpb_candidates(year_str, limit)
    stats["vpb_deals_considered"] = len(candidates)
    logger.info("[VA-VPB] Candidates fetched: %s", len(candidates))
    if not candidates:
        return stats

    company_ids = {c.company_id for c in candidates}
    company_info_map = await _fetch_company_info(list(company_ids))
    logger.info(
        "[VA-VPB] Company info fetched: %s/%s", len(company_info_map), len(company_ids)
    )
    stats["companies_considered"] = len(company_ids)
    logger.info("[VA-VPB] Companies considered: %s", stats["companies_considered"])

    # Prev-year VPB presence
    prev_year_set = await _companies_with_prev_year_vpb(company_ids, int(year_str))
    logger.info("[VA-VPB] Companies with prev-year VPB: %s", len(prev_year_set))

    # Existing VA deals for this year (batch)
    existing_va_companies = await _existing_va_vpb_companies(company_ids, year_str)
    logger.info(
        "[VA-VPB] Companies already in VA for %s: %s",
        year_str,
        len(existing_va_companies),
    )

    # BTW Q4 props
    btw_map = await _load_btw_q4_props(year_str, company_ids)
    logger.info("[VA-VPB] BTW Q4 props loaded for %s companies", len(btw_map))

    processed_companies: set[tuple[str, str]] = set()
    deal_payloads: list[dict[str, Any]] = []
    created_per_stage: dict[str, int] = {}
    for cand in candidates:
        key = (cand.company_id, cand.year)
        if key in processed_companies:
            continue
        processed_companies.add(key)
        stats["eligible_companies"] += 1

        if cand.company_id in existing_va_companies:
            stats["already_in_va"] += 1
            continue

        company_props = va_utils.result_props(company_info_map.get(cand.company_id))
        target_stage_id = _pick_va_stage(
            va_pipeline=va_pipeline,
            vpb_pipeline=vpb_pipeline,
            company_props=company_props,
            target_year=int(year_str),
            has_prev_year_vpb=cand.company_id in prev_year_set,
            btw_props=btw_map.get(cand.company_id, {}),
            vpb_stage_id=cand.dealstage,
        )

        stats["ready_for_creation"] += 1

        if dry_run:
            logger.info(
                "[DRY-RUN] Would create VA VPB deal for company %s year %s at stage %s",
                cand.company_id,
                year_str,
                target_stage_id,
            )
            continue

        dealname = f"Voorlopige Aanslag VPB {year_str}: {company_props.get('name') or cand.company_id}"
        properties = {
            "pipeline": VA_VPB_PIPELINE_ID,
            "dealstage": target_stage_id,
            "year": year_str,
            "dealname": dealname,
        }
        associations = [
            {
                "to": {"id": str(cand.company_id)},
                "types": [
                    {
                        "associationCategory": "HUBSPOT_DEFINED",
                        "associationTypeId": DEAL_TO_COMPANY_ASSOC_TYPE,
                    }
                ],
            }
        ]
        deal_payloads.append({"properties": properties, "associations": associations})
        created_per_stage[target_stage_id] = (
            created_per_stage.get(target_stage_id, 0) + 1
        )

    if not dry_run and deal_payloads:
        logger.info(
            "[VA-VPB] Creating %s deals in %s chunk(s)",
            len(deal_payloads),
            max(
                1,
                len(deal_payloads) // BATCH_SIZE
                + (1 if len(deal_payloads) % BATCH_SIZE else 0),
            ),
        )
        for chunk in va_utils.chunked(deal_payloads, BATCH_SIZE):
            try:
                await call_hubspot_api(hubspot_calls.batch_create_deals_sync, chunk)
                stats["created"] += len(chunk)
                logger.info("[VA-VPB] Created %s VA VPB deals (chunk)", len(chunk))
            except Exception:
                stats["errors"] += len(chunk)
                logger.exception(
                    "[VA-VPB] Failed to batch create %s VA VPB deals", len(chunk)
                )
        if stats["created"]:
            logger.info(
                "[VA-VPB] Created %s deals by stage: %s",
                stats["created"],
                ", ".join(f"{sid}={cnt}" for sid, cnt in created_per_stage.items()),
            )

    return stats


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Populate VA VPB pipeline based on VPB + BTW conditions."
    )
    parser.add_argument(
        "--year", required=True, type=int, help="Year to process (e.g., 2025)"
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Limit VPB deals considered (testing)."
    )
    parser.add_argument(
        "--apply", action="store_true", help="Create deals (omit for dry-run)."
    )
    return parser.parse_args()


async def _run_cli() -> None:
    args = _parse_args()
    worker = asyncio.create_task(api_worker())
    try:
        stats = await fill_va_vpb_pipeline(
            args.year, dry_run=not args.apply, limit=args.limit
        )
        print(json.dumps(stats, indent=2))
    finally:
        worker.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await worker


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.DEBUG, format="%(levelname)s:%(name)s:%(message)s"
    )
    asyncio.run(_run_cli())


# Webhook helpers


async def handle_vpb_finished(vpb_deal_id: int | str) -> dict[str, Any]:
    """When VPB is finished, move VA VPB deal to 'VPB ingediend'."""
    vpb_info = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        vpb_deal_id,
        properties=["year"],
    )
    props = props_of(vpb_info)
    year = str(props.get("year") or "").strip()
    if not year:
        return {"message": "VPB deal missing year; no action taken."}

    company_id = await call_hubspot_api(hubspot_calls.get_company_id, vpb_deal_id)
    body = {
        "filter_groups": [
            {
                "filters": [
                    {
                        "propertyName": "pipeline",
                        "operator": "EQ",
                        "value": VA_VPB_PIPELINE_ID,
                    },
                    {"propertyName": "year", "operator": "EQ", "value": year},
                    {
                        "propertyName": "associations.company",
                        "operator": "EQ",
                        "value": str(company_id),
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
        return {"message": "No VA VPB deal found for company/year."}

    va_deal = results[0]
    va_props = _result_props(va_deal)
    current_stage = str(va_props.get("dealstage") or "")
    va_id = _result_id(va_deal)
    if not va_id:
        return {"message": "VA VPB deal missing id; no action taken."}

    va_pipeline = await call_hubspot_api(
        hubspot_calls.get_pipeline_by_id, VA_VPB_PIPELINE_ID
    )
    stage_ingediend = stage_by_label(va_pipeline, VA_STAGE_INGEDIEND)
    if not stage_ingediend:
        return {"message": "Target stage 'VPB ingediend' not found; no action taken."}

    if current_stage == str(stage_ingediend.id):
        return {"message": "VA VPB deal already at 'VPB ingediend'."}

    await call_hubspot_api(
        hubspot_calls.update_deal_properties,
        va_id,
        {"dealstage": str(stage_ingediend.id)},
    )
    return {"message": f"VA VPB deal {va_id} moved to 'VPB ingediend'."}


async def handle_va_vpb_finished(va_deal_id: int | str) -> dict[str, Any]:
    """When VA VPB is finished, mark VPB deal va_ingediend=true."""
    va_info = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        va_deal_id,
        properties=["year"],
    )
    va_props = props_of(va_info)
    year = str(va_props.get("year") or "").strip()
    if not year:
        return {"message": "VA VPB deal missing year; no action taken."}

    company_id = await call_hubspot_api(hubspot_calls.get_company_id, va_deal_id)

    body = {
        "filter_groups": [
            {
                "filters": [
                    {
                        "propertyName": "pipeline",
                        "operator": "IN",
                        "values": list(VPB_PIPELINE_IDS),
                    },
                    {"propertyName": "year", "operator": "EQ", "value": year},
                    {
                        "propertyName": "associations.company",
                        "operator": "EQ",
                        "value": str(company_id),
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
        return {"message": "No VPB deal found for company/year."}

    vpb_deal = results[0]
    vpb_id = _result_id(vpb_deal)
    if not vpb_id:
        return {"message": "VPB deal missing id; no action taken."}

    await call_hubspot_api(
        hubspot_calls.update_deal_properties,
        vpb_id,
        {"va_ingediend": "true"},
    )
    return {"message": f"VPB deal {vpb_id} updated with va_ingediend=true."}
