from __future__ import annotations

import os

from hubspot import Client
from urllib3.util.retry import Retry

HS_ACCESS_TOKEN = os.getenv("HS_ACCESS_TOKEN")


def get_hs_headers() -> dict[str, str]:
    """Return standard HubSpot REST API headers for requests-based calls."""
    return {
        "Authorization": f"Bearer {HS_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }


# Disable automatic HTTP retries to avoid duplicate creates on POST
_retry = Retry(
    total=0,
    connect=0,
    read=0,
    status=0,
    redirect=0,
    backoff_factor=0,
    raise_on_status=False,
)

client = Client.create(access_token=HS_ACCESS_TOKEN, retry=_retry)
