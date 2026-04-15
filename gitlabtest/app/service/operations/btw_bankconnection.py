from __future__ import annotations

import logging
from datetime import date
from typing import Any

import sentry_sdk

import app.repository.hubspot as hubspot_calls
import app.service.operations.find_correct_stage as find_correct_stage_module
import app.service.operations.operations as service_operations
from app.service.rate_limiter import call_hubspot_api
from app.utils import parse_date
from app.utils import parse_quarter
from app.utils import props_of

logger = logging.getLogger(__name__)


async def route_btw_by_deal_id_and_update(deal_id: str | int) -> None:
    """
    BTW router that only needs a HubSpot deal_id.
    - Fetch pipeline & required **deal** props.
    - Fetch bankkoppeling props from the **associated company**.F
    - Apply quarter-aware rules.
    - Update the deal's stage immediately (no return).
    """
    deal_id = str(deal_id)
    logger.info("[BTW] START route_btw_by_deal_id_and_update deal_id=%s", deal_id)

    try:
        # 1) Fetch deal props (pipeline, year, quarter, previous stage marker)
        deal_props = [
            "pipeline",
            "dealstage",
            "year",
            "quarter",
            "btw_2_maanden_geboekt_huidig_kwartaal",
        ]
        deal = await call_hubspot_api(
            hubspot_calls.get_deal_info, deal_id, properties=deal_props
        )

        pipeline_id = str(deal.properties.get("pipeline") or "").strip()
        if not pipeline_id:
            logger.error("[BTW] Missing 'pipeline' on deal id=%s", deal_id)
            msg = "Missing 'pipeline' on deal"
            raise RuntimeError(msg)

        pipeline = await call_hubspot_api(hubspot_calls.get_pipeline_by_id, pipeline_id)
        plabel = (getattr(pipeline, "label", "") or "").upper()
        logger.info("[BTW] pipeline.label=%r", plabel)
        if "BTW" not in plabel:
            logger.info(
                "[BTW] Deal %s not in a BTW pipeline ('%s'); skipping.", deal_id, plabel
            )
            return None

        # 2) Fetch associated company and read bank props FROM COMPANY
        company_id = await call_hubspot_api(hubspot_calls.get_company_id, deal_id)
        company = await call_hubspot_api(
            hubspot_calls.get_company_info,
            company_id,
            properties=[
                find_correct_stage_module.PROP_BANK_STATUS_COMPANY,
                find_correct_stage_module.PROP_BANK_VERLOPEN_COMPANY,
            ],
        )

        # 3) Extract fields for logic
        year = deal.properties.get("year")
        quarter = deal.properties.get("quarter")
        two_month = deal.properties.get("btw_2_maanden_geboekt_huidig_kwartaal")

        status = (
            company.properties.get(find_correct_stage_module.PROP_BANK_STATUS_COMPANY)
            or ""
        ).strip()
        vd = parse_date(
            company.properties.get(find_correct_stage_module.PROP_BANK_VERLOPEN_COMPANY)
        )

        anchor = find_correct_stage_module.first_day_of_next_quarter(
            year, quarter
        )  # e.g., Q3 2025 → 2025-10-01
        logger.info(
            "[BTW] deal=%s year=%r quarter=%r status=%r vd=%r anchor=%r prev2m=%r",
            deal_id,
            year,
            quarter,
            status,
            vd,
            anchor,
            two_month,
        )

        active_by_status = status in find_correct_stage_module.ACTIVE_STATUSES
        active_by_date = (
            status != "Error" and vd is not None and anchor is not None and vd > anchor
        )

        # Active path
        if active_by_status or active_by_date:
            target = find_correct_stage_module.stage_from_2m_property(
                pipeline, two_month
            ) or find_correct_stage_module.find_beginnerstage(pipeline)
            await call_hubspot_api(
                hubspot_calls.update_deal_properties, deal_id, {"dealstage": target.id}
            )
            logger.info(
                "[BTW][ACTIVE] deal=%s -> '%s' (%s)",
                deal_id,
                getattr(target, "label", "?"),
                getattr(target, "id", None),
            )
            return None

        # Expired path
        expired_condition = status == "Error" or (
            status in find_correct_stage_module.EXPIRED_STATUSES
            and (vd is None or anchor is None or vd < anchor)
        )
        if expired_condition:
            try:
                if anchor is None:
                    logger.warning(
                        "[BTW] Missing anchor date for deal=%s; skipping expired routing",
                        deal_id,
                    )
                    return None
                # Compute the first day of the month before the BTW month (anchor's previous month)
                if anchor.month == 1:
                    prev_month_year, prev_month = anchor.year - 1, 12
                else:
                    prev_month_year, prev_month = anchor.year, anchor.month - 1
                pre_btw_month_start = date(prev_month_year, prev_month, 1)
                logger.info("[BTW] Pre-BTW month starts on %s", pre_btw_month_start)

                # First check: route to "2 maanden geboekt (bankkoppeling verlopen)" when prev2m is set
                if two_month is not None:
                    target = find_correct_stage_module.stage_by_label(
                        pipeline, "2 maanden geboekt (bankkoppeling verlopen)"
                    )
                    if target:
                        await call_hubspot_api(
                            hubspot_calls.update_deal_properties,
                            deal_id,
                            {"dealstage": target.id},
                        )
                        logger.info(
                            "[BTW][EXPIRED][BK-VERLOPEN] deal=%s -> '%s' (%s)",
                            deal_id,
                            getattr(target, "label", "?"),
                            getattr(target, "id", None),
                        )
                        return None

                # Second check: route to special 'pre-BTW' stage if vd ∈ [pre_btw_month_start, anchor)
                if vd is not None and pre_btw_month_start <= vd < anchor:
                    special_stage = None
                    for s in getattr(pipeline, "stages", []) or []:
                        label = getattr(s, "label", "") or ""
                        if "verlopen in pre-btw-maand" in label.lower():
                            special_stage = s
                            break

                    if special_stage and getattr(special_stage, "id", None):
                        await call_hubspot_api(
                            hubspot_calls.update_deal_properties,
                            deal_id,
                            {"dealstage": special_stage.id},
                        )
                        logger.info(
                            "[BTW][EXPIRED→PRE-BTW] deal=%s -> '%s' (%s)",
                            deal_id,
                            getattr(special_stage, "label", "?"),
                            getattr(special_stage, "id", None),
                        )
                        return None

                # prev2m not set or target stage missing: default to beginnerstage
                beginner = find_correct_stage_module.find_beginnerstage(pipeline)
                await call_hubspot_api(
                    hubspot_calls.update_deal_properties,
                    deal_id,
                    {"dealstage": beginner.id},
                )
                logger.info(
                    "[BTW][EXPIRED][BEGINNER] deal=%s -> '%s' (%s)",
                    deal_id,
                    getattr(beginner, "label", "?"),
                    getattr(beginner, "id", None),
                )
                return None

            except Exception as e:
                sentry_sdk.capture_exception(e)
                logger.warning(
                    "[BTW] Expired-path routing failed for deal=%s: %s", deal_id, e
                )
                # Last-resort fallback to beginnerstage to avoid no-op
                try:
                    return await service_operations.check_correct_stage(company_id)
                except Exception as e2:
                    sentry_sdk.capture_exception(e2)
                    logger.exception(
                        "[BTW] Last-resort fallback failed for deal=%s: %s", deal_id, e2
                    )

    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception("❌ Error routing BTW deal %s: %s", deal_id, e)


async def update_next_quarter_prev2m_from_webhook(
    *,
    company_id: str,
    pipeline_id: str,
    src_year: int,
    src_quarter: str,
    src_value: str,
) -> None:
    """
    From a webhook on the *previous-quarter* deal:
    - Look up the company's *next-quarter* BTW deal
    - Update its 'btw_2_maanden_geboekt_vorige_maand' property.
    """
    parsed_quarter: int | None = parse_quarter(src_quarter)
    q_int: int = parsed_quarter if parsed_quarter is not None else 1

    # 1) compute next Y/Q
    if q_int >= 4:
        ny, nq = int(src_year) + 1, 1
    else:
        ny, nq = int(src_year), q_int + 1

    # 2) normalize bucket
    mapper = getattr(find_correct_stage_module, "_2m_bucket_from_property", None)
    bucket = (
        mapper(src_value) if callable(mapper) else (src_value or "").strip() or "none"
    )

    # 3) search for the single next-quarter deal
    body: dict[str, Any] = {
        "filter_groups": [
            {
                "filters": [
                    {
                        "propertyName": "associations.company",
                        "operator": "EQ",
                        "value": str(company_id),
                    },
                    {
                        "propertyName": "pipeline",
                        "operator": "EQ",
                        "value": str(pipeline_id),
                    },
                    {"propertyName": "year", "operator": "EQ", "value": str(ny)},
                    {"propertyName": "quarter", "operator": "EQ", "value": f"Q{nq}"},
                ]
            }
        ],
        "properties": ["btw_2_maanden_geboekt_vorig_kwartaal"],
        "limit": 1,
    }

    try:
        res = await call_hubspot_api(hubspot_calls.search_deals, body)
        next_deals = getattr(res, "results", None) or []
        if not next_deals:
            logger.info(
                "[BTW][NEXT-Q] No next-quarter deal found for company=%s %sQ%s",
                company_id,
                ny,
                nq,
            )
            return

        d = next_deals[0]
        did = getattr(d, "id", None)
        cur = props_of(d).get("btw_2_maanden_geboekt_vorig_kwartaal")
        if did and cur != bucket:
            await call_hubspot_api(
                hubspot_calls.update_deal_properties,
                did,
                {"btw_2_maanden_geboekt_vorig_kwartaal": bucket},
            )
            logger.info(
                "[BTW][NEXT-Q][UPDATED] deal=%s <- %s (company=%s %sQ%s)",
                did,
                bucket,
                company_id,
                ny,
                nq,
            )
        else:
            logger.info(
                "[BTW][NEXT-Q] No update needed for deal=%s (already %s)", did, cur
            )
    except Exception as e:
        sentry_sdk.capture_exception(e)
        logger.exception(
            "[BTW][NEXT-Q] Failed to update next-quarter deal for company=%s: %s",
            company_id,
            e,
        )
