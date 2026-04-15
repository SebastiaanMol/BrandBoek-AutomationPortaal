from __future__ import annotations

import base64
import logging
import os
from collections import defaultdict
from datetime import datetime
from datetime import timedelta
from typing import Any

import requests
import sentry_sdk

from app.hubspot_client import get_hs_headers
from app.service.rate_limiter import call_hubspot_api

FACTUUR_STUREN_API_KEY = os.getenv("FACTUURSTUREN_API_KEY")

logger = logging.getLogger(__name__)

headers = get_hs_headers()


def search_factuur_by_invoice_number(invoice_number: str) -> dict[str, Any] | None:
    """MAKES CALL TO HUBSPOT API
    Search for a factuur (custom object) in HubSpot by invoice number.

    Parameters:
    - invoice_number (str): The invoice number to search for

    Returns:
    - dict or None: The matching factuur record, or None if not found
    """
    url = "https://api.hubapi.com/crm/v3/objects/2-43860158/search"

    payload = {
        "filterGroups": [
            {
                "filters": [
                    {
                        "propertyName": "factuurnummer",
                        "operator": "EQ",
                        "value": invoice_number,
                    }
                ]
            }
        ],
        # Add more if needed
        "properties": [
            "factuurnummer",
            "bedrijf__zoals_vermeld_op_factuur_",
            "bedrag",
            "nog_te_betalen",
            "vervaldatum",
            "verstuurd_datum",
            "vorige_reminder_datum",
            "betaald_datum",
        ],
        "limit": 1,
    }

    response = requests.post(url, headers=headers, json=payload)

    if response.status_code == 200:
        results = response.json().get("results", [])
        return results[0] if results else None

    logger.error(f"Search failed: {response.status_code} - {response.text}")
    return None


async def update_factuur_by_factuurnummer(
    factuurnummer: str, updated_properties: dict[str, Any]
) -> Any:
    """Updates all given properties on a HubSpot factuur record.

    Args:
        factuurnummer (str): The invoice number to search for the factuur record
        updated_properties (dict): Dictionary of properties to update

    Returns:
        dict: The response from the HubSpot API after updating the factuur
    """

    factuur = await call_hubspot_api(search_factuur_by_invoice_number, factuurnummer)
    factuur_id = factuur["id"]
    return await call_hubspot_api(
        update_factuur_properties, factuur_id, updated_properties
    )


def update_factuur_properties(
    factuur_id: str, updated_properties: dict[str, Any]
) -> bool:
    """MAKES CALL TO HUBSPOT API
    Updates properties of a factuur (custom object) in HubSpot.

    Args:
        factuur_id (str): The ID of the factuur to update.
        updated_properties (dict): A dictionary of properties to update.

    Returns:
        bool: True if the update was successful, False otherwise.
    """

    url = f"https://api.hubapi.com/crm/v3/objects/2-43860158/{factuur_id}"
    payload = {"properties": updated_properties}

    response = requests.patch(url, headers=headers, json=payload)

    if response.status_code == 200:
        logger.info(f"Successfully updated factuur {factuur_id}")
        return True
    logger.error(
        f"Update failed for factuur {factuur_id}: {response.status_code} - {response.text}"
    )
    return False


def create_auth_header() -> dict[str, str]:
    """
    Creates the Authorization header for the API requests.

    Returns:
        dict: A dictionary containing the Authorization header.
    """

    username = "brandboekhouders"
    api_key = FACTUUR_STUREN_API_KEY
    # Combine the username and api_key with a colon in between
    auth_string = f"{username}:{api_key}"

    # Base64 encode the authentication string
    base64_encoded = base64.b64encode(auth_string.encode("utf-8")).decode("utf-8")

    # Return the Authorization header
    return {"Authorization": f"Basic {base64_encoded}"}


def get_invoices(filters: str) -> list[dict[str, Any]]:
    """MAKES CALL TO FACTUURSTUREN API
    Fetches all invoices from the Factuursturen API with optional filters.

    Args:
        filters (str): Query parameters for filtering invoices, e.g. '?status=paid'.

    Returns:
        list: A list of all invoices fetched from the API.
    """

    all_invoices = []
    start = 0
    count = 100  # Adjust as needed; default is 100

    headers = create_auth_header()
    headers["Accept"] = "application/json"

    while True:
        url = f"https://www.factuursturen.nl/api/v1/invoices?start={start}&count={count}{filters}"
        response = requests.get(url, headers=headers)

        if response.status_code != 200:
            logger.error(
                f"Failed to fetch invoices. Status Code: {response.status_code}"
            )
            break

        batch = response.json()

        if not isinstance(batch, list):
            logger.error("Unexpected response format")
            break

        if not batch:
            break  # No more records

        all_invoices.extend(batch)
        start += count  # Move to next page

    return all_invoices


def find_contact(
    email: str | None, contact_name: str | None, company_name: str | None
) -> str | None:
    """MAKES CALL TO HUBSPOT API
    Searches for a contact in HubSpot by one or more emails, contact name, or company name.

    Args:
        email (str): The email address(es) of the contact (can be comma-separated).
        contact_name (str): The name of the contact.
        company_name (str): The name of the company.

    Returns:
        str: The ID of the contact if found, otherwise None.
    """
    import requests

    email_list = [e.strip() for e in email.split(",")] if email else []

    url = "https://api.hubapi.com/crm/v3/objects/contacts/search"

    # Try each email one by one
    for email_item in email_list:
        data: dict[str, Any] = {
            "filterGroups": [
                {
                    "filters": [
                        {"propertyName": "email", "operator": "EQ", "value": email_item}
                    ]
                },
                {
                    "filters": [
                        {
                            "propertyName": "hs_additional_emails",
                            "operator": "CONTAINS_TOKEN",
                            "value": email_item,
                        }
                    ]
                },
            ]
        }
        response = requests.post(url, headers=headers, json=data)
        results = response.json().get("results", [])
        if results:
            return results[0]["id"]

    # If no contact found via email, try contact name
    if contact_name:
        data = {"query": contact_name}
        response = requests.post(url, headers=headers, json=data)
        results = response.json().get("results", [])
        if results:
            return results[0]["id"]

    # If still no result, try company name
    if company_name:
        url = "https://api.hubapi.com/crm/v3/objects/companies/search"
        data = {
            "filterGroups": [
                {
                    "filters": [
                        {
                            "propertyName": "name",
                            "operator": "CONTAINS_TOKEN",
                            "value": company_name,
                        }
                    ]
                }
            ]
        }
        response = requests.post(url, headers=headers, json=data)
        results = response.json().get("results")
        if results:
            objectId = results[0]["id"]
            url = f"https://api.hubapi.com/crm/v4/objects/companies/{objectId}/associations/contacts"
            response = requests.get(url, headers=headers)
            results = response.json().get("results")
            contact_ids = [item["toObjectId"] for item in results]
            if len(contact_ids) == 1:
                return contact_ids[0]

    return None


def create_factuur_object(invoice: dict[str, Any]) -> dict[str, Any]:
    """MAKES CALL TO HUBSPOT API
    Creates a new factuur (custom object) in HubSpot with the given invoice data.

    Args:
        invoice (dict): The invoice data containing properties like 'invoicenr', 'email', etc.

    Returns:
        dict: The response from the HubSpot API after creating the factuur.
    """

    url = "https://api.hubapi.com/crm/v3/objects/2-43860158"

    reference_obj = invoice.get("reference", {})
    reference_text = "\n".join(
        filter(
            None,
            [
                reference_obj.get("line1", ""),
                reference_obj.get("line2", ""),
                reference_obj.get("line3", ""),
            ],
        )
    )

    data = {
        "properties": {
            "factuurnummer": invoice.get("invoicenr"),
            "email": invoice.get("email"),
            "naam__zoals_vermeld_op_factuur_": invoice.get("contact"),
            "bedrijf__zoals_vermeld_op_factuur_": invoice.get("company"),
            "bedrag": invoice.get("totalintax"),
            "nog_te_betalen": invoice.get("open"),
            "vervaldatum": invoice.get("duedate"),
            "verstuurd_datum": invoice.get("sent"),
            "vorige_reminder_datum": invoice.get("lastreminder"),
            "betaald_datum": invoice.get("paiddate"),
            "referentie": reference_text,
        }
    }

    response = requests.post(url, headers=headers, json=data)

    # Log status and errors
    if response.status_code != 201:
        logger.error(
            f"❌ Failed to create invoice {invoice.get('invoicenr')}. Status: {response.status_code}, Response: {response.text}"
        )
    else:
        logger.info(f"✅ Successfully created invoice {invoice.get('invoicenr')}")

    return response.json()


def associate_factuur_with_contact(factuur_id: str, contact_id: str) -> bool:
    """MAKES CALL TO HUBSPOT API
    Associates a factuur (custom object) with a contact in HubSpot.

    Args:
        factuur_id (str): The ID of the factuur to associate.
        contact_id (str): The ID of the contact to associate with.

    Returns:
        bool: True if the association was successful, False otherwise.
    """

    url = f"https://api.hubapi.com/crm/v3/objects/2-43860158/{factuur_id}/associations/contact/{contact_id}/contact_to_facturen"
    response = requests.put(url, headers=headers)
    return response.status_code in {200, 204}


def normalize(value: Any) -> str:
    """Normalizes a value to a string, stripping whitespace and handling None.

    Args:
        value: The value to normalize, can be any type.

    Returns:
        str: The normalized string value, or an empty string if None.
    """

    return str(value).strip() if value is not None else ""


async def sync_open_invoices() -> None:
    """Syncs open invoices from Factuursturen API to HubSpot."""

    logger.info("🔄 Syncing open invoices for updates...")

    since_date = "2024-11-08"
    filters = f"&since={since_date}&filter=open"
    invoices = await call_hubspot_api(get_invoices, filters)

    if not invoices:
        logger.warning("⚠️ No open invoices retrieved.")
        return

    logger.info(f"📥 {len(invoices)} open invoices retrieved.")

    updated_invoices = []

    for invoice in invoices:
        factuurnummer = invoice.get("invoicenr")
        existing_factuur = await call_hubspot_api(
            search_factuur_by_invoice_number, factuurnummer
        )

        if not existing_factuur:
            continue

        reference_obj = invoice.get("reference", {})
        reference_text = "\n".join(
            filter(
                None,
                [
                    reference_obj.get("line1", ""),
                    reference_obj.get("line2", ""),
                    reference_obj.get("line3", ""),
                ],
            )
        )

        updated_properties = {
            "factuurnummer": factuurnummer,
            "email": invoice.get("email"),
            "naam__zoals_vermeld_op_factuur_": invoice.get("contact"),
            "bedrijf__zoals_vermeld_op_factuur_": invoice.get("company"),
            "bedrag": invoice.get("totalintax"),
            "nog_te_betalen": invoice.get("open"),
            "vervaldatum": invoice.get("duedate"),
            "verstuurd_datum": invoice.get("sent"),
            "vorige_reminder_datum": invoice.get("lastreminder"),
            "betaald_datum": invoice.get("paiddate"),
            "referentie": reference_text,
        }

        existing_props = existing_factuur.get("properties", {})

        changed = False

        if normalize(existing_props.get("nog_te_betalen")) != normalize(
            updated_properties.get("nog_te_betalen")
        ):
            changed = True

        # Only compare 'vorige_reminder_datum' if at least one side has a value
        existing_reminder = normalize(existing_props.get("vorige_reminder_datum"))
        new_reminder = normalize(updated_properties.get("vorige_reminder_datum"))
        if existing_reminder or new_reminder:
            if existing_reminder != new_reminder:
                changed = True

        if changed:
            await update_factuur_by_factuurnummer(factuurnummer, updated_properties)
            updated_invoices.append(factuurnummer)
            logger.info(f"🔄 Updated invoice {factuurnummer}")

    logger.info(f"✅ Open invoice update complete: {len(updated_invoices)} updated.")


async def create_new_invoices_from_yesterday() -> None:
    """Creates new invoices in HubSpot from those sent yesterday in Factuursturen API."""

    logger.info("🆕 Creating invoices sent yesterday...")

    yesterday = (datetime.today() - timedelta(days=1)).strftime("%Y-%m-%d")
    filters = f"&since={yesterday}"
    invoices = await call_hubspot_api(get_invoices, filters)

    if not invoices:
        logger.warning("⚠️ No new invoices found.")
        return

    created_invoices = []
    successful_associations = []
    unmatched_invoices = []

    for invoice in invoices:
        factuurnummer = invoice.get("invoicenr")
        existing_factuur = await call_hubspot_api(
            search_factuur_by_invoice_number, factuurnummer
        )

        if existing_factuur:
            continue  # Already exists

        new_factuur = await call_hubspot_api(create_factuur_object, invoice)
        new_factuur_id = new_factuur.get("id")
        created_invoices.append(factuurnummer)
        logger.info(f"🆕 Created new invoice {factuurnummer}")

        if new_factuur_id:
            email = invoice.get("email")
            contact_id = await call_hubspot_api(
                find_contact, email, invoice.get("contact"), invoice.get("company")
            )
            if contact_id and await call_hubspot_api(
                associate_factuur_with_contact, new_factuur_id, contact_id
            ):
                successful_associations.append(contact_id)
            else:
                unmatched_invoices.append(invoice)

    logger.info(
        f"✅ New invoice creation complete: {len(created_invoices)} created, {len(successful_associations)} associated, {len(unmatched_invoices)} unmatched."
    )


def update_expired_flags() -> None:
    """MAKES CALL TO HUBSPOT API
    Updates the 'verlopen' flag for facturen based on their vervaldatum and nog_te_betalen properties.
    """

    url = "https://api.hubapi.com/crm/v3/objects/2-43860158"

    params: dict[str, str | int | list[str]] = {
        "limit": 100,
        "properties": ["vervaldatum", "verlopen", "factuurnummer", "nog_te_betalen"],
    }

    while True:
        response = requests.get(url, headers=headers, params=params)
        data = response.json()

        for factuur in data.get("results", []):
            props = factuur.get("properties", {})
            vervaldatum_str = props.get("vervaldatum")
            verlopen_raw = (props.get("verlopen") or "").lower()
            verlopen_current = verlopen_raw == "true"
            factuurnummer = props.get("factuurnummer")
            factuur_id = factuur.get("id")

            if not vervaldatum_str or not factuur_id:
                continue

            try:
                vervaldatum = datetime.strptime(vervaldatum_str, "%Y-%m-%d").date()
                vandaag = datetime.today().date()
                is_expired = vervaldatum < vandaag

                try:
                    nog_te_betalen = float(props.get("nog_te_betalen", "0") or 0)
                except ValueError:
                    nog_te_betalen = 0

                still_owed = nog_te_betalen > 0
                should_be_verlopen = is_expired and still_owed

                # Only update if the current value differs from what it should be
                if should_be_verlopen != verlopen_current:
                    patch_url = (
                        f"https://api.hubapi.com/crm/v3/objects/2-43860158/{factuur_id}"
                    )
                    patch_payload = {"properties": {"verlopen": should_be_verlopen}}
                    requests.patch(patch_url, headers=headers, json=patch_payload)
                    logger.info(
                        f"🔄 Updated {factuurnummer}: verlopen → {should_be_verlopen}"
                    )

            except Exception as e:
                sentry_sdk.capture_exception(e)
                logger.warning(f"⚠️ Skipping {factuurnummer} due to error: {e}")

        if not data.get("paging") or not data["paging"].get("next"):
            break
        after = data["paging"]["next"]["after"]
        params["after"] = after


def get_all_facturen() -> list[dict[str, Any]]:
    """MAKES CALL TO HUBSPOT API
    Fetches all facturen (custom objects) from HubSpot.

    Returns:
        list: A list of all facturen fetched from the API.
    """

    url: str | None = (
        "https://api.hubapi.com/crm/v3/objects/2-43860158?limit=100&properties=nog_te_betalen&properties=bedrag"
    )
    facturen = []
    while url:
        response = requests.get(url, headers=headers)
        data = response.json()
        facturen.extend(data.get("results", []))
        paging = data.get("paging", {}).get("next", {}).get("link")
        url = paging if paging else None
    return facturen


def get_associated_contact(factuur_id: str) -> str | None:
    """MAKES CALL TO HUBSPOT API
    Retrieves the associated contact ID for a given factuur ID.

    Args:
        factuur_id (str): The ID of the factuur to check.

    Returns:
        str or None: The ID of the associated contact, or None if not found.
    """

    url = f"https://api.hubapi.com/crm/v4/objects/2-43860158/{factuur_id}/associations/contacts"
    response = requests.get(url, headers=headers)
    results = response.json().get("results", [])
    if results:
        return results[0]["toObjectId"]
    return None


def update_contact_total(contact_id: str, total: float) -> bool:
    """MAKES CALL TO HUBSPOT API
    Updates the 'nog_te_betalen_totaal' property for a contact in HubSpot.

    Args:
        contact_id (str): The ID of the contact to update.
        total (float): The new total amount to set for 'nog_te_betalen_totaal'.

    Returns:
        bool: True if the update was successful, False otherwise.
    """

    url = f"https://api.hubapi.com/crm/v3/objects/contacts/{contact_id}"
    payload = {"properties": {"nog_te_betalen_totaal": total}}
    response = requests.patch(url, headers=headers, json=payload)
    return response.status_code == 200


def get_current_contact_total(contact_id: str) -> float:
    """MAKES CALL TO HUBSPOT API
    Retrieves the current 'nog_te_betalen_totaal' for a contact.

    Args:
        contact_id (str): The ID of the contact to check.

    Returns:
        float: The current total amount for 'nog_te_betalen_totaal', or 0 if not found.
    """

    url = f"https://api.hubapi.com/crm/v3/objects/contacts/{contact_id}?properties=nog_te_betalen_totaal"
    response = requests.get(url, headers=get_hs_headers())
    if response.status_code == 200:
        data = response.json()
        return float(data.get("properties", {}).get("nog_te_betalen_totaal", 0) or 0)
    logger.error(
        f"⚠️ Failed to retrieve current total for contact {contact_id}, status {response.status_code}"
    )
    return 0


async def sync_outstanding_totals() -> None:
    """Syncs the total outstanding amounts for contacts based on their associated facturen."""

    facturen = await call_hubspot_api(get_all_facturen)
    contact_totals: dict[str, float] = defaultdict(float)

    for factuur in facturen:
        factuur_id = factuur["id"]
        props = factuur.get("properties", {})
        open_amount = float(props.get("nog_te_betalen", 0) or 0)

        contact_id = await call_hubspot_api(get_associated_contact, factuur_id)
        if contact_id:
            # Add open amount (normal case)
            contact_totals[contact_id] += open_amount

    for contact_id, new_total in contact_totals.items():
        current_total = await call_hubspot_api(get_current_contact_total, contact_id)

        if round(current_total, 2) != round(new_total, 2):  # Compare rounded floats
            await call_hubspot_api(update_contact_total, contact_id, new_total)
            logger.info(
                f"🔄 Updated contact {contact_id} from {current_total} to {new_total}"
            )
