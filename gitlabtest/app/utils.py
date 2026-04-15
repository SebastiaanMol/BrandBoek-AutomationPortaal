"""Shared utilities for working with HubSpot API responses."""

from __future__ import annotations

from datetime import UTC
from datetime import datetime
from typing import Any

# Re-export canonical helpers from the va_pipelines utils module so callers
# outside the va_pipelines package can import from a stable, top-level location.
from app.service.operations.va_pipelines.utils import chunked
from app.service.operations.va_pipelines.utils import normalize_kwartalen
from app.service.operations.va_pipelines.utils import parse_date
from app.service.operations.va_pipelines.utils import result_id
from app.service.operations.va_pipelines.utils import result_list
from app.service.operations.va_pipelines.utils import result_props


def to_int(value: Any) -> int | None:
    """Convert a value to int, returning None on failure."""
    if value is None:
        return None
    try:
        return int(str(value).strip())
    except Exception:
        return None


def parse_quarter(q_raw: Any) -> int | None:
    """Accept 'Q1', '1', 1, 'Q4', etc. Returns 1..4 or None."""
    if q_raw is None:
        return None
    s = str(q_raw).strip().upper()
    if not s:
        return None
    if s.startswith("Q"):
        s = s[1:]
    try:
        q = int(s)
        return q if 1 <= q <= 4 else None
    except Exception:
        return None


def props_of(obj: Any) -> dict[str, Any]:
    """Extract .properties from a HubSpot SDK object or dict."""
    if hasattr(obj, "properties") and obj.properties is not None:
        return dict(obj.properties)
    if isinstance(obj, dict):
        return dict(obj.get("properties", {}) or {})
    return {}


def build_deal_properties_map(deals_map: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Transform raw deals_map into normalized deal_properties dict."""
    result: dict[str, dict[str, Any]] = {}
    for did, obj in deals_map.items():
        p = props_of(obj)
        result[str(did)] = {
            "pipeline_id": p.get("pipeline"),
            "dealstage": p.get("dealstage"),
            "year": str(p.get("year") or ""),
            "quarter": str(p.get("quarter") or ""),
            "maand": str(p.get("maand") or ""),
            "amount": str(p.get("amount") or ""),
            "won_dtm": p.get("won_dtm"),
            "entered_btw_csv_a": p.get("hs_v2_date_entered_1047755303"),
            "entered_btw_csv_b": p.get("hs_v2_date_entered_1090656291"),
            "entered_btw_csv_c": p.get("hs_v2_date_entered_1162445750"),
            "entered_jr_zelf_a": p.get("hs_v2_date_entered_1086412193"),
            "entered_jr_zelf_b": p.get("hs_v2_date_entered_1012525422"),
        }
    return result


def result_after(resp: Any) -> str | None:
    """Extract the paging cursor ('after') from a HubSpot paginated response."""
    paging = getattr(resp, "paging", None)
    if paging:
        nxt = getattr(paging, "next", None)
        if nxt:
            return getattr(nxt, "after", None)
    if isinstance(resp, dict):
        return (resp.get("paging") or {}).get("next", {}).get("after")
    return None


def parse_daily_time(value: str) -> tuple[int, int]:
    """Parse a time string in HH:MM (24h) format into (hour, minute).

    Raises ValueError if the format is invalid or values are out of range.
    """
    try:
        hour_str, minute_str = value.split(":")
        hour = int(hour_str)
        minute = int(minute_str)
        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            raise ValueError
        return hour, minute
    except Exception:
        msg = "daily time must be in HH:MM (24h) format"
        raise ValueError(msg) from None


def get_year_from_date(date: str | int | None) -> int | None:
    """Extract the year from a Unix timestamp in milliseconds.

    Args:
        date: Unix timestamp in milliseconds (as int or str), or None.

    Returns:
        The year as an integer, or None if input is None.
    """
    if date is not None:
        ts_ms = int(date)
        dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=UTC)
        return dt.year
    return None


__all__ = [
    "build_deal_properties_map",
    "chunked",
    "get_year_from_date",
    "normalize_kwartalen",
    "parse_daily_time",
    "parse_date",
    "parse_quarter",
    "props_of",
    "result_after",
    "result_id",
    "result_list",
    "result_props",
    "to_int",
]
