from __future__ import annotations

import datetime
from collections.abc import Iterable
from datetime import UTC
from typing import Any


def chunked(items: Iterable[Any], size: int) -> Iterable[list[Any]]:
    chunk: list[Any] = []
    for value in items:
        chunk.append(value)
        if len(chunk) >= size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def result_list(resp: Any) -> list[Any]:
    if hasattr(resp, "results") and resp.results is not None:
        return list(resp.results)
    if isinstance(resp, dict):
        return list(resp.get("results", []) or [])
    return []


def result_props(obj: Any) -> dict[str, Any]:
    if hasattr(obj, "properties") and obj.properties is not None:
        return dict(obj.properties)
    if isinstance(obj, dict):
        return dict(obj.get("properties", {}) or {})
    return {}


def result_id(obj: Any) -> str:
    if hasattr(obj, "id"):
        return str(obj.id)
    if isinstance(obj, dict) and obj.get("id"):
        return str(obj["id"])
    return ""


def parse_date(value: str | None) -> datetime.date | None:
    """Accept ISO8601 ('YYYY-MM-DD', '...Z') or HubSpot millis -> date or None."""
    if not value:
        return None
    s = str(value)
    try:
        if s.isdigit():
            return datetime.datetime.fromtimestamp(int(s) / 1000, tz=UTC).date()
        return datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except Exception:
        return None


def normalize_kwartalen(value: Any) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return set()
        return {token.strip() for token in raw.split(";") if token.strip()}
    if isinstance(value, list):
        return {str(item).strip() for item in value if str(item).strip()}
    return {str(value).strip()}
