from types import SimpleNamespace
from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest

from app.schemas.classes import CalendlyLead
from app.service.sales.constants import FYSIEKE_AFSPRAAK_STAGE_ID
from app.service.sales.constants import SALES_PIPELINE_ID_NEW
from app.service.sales.sales import add_lead_to_hubspot
from app.service.sales.sales import create_object_properties_from_calendly
from app.service.sales.sales import get_hubspot_owner_id_by_email


def test_create_object_properties_from_calendly_uses_owner_stage_and_name():
    lead = CalendlyLead.model_validate(
        {
            "event": "invitee.created",
            "payload": {
                "name": "Jane Doe",
                "email": "jane@example.com",
                "questions_and_answers": [
                    {"question": "Telefoonnummer", "answer": "+31 6 12345678"},
                    {"question": "Bedrijfsnaam", "answer": "Test BV"},
                    {"question": "Vraag", "answer": "Antwoord"},
                ],
                "scheduled_event": {
                    "name": "Kennismakingsgesprek",
                    "event_memberships": [
                        {
                            "user_email": "owner@example.com",
                        }
                    ],
                },
            },
        }
    )

    contact, company, deal, note = create_object_properties_from_calendly(
        lead, hs_owner_id="123"
    )

    assert contact["hubspot_owner_id"] == "123"
    assert company["hubspot_owner_id"] == "123"
    assert deal["hubspot_owner_id"] == "123"
    assert note["hubspot_owner_id"] == "123"
    assert deal["dealstage"] == FYSIEKE_AFSPRAAK_STAGE_ID
    assert deal["dealname"] == "Jane Doe - Test BV"
    assert note["hs_note_body"] == (
        "Telefoonnummer: +31 6 12345678<br>Bedrijfsnaam: Test BV<br>Vraag: Antwoord"
    )


@pytest.mark.asyncio
async def test_get_hubspot_owner_id_by_email_matches_active_owner():
    owners = [
        SimpleNamespace(id="456", email="other@example.com"),
        SimpleNamespace(id="789", email="owner@example.com"),
    ]

    with patch(
        "app.service.sales.sales.call_hubspot_api",
        new=AsyncMock(return_value=owners),
    ):
        owner_id = await get_hubspot_owner_id_by_email("owner@example.com")

    assert owner_id == "789"


@pytest.mark.asyncio
async def test_add_lead_to_hubspot_updates_existing_calendly_contact():
    lead = CalendlyLead.model_validate(
        {
            "event": "invitee.created",
            "payload": {
                "name": "Kelechi Nwogu",
                "email": "nwogukc@gmail.com",
                "questions_and_answers": [
                    {"question": "Telefoonnummer", "answer": "+31 6 84616703"},
                    {"question": "Bedrijfsnaam", "answer": "KCN Services"},
                ],
                "scheduled_event": {
                    "event_memberships": [
                        {
                            "user_email": "owner@example.com",
                        }
                    ]
                },
            },
        }
    )

    with patch(
        "app.service.sales.sales.call_hubspot_api",
        new=AsyncMock(
            side_effect=[
                [
                    SimpleNamespace(id="789", email="owner@example.com")
                ],  # get_active_owners
                "existing-contact-id",  # find_contact_by_email
                None,  # update_contact
                [],  # get_deals_for_contact → no existing deal
                [],  # get_companies_for_contact → no existing company
                "company-id",  # create_company
                "deal-id",  # create_deal
                SimpleNamespace(id="note-id"),  # add_note_to_deal
            ]
        ),
    ) as mock_call_hubspot_api:
        result = await add_lead_to_hubspot(lead, "calendly")

    assert result == {"message": "Added Calendly lead to hubspot"}
    update_call = mock_call_hubspot_api.await_args_list[2]
    assert update_call.args[0].__name__ == "update_contact"
    assert update_call.args[1] == "existing-contact-id"
    assert update_call.args[2]["firstname"] == "Kelechi"
    assert update_call.args[2]["lastname"] == "Nwogu"
    assert update_call.args[2]["phone"] == "+31 6 84616703"


@pytest.mark.asyncio
async def test_add_calendly_lead_skips_duplicate_deal():
    """When the contact already has a deal in the sales pipeline, no new deal is created."""
    lead = CalendlyLead.model_validate(
        {
            "event": "invitee.created",
            "payload": {
                "name": "Kelechi Nwogu",
                "email": "nwogukc@gmail.com",
                "questions_and_answers": [],
                "scheduled_event": {
                    "event_memberships": [{"user_email": "owner@example.com"}]
                },
            },
        }
    )

    existing_deal = SimpleNamespace(
        id="existing-deal-id",
        properties={"pipeline": SALES_PIPELINE_ID_NEW},
    )

    with patch(
        "app.service.sales.sales.call_hubspot_api",
        new=AsyncMock(
            side_effect=[
                [
                    SimpleNamespace(id="789", email="owner@example.com")
                ],  # get_active_owners
                "existing-contact-id",  # find_contact_by_email
                None,  # update_contact
                ["existing-deal-id"],  # get_deals_for_contact
                [existing_deal],  # batch_get_deals_info
            ]
        ),
    ) as mock_call_hubspot_api:
        result = await add_lead_to_hubspot(lead, "calendly")

    assert result == {
        "message": "Calendly lead skipped: contact already has a deal in sales pipeline"
    }
    # Ensure neither create_company nor create_deal was called
    called_names = [
        call.args[0].__name__ for call in mock_call_hubspot_api.await_args_list
    ]
    assert "create_company" not in called_names
    assert "create_deal" not in called_names


@pytest.mark.asyncio
async def test_add_calendly_lead_reuses_existing_company():
    """When the contact already has an associated company, it is reused instead of creating a new one."""
    lead = CalendlyLead.model_validate(
        {
            "event": "invitee.created",
            "payload": {
                "name": "Kelechi Nwogu",
                "email": "nwogukc@gmail.com",
                "questions_and_answers": [],
                "scheduled_event": {
                    "event_memberships": [{"user_email": "owner@example.com"}]
                },
            },
        }
    )

    with patch(
        "app.service.sales.sales.call_hubspot_api",
        new=AsyncMock(
            side_effect=[
                [
                    SimpleNamespace(id="789", email="owner@example.com")
                ],  # get_active_owners
                "existing-contact-id",  # find_contact_by_email
                None,  # update_contact
                [],  # get_deals_for_contact → no existing deal
                ["existing-company-id"],  # get_companies_for_contact → reuse this
                "deal-id",  # create_deal
                SimpleNamespace(id="note-id"),  # add_note_to_deal
            ]
        ),
    ) as mock_call_hubspot_api:
        result = await add_lead_to_hubspot(lead, "calendly")

    assert result == {"message": "Added Calendly lead to hubspot"}
    called_names = [
        call.args[0].__name__ for call in mock_call_hubspot_api.await_args_list
    ]
    assert "create_company" not in called_names
    # create_deal should be called with the existing company id
    create_deal_call = next(
        call
        for call in mock_call_hubspot_api.await_args_list
        if call.args[0].__name__ == "create_deal"
    )
    assert create_deal_call.args[3] == "existing-company-id"
