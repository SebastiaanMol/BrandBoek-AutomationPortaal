"""Typeform lead ingestion for HubSpot.

Handles incoming Typeform webhook payloads: submits the contact via the
HubSpot Forms API v3 (so the hutk cookie is forwarded for source attribution),
then creates the associated company, deal, and note in the sales pipeline.
"""

from __future__ import annotations

import asyncio
import datetime
import logging
import os
import re
from typing import Any

import sentry_sdk

import app.repository.hubspot as hubspot_calls
from app.exceptions import SalesLeadError
from app.schemas.classes import TypeformAnswer
from app.schemas.classes import TypeformField
from app.schemas.classes import TypeformFormResponse
from app.schemas.classes import TypeformWebhook
from app.service.rate_limiter import call_hubspot_api
from app.service.sales.constants import DEFAULT_SALES_OWNER_ID
from app.service.sales.constants import OFFERTE_VERSTUURD_STAGE_ID
from app.service.sales.constants import SALES_PIPELINE_ID_NEW
from app.service.sales.sales import add_note_to_deal
from app.service.sales.sales import create_company
from app.service.sales.sales import create_deal
from app.service.sales.sales import find_contact_by_email
from app.service.sales.sales import find_existing_company_for_contact
from app.service.sales.sales import find_sales_pipeline_deal_for_contact
from app.service.sales.sales import get_first_and_last_name

logger = logging.getLogger(__name__)

HUBSPOT_PORTAL_ID = os.getenv("HUBSPOT_PORTAL_ID", "")
HUBSPOT_TYPEFORM_FORM_GUID = os.getenv("HUBSPOT_TYPEFORM_FORM_GUID", "")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fields_by_id(form_response: TypeformFormResponse) -> dict[str, TypeformField]:
    definition = form_response.definition
    if not definition or not definition.fields:
        return {}
    return {f.id: f for f in definition.fields if f.id}


def _clean_title(title: str) -> str:
    """Remove unresolved Typeform {{field:...}} placeholders from field titles."""
    cleaned = re.sub(r",?\s*\{\{field:[^}]+\}\}", "", title)
    return re.sub(r"\s{2,}", " ", cleaned).strip(" ,!")


def _field_title(
    answer: TypeformAnswer, fields_by_id: dict[str, TypeformField]
) -> str | None:
    """Return the human-readable title for an answer's field."""
    field = answer.field
    if not field:
        return None
    raw = field.title
    if not raw and field.id:
        def_field = fields_by_id.get(field.id)
        raw = def_field.title if def_field else None
    return _clean_title(raw) if raw else None


def get_answer_value(answer: TypeformAnswer) -> str | None:
    """Extract the string value from a Typeform answer regardless of type."""
    match answer.type:
        case "text" | "long_text" | "short_text":
            return answer.text
        case "email":
            return answer.email
        case "phone_number":
            return answer.phone_number
        case "number":
            return str(answer.number) if answer.number is not None else None
        case "boolean":
            return "Ja" if answer.boolean else "Nee"
        case "choice":
            return (answer.choice or {}).get("label")
        case "choices":
            choices = answer.choices or {}
            parts = list(choices.get("labels", []))
            if choices.get("other"):
                parts.append(choices["other"])
            return "\n".join(parts) if parts else None
        case "date":
            return answer.date
        case "url":
            return answer.url
        case "file_url":
            return answer.file_url
        case _:
            return None


def get_answer_by_titles(
    answers: list[TypeformAnswer],
    fields_by_id: dict[str, TypeformField],
    *titles: str,
) -> str | None:
    """Return the value of the first answer whose field title matches one of the
    given titles (case-insensitive)."""
    normalized = {t.strip().lower() for t in titles}
    for answer in answers:
        title = _field_title(answer, fields_by_id)
        if title and title.strip().lower() in normalized:
            return get_answer_value(answer)
    return None


def get_answer_by_title_keyword(
    answers: list[TypeformAnswer],
    fields_by_id: dict[str, TypeformField],
    *keywords: str,
) -> str | None:
    """Return the value of the first answer whose field title CONTAINS one of the
    given keywords (case-insensitive). Used for long or dynamic field titles."""
    normalized = [k.strip().lower() for k in keywords]
    for answer in answers:
        title = _field_title(answer, fields_by_id)
        if title:
            title_lower = title.strip().lower()
            if any(kw in title_lower for kw in normalized):
                return get_answer_value(answer)
    return None


def get_email_from_answers(answers: list[TypeformAnswer]) -> str | None:
    """Find the email answer by its Typeform type (type == 'email')."""
    for answer in answers:
        if answer.type == "email" and answer.email:
            return answer.email
    return None


def get_phone_from_answers(
    answers: list[TypeformAnswer],
    fields_by_id: dict[str, TypeformField],
) -> str | None:
    """Find a phone number from a phone_number-typed answer or by field title."""
    for answer in answers:
        if answer.type == "phone_number" and answer.phone_number:
            return answer.phone_number
    return get_answer_by_titles(
        answers, fields_by_id, "telefoonnummer", "telefoon", "phone", "phone number"
    ) or get_answer_by_title_keyword(answers, fields_by_id, "telefoonnummer", "phone")


def get_company_from_answers(
    answers: list[TypeformAnswer],
    fields_by_id: dict[str, TypeformField],
) -> str | None:
    """Find a company name by exact field title or keyword fallback."""
    return get_answer_by_titles(
        answers,
        fields_by_id,
        "bedrijfsnaam",
        "bedrijf",
        "company",
        "company name",
        "organisatie",
    ) or get_answer_by_title_keyword(answers, fields_by_id, "bedrijfsnaam", "company")


# ---------------------------------------------------------------------------
# Note formatting
# ---------------------------------------------------------------------------


def format_typeform_note(form_response: TypeformFormResponse) -> str:
    """Build an HTML note body from all Q&A in the form response."""
    answers = form_response.answers or []
    fbi = _fields_by_id(form_response)
    lines: list[str] = []
    for answer in answers:
        title = _field_title(answer, fbi) or "Vraag"
        value = get_answer_value(answer) or ""
        lines.append(f"{title}: {value}")
    return "<br>".join(lines)


# ---------------------------------------------------------------------------
# Forms API v3 payload builder
# ---------------------------------------------------------------------------


def build_forms_api_payload(
    form_response: TypeformFormResponse,
) -> tuple[list[dict[str, str]], dict[str, str]]:
    """Build the fields list and context dict for a HubSpot Forms API v3 submission.

    Returns:
        fields: List of {objectTypeId, name, value} dicts for each contact property.
        context: Dict with hutk and/or pageUri for source attribution.
    """
    answers = form_response.answers or []
    hidden = form_response.hidden
    fbi = _fields_by_id(form_response)

    email = get_email_from_answers(answers)

    # Resolve name — prefer explicit first/last fields, fall back to a full-name field
    firstname = get_answer_by_titles(
        answers, fbi, "voornaam", "first name", "firstname"
    )
    lastname = get_answer_by_titles(
        answers, fbi, "achternaam", "last name", "lastname", "familienaam"
    )
    if not firstname:
        full_name = get_answer_by_titles(
            answers, fbi, "naam", "name", "volledige naam", "full name"
        )
        if full_name:
            parsed = get_first_and_last_name(full_name)
            firstname = parsed["firstname"]
            lastname = lastname or parsed["lastname"]

    phone = get_phone_from_answers(answers, fbi)
    company = get_company_from_answers(answers, fbi)

    fields: list[dict[str, str]] = []

    def _add(name: str, value: str | None) -> None:
        if value:
            fields.append({"objectTypeId": "0-1", "name": name, "value": value})

    _add("email", email)
    _add("firstname", firstname)
    _add("lastname", lastname)
    _add("phone", phone)
    _add("company", company)

    if hidden:
        _add("utm_source", hidden.utm_source)
        _add("utm_medium", hidden.utm_medium)
        _add("utm_campaign", hidden.utm_campaign)
        _add("utm_term", hidden.utm_term)
        _add("utm_content", hidden.utm_content)

    context: dict[str, str] = {}
    if hidden and hidden.hubspot_utk:
        context["hutk"] = hidden.hubspot_utk

    return fields, context


# ---------------------------------------------------------------------------
# Object properties builder
# ---------------------------------------------------------------------------


def create_object_properties_from_typeform(
    form_response: TypeformFormResponse,
    hs_owner_id: str | None = None,
) -> tuple[str | None, dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Derive company, deal, and note properties from a Typeform form response.

    Contact creation is handled separately via the Forms API v3, so this
    function only returns (email, company_props, deal_props, note_props).
    The email is returned so the caller can look up the contact ID after
    the Forms API submission.
    """
    hs_owner_id = hs_owner_id or DEFAULT_SALES_OWNER_ID
    answers = form_response.answers or []
    fbi = _fields_by_id(form_response)

    email = get_email_from_answers(answers)

    firstname = get_answer_by_titles(
        answers, fbi, "voornaam", "first name", "firstname"
    )
    lastname = get_answer_by_titles(
        answers, fbi, "achternaam", "last name", "lastname", "familienaam"
    )
    if not firstname:
        full_name = get_answer_by_titles(
            answers, fbi, "naam", "name", "volledige naam", "full name"
        )
        if full_name:
            parsed = get_first_and_last_name(full_name)
            firstname = parsed["firstname"]
            lastname = lastname or parsed["lastname"]

    display_name = " ".join(p for p in [firstname, lastname] if p).strip()

    company_name = get_company_from_answers(answers, fbi) or (
        f"{display_name} - bedrijf" if display_name else "Typeform lead - bedrijf"
    )

    phone = get_phone_from_answers(answers, fbi)

    hs_company_properties: dict[str, Any] = {
        "name": company_name,
        "phone": phone,
        "hubspot_owner_id": hs_owner_id,
    }

    hs_deal_properties: dict[str, Any] = {
        "dealname": f"{display_name} - {company_name}"
        if display_name and company_name
        else company_name or display_name or "Typeform lead",
        "dealstage": OFFERTE_VERSTUURD_STAGE_ID,
        "email": email,
        "pipeline": SALES_PIPELINE_ID_NEW,
        "amount": "0",
        "lead_source_wiecher": "Google",
        "hubspot_owner_id": hs_owner_id,
    }

    hs_note_properties: dict[str, Any] = {
        "hubspot_owner_id": hs_owner_id,
        "hs_note_body": format_typeform_note(form_response),
        "hs_timestamp": int(datetime.datetime.now().timestamp() * 1000),
    }

    return email, hs_company_properties, hs_deal_properties, hs_note_properties


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


async def process_typeform_lead(webhook: TypeformWebhook) -> dict[str, str]:
    """Ingest a Typeform form response into HubSpot.

    Flow:
    1. Submit contact fields + UTMs + hutk to the HubSpot Forms API v3.
       This creates or updates the contact and attributes the source correctly.
    2. Look up the contact by email to retrieve the HubSpot contact ID.
    3. Skip if the contact already has a deal in the sales pipeline.
    4. Reuse an existing company or create a new one.
    5. Create the deal and attach a note with all Q&A.
    """
    form_response = webhook.form_response
    if not form_response:
        return {"message": "No form_response in payload"}

    if not HUBSPOT_PORTAL_ID or not HUBSPOT_TYPEFORM_FORM_GUID:
        logger.error("HUBSPOT_PORTAL_ID or HUBSPOT_TYPEFORM_FORM_GUID not configured")
        msg = "Forms API credentials not configured"
        raise SalesLeadError(msg)

    email = get_email_from_answers(form_response.answers or [])
    if not email:
        logger.warning("Typeform: no email found in form response — skipping")
        return {"message": "No email found in form response — lead skipped"}

    fields, context = build_forms_api_payload(form_response)

    submitted_at_ms: int | None = None
    if form_response.submitted_at:
        try:
            dt = datetime.datetime.fromisoformat(
                form_response.submitted_at.replace("Z", "+00:00")
            )
            submitted_at_ms = int(dt.timestamp() * 1000)
        except ValueError:
            pass

    try:
        await call_hubspot_api(
            hubspot_calls.submit_contact_via_forms_api,
            HUBSPOT_PORTAL_ID,
            HUBSPOT_TYPEFORM_FORM_GUID,
            fields,
            context or None,
            submitted_at_ms,
        )
        logger.info("Typeform: Forms API v3 submission succeeded for %s", email)
    except Exception as e:
        sentry_sdk.capture_exception(e)
        msg = f"Forms API v3 submission failed: {e!s}"
        logger.exception(msg)
        raise SalesLeadError(msg) from e

    # The Forms API processes submissions asynchronously, so retry a few times
    # to give HubSpot time to create the contact before we look it up.
    contact_id = None
    for attempt in range(1, 5):
        try:
            contact_id = await call_hubspot_api(find_contact_by_email, email)
        except Exception as e:
            sentry_sdk.capture_exception(e)
            msg = f"Error finding contact: {e!s}"
            logger.exception(msg)
            raise SalesLeadError(msg) from e
        if contact_id:
            break
        logger.info(
            "Typeform: contact not found yet for %s (attempt %d/4), retrying in 3s",
            email,
            attempt,
        )
        await asyncio.sleep(3)

    if not contact_id:
        msg = f"Contact not found after Forms API submission for {email}"
        logger.warning("Typeform: %s", msg)
        raise SalesLeadError(msg)

    logger.info("Typeform: resolved contact %s for %s", contact_id, email)

    gclid = form_response.hidden.gclid if form_response.hidden else None
    if gclid:
        try:
            await call_hubspot_api(
                hubspot_calls.update_contact,
                str(contact_id),
                {"hs_google_click_id": gclid},
            )
            logger.info("Typeform: set hs_google_click_id on contact %s", contact_id)
        except Exception as e:
            sentry_sdk.capture_exception(e)
            logger.exception("Typeform: failed to set hs_google_click_id: %s", e)

    existing_deal_id = await find_sales_pipeline_deal_for_contact(str(contact_id))
    if existing_deal_id:
        logger.info(
            "Typeform duplicate skipped: contact %s already has deal %s in sales pipeline",
            contact_id,
            existing_deal_id,
        )
        return {
            "message": "Typeform lead skipped: contact already has a deal in sales pipeline"
        }

    _, company_props, deal_props, note_props = create_object_properties_from_typeform(
        form_response
    )

    existing_company_id = await find_existing_company_for_contact(str(contact_id))
    if existing_company_id:
        company_id = existing_company_id
        logger.info("Typeform: reused existing company %s", company_id)
    else:
        try:
            company_id = await call_hubspot_api(
                create_company, company_props, contact_id
            )
            logger.info("Typeform: created company %s", company_id)
        except Exception as e:
            sentry_sdk.capture_exception(e)
            msg = f"Error creating company: {e!s}"
            logger.exception(msg)
            raise SalesLeadError(msg) from e

    try:
        deal_id = await call_hubspot_api(
            create_deal, deal_props, contact_id, company_id
        )
        logger.info("Typeform: created deal %s", deal_id)
    except Exception as e:
        sentry_sdk.capture_exception(e)
        msg = f"Error creating deal: {e!s}"
        logger.exception(msg)
        raise SalesLeadError(msg) from e

    try:
        await call_hubspot_api(add_note_to_deal, note_props, deal_id)
        logger.info("Typeform: added note to deal %s", deal_id)
    except Exception as e:
        sentry_sdk.capture_exception(e)
        # Note failure is non-fatal — log and continue
        logger.exception("Typeform: error adding note to deal %s: %s", deal_id, e)

    return {"message": f"Typeform lead processed: contact {contact_id}, deal {deal_id}"}
