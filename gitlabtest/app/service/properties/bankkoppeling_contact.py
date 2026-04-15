from __future__ import annotations

import logging
from typing import Any

import app.repository.hubspot as hubspot_calls
from app.service.rate_limiter import call_hubspot_api
from app.utils import props_of

logger = logging.getLogger(__name__)

BANKKOPPELING_ACTIEF = "Actief"
KLANTENBESTAND_PIPELINE_ID = "5941173"
KLANTENBESTAND_EXCLUDED_STAGES = {"1189168762", "1176430505"}
KLANTENBESTAND_ALWAYS_ELIGIBLE_STAGES = {"1233079418", "1244326492"}
PROP_BEDRIJVEN_ZONDER_BANKKOPPELING = "bedrijven_zonder_bankkoppeling"


async def sync_bedrijven_zonder_bankkoppeling(company_id: int | str) -> dict[str, Any]:
    """Update bedrijven_zonder_bankkoppeling on all contacts associated with company_id.

    For each contact associated with the given company, looks at all companies
    linked to that contact and builds a comma-separated list of company names
    where the company has a deal in the klantenbestand pipeline (5941173) with
    activiteit=Actief and not in an excluded dealstage, and bankkoppeling_status
    is not 'Actief'. Writes this to the contact property bedrijven_zonder_bankkoppeling.
    """
    company_id_str = str(company_id)

    # 1. Get all contacts for the trigger company
    contacts_by_company = await call_hubspot_api(
        hubspot_calls.batch_get_contacts_for_companies,
        [company_id_str],
    )
    contact_ids: list[str] = contacts_by_company.get(company_id_str, [])

    if not contact_ids:
        logger.info("No contacts found for company %s", company_id_str)
        return {
            "message": "No contacts found for company; no action taken.",
            "company_id": company_id_str,
            "contacts_updated": 0,
        }

    # 2. For each contact, get all their associated companies
    companies_by_contact = await call_hubspot_api(
        hubspot_calls.batch_get_companies_for_contacts,
        contact_ids,
    )

    # 3. Collect all unique company IDs across all contacts
    all_company_ids: set[str] = set()
    for cids in companies_by_contact.values():
        all_company_ids.update(cids)

    # 4. Batch-fetch name and bankkoppeling_status for all companies
    companies = await call_hubspot_api(
        hubspot_calls.batch_get_companies_info,
        list(all_company_ids),
        ["name", "bankkoppeling_status"],
    )

    company_info: dict[str, dict[str, str]] = {}
    for company in companies or []:
        p = props_of(company)
        company_info[str(company.id)] = {
            "name": p.get("name") or "",
            "status": p.get("bankkoppeling_status") or "",
        }

    # 5. Fetch deals for all companies and determine which are in an eligible stage
    deals_by_company = await call_hubspot_api(
        hubspot_calls.batch_get_associations,
        "company",
        "deal",
        list(all_company_ids),
    )
    all_deal_ids: list[str] = [
        deal_id for deal_ids in deals_by_company.values() for deal_id in deal_ids
    ]
    deals = (
        await call_hubspot_api(
            hubspot_calls.batch_get_deals_info,
            all_deal_ids,
            ["pipeline", "dealstage", "activiteit"],
        )
        if all_deal_ids
        else []
    )

    # Build set of company IDs that have an eligible klantenbestand deal
    eligible_company_ids: set[str] = set()
    deal_to_company: dict[str, str] = {
        deal_id: company_id
        for company_id, deal_ids in deals_by_company.items()
        for deal_id in deal_ids
    }
    for deal in deals or []:
        p = props_of(deal)
        if str(p.get("pipeline") or "") == KLANTENBESTAND_PIPELINE_ID and (
            str(p.get("dealstage") or "") in KLANTENBESTAND_ALWAYS_ELIGIBLE_STAGES
            or (
                str(p.get("activiteit") or "") == "Actief"
                and str(p.get("dealstage") or "") not in KLANTENBESTAND_EXCLUDED_STAGES
            )
        ):
            cid = deal_to_company.get(str(deal.id))
            if cid:
                eligible_company_ids.add(cid)

    # 6. For each contact build the inactive-companies list and update
    results: list[dict[str, Any]] = []
    for contact_id in contact_ids:
        contact_company_ids = companies_by_contact.get(str(contact_id), [])
        inactive_names = sorted(
            info["name"]
            for cid in contact_company_ids
            if (info := company_info.get(str(cid)))
            and str(cid) in eligible_company_ids
            and info["status"] != BANKKOPPELING_ACTIEF
        )
        new_value = ", ".join(inactive_names)

        await call_hubspot_api(
            hubspot_calls.update_contact,
            str(contact_id),
            {PROP_BEDRIJVEN_ZONDER_BANKKOPPELING: new_value},
        )
        logger.info(
            "Updated bedrijven_zonder_bankkoppeling for contact %s: %s",
            contact_id,
            inactive_names,
        )
        results.append(
            {
                "contact_id": contact_id,
                "bedrijven_zonder_bankkoppeling": new_value,
            }
        )

    return {
        "message": "bedrijven_zonder_bankkoppeling updated.",
        "company_id": company_id_str,
        "contacts_updated": len(results),
        "results": results,
    }
