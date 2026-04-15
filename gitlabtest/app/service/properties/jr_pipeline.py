from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

import app.repository.hubspot as hubspot_calls
from app.service.operations.constants import IB_PIPELINE_ID
from app.service.operations.constants import JAARREKENING_PIPELINE_IDS
from app.service.rate_limiter import call_hubspot_api
from app.utils import normalize_kwartalen
from app.utils import props_of

JR_STAGE_Q_GEBOEKT = "1086340940"
JR_STAGE_Q_GEBOEKT_PRI = "1086340941"
SOFTWARE_JR_STAGE_Q_GEBOEKT = "1178775808"
SOFTWARE_JR_STAGE_Q_GEBOEKT_PRI = "1178801953"
JR_STAGE_GEG_GEREED = "1086340936"
JR_STAGE_GEG_GEREED_PRI = "1086340937"
JR_STAGE_DEELS_GEBOEKT = "1310846636"
JR_STAGE_DEELS_GEBOEKT_PRI = "1311051916"
JR_STAGE_DEELS_GEBOEKT = "1310846636"
JR_STAGE_DEELS_GEBOEKT_PRI = "1311051916"

JR_STAGE_MAP = {
    JR_STAGE_Q_GEBOEKT: JR_STAGE_Q_GEBOEKT_PRI,
    SOFTWARE_JR_STAGE_Q_GEBOEKT: SOFTWARE_JR_STAGE_Q_GEBOEKT_PRI,
    JR_STAGE_GEG_GEREED: JR_STAGE_GEG_GEREED_PRI,
    JR_STAGE_DEELS_GEBOEKT: JR_STAGE_DEELS_GEBOEKT_PRI,
}
JR_PRIORITY_SET = {
    JR_STAGE_Q_GEBOEKT_PRI,
    JR_STAGE_GEG_GEREED_PRI,
    JR_STAGE_DEELS_GEBOEKT_PRI,
}
ACTIVE_MACHTIGING_VALUES = {
    "Contact actief, geen partner",
    "Contact en Partner actief",
    "VIG ontvangen",
}
JR_PRIORITY_DOT_VALUE = "high"

# The exact stage labels as they appear in the pipeline editor
STAGE_LABEL_DEELS = "Deels geboekt"
STAGE_LABEL_ALL = "Q1 tot Q4 geboekt"

# The exact checkbox option labels as they appear in the 'geboekte_kwartalen' property
Q_OPTS = {"Q1 geboekt", "Q2 geboekt", "Q3 geboekt", "Q4 geboekt"}

ALLOWED_UPDATE_STAGE_LABELS = {
    "Open nieuwe klanten",
    STAGE_LABEL_DEELS,
    "Niet geboekt (Met bank)",
    "Niet geboekt (Met bank) PRIO",
    "Deels geboekt (Met bank)",
    "Deels geboekt (Met bank) PRIO",
}


async def bump_related_jr_from_ib(ib_deal_id: str) -> None:
    ib = await call_hubspot_api(
        hubspot_calls.get_deal_info, ib_deal_id, properties=["year"]
    )
    ib_year = str(ib.properties.get("year") or "")
    if not ib_year:
        logger.info(f"[JR-PRIO] IB {ib_deal_id} missing year; abort.")
        return

    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, ib_deal_id)
    deal_ids = (
        await call_hubspot_api(hubspot_calls.get_deals_for_contact, contact_id) or []
    )
    if not deal_ids:
        return

    props = ["pipeline", "year", "dealstage"]
    deals_info = await call_hubspot_api(
        hubspot_calls.batch_get_deals_info, deal_ids, props
    )
    for d in deals_info or []:
        p = props_of(d)
        if str(p.get("pipeline") or "") not in JAARREKENING_PIPELINE_IDS:
            continue
        if str(p.get("year") or "") != ib_year:
            continue

        cur = str(p.get("dealstage") or "")
        if cur in JR_PRIORITY_SET:
            logger.info(f"[JR-PRIO] JR {d.id} already priority.")
            continue
        target = JR_STAGE_MAP.get(cur)
        if not target:
            continue

        await call_hubspot_api(
            hubspot_calls.update_deal_properties, d.id, properties={"dealstage": target}
        )
        logger.info(f"[JR-PRIO] JR {d.id}: {cur} -> {target}")


async def sync_jr_priority_dot_from_ib(ib_deal_id: str) -> dict[str, int]:
    ib = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        ib_deal_id,
        properties=["pipeline", "year", "ib_typeform_ingevuld"],
    )
    if str(ib.properties.get("pipeline") or "") != IB_PIPELINE_ID:
        return {"updated": 0, "matched": 0}

    ib_year = str(ib.properties.get("year") or "")
    if not ib_year:
        logger.info(f"[JR-PRIO-DOT] IB {ib_deal_id} missing year; abort.")
        return {"updated": 0, "matched": 0}

    typeform_filled = (
        str(ib.properties.get("ib_typeform_ingevuld") or "").lower() == "true"
    )
    target_priority = JR_PRIORITY_DOT_VALUE if typeform_filled else ""

    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, ib_deal_id)
    deal_ids = (
        await call_hubspot_api(hubspot_calls.get_deals_for_contact, contact_id) or []
    )
    if not deal_ids:
        return {"updated": 0, "matched": 0}

    deals_info = await call_hubspot_api(
        hubspot_calls.batch_get_deals_info,
        deal_ids,
        ["pipeline", "year", "hs_priority"],
    )

    updated = 0
    matched = 0
    for d in deals_info or []:
        p = getattr(d, "properties", {}) or {}
        if str(p.get("pipeline") or "") not in JAARREKENING_PIPELINE_IDS:
            continue
        if str(p.get("year") or "") != ib_year:
            continue

        matched += 1
        current_priority = str(p.get("hs_priority") or "")
        if current_priority == target_priority:
            continue

        await call_hubspot_api(
            hubspot_calls.update_deal_properties,
            d.id,
            properties={"hs_priority": target_priority},
        )
        updated += 1
        logger.info(
            "[JR-PRIO-DOT] JR %s hs_priority updated from %r to %r",
            d.id,
            current_priority,
            target_priority,
        )

    return {"updated": updated, "matched": matched}


async def bump_this_jr_if_ib_ready_except_jr(jr_deal_id: str) -> None:
    logging.info("[JR-PRIO] Start check for JR %s", jr_deal_id)
    jr = await call_hubspot_api(
        hubspot_calls.get_deal_info,
        jr_deal_id,
        properties=["pipeline", "year", "dealstage"],
    )
    if jr.properties.get("pipeline") not in JAARREKENING_PIPELINE_IDS:
        logging.info(
            "[JR-PRIO] Skip JR %s: non-JR pipeline=%r",
            jr_deal_id,
            jr.properties.get("pipeline"),
        )
        return

    target = JR_STAGE_MAP.get(jr.properties.get("dealstage"))
    if not target or jr.properties.get("dealstage") in JR_PRIORITY_SET:
        logging.info(
            "[JR-PRIO] Skip JR %s: stage=%r target=%r",
            jr_deal_id,
            jr.properties.get("dealstage"),
            target,
        )
        return
    logging.info(f"[JR-PRIO] Evaluating JR {jr_deal_id} for potential bump")

    jr_year = str(jr.properties.get("year") or "")
    if not jr_year:
        logging.info("[JR-PRIO] Skip JR %s: missing year", jr_deal_id)
        return

    contact_id = await call_hubspot_api(hubspot_calls.get_contact_id, jr_deal_id)
    # look for an IB of the same year with all prereqs except JR
    deal_ids = (
        await call_hubspot_api(hubspot_calls.get_deals_for_contact, contact_id) or []
    )
    if not deal_ids:
        logging.info("[JR-PRIO] Skip JR %s: no associated contact deals", jr_deal_id)
        return

    props = [
        "pipeline",
        "year",
        "machtiging_actief",
        "jaarrekeningen_klaar_om_ib_te_maken",
    ]
    deals_info = await call_hubspot_api(
        hubspot_calls.batch_get_deals_info, deal_ids, props
    )
    logging.info(
        f"[JR-PRIO] Found {len(deals_info or [])} deals for contact {contact_id}"
    )
    matched_ib_same_year = False
    for d in deals_info or []:
        p = props_of(d)
        if str(p.get("pipeline") or "") != IB_PIPELINE_ID:
            continue
        if str(p.get("year") or "") != jr_year:
            continue
        matched_ib_same_year = True

        jr_ready_for_ib = str(
            p.get("jaarrekeningen_klaar_om_ib_te_maken") or ""
        ).lower()
        logging.info(
            "[JR-PRIO] Decision JR %s <- IB %s: machtiging_actief=%r, jr_ready_for_ib=%r, should_bump=%s",
            jr_deal_id,
            d.id,
            p.get("machtiging_actief"),
            jr_ready_for_ib,
            p.get("machtiging_actief") in ACTIVE_MACHTIGING_VALUES
            and jr_ready_for_ib in {"", "false"},
        )

        if p.get(
            "machtiging_actief"
        ) in ACTIVE_MACHTIGING_VALUES and jr_ready_for_ib in {"", "false"}:
            await call_hubspot_api(
                hubspot_calls.update_deal_properties,
                jr_deal_id,
                properties={"dealstage": target},
            )
            logger.info(
                f"[JR-PRIO] JR {jr_deal_id}: bumped to {target} (IB ready-except-JR)."
            )
            return

    if not matched_ib_same_year:
        logger.info(
            "[JR-PRIO] JR %s: no IB deal found in year %s",
            jr_deal_id,
            jr_year,
        )


# --- NEW: cache pipeline stages and provide id<->label maps
_pipeline_stage_cache: dict[str, dict[str, dict[str, str]]] = {}
PipelineStructure = dict[str, dict[str, dict[str, str]]]


async def _get_stage_maps(pipeline_id: str) -> tuple[dict[str, str], dict[str, str]]:
    cached = _pipeline_stage_cache.get(pipeline_id)
    if cached:
        return cached["id2label"], cached["label2id"]

    pipeline = await call_hubspot_api(hubspot_calls.get_pipeline_by_id, pipeline_id)
    id2label: dict[str, str] = {}
    label2id: dict[str, str] = {}
    for st in getattr(pipeline, "stages", []) or []:
        sid = getattr(st, "id", "")
        lab = getattr(st, "label", "")
        if sid and lab:
            id2label[sid] = lab
            label2id[lab] = sid
    _pipeline_stage_cache[pipeline_id] = {"id2label": id2label, "label2id": label2id}
    return id2label, label2id


async def _resolve_stage_id_for_label(pipeline_id: str, stage_label: str) -> str | None:
    _, label2id = await _get_stage_maps(pipeline_id)
    sid = label2id.get(stage_label)
    if not sid:
        logger.warning(
            "Stage with label '%s' not found in pipeline %s", stage_label, pipeline_id
        )
    return sid


# --- NEW: gatekeeper for allowed current stages


async def _is_allowed_to_update(pipeline_id: str, current_stage_id: str) -> bool:
    id2label, _ = await _get_stage_maps(pipeline_id)
    label = id2label.get(current_stage_id, "")
    if not label:
        return False
    # Keep broad support for early/open stages and explicit exceptions.
    return label.startswith("Open") or label in ALLOWED_UPDATE_STAGE_LABELS


# shim that accepts BOTH positional and keyword usage (keeps you safe while migrating)


async def update_jr_stage_from_btw_geboekt(*args: Any, **kwargs: Any) -> dict[str, Any]:
    if args and not kwargs:
        if len(args) != 3:
            msg = (
                "update_jr_stage_from_btw_geboekt expected 3 positional args"
                "(company_id, year, geboekte_kwartalen)"
            )
            raise TypeError(msg)
        company_id, year, geboekte_kwartalen = args
    else:
        try:
            company_id = kwargs["company_id"]
            year = kwargs["year"]
            geboekte_kwartalen = kwargs.get("geboekte_kwartalen")
        except KeyError as e:
            msg = f"Missing required keyword argument: {e.args[0]}"
            raise TypeError(msg) from None

    year_str = str(year)
    checked = normalize_kwartalen(geboekte_kwartalen)

    if not checked:
        msg = "No BTW quarters booked → no-op."
        logger.info("[JR Stage] %s company_id=%s year=%s", msg, company_id, year_str)
        return {"updated": 0, "target": None, "reason": msg}

    target_label = STAGE_LABEL_ALL if Q_OPTS.issubset(checked) else STAGE_LABEL_DEELS
    logger.info(
        "[JR Stage] Target label: %s (checked=%s)", target_label, sorted(checked)
    )

    deal_ids = await call_hubspot_api(
        hubspot_calls.get_deals_for_company, str(company_id)
    )
    if not deal_ids:
        return {
            "updated": 0,
            "target": target_label,
            "reason": "Company has no associated deals.",
        }

    props = ["pipeline", "dealstage", "year"]
    deals_info = await call_hubspot_api(
        hubspot_calls.batch_get_deals_info, deal_ids, props
    )

    jr_deals: list[tuple[str, dict]] = []
    for d in deals_info or []:
        p = props_of(d)
        pipeline_id = str(p.get("pipeline") or "")
        if (
            pipeline_id in JAARREKENING_PIPELINE_IDS
            and str(p.get("year") or "") == year_str
        ):
            jr_deals.append((str(d.id), p))

    if not jr_deals:
        return {
            "updated": 0,
            "target": target_label,
            "reason": "No Jaarrekening deal found for this company/year.",
        }

    updated = 0
    stage_id_cache: dict[tuple[str, str], str | None] = {}

    for deal_id, props_map in jr_deals:
        pipeline_id = str(props_map.get("pipeline") or "")
        current_stage_id = str(props_map.get("dealstage") or "")

        # --- NEW: only proceed when current stage is allowed
        if not await _is_allowed_to_update(pipeline_id, current_stage_id):
            logger.info(
                "[JR Stage] Skip deal %s: current stage not allowed for update (pipeline=%s, stage=%s)",
                deal_id,
                pipeline_id,
                current_stage_id,
            )
            continue

        cache_key = (pipeline_id, target_label)
        stage_id = stage_id_cache.get(cache_key)
        if stage_id is None:
            stage_id = await _resolve_stage_id_for_label(pipeline_id, target_label)
            stage_id_cache[cache_key] = stage_id

        if not stage_id:
            logger.warning(
                "[JR Stage] Skipping deal %s: could not resolve target stage '%s' in pipeline %s",
                deal_id,
                target_label,
                pipeline_id,
            )
            continue

        if current_stage_id == stage_id:
            logger.info("[JR Stage] Deal %s already at target stage.", deal_id)
            continue

        await call_hubspot_api(
            hubspot_calls.update_deal_properties,
            int(deal_id),
            {"dealstage": stage_id},
        )
        updated += 1
        logger.info(
            "[JR Stage] Updated deal %s → %s (%s)", deal_id, target_label, stage_id
        )

    reason = (
        "Updated matching JR deal(s)."
        if updated
        else "No updates necessary (either already set or stage not eligible)."
    )
    return {"updated": updated, "target": target_label, "reason": reason}
