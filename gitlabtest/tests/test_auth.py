"""Tests for API key authentication."""

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


async def test_valid_api_key(client, auth_headers):
    """Request with a valid API key should not get 401/403."""
    with patch(
        "app.API.operations.service_hubspot.get_owner_id",
        new_callable=AsyncMock,
        return_value={"id": "1"},
    ):
        resp = await client.get(
            "/operations/hubspot/owner", params={"deal_id": 1}, headers=auth_headers
        )
        assert resp.status_code not in (401, 403)


async def test_missing_api_key(client):
    """Request without an API key should be rejected."""
    resp = await client.get("/operations/hubspot/owner", params={"deal_id": 1})
    assert resp.status_code in (401, 403)


async def test_wrong_api_key(client, bad_auth_headers):
    """Request with wrong API key should return 401."""
    resp = await client.get(
        "/operations/hubspot/owner", params={"deal_id": 1}, headers=bad_auth_headers
    )
    assert resp.status_code == 401


async def test_auth_not_required_for_solvari(client):
    """Solvari endpoint uses its own secret, not X-API-Key."""
    resp = await client.post(
        "/sales/leads/hubspot/solvari",
        json={
            "secret": "wrong-secret",
            "first_name": "Test",
            "last_name": "User",
            "email": "test@example.com",
            "phone": "0612345678",
        },
    )
    # Should get 401 from wrong Solvari secret, NOT 403 from missing X-API-Key
    assert resp.status_code == 401


async def test_auth_not_required_for_calendly(client):
    """Calendly endpoint should accept webhook requests without X-API-Key."""
    with patch(
        "app.API.sales.add_lead_to_hubspot",
        new_callable=AsyncMock,
    ):
        resp = await client.post(
            "/sales/leads/hubspot/calendly",
            json={
                "event": "invitee.created",
                "payload": {
                    "name": "Test User",
                    "email": "test@example.com",
                },
            },
        )
        assert resp.status_code == 202
