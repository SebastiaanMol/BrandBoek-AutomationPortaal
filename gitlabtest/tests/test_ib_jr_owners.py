"""Tests for the IB JR owner sync service."""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock
from unittest.mock import patch

from app.exceptions import HubSpotNotFoundError
from app.service.operations.constants import IB_PIPELINE_ID
from app.service.operations.constants import JAARREKENING_PIPELINE_ID
from app.service.properties import ib_jr_owners


def _deal(deal_id: str, **properties: str) -> SimpleNamespace:
    return SimpleNamespace(id=deal_id, properties=properties)


def _company(company_id: str, name: str) -> SimpleNamespace:
    return SimpleNamespace(id=company_id, properties={"name": name})


def _owner(owner_id: str, first_name: str, last_name: str) -> SimpleNamespace:
    return SimpleNamespace(id=owner_id, first_name=first_name, last_name=last_name)


def test_sync_ib_jr_owner_summary_maps_owners_to_checkbox_values():
    """Matching JR owners should be mapped onto jr_boekers checkbox values."""
    updated_properties: list[dict[str, str]] = []

    async def fake_call_hubspot_api(sync_func, *args, **kwargs):
        if sync_func is ib_jr_owners.hubspot_calls.get_deal_info:
            return _deal(str(args[0]), pipeline=IB_PIPELINE_ID, year="2024")
        if sync_func is ib_jr_owners.hubspot_calls.get_contact_id:
            return "contact-1"
        if sync_func is ib_jr_owners.hubspot_calls.get_companies_for_contact:
            return ["company-1", "company-2"]
        if sync_func is ib_jr_owners.hubspot_calls.batch_get_companies_info:
            return [
                _company("company-1", "Acme BV"),
                _company("company-2", "Beta BV"),
            ]
        if sync_func is ib_jr_owners.hubspot_calls.get_deals_for_company:
            if args[0] == "company-1":
                return ["jr-1"]
            if args[0] == "company-2":
                return ["jr-2", "other-1"]
        if sync_func is ib_jr_owners.hubspot_calls.batch_get_deals_info:
            return [
                _deal(
                    "jr-1",
                    pipeline=JAARREKENING_PIPELINE_ID,
                    year="2024",
                    hubspot_owner_id="owner-a",
                ),
                _deal(
                    "jr-2",
                    pipeline=JAARREKENING_PIPELINE_ID,
                    year="2024",
                    hubspot_owner_id="owner-b",
                ),
                _deal("other-1", pipeline="not-jr", year="2024"),
            ]
        if sync_func is ib_jr_owners.hubspot_calls.get_property:
            return {
                "options": [
                    {"label": "Alice Example", "value": "alice-checkbox"},
                    {"label": "Bob Example", "value": "owner-b"},
                ]
            }
        if sync_func is ib_jr_owners.hubspot_calls.get_active_owners:
            return [
                _owner("owner-a", "Alice", "Example"),
                _owner("owner-b", "Bob", "Example"),
            ]
        if sync_func is ib_jr_owners.hubspot_calls.update_deal_properties:
            updated_properties.append(kwargs["properties"])
            return None
        msg = f"Unexpected HubSpot call: {sync_func} args={args}"
        raise AssertionError(msg)

    with patch.object(
        ib_jr_owners,
        "call_hubspot_api",
        new=AsyncMock(side_effect=fake_call_hubspot_api),
    ):
        result = asyncio.run(ib_jr_owners.sync_ib_jr_owner_summary("ib-1"))

    assert result["updated"] is True
    assert result["property_value"] == "alice-checkbox;owner-b"
    assert result["owner_names"] == ["Alice Example", "Bob Example"]
    assert result["owners"] == 2
    assert result["skipped_owners"] == 0
    assert updated_properties == [{"jr_boekers": "alice-checkbox;owner-b"}]


def test_sync_ib_jr_owner_summary_skips_owners_outside_allowed_subset():
    """JR owners outside the configured jr_boekers options should be skipped."""
    updated_properties: list[dict[str, str]] = []

    async def fake_call_hubspot_api(sync_func, *args, **kwargs):
        if sync_func is ib_jr_owners.hubspot_calls.get_deal_info:
            return _deal(str(args[0]), pipeline=IB_PIPELINE_ID, year="2024")
        if sync_func is ib_jr_owners.hubspot_calls.get_contact_id:
            return "contact-1"
        if sync_func is ib_jr_owners.hubspot_calls.get_companies_for_contact:
            return ["company-1"]
        if sync_func is ib_jr_owners.hubspot_calls.batch_get_companies_info:
            return [_company("company-1", "Acme BV")]
        if sync_func is ib_jr_owners.hubspot_calls.get_deals_for_company:
            return ["jr-1"]
        if sync_func is ib_jr_owners.hubspot_calls.batch_get_deals_info:
            return [
                _deal(
                    "jr-1",
                    pipeline=JAARREKENING_PIPELINE_ID,
                    year="2024",
                    hubspot_owner_id="owner-x",
                )
            ]
        if sync_func is ib_jr_owners.hubspot_calls.get_property:
            return {"options": [{"label": "Alice Example", "value": "alice-checkbox"}]}
        if sync_func is ib_jr_owners.hubspot_calls.get_active_owners:
            return [_owner("owner-x", "Xavier", "Example")]
        if sync_func is ib_jr_owners.hubspot_calls.update_deal_properties:
            updated_properties.append(kwargs["properties"])
            return None
        msg = f"Unexpected HubSpot call: {sync_func} args={args}"
        raise AssertionError(msg)

    with patch.object(
        ib_jr_owners,
        "call_hubspot_api",
        new=AsyncMock(side_effect=fake_call_hubspot_api),
    ):
        result = asyncio.run(ib_jr_owners.sync_ib_jr_owner_summary("ib-1"))

    assert result["updated"] is True
    assert result["property_value"] == ""
    assert result["owner_names"] == []
    assert result["owners"] == 0
    assert result["skipped_owners"] == 1
    assert updated_properties == [{"jr_boekers": ""}]


def test_sync_ib_jr_owner_summary_clears_property_when_contact_missing():
    """A missing IB contact should clear jr_boekers instead of failing."""
    updated_properties: list[dict[str, str]] = []

    async def fake_call_hubspot_api(sync_func, *args, **kwargs):
        if sync_func is ib_jr_owners.hubspot_calls.get_deal_info:
            return _deal(str(args[0]), pipeline=IB_PIPELINE_ID, year="2024")
        if sync_func is ib_jr_owners.hubspot_calls.get_contact_id:
            msg = "No contact"
            raise HubSpotNotFoundError(msg)
        if sync_func is ib_jr_owners.hubspot_calls.update_deal_properties:
            updated_properties.append(kwargs["properties"])
            return None
        msg = f"Unexpected HubSpot call: {sync_func} args={args}"
        raise AssertionError(msg)

    with patch.object(
        ib_jr_owners,
        "call_hubspot_api",
        new=AsyncMock(side_effect=fake_call_hubspot_api),
    ):
        result = asyncio.run(ib_jr_owners.sync_ib_jr_owner_summary("ib-1"))

    assert result == {
        "updated": True,
        "reason": "missing_contact",
        "property_value": "",
    }
    assert updated_properties == [{"jr_boekers": ""}]


def test_build_jr_owner_summary_chunks_batch_deal_reads_at_100():
    """Batch deal reads should be chunked to stay within HubSpot's 100-item limit."""
    batch_sizes: list[int] = []

    async def fake_call_hubspot_api(sync_func, *args, **kwargs):
        if sync_func is ib_jr_owners.hubspot_calls.get_companies_for_contact:
            return ["company-1"]
        if sync_func is ib_jr_owners.hubspot_calls.batch_get_companies_info:
            return [_company("company-1", "Acme BV")]
        if sync_func is ib_jr_owners.hubspot_calls.get_deals_for_company:
            return [f"deal-{index}" for index in range(101)]
        if sync_func is ib_jr_owners.hubspot_calls.batch_get_deals_info:
            batch_sizes.append(len(args[0]))
            return []
        if sync_func is ib_jr_owners.hubspot_calls.get_property:
            return {"options": []}
        if sync_func is ib_jr_owners.hubspot_calls.get_active_owners:
            return []
        msg = f"Unexpected HubSpot call: {sync_func} args={args}"
        raise AssertionError(msg)

    with patch.object(
        ib_jr_owners,
        "call_hubspot_api",
        new=AsyncMock(side_effect=fake_call_hubspot_api),
    ):
        result = asyncio.run(ib_jr_owners._build_jr_owner_summary("contact-1", "2024"))

    assert result["property_value"] == ""
    assert batch_sizes == [100, 1]
