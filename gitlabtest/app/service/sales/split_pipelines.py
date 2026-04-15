from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC
from datetime import datetime
from typing import Any

import app.repository.hubspot as hubspot_calls
from app.service.rate_limiter import call_hubspot_api
from app.utils import props_of
from app.utils import result_id

# --- tune these if needed ---
BATCH_SIZE = 80  # HubSpot batch limits are 100; keep some headroom


def normalize(s: str | None) -> str:
    return (s or "").strip().lower()


# You likely have these already:
# - call_hubspot_api(func, *args, **kwargs)
# - hubspot_calls.* (various wrappers)
# - service_hubspot.* (helpers)

# -------- Pipeline / stage helpers --------


async def get_pipeline_stage_maps(
    pipeline_id: str,
) -> tuple[dict[str, str], dict[str, str]]:
    """
    Returns (label_to_id, id_to_label) for a pipeline's stages.
    """
    pipeline = await call_hubspot_api(hubspot_calls.get_pipeline_by_id, pipeline_id)
    stages = (
        getattr(pipeline, "stages", None)
        or getattr(pipeline, "get", lambda k, d=None: d)("stages", [])
        or []
    )
    label_to_id = {
        normalize(getattr(s, "label", None) or s.get("label")): str(
            getattr(s, "id", None) or s.get("id")
        )
        for s in stages
    }
    id_to_label = {
        str(getattr(s, "id", None) or s.get("id")): (
            getattr(s, "label", None) or s.get("label")
        )
        for s in stages
    }
    return label_to_id, id_to_label


# -------- Deal search / pagination --------


async def search_deals_in_pipeline_stages(
    pipeline_id: str,
    stage_ids: Iterable[str],
    properties: list[str] | None = None,
) -> dict[str, dict[str, Any]]:
    """
    Returns {deal_id: {"properties": {...}}} for deals in the given pipeline whose dealstage is in stage_ids.
    Works with either raw dict JSON or HubSpot SDK model objects.
    """
    stage_ids = list(set(stage_ids))
    properties = properties or [
        "dealname",
        "dealstage",
        "pipeline",
        "amount",
        "hubspot_owner_id",
        "year",
        "quarter",
        "hs_createdate",
    ]

    results: dict[str, dict[str, Any]] = {}
    after = None

    while True:
        payload = {
            "filter_groups": [
                {
                    "filters": [
                        {
                            "propertyName": "pipeline",
                            "operator": "EQ",
                            "value": pipeline_id,
                        },
                        {
                            "propertyName": "dealstage",
                            "operator": "IN",
                            "values": stage_ids,
                        },
                    ]
                }
            ],
            "properties": properties,
            "after": after,
            "limit": 100,
        }

        resp = await call_hubspot_api(hubspot_calls.search_deals, payload)

        # --- normalize top-level container ---
        if isinstance(resp, dict):
            raw_results = resp.get("results", []) or []
            paging = resp.get("paging") or {}
            after = ((paging.get("next") or {}).get("after")) or None
        else:
            # HubSpot SDK model, e.g. CollectionResponseSimplePublicObject...
            raw_results = getattr(resp, "results", []) or []
            paging_obj = getattr(resp, "paging", None)
            after = getattr(getattr(paging_obj, "next", None), "after", None)

        # --- normalize each item ---
        for d in raw_results:
            did = result_id(d)
            props = props_of(d)

            if not did:
                continue

            results[did] = {"properties": props}

        if not after:
            break

    return results


# -------- Copy/move builders --------


def build_update_inputs_for_move(
    deals: dict[str, dict[str, Any]],
    dest_pipeline_id: str,
    dest_label_to_stage_id: dict[str, str],
    src_id_to_label: dict[str, str],
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Builds batch update inputs for a move.
    Returns (update_inputs, skipped_deal_ids_missing_stage).
    """
    updates = []
    skipped = []
    for deal_id, rec in deals.items():
        props = rec.get("properties", {})
        src_stage_id = props.get("dealstage")
        src_label = normalize(src_id_to_label.get(src_stage_id, ""))
        dest_stage_id = dest_label_to_stage_id.get(src_label)

        if not dest_stage_id:
            skipped.append(deal_id)
            continue

        updates.append(
            {
                "id": deal_id,
                "properties": {
                    "pipeline": dest_pipeline_id,
                    "dealstage": dest_stage_id,
                },
            }
        )
    return updates, skipped


def build_create_inputs_for_copy(
    deals: dict[str, dict[str, Any]],
    dest_pipeline_id: str,
    dest_label_to_stage_id: dict[str, str],
    src_id_to_label: dict[str, str],
) -> tuple[list[dict[str, Any]], list[str]]:
    """
    Builds batch create inputs for a copy.
    We copy commonly important props; extend if you need more.
    Returns (create_inputs, skipped_deal_ids_missing_stage).
    """
    creates = []
    skipped = []
    for deal_id, rec in deals.items():
        p = rec.get("properties", {})
        src_stage_id = p.get("dealstage")
        src_label = normalize(src_id_to_label.get(src_stage_id, ""))
        dest_stage_id = dest_label_to_stage_id.get(src_label)
        if not dest_stage_id:
            skipped.append(deal_id)
            continue

        base_name = p.get("dealname") or f"Copied from {deal_id}"
        dealname = (
            f"{base_name} (copy {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S')})"
        )

        creates.append(
            {
                "properties": {
                    "dealname": dealname,
                    "pipeline": dest_pipeline_id,
                    "dealstage": dest_stage_id,
                    # common fields to preserve
                    "amount": p.get("amount"),
                    "hubspot_owner_id": p.get("hubspot_owner_id"),
                    "year": p.get("year"),
                    "quarter": p.get("quarter"),
                },
                # TIP: if your batch_create_deals_sync supports associations, include them here:
                # "associations": [
                #   {"to": {"id": <company_id>}, "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 3}]},
                #   {"to": {"id": <contact_id>}, "types": [{"associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 4}]},
                # ]
            }
        )
    return creates, skipped


async def chunked(iterable: list[Any], size: int) -> Any:
    for i in range(0, len(iterable), size):
        yield iterable[i : i + size]


# -------- Main entry --------


async def migrate_or_copy_deals_between_pipelines(
    source_pipeline_id: str,
    dest_pipeline_id: str,
    stage_labels_to_include: list[str],
    *,
    mode: str = "move",  # "move" or "copy"
    dry_run: bool = True,  # True to preview without changes
    include_props: list[str] | None = None,
) -> dict[str, Any]:
    """
    One-time migration utility.
    - Picks all deals in the SOURCE pipeline whose stage LABEL is in stage_labels_to_include.
    - If mode == 'move' → updates those deals to DEST pipeline + mapped stage.
    - If mode == 'copy' → creates mirror deals in DEST pipeline with key fields copied.
    """
    assert mode in ("move", "copy"), "mode must be 'move' or 'copy'"

    include_props = include_props or [
        "dealname",
        "dealstage",
        "pipeline",
        "amount",
        "hubspot_owner_id",
        "year",
        "quarter",
        "hs_createdate",
    ]

    # Stage mappings
    src_label_to_stage_id, src_id_to_label = await get_pipeline_stage_maps(
        source_pipeline_id
    )
    dest_label_to_stage_id, _dest_id_to_label = await get_pipeline_stage_maps(
        dest_pipeline_id
    )

    # Normalize requested labels
    wanted = {normalize(lbl) for lbl in stage_labels_to_include}

    # Figure which source stage IDs to pull
    src_stage_ids = [sid for lbl, sid in src_label_to_stage_id.items() if lbl in wanted]
    if not src_stage_ids:
        return {
            "ok": False,
            "message": "None of the requested stage labels exist in the source pipeline.",
            "requested_labels": stage_labels_to_include,
            "available_labels": list(src_label_to_stage_id.keys()),
        }

    # Fetch deals
    deals = await search_deals_in_pipeline_stages(
        pipeline_id=source_pipeline_id,
        stage_ids=src_stage_ids,
        properties=include_props,
    )

    if not deals:
        return {
            "ok": True,
            "message": "No deals found in the specified stages.",
            "count": 0,
            "mode": mode,
            "dry_run": dry_run,
        }

    # Build inputs
    if mode == "move":
        update_inputs, skipped = build_update_inputs_for_move(
            deals, dest_pipeline_id, dest_label_to_stage_id, src_id_to_label
        )
        action_count = len(update_inputs)
    else:
        create_inputs, skipped = build_create_inputs_for_copy(
            deals, dest_pipeline_id, dest_label_to_stage_id, src_id_to_label
        )
        action_count = len(create_inputs)

    summary = {
        "ok": True,
        "mode": mode,
        "dry_run": dry_run,
        "source_pipeline_id": source_pipeline_id,
        "dest_pipeline_id": dest_pipeline_id,
        "requested_stage_labels": stage_labels_to_include,
        "found_deals": len(deals),
        "actionable": action_count,
        "skipped_missing_dest_stage": skipped,
        "dest_missing_labels": sorted(
            {
                normalize(
                    src_id_to_label.get(rec.get("properties", {}).get("dealstage"))
                    or ""
                )
                for did, rec in deals.items()
                if did in skipped
            }
        ),
    }

    if dry_run:
        # Do nothing—just return the plan
        return summary

    # Perform batch operations
    if mode == "move" and action_count:
        for chunk in [
            update_inputs[i : i + BATCH_SIZE]
            for i in range(0, len(update_inputs), BATCH_SIZE)
        ]:
            await call_hubspot_api(hubspot_calls.batch_update_deals_sync, chunk)

    if mode == "copy" and action_count:
        for chunk in [
            create_inputs[i : i + BATCH_SIZE]
            for i in range(0, len(create_inputs), BATCH_SIZE)
        ]:
            await call_hubspot_api(hubspot_calls.batch_create_deals_sync, chunk)
        # Optional: copy line items/associations after creation (requires you to capture new IDs from the response).
        # If your batch_create returns created IDs, wire a post-step here to clone line items if desired.

    return summary
