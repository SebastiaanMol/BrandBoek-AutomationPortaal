"""Tests for the sales API router endpoints."""

from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest
from httpx import ASGITransport
from httpx import AsyncClient


@pytest.fixture()
async def client():
    """Async HTTP client for testing the FastAPI app."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def test_trustoo_lead_queued(client, auth_headers):
    """POST /sales/leads/hubspot/trustoo should accept lead and return success."""
    with patch(
        "app.API.sales.add_lead_to_hubspot",
        new_callable=AsyncMock,
    ):
        resp = await client.post(
            "/sales/leads/hubspot/trustoo",
            json={
                "name": "Test Lead",
                "phone": "0612345678",
                "email": "test@example.com",
                "postal_code": "1234AB",
                "questions_answers_text": "Q: Test? A: Yes",
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "queued" in resp.json()["message"].lower()


async def test_solvari_valid_secret(client):
    """POST /sales/leads/hubspot/solvari should accept valid secret."""
    with (
        patch(
            "app.API.sales.add_lead_to_hubspot",
            new_callable=AsyncMock,
            return_value={"status": "created"},
        ),
        patch("app.API.sales.SOLVARI_KEY", "test-secret"),
    ):
        resp = await client.post(
            "/sales/leads/hubspot/solvari",
            json={
                "secret": "test-secret",
                "first_name": "Jan",
                "last_name": "de Vries",
                "email": "jan@example.com",
                "phone": "0612345678",
            },
        )
        assert resp.status_code == 201


async def test_solvari_invalid_secret(client):
    """POST /sales/leads/hubspot/solvari should reject invalid secret."""
    resp = await client.post(
        "/sales/leads/hubspot/solvari",
        json={
            "secret": "wrong-secret",
            "first_name": "Jan",
            "last_name": "de Vries",
            "email": "jan@example.com",
            "phone": "0612345678",
        },
    )
    assert resp.status_code == 401


async def test_calendly_invitee_created_queued(client):
    """POST /sales/leads/hubspot/calendly should queue invitee.created events."""
    with patch(
        "app.API.sales.add_lead_to_hubspot",
        new_callable=AsyncMock,
    ) as mock_add_lead:
        resp = await client.post(
            "/sales/leads/hubspot/calendly",
            json={
                "event": "invitee.created",
                "payload": {
                    "name": "Jane Doe",
                    "email": "jane@example.com",
                    "questions_and_answers": [
                        {
                            "question": "Bedrijfsvorm",
                            "answer": "BV",
                        }
                    ],
                    "scheduled_event": {
                        "name": "Kennismaking",
                        "start_time": "2026-03-17T10:00:00Z",
                    },
                },
            },
        )
        assert resp.status_code == 202
        assert "queued" in resp.json()["message"].lower()
        mock_add_lead.assert_awaited_once()


async def test_calendly_non_invitee_created_ignored(client):
    """POST /sales/leads/hubspot/calendly should ignore non-target events."""
    with patch(
        "app.API.sales.add_lead_to_hubspot",
        new_callable=AsyncMock,
    ) as mock_add_lead:
        resp = await client.post(
            "/sales/leads/hubspot/calendly",
            json={
                "event": "invitee.canceled",
                "payload": {
                    "name": "Jane Doe",
                    "email": "jane@example.com",
                },
            },
        )
        assert resp.status_code == 202
        assert "ignored" in resp.json()["message"].lower()
        mock_add_lead.assert_not_called()
