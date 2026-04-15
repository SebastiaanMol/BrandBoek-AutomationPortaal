"""Tests for the BTW assignment propagation service."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
from unittest.mock import patch

from app.service.properties import btw_assignment
from app.service.properties.btw_assignment import find_latest_btw_assignment

BTW_PIPELINE_ID = "759381020"
OTHER_PIPELINE_ID = "999999999"
FINISHED_STAGE = "1162621605"
OPEN_STAGE = "123456789"


def _deal(
    pipeline: str = BTW_PIPELINE_ID,
    dealstage: str = FINISHED_STAGE,
    year: str = "2024",
    quarter: str = "Q1",
    controleur: str | None = "ctrl-1",
    hubspot_owner_id: str | None = "owner-1",
) -> SimpleNamespace:
    return SimpleNamespace(
        properties={
            "pipeline": pipeline,
            "dealstage": dealstage,
            "year": year,
            "quarter": quarter,
            "controleur": controleur,
            "hubspot_owner_id": hubspot_owner_id,
        }
    )


# ---------------------------------------------------------------------------
# find_latest_btw_assignment — pure function tests
# ---------------------------------------------------------------------------


def test_returns_none_for_empty_deals_map():
    assert find_latest_btw_assignment({}, "2024", "Q2") is None


def test_returns_none_when_no_finished_deals():
    deals = {"d1": _deal(dealstage=OPEN_STAGE, year="2024", quarter="Q1")}
    assert find_latest_btw_assignment(deals, "2024", "Q2") is None


def test_ignores_non_btw_pipeline():
    deals = {"d1": _deal(pipeline=OTHER_PIPELINE_ID, year="2024", quarter="Q1")}
    assert find_latest_btw_assignment(deals, "2024", "Q2") is None


def test_ignores_same_quarter():
    deals = {"d1": _deal(year="2024", quarter="Q2")}
    assert find_latest_btw_assignment(deals, "2024", "Q2") is None


def test_ignores_later_quarter():
    deals = {"d1": _deal(year="2024", quarter="Q3")}
    assert find_latest_btw_assignment(deals, "2024", "Q2") is None


def test_ignores_deal_with_no_controleur_and_no_owner():
    deals = {
        "d1": _deal(year="2024", quarter="Q1", controleur=None, hubspot_owner_id=None)
    }
    assert find_latest_btw_assignment(deals, "2024", "Q2") is None


def test_returns_single_matching_finished_deal():
    deals = {
        "d1": _deal(
            year="2024", quarter="Q1", controleur="ctrl-1", hubspot_owner_id="owner-1"
        )
    }
    result = find_latest_btw_assignment(deals, "2024", "Q2")
    assert result is not None
    assert result["deal_id"] == "d1"
    assert result["controleur"] == "ctrl-1"
    assert result["hubspot_owner_id"] == "owner-1"


def test_picks_latest_of_multiple_finished_deals():
    deals = {
        "d1": _deal(
            year="2024",
            quarter="Q1",
            controleur="ctrl-old",
            hubspot_owner_id="owner-old",
        ),
        "d2": _deal(
            year="2024",
            quarter="Q2",
            controleur="ctrl-new",
            hubspot_owner_id="owner-new",
        ),
        "d3": _deal(
            year="2023",
            quarter="Q4",
            controleur="ctrl-older",
            hubspot_owner_id="owner-older",
        ),
    }
    result = find_latest_btw_assignment(deals, "2024", "Q3")
    assert result is not None
    assert result["deal_id"] == "d2"
    assert result["controleur"] == "ctrl-new"
    assert result["hubspot_owner_id"] == "owner-new"


def test_matches_across_year_boundary():
    """Q1 2025 should inherit from Q4 2024."""
    deals = {"d1": _deal(year="2024", quarter="Q4")}
    result = find_latest_btw_assignment(deals, "2025", "Q1")
    assert result is not None
    assert result["deal_id"] == "d1"


def test_excludes_specified_deal_id():
    deals = {
        "d1": _deal(
            year="2024", quarter="Q1", controleur="ctrl-1", hubspot_owner_id="owner-1"
        ),
        "d2": _deal(
            year="2023", quarter="Q4", controleur="ctrl-2", hubspot_owner_id="owner-2"
        ),
    }
    result = find_latest_btw_assignment(deals, "2024", "Q2", exclude_deal_id="d1")
    assert result is not None
    assert result["deal_id"] == "d2"


def test_accepts_quarter_without_q_prefix():
    deals = {"d1": _deal(year="2024", quarter="1")}
    result = find_latest_btw_assignment(deals, "2024", "2")
    assert result is not None
    assert result["deal_id"] == "d1"


def test_returns_none_for_invalid_target_quarter():
    deals = {"d1": _deal(year="2024", quarter="Q1")}
    assert find_latest_btw_assignment(deals, "2024", "Q5") is None


def test_returns_assignment_when_only_controleur_set():
    deals = {
        "d1": _deal(
            year="2024", quarter="Q1", controleur="ctrl-1", hubspot_owner_id=None
        )
    }
    result = find_latest_btw_assignment(deals, "2024", "Q2")
    assert result is not None
    assert result["controleur"] == "ctrl-1"
    assert result["hubspot_owner_id"] is None


def test_returns_assignment_when_only_owner_set():
    deals = {
        "d1": _deal(
            year="2024", quarter="Q1", controleur=None, hubspot_owner_id="owner-1"
        )
    }
    result = find_latest_btw_assignment(deals, "2024", "Q2")
    assert result is not None
    assert result["controleur"] is None
    assert result["hubspot_owner_id"] == "owner-1"


# ---------------------------------------------------------------------------
# sync_future_btw_assignments_from_finished_deal — async integration tests
# ---------------------------------------------------------------------------


def test_sync_no_op_for_non_btw_pipeline():
    async def fake_call(sync_func, *args, **kwargs):
        return SimpleNamespace(
            properties={
                "pipeline": "999999999",
                "dealstage": FINISHED_STAGE,
                "year": "2024",
                "quarter": "Q1",
                "controleur": "ctrl-1",
                "hubspot_owner_id": "owner-1",
            }
        )

    with patch.object(
        btw_assignment, "call_hubspot_api", new=AsyncMock(side_effect=fake_call)
    ):
        result = asyncio.run(
            btw_assignment.sync_future_btw_assignments_from_finished_deal("d1")
        )

    assert result["ok"] is True
    assert "not in a BTW pipeline" in result["message"]


def test_sync_propagates_to_future_deals():
    updated: dict[str, dict] = {}

    source = SimpleNamespace(
        properties={
            "pipeline": BTW_PIPELINE_ID,
            "dealstage": FINISHED_STAGE,
            "year": "2024",
            "quarter": "Q2",
            "controleur": "ctrl-1",
            "hubspot_owner_id": "owner-1",
        }
    )
    future_deal = SimpleNamespace(
        properties={
            "pipeline": BTW_PIPELINE_ID,
            "dealstage": OPEN_STAGE,
            "year": "2024",
            "quarter": "Q3",
            "controleur": None,
            "hubspot_owner_id": None,
        }
    )
    past_deal = SimpleNamespace(
        properties={
            "pipeline": BTW_PIPELINE_ID,
            "dealstage": FINISHED_STAGE,
            "year": "2024",
            "quarter": "Q1",
            "controleur": "ctrl-old",
            "hubspot_owner_id": "owner-old",
        }
    )

    async def fake_call(sync_func, *args, **kwargs):
        if sync_func is btw_assignment.hubspot_calls.get_deal_info:
            return source
        if sync_func is btw_assignment.hubspot_calls.get_company_id:
            return "company-1"
        if sync_func is btw_assignment.hubspot_calls.update_deal_properties:
            updated[str(args[0])] = args[1]
            return None
        msg = f"Unexpected call: {sync_func}"
        raise AssertionError(msg)

    async def fake_fetch_deals(company_id, props):
        return {
            "d1": source,  # source deal itself (skipped)
            "d2": future_deal,
            "d3": past_deal,
        }

    with (
        patch.object(
            btw_assignment, "call_hubspot_api", new=AsyncMock(side_effect=fake_call)
        ),
        patch(
            "app.service.operations.hubspot.fetch_all_company_deals_with_props",
            new=AsyncMock(side_effect=fake_fetch_deals),
        ),
    ):
        result = asyncio.run(
            btw_assignment.sync_future_btw_assignments_from_finished_deal("d1")
        )

    assert result["ok"] is True
    assert result["updated_count"] == 1
    assert "d2" in result["updated_deals"]
    assert updated["d2"] == {"controleur": "ctrl-1", "hubspot_owner_id": "owner-1"}
    assert "d3" not in updated  # past deal not touched


def test_sync_no_op_when_no_controleur_or_owner():
    source = SimpleNamespace(
        properties={
            "pipeline": BTW_PIPELINE_ID,
            "dealstage": FINISHED_STAGE,
            "year": "2024",
            "quarter": "Q1",
            "controleur": None,
            "hubspot_owner_id": None,
        }
    )

    async def fake_call(sync_func, *args, **kwargs):
        return source

    with patch.object(
        btw_assignment, "call_hubspot_api", new=AsyncMock(side_effect=fake_call)
    ):
        result = asyncio.run(
            btw_assignment.sync_future_btw_assignments_from_finished_deal("d1")
        )

    assert result["ok"] is True
    assert "no controleur or owner" in result["message"]
