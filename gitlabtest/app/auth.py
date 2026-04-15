from __future__ import annotations

import os
import secrets

from fastapi import HTTPException
from fastapi import Security
from fastapi.security import APIKeyHeader
from starlette.status import HTTP_401_UNAUTHORIZED

API_KEY: str | None = os.getenv("BRAND_API_KEY")

api_key_header = APIKeyHeader(name="X-API-Key")


def get_api_key(api_key_header: str = Security(api_key_header)) -> str:
    if secrets.compare_digest(api_key_header, API_KEY or ""):
        return api_key_header
    raise HTTPException(
        status_code=HTTP_401_UNAUTHORIZED, detail="Invalid or missing API Key"
    )
