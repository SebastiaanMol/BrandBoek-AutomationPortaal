from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi import HTTPException
from fastapi import Security

from app.auth import get_api_key
from app.repository.hubspot import update_company_properties
from app.schemas.classes import WefactDebtorUpsert
from app.service.wefact.wefact import debtor_show_by_hubspot_id
from app.service.wefact.wefact import upsert_debtor_from_hubspot

router = APIRouter(
    prefix="/wefact",
    tags=["wefact"],
    responses={404: {"description": "Not found"}},
    dependencies=[Security(get_api_key)],
)


@router.post("/hubspot/upsert_debtor")
async def upsert_wefact_debtor_from_hubspot(
    payload: WefactDebtorUpsert,
) -> dict[str, Any]:
    """
    Upsert a Wefact debtor from HubSpot data.
    - Looks up by HubSpot id (custom field) via list action; optional fallback to provided debtor_code.
    - If found and already matches (name + HubSpot id), no call is made (returns status 'noop').
    - Otherwise updates the debtor, or creates a new one if none found.
    """
    result = upsert_debtor_from_hubspot(
        hubspot_company_id=str(payload.record_id),
        company_name=payload.company_name,
        contact_name=payload.contact_name,
        email=payload.email,
        wefact_id=str(payload.wefact_id) if payload.wefact_id is not None else None,
        company_number=payload.company_number,
        tax_number=str(payload.tax_number) if payload.tax_number is not None else None,
        initials=payload.initials,
        surname=payload.surname,
        address=payload.address,
        zip_code=str(payload.zip_code) if payload.zip_code is not None else None,
        city=payload.city,
        country=payload.country,
        phone_number=payload.phone_number,
    )
    if result.get("status") == "created" and result.get("debtor_code"):
        update_company_properties(
            company_id=int(payload.record_id),
            properties={"wefact_company_id": result["debtor_code"]},
        )
    return {
        "status": result.get("status"),
        "debtor_code": result.get("debtor_code"),
        "record_id": payload.record_id,
        "company_name": payload.company_name,
        "contact_name": payload.contact_name,
        "email": payload.email,
        "wefact_id": payload.wefact_id,
        "company_number": payload.company_number,
        "tax_number": payload.tax_number,
        "initials": payload.initials,
        "surname": payload.surname,
        "address": payload.address,
        "zip_code": payload.zip_code,
        "city": payload.city,
        "country": payload.country,
        "phone_number": payload.phone_number,
    }


@router.get("/hubspot/test_list")
async def test_list_by_hubspot_id(hubspot_id: str) -> dict[str, Any]:
    """
    Test-only endpoint: look up a debtor by HubSpot id using the list action and return raw data.
    No create/update side effects.
    """
    result = debtor_show_by_hubspot_id(hubspot_id)
    if not result:
        raise HTTPException(status_code=404, detail="Not found")
    return {"found": True, "hubspot_id": hubspot_id, "debtor": result}
