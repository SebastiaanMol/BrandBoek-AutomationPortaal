from __future__ import annotations

import datetime
import logging
from collections import defaultdict
from typing import Any

import requests
import sentry_sdk

import app.repository.hubspot as hubspot_calls
from app.constants import DEAL_TO_COMPANY_ASSOC_TYPE
from app.constants import DEAL_TO_CONTACT_ASSOC_TYPE
from app.constants import NOTE_TO_CONTACT_ASSOC_TYPE
from app.constants import NOTE_TO_DEAL_ASSOC_TYPE
from app.exceptions import SalesLeadError
from app.hubspot_client import client
from app.hubspot_client import get_hs_headers
from app.schemas.classes import CalendlyLead
from app.schemas.classes import TrustooLead
from app.service.rate_limiter import call_hubspot_api
from app.service.sales.constants import DEFAULT_SALES_OWNER_ID
from app.service.sales.constants import FYSIEKE_AFSPRAAK_STAGE_ID
from app.service.sales.constants import OFFERTE_VERSTUURD_STAGE_ID
from app.service.sales.constants import SALES_PIPELINE_ID_NEW

logger = logging.getLogger(__name__)

_HS_HEADERS = get_hs_headers()


def format_ligo_email(raw_email_data: str) -> dict[str, str | None]:
    """Parses the raw email data from Ligo and returns a dictionary with properties.

    Args:
        raw_email_data (str): The raw email data from Ligo.

    Returns:
        dict: A dictionary containing the parsed properties.
    """

    sections = raw_email_data.split("*")
    # Discard the first and last sections
    sections = sections[1:-1]
    properties: dict[str, str | None] = {
        "description": sections[0].replace("\n", "").strip(),
        "first_name": sections[1].replace("\n", "").strip(),
        "last_name": sections[2].replace("\n", "").strip(),
        "email": sections[3].replace("\n", "").strip(),
        "phone": sections[4].replace("\n", "").strip(),
    }

    for key, value in list(properties.items()):
        if value is not None and "-" in value:
            properties[key] = None

    return properties


def format_trustoo_questions(questions_answers_text: str) -> dict[str, str]:
    """Parses the questions and answers text from Trustoo and returns a dictionary.

    Args:
        questions_answers_text (str): The text containing questions and answers.
    Returns:
        dict: A dictionary with questions as keys and answers as values.
    """

    if not isinstance(questions_answers_text, str):
        return {}

    lines = questions_answers_text.strip().split("\n")
    questions_answers = {}

    for line in lines:
        if ": " in line:
            question, answer = line.split(": ", 1)
            questions_answers[question.strip()] = answer.strip()

    return questions_answers


def format_trustoo_note(questions_answers_text: str) -> str:
    """
    Parses the questions and answers text from Trustoo and returns a single string.
    Example output:
        "Boekhouder voor: Volledige boekhouding\nRechtsvorm: BV\nJaaromzet: €50.000 tot €100.000"
    """
    if not isinstance(questions_answers_text, str):
        return ""

    lines = questions_answers_text.strip().split("\n")
    qa_lines = []

    for line in lines:
        if ":" in line:
            question, answer = line.split(":", 1)
            qa_lines.append(f"{question.strip()}: {answer.strip()}")

    return "\n".join(qa_lines)


def convert_rechtsvorm_to_standard(rechtsvorm: str) -> str | None:
    """Converts the rechtsvorm (legal form) to a standard format.

    Args:
        rechtsvorm (str): The legal form as provided in the Trustoo lead.

    Returns:
        str: The standardized legal form.
    """

    if "BV" in rechtsvorm:
        output = "BV"
    elif "Stichting" in rechtsvorm:
        output = "Stichting/Vereniging"
    elif "VOF" in rechtsvorm:
        output = "VOF/Maatschap"
    elif "ZZP" in rechtsvorm:
        output = "Eenmanszaak/ZZP"
    else:
        output = None
    return output


def create_object_properties_from_trustoo(
    lead: TrustooLead,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Creates HubSpot object properties from a Trustoo lead.

    Args:
        lead (TrustooLead): The Trustoo lead object containing the lead information.

    Returns:
        tuple: A tuple containing dictionaries for contact, company, deal, and note properties.
    """

    hs_owner_id = DEFAULT_SALES_OWNER_ID
    pipeline_id = SALES_PIPELINE_ID_NEW
    deal_stage = OFFERTE_VERSTUURD_STAGE_ID

    names = get_first_and_last_name(lead.name or "")

    hubspot_contact_properties = {
        "email": lead.email,
        "firstname": names["firstname"],
        "lastname": names["lastname"],
        "phone": lead.phone,
        "city": lead.place_name,
        "zip": lead.postal_code,
        "address": f"{lead.street_name} {lead.house_number}"
        if lead.street_name and lead.house_number
        else None,
        "hubspot_owner_id": hs_owner_id,
    }
    formatted_trustoo_answers = format_trustoo_questions(
        lead.questions_answers_text or ""
    )

    company_name = formatted_trustoo_answers.get("Bedrijfsnaam", lead.name)

    hs_company_properties = {
        "name": company_name,
        "phone": lead.phone,
        "city": lead.place_name,
        "zip": lead.postal_code,
        "address": f"{lead.street_name} {lead.house_number}"
        if lead.street_name and lead.house_number
        else None,
        "bedrijfsvorm": convert_rechtsvorm_to_standard(
            formatted_trustoo_answers["Rechtsvorm"]
        )
        if "Rechtsvorm" in formatted_trustoo_answers
        else None,
        "hubspot_owner_id": hs_owner_id,
    }

    hs_deal_properties = {
        "dealname": f"{lead.name} - {company_name} - Trustoo"
        if company_name != lead.name
        else f"{lead.name} - Trustoo",
        "dealstage": deal_stage,
        "email": None,
        "pipeline": pipeline_id,
        "amount": 0,
        "lead_source_wiecher": "Trustoo",
        "hubspot_owner_id": hs_owner_id,
    }

    note_content = format_trustoo_note(lead.questions_answers_text or "")

    hs_note_properties = {
        "hubspot_owner_id": hs_owner_id,
        "hs_note_body": note_content,
        "hs_timestamp": int(datetime.datetime.now().timestamp() * 1000),
    }

    return (
        hubspot_contact_properties,
        hs_company_properties,
        hs_deal_properties,
        hs_note_properties,
    )


def create_object_properties_from_ligo(
    properties: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Creates HubSpot object properties from a Ligo lead.

    Args:
        properties (dict): A dictionary containing the lead information from Ligo.

    Returns:
        tuple: A tuple containing dictionaries for contact, company, deal, and note properties.
    """

    hs_owner_id = DEFAULT_SALES_OWNER_ID
    pipeline_id = SALES_PIPELINE_ID_NEW
    deal_stage = OFFERTE_VERSTUURD_STAGE_ID

    hs_contact_properties = {
        "email": properties["email"],
        "firstname": properties["first_name"],
        "lastname": properties["last_name"],
        "phone": properties["phone"],
        "hubspot_owner_id": hs_owner_id,
    }

    hs_company_properties = {
        "name": f"{properties['first_name']} {properties['last_name']}",
        "phone": properties["phone"],
        "hubspot_owner_id": hs_owner_id,
    }

    hs_deal_properties = {
        "dealname": properties["first_name"]
        + " "
        + properties["last_name"]
        + " - Ligo",
        "dealstage": deal_stage,
        "email": properties["email"],
        "pipeline": pipeline_id,
        "amount": 0,
        "lead_source_wiecher": "Ligo",
        "hubspot_owner_id": hs_owner_id,
    }

    note_content = properties["description"]

    hs_note_properties = {
        "hubspot_owner_id": hs_owner_id,
        "hs_note_body": note_content,
        "hs_timestamp": int(datetime.datetime.now().timestamp() * 1000),
    }

    return (
        hs_contact_properties,
        hs_company_properties,
        hs_deal_properties,
        hs_note_properties,
    )


def map_bedrijfsvorm(input_value: str) -> str | None:
    if not input_value:
        return None

    cleaned_value = input_value.strip().lower()

    mapping = {
        "eenmanszaak / zzp": "Eenmanszaak/ZZP",
        "eenmanszaak/zzp": "Eenmanszaak/ZZP",
        "vof/maatschap": "VOF/Maatschap",
        "bv": "BV",
        "stichting/vereniging": "Stichting/Vereniging",
        "inkomstenbelasting aangifte / particulier": "Inkomstenbelasting Aangifte / Particulier",
    }

    return mapping.get(cleaned_value, input_value.strip())


def map_bedrijfsvorm_solvari(additional_data: list[Any]) -> str | None:
    for item in additional_data:
        if item.question == "Bedrijfsvorm":
            answer = item.answer or ""
            if "Eenmanszaak" in answer or "ZZP" in answer:
                return "Eenmanszaak/ZZP"
            if "BV" in answer:
                return "BV"
            if "VOF" in answer or "Maatschap" in answer:
                return "VOF/Maatschap"
            if "Stichting" in answer or "Vereniging" in answer:
                return "Stichting/Vereniging"
    return None


def map_bedrijfsvorm_for_company_name(bedrijfsvorm: str | None) -> str | None:
    if bedrijfsvorm == "Eenmanszaak/ZZP":
        return "EZ"
    if bedrijfsvorm == "BV":
        return "BV"
    if bedrijfsvorm == "VOF/Maatschap":
        return "VOF"
    if bedrijfsvorm == "Stichting/Vereniging":
        return "Stichting"
    return None


def create_object_properties_from_offertenl(
    properties: Any,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    hs_owner_id = DEFAULT_SALES_OWNER_ID
    pipeline_id = SALES_PIPELINE_ID_NEW
    deal_stage = OFFERTE_VERSTUURD_STAGE_ID

    names = get_first_and_last_name(properties.name)

    hubspot_contact_properties = {
        "email": properties.email,
        "firstname": names["firstname"],
        "lastname": names["lastname"],
        "phone": properties.phone,
        "city": properties.city,
        "country": properties.country["name"] if properties.country else None,
        "zip": properties.postcode,
        "state": properties.region,
        "address": f"{properties.street} {properties.housenumber}"
        if properties.street and properties.housenumber
        else None,
        "hubspot_owner_id": hs_owner_id,
    }

    hs_company_properties = {
        "name": properties.companyname,
        "phone": properties.phone,
        "city": properties.city,
        "country": properties.country["name"] if properties.country else None,
        "zip": properties.postcode,
        "state": properties.region,
        "address": f"{properties.street} {properties.housenumber}"
        if properties.street and properties.housenumber
        else None,
        "bedrijfsvorm": map_bedrijfsvorm(properties.questions.get("Bedrijfsvorm"))
        if properties.questions
        else None,
        "hubspot_owner_id": hs_owner_id,
    }

    deal_name = f"{properties.name} - {properties.companyname} - Offerte.nl"

    hs_deal_properties = {
        "dealname": deal_name,
        "dealstage": deal_stage,
        "email": properties.email,
        "pipeline": pipeline_id,
        "amount": "0",
        "lead_source_wiecher": "Offerte.nl",
        "hubspot_owner_id": hs_owner_id,
    }

    def safe_q(key: str) -> str:
        return (properties.questions.get(key) or "") if properties.questions else ""

    note_content = (
        "\n <br><b> Werkzaamheden: </b><br> \n"
        + safe_q("Werkzaamheden")
        + "\n <br><b> Kunt u online werken met de boekhouder? </b><br>\n"
        + safe_q("Kunt u online werken met de boekhouder?")
        + "\n <br><b> Aantal in- en verkoopfacturen (incl. bonnetjes) per maand: </b><br>\n"
        + safe_q("Aantal in- en verkoopfacturen (incl. bonnetjes) per maand")
        + "\n <br><b> Notities: </b><br>\n"
        + (properties.notes or "").replace("**", "<br>")
    )

    hs_note_properties = {
        "hubspot_owner_id": hs_owner_id,
        "hs_note_body": note_content,
        "hs_timestamp": int(datetime.datetime.now().timestamp() * 1000),
    }

    return (
        hubspot_contact_properties,
        hs_company_properties,
        hs_deal_properties,
        hs_note_properties,
    )


def create_object_properties_from_solvari(
    properties: Any,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    hs_owner_id = DEFAULT_SALES_OWNER_ID
    pipeline_id = SALES_PIPELINE_ID_NEW
    deal_stage = OFFERTE_VERSTUURD_STAGE_ID

    # Handle names — assuming 'first_name' and 'last_name' are already separate
    firstname = properties.first_name
    lastname = properties.last_name
    if firstname in {"-", "/"}:
        firstname = ""

    if lastname in {"-", "/"}:
        lastname = ""

    hubspot_contact_properties = {
        "email": properties.email,
        "firstname": firstname,
        "lastname": lastname,
        "phone": properties.phone,
        "city": properties.city,
        "country": properties.country,
        "zip": properties.zip_code,
        "address": f"{properties.street} {properties.house_nr}"
        if properties.street and properties.house_nr
        else None,
        "hubspot_owner_id": hs_owner_id,
    }

    bedrijfsvorm = (
        map_bedrijfsvorm_solvari(properties.additional_data)
        if properties.additional_data
        else None
    )
    bedrijfsvorm_for_company_name = (
        map_bedrijfsvorm_for_company_name(bedrijfsvorm) if bedrijfsvorm else None
    )
    company_name = (
        f"{firstname} {lastname} - {bedrijfsvorm_for_company_name}"
        if bedrijfsvorm_for_company_name
        else f"{firstname} {lastname}"
    )

    hs_company_properties = {
        "name": company_name,
        "phone": properties.phone,
        "city": properties.city,
        "country": properties.country,
        "zip": properties.zip_code,
        "state": None,
        "address": f"{properties.street} {properties.house_nr}"
        if properties.street and properties.house_nr
        else None,
        "hubspot_owner_id": hs_owner_id,
        "bedrijfsvorm": bedrijfsvorm,
    }

    hs_deal_properties = {
        "dealname": company_name,
        "dealstage": deal_stage,
        "email": properties.email,
        "pipeline": pipeline_id,
        "amount": "0",
        "lead_source_wiecher": "Solvari",
        "hubspot_owner_id": hs_owner_id,
    }

    note_content = ""

    if properties.additional_data:
        grouped = defaultdict(list)
        for item in properties.additional_data:
            if item.question and item.answer:
                grouped[item.question].append(item.answer.strip())

        note_content += "<b>Extra informatie:</b><br>"
        for question, answers in grouped.items():
            joined_answers = ", ".join(sorted(answers))
            note_content += f"<b>{question}:</b> {joined_answers}<br>"

    if properties.description:
        note_content += f"<br><b>Beschrijving:</b> {properties.description}<br>"

    hs_note_properties = {
        "hubspot_owner_id": hs_owner_id,
        "hs_note_body": note_content,
        "hs_timestamp": int(datetime.datetime.now().timestamp() * 1000),
    }

    return (
        hubspot_contact_properties,
        hs_company_properties,
        hs_deal_properties,
        hs_note_properties,
    )


def format_calendly_note(lead: CalendlyLead) -> str:
    payload = lead.payload
    if payload is None:
        return ""

    questions = payload.questions_and_answers
    lines: list[str] = []

    if questions:
        for item in questions:
            if not item.question and not item.answer:
                continue
            question = (item.question or "Question").strip()
            answer = (item.answer or "").strip()
            lines.append(f"{question}: {answer}")

    return "<br>".join(lines)


def get_calendly_answer(
    questions: list[Any] | None, *question_names: str
) -> str | None:
    if not questions:
        return None

    normalized_names = {name.strip().lower() for name in question_names}
    for item in questions:
        question = getattr(item, "question", None)
        answer = getattr(item, "answer", None)
        if (
            question
            and answer
            and question.strip().lower() in normalized_names
            and answer.strip()
        ):
            return answer.strip()
    return None


def get_calendly_event_owner_email(lead: CalendlyLead) -> str | None:
    payload = lead.payload
    scheduled_event = payload.scheduled_event if payload else None
    memberships = scheduled_event.event_memberships if scheduled_event else None
    if not memberships:
        return None

    for membership in memberships:
        email = str(getattr(membership, "user_email", "") or "").strip().lower()
        if email:
            return email
    return None


async def get_hubspot_owner_id_by_email(email: str | None) -> str | None:
    if not email:
        return None

    owners = await call_hubspot_api(hubspot_calls.get_active_owners)
    normalized_email = email.strip().lower()
    for owner in owners or []:
        owner_email = str(getattr(owner, "email", "") or "").strip().lower()
        owner_id = str(getattr(owner, "id", "") or "").strip()
        if owner_email == normalized_email and owner_id:
            return owner_id
    return None


def create_object_properties_from_calendly(
    lead: CalendlyLead,
    hs_owner_id: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    hs_owner_id = hs_owner_id or DEFAULT_SALES_OWNER_ID
    pipeline_id = SALES_PIPELINE_ID_NEW
    deal_stage = FYSIEKE_AFSPRAAK_STAGE_ID

    payload = lead.payload
    questions = payload.questions_and_answers if payload else None
    tracking = payload.tracking if payload else None
    full_name = (
        payload.name
        if payload and payload.name
        else " ".join(
            part
            for part in [
                payload.first_name if payload else None,
                payload.last_name if payload else None,
            ]
            if part
        ).strip()
    )
    names = get_first_and_last_name(full_name)
    explicit_company_name = get_calendly_answer(
        questions, "Bedrijfsnaam", "Company name"
    )
    company_name = (
        explicit_company_name
        if explicit_company_name
        else f"{full_name} - bedrijf"
        if full_name
        else "Calendly lead - bedrijf"
    )
    phone_number = get_calendly_answer(
        questions, "Telefoonnummer", "Phone number", "Phone"
    )
    hs_contact_properties = {
        "email": payload.email if payload else None,
        "firstname": names["firstname"],
        "lastname": names["lastname"],
        "phone": phone_number or (payload.text_reminder_number if payload else None),
        "hubspot_owner_id": hs_owner_id,
        **(
            {"utm_source": tracking.utm_source}
            if tracking and tracking.utm_source
            else {}
        ),
        **(
            {"utm_medium": tracking.utm_medium}
            if tracking and tracking.utm_medium
            else {}
        ),
        **(
            {"utm_campaign": tracking.utm_campaign}
            if tracking and tracking.utm_campaign
            else {}
        ),
        **({"utm_term": tracking.utm_term} if tracking and tracking.utm_term else {}),
        **(
            {"utm_content": tracking.utm_content}
            if tracking and tracking.utm_content
            else {}
        ),
        **(
            {"google_ad_click_id": tracking.salesforce_uuid}
            if tracking and tracking.salesforce_uuid
            else {}
        ),
    }

    hs_company_properties = {
        "name": company_name,
        "phone": phone_number or (payload.text_reminder_number if payload else None),
        "hubspot_owner_id": hs_owner_id,
    }

    hs_deal_properties = {
        "dealname": f"{full_name} - {company_name}"
        if full_name and company_name
        else company_name or full_name or "Calendly lead",
        "dealstage": deal_stage,
        "email": payload.email if payload else None,
        "pipeline": pipeline_id,
        "amount": "0",
        "lead_source_wiecher": "Calendly",
        "hubspot_owner_id": hs_owner_id,
    }

    hs_note_properties = {
        "hubspot_owner_id": hs_owner_id,
        "hs_note_body": format_calendly_note(lead),
        "hs_timestamp": int(datetime.datetime.now().timestamp() * 1000),
    }

    return (
        hs_contact_properties,
        hs_company_properties,
        hs_deal_properties,
        hs_note_properties,
    )


def get_first_and_last_name(name: str) -> dict[str, str | None]:
    """
    Splits a full name into first and last name.
    Args:
        name (str): The full name to be split.
    Returns:
        dict: A dictionary containing 'firstName' and 'lastName'.
    """

    name = name.strip()

    # Return empty names if the input is empty after stripping
    if not name:
        return {"firstname": None, "lastname": None}

    # Split the name by whitespace
    names = name.split()

    # Assign based on number of name parts
    if len(names) == 1:
        firstname = names[0]
        lastname = None
    else:
        firstname = names[0]
        lastname = " ".join(names[1:])

    return {"firstname": firstname, "lastname": lastname}


def create_contact(hs_contact_properties: dict[str, Any]) -> str:
    """MAKES CALL TO HUBSPOT API
    Creates a contact in HubSpot with the provided properties.

    Args:
        hs_contact_properties (dict): The properties of the contact to create.

    Returns:
        str: The ID of the created contact.
    """

    input_object = {"properties": hs_contact_properties, "associations": []}

    try:
        api_response = client.crm.contacts.basic_api.create(input_object)
    except Exception as e:
        corr_id = None
        if hasattr(e, "response"):
            headers = getattr(e.response, "headers", None)
            if headers:
                corr_id = headers.get("x-hubspot-correlation-id")
        logger.exception("create_contact error corr_id=%s err=%s", corr_id, e)
        raise

    # Return the contact id of the contact just created
    return api_response.id


def find_contact_by_email(email: str) -> str | None:
    """Finds a contact by email (including additional emails)."""
    if not email:
        return None
    url = "https://api.hubapi.com/crm/v3/objects/contacts/search"
    payload = {
        "filterGroups": [
            {
                "filters": [
                    {
                        "propertyName": "email",
                        "operator": "EQ",
                        "value": email,
                    }
                ]
            },
            {
                "filters": [
                    {
                        "propertyName": "hs_additional_emails",
                        "operator": "CONTAINS_TOKEN",
                        "value": email,
                    }
                ]
            },
        ],
        "properties": ["email"],
        "limit": 1,
    }
    response = requests.post(url, headers=_HS_HEADERS, json=payload)
    if response.status_code == 200:
        results = response.json().get("results", [])
        if results:
            return results[0]["id"]
        return None

    logger.warning(
        "Contact search failed for email %s: %s %s",
        email,
        response.status_code,
        response.text,
    )
    return None


def create_company(hs_company_properties: dict[str, Any], contact_id: int | str) -> str:
    """MAKES CALL TO HUBSPOT API
    Creates a company in HubSpot with the provided properties and associates it with a contact.

    Args:
        hs_company_properties (dict): The properties of the company to create.
        contact_id (str): The ID of the contact to associate with the company.

    Returns:
        str: The ID of the created company.
    """

    input_object = {
        "properties": hs_company_properties,
        "associations": [
            {
                "to": {"id": str(contact_id)},
                "types": [
                    {
                        "associationCategory": "HUBSPOT_DEFINED",
                        "associationTypeId": NOTE_TO_CONTACT_ASSOC_TYPE,
                    }
                ],
            }
        ],
    }

    api_response = client.crm.companies.basic_api.create(input_object)

    # Return the contact id of the contact just created
    return api_response.id


def create_deal(
    hs_deal_properties: dict[str, Any], contact_id: int | str, company_id: int | str
) -> str:
    """MAKES CALL TO HUBSPOT API
    Creates a deal in HubSpot with the provided properties and associates it with a contact and a company.

    Args:
        hs_deal_properties (dict): The properties of the deal to create.
        contact_id (str): The ID of the contact to associate with the deal.
        company_id (str): The ID of the company to associate with the deal.

    Returns:
        str: The ID of the created deal.
    """

    input_object = {
        "properties": hs_deal_properties,
        "associations": [
            {
                "to": {"id": str(contact_id)},
                "types": [
                    {
                        "associationCategory": "HUBSPOT_DEFINED",
                        "associationTypeId": DEAL_TO_CONTACT_ASSOC_TYPE,
                    }
                ],
            },
            {
                "to": {"id": str(company_id)},
                "types": [
                    {
                        "associationCategory": "HUBSPOT_DEFINED",
                        "associationTypeId": DEAL_TO_COMPANY_ASSOC_TYPE,
                    }
                ],
            },
        ],
    }

    api_response = client.crm.deals.basic_api.create(input_object)

    # Return the deal id of the deal just created
    return api_response.id


def add_note_to_deal(hs_note_properties: dict[str, Any], deal_id: int | str) -> Any:
    """MAKES CALL TO HUBSPOT API
    Adds a note to a deal in HubSpot.

    Args:
        hs_note_properties (dict): The properties of the note to create.
        deal_id (str): The ID of the deal to associate with the note.

    Returns:
        str: The ID of the created note.
    """

    input_object = {
        "properties": hs_note_properties,
        "associations": [
            {
                "to": {"id": str(deal_id)},
                "types": [
                    {
                        "associationCategory": "HUBSPOT_DEFINED",
                        "associationTypeId": NOTE_TO_DEAL_ASSOC_TYPE,
                    }
                ],
            }
        ],
    }

    return client.crm.objects.notes.basic_api.create(input_object)


async def find_sales_pipeline_deal_for_contact(contact_id: str) -> str | None:
    """Returns the deal ID if the contact already has a deal in the sales pipeline."""
    deal_ids = await call_hubspot_api(hubspot_calls.get_deals_for_contact, contact_id)
    if not deal_ids:
        return None
    deals = await call_hubspot_api(
        hubspot_calls.batch_get_deals_info, deal_ids, ["pipeline"]
    )
    for deal in deals or []:
        pipeline = (deal.properties or {}).get("pipeline")
        if pipeline == SALES_PIPELINE_ID_NEW:
            return deal.id
    return None


async def find_existing_company_for_contact(contact_id: str) -> str | None:
    """Returns the first company ID already associated with the contact, if any."""
    company_ids = await call_hubspot_api(
        hubspot_calls.get_companies_for_contact, contact_id
    )
    return str(company_ids[0]) if company_ids else None


async def add_lead_to_hubspot(
    properties: Any, lead_source: str
) -> dict[str, str] | None:
    """Adds a lead to HubSpot based on the lead source and properties provided.

    Args:
        properties (dict): A dictionary containing the lead properties.
        lead_source (str): The source of the lead, e.g., "trustoo", "ligo", or "offerte.nl".

    Returns:
        dict: A dictionary containing a success message.
    """

    if lead_source == "trustoo":
        lead_properties_formatted = create_object_properties_from_trustoo(properties)
    elif lead_source == "ligo":
        lead_properties_formatted = create_object_properties_from_ligo(properties)
    elif lead_source == "offerte.nl":
        lead_properties_formatted = create_object_properties_from_offertenl(properties)
    elif lead_source == "solvari":
        lead_properties_formatted = create_object_properties_from_solvari(properties)
    elif lead_source == "calendly":
        calendly_owner_email = get_calendly_event_owner_email(properties)
        calendly_owner_id = await get_hubspot_owner_id_by_email(calendly_owner_email)
        lead_properties_formatted = create_object_properties_from_calendly(
            properties, calendly_owner_id
        )

    email = (
        lead_properties_formatted[0].get("email")
        if lead_properties_formatted[0]
        else None
    )

    try:
        contact_id = await call_hubspot_api(find_contact_by_email, email)
        if contact_id:
            if lead_source == "calendly":
                await call_hubspot_api(
                    hubspot_calls.update_contact,
                    str(contact_id),
                    lead_properties_formatted[0],
                )
                logger.info("Updated existing Calendly contact")
            logger.info("Reused Contact")
        else:
            contact_id = await call_hubspot_api(
                create_contact, lead_properties_formatted[0]
            )
            logger.info("Created Contact")
    except Exception as e:
        sentry_sdk.capture_exception(e)
        msg = f"Error finding/creating contact: {e!s}"
        logger.exception(msg)
        raise SalesLeadError(msg) from e

    if lead_source == "calendly":
        existing_deal_id = await find_sales_pipeline_deal_for_contact(str(contact_id))
        if existing_deal_id:
            logger.info(
                "Calendly duplicate skipped: contact %s already has deal %s in sales pipeline",
                contact_id,
                existing_deal_id,
            )
            return {
                "message": "Calendly lead skipped: contact already has a deal in sales pipeline"
            }

    if lead_source == "calendly":
        existing_company_id = await find_existing_company_for_contact(str(contact_id))
    else:
        existing_company_id = None

    if existing_company_id:
        company_id = existing_company_id
        logger.info(
            "Reused existing company %s for Calendly contact %s", company_id, contact_id
        )
    else:
        try:
            company_id = await call_hubspot_api(
                create_company, lead_properties_formatted[1], contact_id
            )
            logger.info("Created Company")
        except Exception as e:
            sentry_sdk.capture_exception(e)
            msg = f"Error creating company: {e!s}"
            logger.exception(msg)
            raise SalesLeadError(msg) from e

    logger.info(f"Deal Properties: {lead_properties_formatted[2]}")
    logger.info(f"Note Properties: {lead_properties_formatted[3]}")
    try:
        deal_id = await call_hubspot_api(
            create_deal, lead_properties_formatted[2], contact_id, company_id
        )
        note = await call_hubspot_api(
            add_note_to_deal, lead_properties_formatted[3], deal_id
        )
        logger.info(
            f"Created Deal with deal_id: {deal_id}. Note added with ID: {note.id}"
        )
    except Exception as e:
        sentry_sdk.capture_exception(e)
        msg = f"Error creating deal: {e!s}"
        logger.exception(msg)
        raise SalesLeadError(msg) from e

    if lead_source == "trustoo":
        return {"message": "Added Trustoo lead to hubspot"}
    if lead_source == "ligo":
        return {"message": "Added Ligo lead to hubspot"}
    if lead_source == "offerte.nl":
        return {"message": "Added Offerte.nl lead to hubspot"}
    if lead_source == "solvari":
        return {"message": "Added Solvari lead to hubspot"}
    if lead_source == "calendly":
        return {"message": "Added Calendly lead to hubspot"}
    return None
