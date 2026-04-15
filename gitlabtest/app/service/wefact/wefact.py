"""
Lightweight Wefact client helpers for creating/updating debtors (companies) from HubSpot/Clockify data.

API style: RPC-like (single POST to https://api.mijnwefact.nl/v2/ with controller/action/api_key in body).
You must adjust the payload keys for your exact Wefact setup:
 - DebtorCode vs. Identifier: use the key your instance expects for selecting a debtor.
 - CompanyName: adjust if your field differs.
 - CustomFields: ensure HUBSPOT_FIELD_KEY matches your custom field for HubSpot company record id.
 - Actions: double-check the action names (commonly "show", "edit", "add") in your docs.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import requests

from app.exceptions import WefactError

logger = logging.getLogger(__name__)

WEFACT_API_KEY = os.getenv("WEFACT_API_KEY")
WEFACT_API_URL = os.environ.get("WEFACT_API_URL", "https://api.mijnwefact.nl/v2/")
HUBSPOT_FIELD_KEY = os.environ.get("HUBSPOT_FIELD_KEY", "hubspotcompanyrecordid")

# 200 calls/minute => ~0.30s; small cushion:
WEFACT_RATE_LIMIT_DELAY = 0.31
_last_wefact_call = 0.0


def _respect_wefact_rate_limit() -> None:
    global _last_wefact_call
    now = time.time()
    elapsed = now - _last_wefact_call
    if elapsed < WEFACT_RATE_LIMIT_DELAY:
        time.sleep(WEFACT_RATE_LIMIT_DELAY - elapsed)
    _last_wefact_call = time.time()


def _wefact_post(payload: dict[str, Any]) -> dict[str, Any]:
    """POST to Wefact RPC endpoint with api_key/controller/action."""
    if not WEFACT_API_KEY:
        msg = "WEFACT_API_KEY is not set"
        raise WefactError(msg)

    base_payload = {
        "api_key": WEFACT_API_KEY,
    }
    body = {**base_payload, **payload}

    _respect_wefact_rate_limit()
    resp = requests.post(WEFACT_API_URL, json=body, timeout=20)
    if resp.status_code >= 300:
        msg = f"Wefact HTTP {resp.status_code}: {resp.text}"
        raise WefactError(msg)
    data = resp.json()
    if data.get("status") not in ("success", "ok"):
        msg = f"Wefact error: {data}"
        raise WefactError(msg)
    return data


def _debtor_show_by_code(klantnummer: str) -> dict[str, Any] | None:
    """Fetch debtor by code. Adjust 'action'/'DebtorCode' keys if your API differs."""
    try:
        res = _wefact_post(
            {
                "controller": "debtor",
                "action": "show",
                "Identifier": klantnummer,
            }
        )
        return res.get("debtor") or res.get("client") or res.get("data")
    except Exception as exc:
        logger.info(f"Debtor show failed for code {klantnummer}: {exc}")
        return None


def _debtor_list(limit: int = 10000) -> list[dict[str, Any]]:
    """
    List debtors once with a high limit; Wefact list may not include custom fields,
    so this is primarily to collect DebtorCodes for subsequent show calls.
    """
    res = _wefact_post(
        {
            "controller": "debtor",
            "action": "list",
            "limit": limit,
        }
    )
    return res.get("debtors") or res.get("clients") or res.get("data") or []


def list_invoices(status: str | None = None, limit: int = 1000) -> list[dict[str, Any]]:
    """
    List invoices from Wefact with pagination.
    - status: optional filter, see variables list for valid status codes.
    - limit: page size (default 1000 per docs).
    """
    items: list[dict[str, Any]] = []
    offset = 0
    while True:
        payload: dict[str, Any] = {
            "controller": "invoice",
            "action": "list",
            "limit": limit,
            "offset": offset,
        }
        if status:
            payload["status"] = status
        res = _wefact_post(payload)
        batch = res.get("invoices") or res.get("data") or []
        items.extend(batch)
        current = res.get("currentresults")
        total = res.get("totalresults")
        if current is None:
            if len(batch) < limit:
                break
        else:
            if current < limit:
                break
            if total is not None and (offset + current) >= total:
                break
        offset += limit
    return items


def debtor_show_by_hubspot_id(hubspot_id: str) -> dict[str, Any] | None:
    """
    Fetch debtor by custom field (HubSpot id) by:
    - listing debtors to collect DebtorCodes
    - iterating over DebtorCodes and calling show to inspect custom fields
    Stops at the first match.
    """
    try:
        items = _debtor_list(limit=10000)
        for item in items:
            code = item.get("Identifier")
            if not code:
                continue
            detail = _debtor_show_by_code(code)
            if not detail:
                continue
            custom_fields = detail.get("CustomFields") or {}
            if str(custom_fields.get(HUBSPOT_FIELD_KEY) or "") == hubspot_id:
                return detail
        return None
    except Exception as exc:
        logger.info(f"Debtor lookup by HubSpot id {hubspot_id} failed: {exc}")
        return None


def _build_debtor_payload(
    company_name: str,
    hubspot_id: str,
    contact_name: str | None = None,
    email: str | None = None,
    company_number: str | int | None = None,
    tax_number: str | None = None,
    initials: str | None = None,
    surname: str | None = None,
    address: str | None = None,
    zip_code: str | None = None,
    city: str | None = None,
    country: str | None = None,
    phone_number: str | None = None,
    include_contact_channels: bool = True,
) -> dict[str, Any]:
    """Build the common debtor fields shared by add and edit actions."""
    payload: dict[str, Any] = {
        "CompanyName": company_name,
        "CustomFields": {HUBSPOT_FIELD_KEY: hubspot_id},
    }
    if contact_name:
        payload["ContactName"] = contact_name
    if company_number:
        payload["CompanyNumber"] = str(company_number)
    if tax_number:
        payload["TaxNumber"] = tax_number
    if initials:
        payload["Initials"] = initials
    if surname:
        payload["SurName"] = surname
    if address:
        payload["Address"] = address
    if zip_code:
        payload["ZipCode"] = zip_code
    if city:
        payload["City"] = city
    if country:
        payload["Country"] = country
    if include_contact_channels and email:
        payload["EmailAddress"] = email
    if include_contact_channels and phone_number:
        payload["PhoneNumber"] = phone_number
    return payload


def _debtor_edit(
    debtor_code: str,
    company_name: str,
    hubspot_id: str,
    contact_name: str | None = None,
    email: str | None = None,
    company_number: str | int | None = None,
    tax_number: str | None = None,
    initials: str | None = None,
    surname: str | None = None,
    address: str | None = None,
    zip_code: str | None = None,
    city: str | None = None,
    country: str | None = None,
    phone_number: str | None = None,
) -> None:
    """Update debtor. Adjust payload keys per your API spec."""
    payload = _build_debtor_payload(
        company_name,
        hubspot_id,
        contact_name=contact_name,
        email=email,
        company_number=company_number,
        tax_number=tax_number,
        initials=initials,
        surname=surname,
        address=address,
        zip_code=zip_code,
        city=city,
        country=country,
        phone_number=phone_number,
        include_contact_channels=False,
    )
    payload["controller"] = "debtor"
    payload["action"] = "edit"
    payload["DebtorCode"] = str(debtor_code)
    _wefact_post(payload)


def _debtor_add(
    company_name: str,
    hubspot_id: str,
    contact_name: str | None = None,
    email: str | None = None,
    company_number: str | int | None = None,
    tax_number: str | None = None,
    initials: str | None = None,
    surname: str | None = None,
    address: str | None = None,
    zip_code: str | None = None,
    city: str | None = None,
    country: str | None = None,
    phone_number: str | None = None,
) -> dict[str, Any]:
    """Create debtor. Adjust payload keys per your API spec."""
    payload = _build_debtor_payload(
        company_name,
        hubspot_id,
        contact_name=contact_name,
        email=email,
        company_number=company_number,
        tax_number=tax_number,
        initials=initials,
        surname=surname,
        address=address,
        zip_code=zip_code,
        city=city,
        country=country,
        phone_number=phone_number,
    )
    payload["controller"] = "debtor"
    payload["action"] = "add"
    res = _wefact_post(payload)
    return res.get("debtor") or res.get("client") or res.get("data") or {}


def upsert_debtor_from_hubspot(
    hubspot_company_id: str,
    company_name: str,
    contact_name: str | None = None,
    email: str | None = None,
    wefact_id: str | None = None,
    company_number: str | int | None = None,
    tax_number: str | None = None,
    initials: str | None = None,
    surname: str | None = None,
    address: str | None = None,
    zip_code: str | None = None,
    city: str | None = None,
    country: str | None = None,
    phone_number: str | None = None,
) -> dict[str, str]:
    """
    Create a Wefact debtor using a provided Wefact ID only to detect existing records.
    - If wefact_id is provided, do not update that debtor.
    - If not provided, create a new debtor.

    Returns: {"status": "...", "debtor_code": "..."}
    """
    target_name = company_name.strip()
    if wefact_id:
        logger.info(
            "Wefact debtor left unchanged: code=%s, name='%s'.",
            wefact_id,
            target_name,
        )
        return {"status": "noop", "debtor_code": wefact_id}

    created = _debtor_add(
        target_name,
        hubspot_company_id,
        contact_name=contact_name,
        email=email,
        company_number=company_number,
        tax_number=tax_number,
        initials=initials,
        surname=surname,
        address=address,
        zip_code=str(zip_code) if zip_code else None,
        city=city,
        country=country,
        phone_number=phone_number,
    )
    new_code = created.get("Identifier") or ""
    logger.info(f"Wefact debtor created: code={new_code}, name='{target_name}'.")
    return {"status": "created", "debtor_code": new_code}
