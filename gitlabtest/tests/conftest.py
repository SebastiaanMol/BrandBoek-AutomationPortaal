"""Shared test fixtures for the Brand Automations test suite."""

import pytest


@pytest.fixture(autouse=True)
def _mock_env(monkeypatch):
    """Set required environment variables and patch module-level reads.

    Several modules read os.getenv() at import time (before monkeypatch can
    set the env var).  We patch both the env AND the already-resolved
    module-level variables so tests see the correct values.
    """
    monkeypatch.setenv("BRAND_API_KEY", "test-api-key")
    monkeypatch.setenv("HS_ACCESS_TOKEN", "fake-hs-token")
    monkeypatch.setenv("SENTRY_DSN", "")
    monkeypatch.setenv("WEFACT_API_KEY", "fake-wefact-key")
    monkeypatch.setenv("WEFACT_API_URL", "https://api.mijnwefact.nl/v2/")
    monkeypatch.setenv("CLOCKIFY_API_KEY", "fake-clockify-key")
    monkeypatch.setenv("SOLVARI_KEY", "fake-solvari-key")
    monkeypatch.setenv("OPENSTAAND_SYNC_ENABLED", "false")
    monkeypatch.setenv("LOG_LEVEL", "WARNING")

    # Patch module-level variables that were already read at import time
    import app.auth

    monkeypatch.setattr(app.auth, "API_KEY", "test-api-key")


@pytest.fixture()
def auth_headers():
    """Valid API key headers for authenticated endpoints."""
    return {"X-API-Key": "test-api-key"}


@pytest.fixture()
def bad_auth_headers():
    """Invalid API key headers."""
    return {"X-API-Key": "wrong-key"}
