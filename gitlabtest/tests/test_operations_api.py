"""Tests for the operations API router endpoints."""

from unittest.mock import AsyncMock
from unittest.mock import MagicMock
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


async def test_get_owner_returns_404_when_not_found(client, auth_headers):
    """GET /operations/hubspot/owner should return 404 when owner not found."""
    with patch(
        "app.API.operations.service_hubspot.get_owner_id",
        new_callable=AsyncMock,
        return_value=None,
    ):
        resp = await client.get(
            "/operations/hubspot/owner",
            params={"deal_id": 999},
            headers=auth_headers,
        )
        assert resp.status_code == 404


async def test_get_owner_returns_data(client, auth_headers):
    """GET /operations/hubspot/owner should return owner data when found."""
    mock_owner = {"id": "123", "name": "Test Owner"}
    with patch(
        "app.API.operations.service_hubspot.get_owner_id",
        new_callable=AsyncMock,
        return_value=mock_owner,
    ):
        resp = await client.get(
            "/operations/hubspot/owner",
            params={"deal_id": 100},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json() == mock_owner


async def test_create_new_deal_success(client, auth_headers):
    """POST /operations/hubspot/create_new_deal should call service and return success."""
    with patch(
        "app.API.operations.create_new_deal",
        new_callable=AsyncMock,
        return_value={"id": "new-deal"},
    ):
        resp = await client.post(
            "/operations/hubspot/create_new_deal",
            json={"deal_id": "12345"},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert "message" in resp.json()


async def test_create_new_deal_error(client, auth_headers):
    """POST /operations/hubspot/create_new_deal should return 400 on service error."""
    with patch(
        "app.API.operations.create_new_deal",
        new_callable=AsyncMock,
        side_effect=ValueError("Deal creation failed"),
    ):
        resp = await client.post(
            "/operations/hubspot/create_new_deal",
            json={"deal_id": "12345"},
            headers=auth_headers,
        )
        assert resp.status_code == 400


async def test_active_pipelines(client, auth_headers):
    """GET /operations/hubspot/active_pipelines should return pipeline list."""
    mock_pipeline = MagicMock()
    mock_pipeline.to_dict.return_value = {"id": "123", "label": "Test Pipeline"}

    with patch(
        "app.API.operations.service_hubspot.get_active_pipelines",
        new_callable=AsyncMock,
        return_value=[mock_pipeline],
    ):
        resp = await client.get(
            "/operations/hubspot/active_pipelines",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["label"] == "Test Pipeline"


async def test_operations_requires_auth(client):
    """Operations endpoints should require authentication."""
    resp = await client.get("/operations/hubspot/owner", params={"deal_id": 1})
    assert resp.status_code in (401, 403)
