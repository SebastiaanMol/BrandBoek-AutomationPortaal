"""Onboarding Typeform webhook handler.

Processes submissions from the four client onboarding typeforms:
  - New client,      EZ/VOF structure  (ONBOARDING_FORM_ID_NEW_EZ)
  - New client,      BV/Holding        (ONBOARDING_FORM_ID_NEW_BV)
  - Existing client, EZ/VOF            (ONBOARDING_FORM_ID_EXISTING_EZ)
  - Existing client, BV/Holding        (ONBOARDING_FORM_ID_EXISTING_BV)

For every submission the handler:
  1. Extracts the HubSpot company ID from field 1 (bedrijfs-ID).
  2. Finds the best-matching contact on the company (email → name → first contact).
  3. Updates HubSpot contact properties (new-client forms only).
  4. Updates HubSpot company properties (all forms).
  5. Uploads all file attachments + a PDF summary to SharePoint.
"""

import logging
import os
from datetime import UTC
from datetime import datetime
from typing import Any

import sentry_sdk

from app.constants import DEAL_TO_COMPANY_ASSOC_TYPE
from app.constants import DEAL_TO_CONTACT_ASSOC_TYPE
from app.hubspot_client import client as hs_client
from app.repository import hubspot as hubspot_repository
from app.service.typeform.typeform import GRAPH_BASE_URL
from app.service.typeform.typeform import answer_to_display_value
from app.service.typeform.typeform import build_contact_folder_name
from app.service.typeform.typeform import build_field_title_map
from app.service.typeform.typeform import ensure_child_folder
from app.service.typeform.typeform import get_contact_display_name
from app.service.typeform.typeform import get_graph_access_token
from app.service.typeform.typeform import get_site
from app.service.typeform.typeform import graph_json
from app.service.typeform.typeform import http_request
from app.service.typeform.typeform import list_children
from app.service.typeform.typeform import rename_drive_item
from app.service.typeform.typeform import render_summary_document
from app.service.typeform.typeform import require_env
from app.service.typeform.typeform import resolve_contact_folder
from app.service.typeform.typeform import resolve_typeform_definition
from app.service.typeform.typeform import sanitize_filename
from app.service.typeform.typeform import sanitize_folder_name
from app.service.typeform.typeform import search_dossier_folders
from app.service.typeform.typeform import upload_bytes_to_folder
from app.service.typeform.typeform import upload_typeform_files_to_sharepoint

DEFAULT_SHAREPOINT_SITE_PATH = "/sites/Clients"
DEFAULT_YEAR_FOLDER = "2025"

LOONADMINISTRATIE_PIPELINE_ID = "651277"
LOONADMINISTRATIE_STAGE_ID = "2217038"
LOONADMINISTRATIE_AMOUNT = "100"

# Typeform form IDs for the four onboarding forms
FORM_ID_NEW_EZ = "DMcVFxg2"
FORM_ID_NEW_BV = "BrjshCLT"
FORM_ID_EXISTING_EZ = "j2G9yJ6k"
FORM_ID_EXISTING_BV = "f99tdwMz"

_NEW_CLIENT_FORM_IDS = {FORM_ID_NEW_EZ, FORM_ID_NEW_BV}
_BV_FORM_IDS = {FORM_ID_NEW_BV, FORM_ID_EXISTING_BV}

_COMPANY_YEAR_SUBFOLDERS = ("BTW-aangiftes", "Aanvullende documenten")
_TEMPLATE_LIBRARY_FOLDER = "2. Templates"
_BV_TEMPLATE_FOLDER = "Besloten vennootschap"
_EZ_TEMPLATE_FOLDER = "Eenmanszaak"
_BV_TEMPLATE_FILENAMES = ("Besloten vennootschap.xlsx",)
_EZ_TEMPLATE_FILENAMES = ("Eenmanszaak template.xlsx", "Template Eenmanszaak.xlsx")
_XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
_QUARTER_FOLDERS = ("Q1", "Q2", "Q3", "Q4")

# Any answer that starts with "Ja" triggers a deal; "Nee" skips it.
# Listed explicitly so unexpected future options don't accidentally create deals.
_LOONADMINISTRATIE_TRIGGER_VALUES = {
    "Ja, dit betreft een werknemer of meerdere werknemers van de onderneming",
    "Ja, dit betreft mijzelf als eigenaar van de BV (DGA)",
}

# ---------------------------------------------------------------------------
# Lookup tables  (Typeform answer text → HubSpot internal value)
# ---------------------------------------------------------------------------

_AUTO_LOOKUP: dict[str, str] = {
    "Nee": "nvt",
    "Ja, er is één zakelijke auto aanwezig": "Financial lease",
    "Ja, er zijn twee zakelijke auto's aanwezig": "Meerdere auto's",
    "Ja, er zijn drie of meer zakelijke auto's aanwezig": "Meerdere auto's",
    "Ik heb een auto, maar weet niet of deze zakelijk is": "Ik heb een auto, maar weet niet of hij zakelijk is",
}

_BEDRIJFSVORM_LOOKUP: dict[str, str] = {
    # EZ/VOF form answers
    "Eenmanszaak (EZ)": "Eenmanszaak/ZZP",
    "Ik vul deze vragenlijst in voor een eenmanszaak (EZ)": "Eenmanszaak/ZZP",
    "Vennootschap onder firma (VOF) / Maatschap": "VOF/Maatschap",
    "Ik vul deze vragenlijst in voor een VOF": "VOF/Maatschap",
    # BV/Holding form answers
    "Stichting/Vereniging": "Stichting/Vereniging",
    "Ik vul deze vragenlijst voor één enkele BV in": "BV",
    "Ik vul deze vragenlijst in voor een Werkmaatschappij/BV": "BV",
    "Ik vul deze vragenlijst voor één enkele Holding in": "BV (Holding)",
    "Voor meerdere entiteiten zal ik informatie aanleveren, dit is de Holding of tussen Holding": "BV (Holding)",
    "Voor meerdere entiteiten zal ik informatie aanleveren, dit is de Werkmaatschappij": "BV",
}

_VERLENGD_BOEKJAAR_LOOKUP: dict[str, str] = {
    "Nee, ik heb geen verlengd boekjaar": "nvt",
    "2022 - 2023": "2022 - 2023",
    "2023 - 2024": "2023 - 2024",
    "2024 - 2025": "2024 - 2025",
    "2025 - 2026": "2025 - 2026",
}

# Used when the form asks "Is de onderneming BTW-plichtig?"
_BTW_PLICHT_LOOKUP: dict[str, str] = {
    "Ja": "Aangifteplichtig",
    "Nee": "Vrijgesteld van aangifte",
}

# Used when the form asks "Is de onderneming BTW-vrijgesteld?" (BV forms)
_BTW_VRIJGESTELD_TO_PLICHT_LOOKUP: dict[str, str] = {
    "Ja": "Vrijgesteld van aangifte",
    "Nee": "Aangifteplichtig",
    "Weet ik niet": "Aangifteplichtig",
}

_EU_REVENUE_TYPE_LOOKUP: dict[str, str] = {
    "Business-to-Business (B2B)": "EU omzet B2B",
    "Business-to-Consumers (B2C)": "EU omzet B2C",
    "Zowel B2B als B2C": "EU omzet B2B;EU omzet B2C",
}

_BTW_SPECIFICATIE_LOOKUP: dict[str, str] = {
    "EU omzet B2B": "ICP aangifte",
    "EU omzet B2C": "OSS aangifte",
    "EU omzet B2B;EU omzet B2C": "ICP aangifte;OSS aangifte",
}

_VRIJGESTELDE_OMZET_LOOKUP: dict[str, str] = {
    "Ja": "Vrijgestelde omzet",
    "Nee": "",
}

_BUITEN_EU_LOOKUP: dict[str, str] = {
    "Nee": "",
    "Ja, slechts vanuit EU-landen": "",
    "Ja, slechts vanuit niet-EU-landen": "Buiten EU omzet",
    "Ja, zowel vanuit EU-landen als vanuit niet-EU-landen": "Buiten EU omzet",
}

_VERLEGDE_OMZET_LOOKUP: dict[str, str] = {
    "Ja": "Verlegde omzet",
    "Nee": "",
}

_HOUSING_COSTS_LOOKUP: dict[str, str] = {
    "Corporatie": "Huur (belast)",
    "Particuliere verhuurder": "Huur (vrijgesteld)",
    "Beide": "Huur (belast);Huur (vrijgesteld)",
}

_BANKREKENINGEN_LOOKUP: dict[str, str] = {
    "Nee, de onderneming heeft geen eigen zakelijke rekening": "Geen bankrekening",
    "Nee, maar er word(t)en op korte termijn wel een (of meerdere) zakelijke rekening(en) geopend": "Binnenkort",
    "Nee, hierbij word ik/worden we graag geholpen": "Hulp nodig met de aanvraag",
    "Ja, er is één zakelijke rekening": "Éen bankrekening",
    "Ja, er zijn meerdere zakelijke rekeningen": "Meerdere bankrekeningen",
}

_PAYMENT_METHODS_LOOKUP: dict[str, str] = {
    "Ja, van Paypal": "Paypal",
    "Ja, van Stripe": "Stripe",
    "Ja, van American Express": "Creditcard",
    "Ja, van Paypal, Stripe en/of American Express": "Paypal;Stripe;Creditcard",
    "Nee": "",
}

_VPB_PLICHTIG_LOOKUP: dict[str, str] = {
    "Ja": "Ja",
    "Nee": "Nee",
}

# Used to set the bv_ez contact property (BV forms only)
_BV_EZ_LOOKUP: dict[str, str] = {
    "Stichting/Vereniging": "Stichting/Vereniging",
    "Ik vul deze vragenlijst voor één enkele BV in": "BV",
    "Ik vul deze vragenlijst in voor een Werkmaatschappij/BV": "BV",
    "Ik vul deze vragenlijst voor één enkele Holding in": "Holding",
    "Voor meerdere entiteiten zal ik informatie aanleveren, dit is de Holding of tussen Holding": "Holding",
    "Voor meerdere entiteiten zal ik informatie aanleveren, dit is de Werkmaatschappij": "Werkmaatschappij",
}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def process_onboarding_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    event_type = payload.get("event_type")
    if event_type and event_type != "form_response":
        logging.info("Ignoring onboarding Typeform event_type=%s", event_type)
        return {"status": "ignored", "reason": f"Unsupported event_type {event_type}"}

    form_response = payload.get("form_response")
    if not isinstance(form_response, dict):
        msg = "Onboarding Typeform payload does not contain form_response."
        raise TypeError(msg)

    company_id = _extract_company_id(payload, form_response)
    if not company_id:
        sentry_sdk.capture_message(
            "Onboarding Typeform received without a usable company ID in the first field.",
            level="warning",
        )
        return {"status": "ignored", "reason": "Missing company ID"}

    form_id = str(form_response.get("form_id") or payload.get("form_id") or "").strip()
    is_new_client = _is_new_client_form(form_id)
    is_bv = _is_bv_form(form_id)

    # Parse all form answers into a structured dict once
    raw = _scan_answers(form_response, payload)

    # Find the best-matching contact among all contacts on this company
    contact_id = _find_matching_contact(
        company_id=company_id,
        form_email=raw.get("email"),
        form_firstname=raw.get("firstname"),
        form_lastname=raw.get("lastname"),
    )

    if not contact_id:
        logging.warning(
            "No contact found for company %s in onboarding Typeform.", company_id
        )

    # Update HubSpot contact properties (new clients only)
    if contact_id and is_new_client:
        contact_props = _build_contact_properties(raw)
        if contact_props:
            try:
                hubspot_repository.update_contact(contact_id, contact_props)
                logging.info(
                    "Updated contact %s with onboarding properties.", contact_id
                )
            except Exception as exc:
                sentry_sdk.capture_exception(exc)
                logging.warning(
                    "Failed to update contact %s properties: %s", contact_id, exc
                )

    # Update HubSpot company properties (all forms)
    company_props = _build_company_properties(raw, is_bv)
    if company_props:
        try:
            hubspot_repository.update_company_properties(int(company_id), company_props)
            logging.info("Updated company %s with onboarding properties.", company_id)
        except Exception as exc:
            sentry_sdk.capture_exception(exc)
            logging.warning(
                "Failed to update company %s properties: %s", company_id, exc
            )

    # Create loonadministratie deal if requested
    loon_deal_id = _maybe_create_loonadministratie_deal(
        raw=raw,
        contact_id=contact_id,
        company_id=company_id,
    )

    if not contact_id:
        return {
            "status": "partial",
            "company_id": company_id,
            "reason": "No contact found for company; skipped SharePoint upload.",
        }

    # SharePoint: upload files and PDF summary into the client's dossier folder
    token = get_graph_access_token()
    site_path = os.getenv("TYPEFORM_SHAREPOINT_SITE_PATH", DEFAULT_SHAREPOINT_SITE_PATH)
    host = require_env("SP_HOST")
    site = get_site(token, host, site_path)
    site_id = site["id"]

    drive = graph_json("GET", f"/sites/{site_id}/drive", token)
    drive_id = drive["id"]
    drive_root = graph_json("GET", f"/drives/{drive_id}/root", token)
    drive_root_id = drive_root["id"]

    dossier_folder = _find_or_create_dossier_folder(
        drive_id=drive_id,
        drive_root_id=drive_root_id,
        company_id=company_id,
        company_name=raw.get("company_name"),
        contact_id=contact_id,
        token=token,
    )
    if not dossier_folder:
        message = (
            f"No SharePoint dossier folder found in {site_path} "
            f"for company {company_id}."
        )
        sentry_sdk.capture_message(message, level="warning")
        logging.warning(message)
        return {
            "status": "missing_dossier_folder",
            "company_id": company_id,
            "contact_id": contact_id,
        }

    company_folder = _find_or_create_company_folder(
        drive_id=drive_id,
        dossier_folder_id=dossier_folder["id"],
        company_id=company_id,
        company_name=raw.get("company_name"),
        token=token,
    )
    contact_folder = _ensure_contact_folder(
        drive_id=drive_id,
        dossier_folder_id=dossier_folder["id"],
        contact_id=contact_id,
        token=token,
    )
    year_structure = _ensure_company_year_folders(
        drive_id=drive_id,
        drive_root_id=drive_root_id,
        company_folder_id=company_folder["id"],
        company_name=raw.get("company_name") or company_id,
        is_bv=is_bv,
        token=token,
    )
    _ensure_contact_year_folders(
        drive_id=drive_id,
        contact_folder_id=contact_folder["id"],
        token=token,
    )

    uploaded_files = upload_typeform_files_to_sharepoint(
        payload,
        drive_id,
        company_folder["id"],
        token,
    )

    company_name = raw.get("company_name") or company_id
    summary_name = f"Onboarding Typeform - {sanitize_filename(company_name)}.pdf"
    summary_content = render_summary_document(payload, contact_id or "", uploaded_files)
    upload_bytes_to_folder(
        drive_id,
        company_folder["id"],
        summary_name,
        summary_content,
        "application/pdf",
        token,
    )

    logging.info(
        "Processed onboarding Typeform for company %s / contact %s into '%s'.",
        company_id,
        contact_id,
        dossier_folder["name"],
    )

    return {
        "status": "uploaded",
        "company_id": company_id,
        "contact_id": contact_id,
        "is_new_client": is_new_client,
        "loon_deal_id": loon_deal_id,
        "dossier_folder": dossier_folder["name"],
        "company_folder": company_folder["name"],
        "contact_folder": contact_folder["name"],
        "year_folders": year_structure["year_folders"],
        "summary_file": summary_name,
        "uploaded_files": [item["name"] for item in uploaded_files],
    }


# ---------------------------------------------------------------------------
# Contact identification
# ---------------------------------------------------------------------------


def _find_matching_contact(
    company_id: str,
    form_email: str | None,
    form_firstname: str | None,
    form_lastname: str | None,
) -> str | None:
    """Return the HubSpot contact ID that best matches the form submitter.

    Strategy (in order):
    1. If only one contact is on the company, return it directly.
    2. Match by email (case-insensitive).
    3. Match by first + last name (case-insensitive).
    4. Fall back to the first contact and log a warning.
    """
    contacts_map = hubspot_repository.batch_get_contacts_for_companies([company_id])
    contact_ids = [str(cid) for cid in contacts_map.get(str(company_id), [])]

    if not contact_ids:
        return None
    if len(contact_ids) == 1:
        return contact_ids[0]

    contacts = hubspot_repository.batch_get_contacts_info(
        contact_ids, ["email", "firstname", "lastname"]
    )

    # Email match
    if form_email:
        form_email_lower = form_email.lower()
        for contact in contacts:
            props = getattr(contact, "properties", {}) or {}
            if (props.get("email") or "").lower() == form_email_lower:
                return str(contact.id)

    # Full name match
    if form_firstname or form_lastname:
        fn_lower = (form_firstname or "").lower()
        ln_lower = (form_lastname or "").lower()
        for contact in contacts:
            props = getattr(contact, "properties", {}) or {}
            first = (props.get("firstname") or "").lower()
            last = (props.get("lastname") or "").lower()
            if fn_lower and ln_lower and first == fn_lower and last == ln_lower:
                return str(contact.id)
            if fn_lower and not ln_lower and first == fn_lower:
                return str(contact.id)
            if ln_lower and not fn_lower and last == ln_lower:
                return str(contact.id)

    logging.warning(
        "Could not match a contact by email or name among %d contacts for company %s; "
        "falling back to first contact.",
        len(contact_ids),
        company_id,
    )
    return contact_ids[0]


# ---------------------------------------------------------------------------
# Answer scanner — parses all form answers into a flat raw dict
# ---------------------------------------------------------------------------


def _scan_answers(
    form_response: dict[str, Any], payload: dict[str, Any]
) -> dict[str, Any]:
    """Iterate all form answers and classify them into a raw dict.

    Multi-field properties (company name, KVK) are concatenated across form
    sections; since each submission represents a single company, only one
    section is filled and empty parts contribute nothing.
    """
    definition = resolve_typeform_definition(payload, form_response)
    field_titles = build_field_title_map(definition)
    answers = form_response.get("answers") or []

    raw: dict[str, Any] = {}
    company_name_parts: list[str] = []
    kvk_parts: list[str] = []
    bankspec_parts: list[str] = []  # for bankrekeningen_specificatie

    for answer in answers:
        field = answer.get("field") or {}
        field_id = field.get("id") or ""
        title = field_titles.get(field_id, field.get("title") or "").lower()
        answer_type = answer.get("type")
        value = answer_to_display_value(answer)

        if value is None:
            continue

        is_fp = "fiscale partner" in title or "fiscaal partner" in title

        value_str = (
            ";".join(str(v) for v in value if v)
            if isinstance(value, list)
            else str(value).strip()
        )
        if not value_str:
            continue

        # ---- Contact: typed fields (most reliable) ----
        if answer_type == "email":
            raw.setdefault("email", value_str)
            continue
        if answer_type == "phone_number":
            raw.setdefault("phone", value_str)
            continue

        # ---- Helper: check keyword lists ----
        def has(*kws: str) -> bool:
            return any(kw in title for kw in kws)  # noqa: B023

        # ---- Contact: personal info ----
        if has("first name", "voornaam") and not is_fp:
            raw.setdefault("firstname", value_str)
        elif has("last name", "achternaam", "surname") and not is_fp:
            raw.setdefault("lastname", value_str)
        elif has("e-mailadres", "email") and "email" not in raw and "@" in value_str:
            # existing-client forms use a plain text email field
            raw["email"] = value_str
        elif has("address") and "line 2" not in title and "line2" not in title:
            raw.setdefault("address", value_str)
        elif has("city", "stad", "woonplaats") and not is_fp:
            raw.setdefault("city", value_str)
        elif has("zip", "postal", "postcode") and not is_fp:
            raw.setdefault("zip", value_str)
        elif has("country", "land") and not is_fp:
            raw.setdefault("country", value_str)

        # ---- Contact: BSN / geboortedatum (fp-aware) ----
        elif has("burgerservicenummer", "bsn") and is_fp:
            raw.setdefault("bsn_fiscaal_partner", value_str)
        elif has("burgerservicenummer", "bsn") and not is_fp:
            raw.setdefault("bsn", value_str)
        elif has("geboortedatum") and is_fp:
            raw.setdefault("geboortedatum_fiscaal_partner_raw", value_str)
        elif has("geboortedatum") and not is_fp:
            raw.setdefault("date_of_birth_raw", value_str)

        # ---- Contact: fiscal partner ----
        elif has(
            "naam van de fiscale partner", "voor- en achternaam van de fiscale partner"
        ):
            raw.setdefault("naam_fiscaal_partner", value_str)

        # ---- Contact: vennoten IB info (for ib_toelichting on EZ/VOF new) ----
        elif has("vennoten", "vennoot") and has("inkomstenbelasting", "aangifte"):
            raw.setdefault("ib_vennoten_info", value_str)

        # ---- Company: multi-part concatenated fields ----
        elif has("naam van de onderneming"):
            company_name_parts.append(value_str)
        elif has("kvk nummer"):
            kvk_parts.append(value_str)

        # ---- Company: bankrekeningen fields (most specific first) ----
        elif has("paypal", "stripe", "american express"):
            raw.setdefault("payment_methods_raw", value_str)
        elif has("iban van de zakelijke") or has(
            "overzicht van de zakelijke bankrekeningen"
        ):
            bankspec_parts.append(value_str)
        elif has("zakelijke bankrekening") and not has("paypal", "stripe"):
            raw.setdefault("bankrekeningen_raw", value_str)

        # ---- Company: auto fields ----
        elif has("noteer hieronder welke auto") or (
            has("welke auto") and has("noteer")
        ):
            raw.setdefault("toelichting_auto", value_str)
        elif has("bedrijfsauto") and not has("leasecontract", "koopcontract"):
            raw.setdefault("auto_raw", value_str)

        # ---- Company: BTW / tax ----
        elif has("btw-plichtig") and not has("btw-vrijgesteld"):
            raw.setdefault("btw_plichtig_raw", value_str)
        elif has("btw-vrijgesteld"):
            # BV forms use this instead of btw-plichtig; EZ forms use it for vrijgestelde omzet
            raw.setdefault("btw_vrijgesteld_raw", value_str)
        elif has("btw-nummer", "btw nummer"):
            raw.setdefault("btw_nummer", value_str)
        elif has("toelichting btw", "toelichting op de btw"):
            raw.setdefault("btw_toelichting_raw", value_str)
        elif has("verlegd") and has("omzet") and not has("buitenland"):
            raw.setdefault("verlegde_omzet_raw", value_str)
        elif has("doelgroepen"):
            raw.setdefault("eu_revenue_type_raw", value_str)
        elif has("buitenland"):
            raw.setdefault("buiten_eu_raw", value_str)
        elif has("corporatie", "particuliere verhuurder") and has("huurt"):
            raw.setdefault("housing_raw", value_str)
        elif has("vpb-plichtig", "vpb plichtig"):
            raw.setdefault("vpb_plichtig_raw", value_str)

        # ---- Company: structure / admin ----
        elif has("bedrijfsvorm"):
            raw.setdefault("bedrijfsvorm_raw", value_str)
        elif has("activiteiten"):
            raw.setdefault("description", value_str)
        elif has("rsin"):
            raw.setdefault("rsin", value_str)
        elif has("oprichtingsdatum"):
            raw.setdefault("oprichtingsdatum_raw", value_str)
        elif has("verlengd boekjaar"):
            raw.setdefault("verlengd_boekjaar_raw", value_str)
        elif has("donaties"):
            # choices field: labels are already joined above
            raw.setdefault("donaties_choices", value_str)
        elif has("eigendomsstructuur", "zeggenschap", "vennoten", "vennoot") and has(
            "winstgerechtigdheid", "overzicht"
        ):
            raw.setdefault("toelichting_structuur", value_str)
        elif has("buitenlandse afnemers bijgehouden", "op welke wijze worden"):
            raw.setdefault("toelichting_admin_raw", value_str)
        elif has("bijzonderheden", "boekhoudkundige"):
            raw.setdefault("toelichting_balans_raw", value_str)
        elif has("loonadministratie"):
            raw.setdefault("loonadministratie_raw", value_str)

    # Combine multi-part fields
    if company_name_parts:
        raw["company_name"] = "".join(company_name_parts)
    if kvk_parts:
        raw["kvk"] = "".join(kvk_parts)
    if bankspec_parts:
        raw["bankrekeningen_specificatie"] = "\n".join(bankspec_parts)

    return raw


# ---------------------------------------------------------------------------
# HubSpot property builders
# ---------------------------------------------------------------------------


def _build_contact_properties(raw: dict[str, Any]) -> dict[str, str]:
    """Map raw scanned values to HubSpot contact property names."""
    props: dict[str, str] = {}

    _set(props, "email", raw.get("email"))
    _set(props, "firstname", raw.get("firstname"))
    _set(props, "lastname", raw.get("lastname"))
    _set(props, "phone", raw.get("phone"))
    _set(props, "address", raw.get("address"))
    _set(props, "city", raw.get("city"))
    _set(props, "zip", raw.get("zip"))
    _set(props, "country", raw.get("country"))
    _set(props, "bsn", raw.get("bsn"))
    _set(props, "bsn_fiscaal_partner", raw.get("bsn_fiscaal_partner"))
    _set(props, "naam_fiscaal_partner", raw.get("naam_fiscaal_partner"))
    _set(props, "company", raw.get("company_name"))

    dob = _format_date(raw.get("date_of_birth_raw"))
    _set(props, "date_of_birth", dob)

    fp_dob = _format_date(raw.get("geboortedatum_fiscaal_partner_raw"))
    _set(props, "geboortedatum_fiscaal_partner", fp_dob)

    # ib_toelichting: HTML-formatted vennoten info (EZ/VOF new client)
    vennoten = raw.get("ib_vennoten_info")
    if vennoten:
        props["ib_toelichting"] = (
            "<b>Indien wij aangifte IB voor vennoten in de VOF verzorgen volgt hier "
            "een overzicht van info + info van de fiscaal partner:</b><br>"
            f"{vennoten}"
        )

    return props


def _build_company_properties(raw: dict[str, Any], is_bv: bool) -> dict[str, str]:
    """Map raw scanned values to HubSpot company property names."""
    props: dict[str, str] = {}

    # --- Direct / lookup-mapped fields ---
    _set(props, "name", raw.get("company_name"))
    _set(props, "address", raw.get("address"))
    _set(props, "city", raw.get("city"))
    _set(props, "zip", raw.get("zip"))
    _set(props, "country", raw.get("country"))
    kvk = raw.get("kvk")
    if kvk and len(kvk) == 8:
        props["kvk"] = kvk
    _set(props, "rsin", raw.get("rsin"))
    btw_nummer = str(raw.get("btw_nummer") or "").strip()
    if btw_nummer and len(btw_nummer) <= 14:
        props["btw_nummer"] = btw_nummer
    _set(props, "description", raw.get("description"))
    _set(props, "toelichting_auto", raw.get("toelichting_auto"))
    _set(props, "toelichting_structuur", raw.get("toelichting_structuur"))
    _set(props, "bankrekeningen_specificatie", raw.get("bankrekeningen_specificatie"))

    bedrijfsvorm = _lookup(_BEDRIJFSVORM_LOOKUP, raw.get("bedrijfsvorm_raw"))
    _set(props, "bedrijfsvorm", bedrijfsvorm)

    # bv_ez: only set on BV forms (EZ forms leave this blank in Zapier)
    if is_bv:
        bv_ez = _lookup(_BV_EZ_LOOKUP, raw.get("bedrijfsvorm_raw"))
        _set(props, "bv_ez", bv_ez)

    auto = _lookup(_AUTO_LOOKUP, raw.get("auto_raw"))
    _set(props, "auto", auto)

    verlengd = _lookup(_VERLENGD_BOEKJAAR_LOOKUP, raw.get("verlengd_boekjaar_raw"))
    _set(props, "verlengd_boekjaar", verlengd)

    oprichting = _format_date_unix_ms(raw.get("oprichtingsdatum_raw"))
    _set(props, "oprichtingsdatum", oprichting)

    # --- btw_plicht ---
    # EZ forms ask "Is de onderneming BTW-plichtig?"
    # BV forms ask "Is de onderneming BTW-vrijgesteld?" (mapped inversely)
    if raw.get("btw_plichtig_raw"):
        btw_plicht = _lookup(_BTW_PLICHT_LOOKUP, raw.get("btw_plichtig_raw"))
    else:
        btw_plicht = _lookup(
            _BTW_VRIJGESTELD_TO_PLICHT_LOOKUP, raw.get("btw_vrijgesteld_raw")
        )
    _set(props, "btw_plicht", btw_plicht)

    # --- vpb_plichtig ---
    if is_bv:
        _set(
            props,
            "vpb_plichtig",
            _lookup(_VPB_PLICHTIG_LOOKUP, raw.get("vpb_plichtig_raw")),
        )
    else:
        props["vpb_plichtig"] = "Nee"

    # --- bankrekeningen (multi-select: bank account type + payment methods) ---
    bank = _lookup(_BANKREKENINGEN_LOOKUP, raw.get("bankrekeningen_raw"))
    payment = _lookup(_PAYMENT_METHODS_LOOKUP, raw.get("payment_methods_raw"))
    bankrekeningen = _join(bank, payment)
    _set(props, "bankrekeningen", bankrekeningen)

    # --- btw_soorten (multi-select from 4 sources) ---
    eu_type = _lookup(_EU_REVENUE_TYPE_LOOKUP, raw.get("eu_revenue_type_raw"))

    # verlegde omzet: BV forms only
    verlegde = (
        _lookup(_VERLEGDE_OMZET_LOOKUP, raw.get("verlegde_omzet_raw")) if is_bv else ""
    )

    # vrijgestelde omzet: from btw_vrijgesteld field (EZ) or separate field
    # EZ forms have a dedicated "btw-vrijgesteld" question for omzet; BV forms use it for btw_plicht
    vrijgesteld_raw = raw.get("btw_vrijgesteld_raw") if not is_bv else None
    vrijgesteld = _lookup(_VRIJGESTELDE_OMZET_LOOKUP, vrijgesteld_raw)

    buiten_eu = _lookup(_BUITEN_EU_LOOKUP, raw.get("buiten_eu_raw"))

    btw_soorten = _join(eu_type, verlegde, vrijgesteld, buiten_eu)
    _set(props, "btw_soorten", btw_soorten)

    # --- btw_specificatie (derived from EU type) ---
    btw_spec = _lookup(_BTW_SPECIFICATIE_LOOKUP, eu_type)
    _set(props, "btw_specificatie", btw_spec)

    # --- btw_kosten_soorten (housing costs) ---
    housing = _lookup(_HOUSING_COSTS_LOOKUP, raw.get("housing_raw"))
    _set(props, "btw_kosten_soorten", housing)

    # --- donaties_subsidies_contributie_omzet_derden ---
    donaties = raw.get("donaties_choices")
    _set(props, "donaties_subsidies_contributie_omzet_derden", donaties)

    # --- toelichting_administratiewijze (HTML + raw field) ---
    admin_raw = raw.get("toelichting_admin_raw")
    if admin_raw:
        props["toelichting_administratiewijze"] = (
            "<b>Op welke wijze worden de verkopen aan buitenlandse afnemers bijgehouden:</b><br>"
            f"{admin_raw}"
        )

    # --- btw_toelichting_2 (HTML combining BTW toelichting + buitenlandse afnemers) ---
    btw_toelichting_raw = raw.get("btw_toelichting_raw")
    if btw_toelichting_raw or admin_raw:
        parts = []
        if btw_toelichting_raw:
            parts.append(f"<b>Toelichting BTW:</b><br>{btw_toelichting_raw}.")
        if admin_raw:
            parts.append(
                f"<b>Verkopen aan buitenlandse afnemers bijgehouden:</b><br>{admin_raw}."
            )
        props["btw_toelichting_2"] = "<br><br>".join(parts)

    # --- toelichting_balans ---
    balans_raw = raw.get("toelichting_balans_raw")
    if balans_raw:
        props["toelichting_balans"] = balans_raw

    # --- Onboarding completion flag ---
    props["onboarding_typeform"] = "Ingevuld"

    return props


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------


def _extract_company_id(
    payload: dict[str, Any], form_response: dict[str, Any]
) -> str | None:
    """Extract the HubSpot company ID from the first form field (bedrijfs-ID).

    Typeform may serialize large integers in scientific notation (e.g. 5.31e+10),
    so we normalize to a plain integer string.
    """
    definition = resolve_typeform_definition(payload, form_response)
    fields = definition.get("fields") or []
    answers = form_response.get("answers") or []

    answer_by_field_id: dict[str, Any] = {
        answer.get("field", {}).get("id"): answer
        for answer in answers
        if answer.get("field", {}).get("id")
    }

    first_field_id = fields[0].get("id") if fields else None
    answer = answer_by_field_id.get(first_field_id) if first_field_id else None
    if answer is None and answers:
        answer = answers[0]

    value = answer_to_display_value(answer) if answer else None
    if value is None:
        return None

    raw = str(value).strip()
    try:
        return str(int(float(raw)))
    except (ValueError, OverflowError):
        return raw or None


def _is_new_client_form(form_id: str) -> bool:
    return form_id in _NEW_CLIENT_FORM_IDS


def _is_bv_form(form_id: str) -> bool:
    return form_id in _BV_FORM_IDS


def _lookup(table: dict[str, str], value: str | None) -> str:
    """Return the mapped value from a lookup table, or empty string if not found."""
    if not value:
        return ""
    return table.get(value.strip(), "")


def _join(*values: str | None) -> str:
    """Join non-empty values with a semicolon (HubSpot multi-select format)."""
    return ";".join(v for v in values if v and str(v).strip())


def _set(props: dict[str, str], key: str, value: str | None) -> None:
    """Add key→value to props only when value is non-empty."""
    if value and str(value).strip():
        props[key] = str(value).strip()


def _maybe_create_loonadministratie_deal(
    raw: dict[str, Any],
    contact_id: str | None,
    company_id: str,
) -> str | None:
    """Create a deal in the loonadministratie pipeline if the client requested it.

    Returns the new deal ID, or None if no deal was created.
    """
    loon_answer = raw.get("loonadministratie_raw", "")
    if loon_answer not in _LOONADMINISTRATIE_TRIGGER_VALUES:
        return None

    if not contact_id:
        logging.warning(
            "Loonadministratie requested for company %s but no contact found; skipping deal creation.",
            company_id,
        )
        return None

    # Check whether a loonadministratie deal already exists for this company
    try:
        existing_deal_ids = hubspot_repository.get_deals_for_company(str(company_id))
        if existing_deal_ids:
            existing_deals = hubspot_repository.batch_get_deals_info(
                existing_deal_ids, ["pipeline"]
            )
            for deal in existing_deals:
                props = getattr(deal, "properties", {}) or {}
                if props.get("pipeline") == LOONADMINISTRATIE_PIPELINE_ID:
                    logging.info(
                        "Loonadministratie deal already exists for company %s (deal %s); skipping.",
                        company_id,
                        deal.id,
                    )
                    return str(deal.id)
    except Exception as exc:
        logging.warning(
            "Could not check existing loonadministratie deals for company %s: %s",
            company_id,
            exc,
        )

    firstname = raw.get("firstname", "")
    lastname = raw.get("lastname", "")
    company_name = raw.get("company_name", "")
    name_part = f"{firstname} {lastname}".strip()
    deal_name = f"Loonadministratie: {name_part} - {company_name}".strip(" -")

    input_object = {
        "properties": {
            "dealname": deal_name,
            "pipeline": LOONADMINISTRATIE_PIPELINE_ID,
            "dealstage": LOONADMINISTRATIE_STAGE_ID,
            "amount": LOONADMINISTRATIE_AMOUNT,
        },
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

    try:
        response = hs_client.crm.deals.basic_api.create(input_object)
        deal_id = str(response.id)
        logging.info(
            "Created loonadministratie deal %s for company %s / contact %s.",
            deal_id,
            company_id,
            contact_id,
        )
        return deal_id
    except Exception as exc:
        sentry_sdk.capture_exception(exc)
        logging.warning(
            "Failed to create loonadministratie deal for company %s: %s",
            company_id,
            exc,
        )
        return None


def _get_company_dossier_id(company_id: str) -> str | None:
    """Return the HubSpot dossier ID associated with the given company, or None."""
    try:
        associations = hubspot_repository.get_object_to_dossier_associations(
            "company", str(company_id)
        )
    except Exception as exc:
        logging.warning(
            "HubSpot dossier lookup failed for company %s: %s", company_id, exc
        )
        return None
    results = getattr(associations, "results", None) or []
    if not results:
        return None
    dossier_id = getattr(results[0], "to_object_id", None)
    return str(dossier_id) if dossier_id is not None else None


def _get_dossier_name(dossier_id: str) -> str | None:
    """Return the HubSpot dossier name, or None when unavailable."""
    try:
        dossier = hubspot_repository.get_dossier_object(
            dossier_id,
            properties=["dossier_naam"],
        )
    except Exception as exc:
        logging.warning(
            "HubSpot dossier fetch failed for dossier %s: %s", dossier_id, exc
        )
        return None

    properties = getattr(dossier, "properties", None) or {}
    dossier_name = str(properties.get("dossier_naam") or "").strip()
    return dossier_name or None


def _find_or_create_dossier_folder(
    drive_id: str,
    drive_root_id: str,
    company_id: str,
    company_name: str | None,
    contact_id: str | None,
    token: str,
) -> dict[str, Any] | None:
    """Resolve the dossier folder for the company.

    1. Look up the dossier ID via HubSpot company→dossier association.
    2. Search SharePoint for a root-level folder whose name contains that dossier
       ID, or create one when missing.
    """
    dossier_id = _get_company_dossier_id(company_id)
    if not dossier_id:
        logging.warning("No dossier association found for company %s.", company_id)
        return None
    dossier_name = _get_dossier_name(dossier_id)
    desired_folder_name = _build_dossier_folder_name(
        dossier_id,
        dossier_name,
        contact_id,
        company_name,
    )

    dossier_matches = [
        item
        for item in search_dossier_folders(drive_id, dossier_id, token)
        if (item.get("parentReference") or {}).get("id") == drive_root_id
    ]
    if dossier_matches:
        dossier_matches.sort(key=lambda item: item.get("name", "").lower())
        dossier_folder = dossier_matches[0]
        if dossier_folder.get("name") != desired_folder_name:
            dossier_folder = rename_drive_item(
                drive_id,
                dossier_folder["id"],
                desired_folder_name,
                token,
            )
    else:
        logging.warning(
            "No root-level SharePoint dossier folder found for dossier ID %s "
            "(company %s); creating it.",
            dossier_id,
            company_id,
        )
        dossier_folder = ensure_child_folder(
            drive_id,
            drive_root_id,
            desired_folder_name,
            token,
        )

    return dossier_folder


def _find_or_create_company_folder(
    drive_id: str,
    dossier_folder_id: str,
    company_id: str,
    company_name: str | None,
    token: str,
) -> dict[str, Any]:
    """Find or create the company subfolder inside the dossier folder."""
    children = list_children(drive_id, dossier_folder_id, token)
    for child in children:
        if child.get("folder") is not None and str(company_id) in child.get("name", ""):
            return child

    return ensure_child_folder(
        drive_id,
        dossier_folder_id,
        _build_company_folder_name(company_id, company_name),
        token,
    )


def _ensure_contact_folder(
    drive_id: str,
    dossier_folder_id: str,
    contact_id: str,
    token: str,
) -> dict[str, Any]:
    contact_name = get_contact_display_name(contact_id)
    desired_folder_name = build_contact_folder_name(contact_name, contact_id)
    return resolve_contact_folder(
        drive_id,
        dossier_folder_id,
        contact_name,
        desired_folder_name,
        token,
    )


def _get_target_years(now: datetime | None = None) -> list[int]:
    current_year = (now or datetime.now(UTC)).year
    return [current_year - 1, current_year]


def _ensure_company_year_folders(
    drive_id: str,
    drive_root_id: str,
    company_folder_id: str,
    company_name: str,
    is_bv: bool,
    token: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    template_item = _find_template_file(drive_id, drive_root_id, is_bv, token)
    template_content = _download_drive_item_content(
        drive_id, template_item["id"], token
    )
    template_mime_type = (
        (template_item.get("file") or {}).get("mimeType")
    ) or _XLSX_MIME_TYPE

    years = _get_target_years(now)
    current_year = max(years)
    year_folders: list[str] = []
    current_year_folder: dict[str, Any] | None = None

    for year in years:
        year_folder = ensure_child_folder(
            drive_id,
            company_folder_id,
            str(year),
            token,
        )
        ensure_child_folder(
            drive_id,
            year_folder["id"],
            _COMPANY_YEAR_SUBFOLDERS[0],
            token,
        )
        ensure_child_folder(
            drive_id,
            year_folder["id"],
            _COMPANY_YEAR_SUBFOLDERS[1],
            token,
        )
        for quarter in _QUARTER_FOLDERS:
            ensure_child_folder(
                drive_id,
                year_folder["id"],
                quarter,
                token,
            )
        _ensure_year_template_file(
            drive_id=drive_id,
            year_folder_id=year_folder["id"],
            company_name=company_name,
            year=year,
            content=template_content,
            mime_type=template_mime_type,
            token=token,
        )
        year_folders.append(year_folder["name"])
        if year == current_year:
            current_year_folder = year_folder

    if current_year_folder is None:
        msg = "Current-year folder could not be created."
        raise RuntimeError(msg)

    return {
        "year_folders": year_folders,
        "current_year_folder": current_year_folder,
    }


def _ensure_contact_year_folders(
    drive_id: str,
    contact_folder_id: str,
    token: str,
    now: datetime | None = None,
) -> list[str]:
    year_folders: list[str] = []
    for year in _get_target_years(now):
        year_folder = ensure_child_folder(
            drive_id,
            contact_folder_id,
            str(year),
            token,
        )
        year_folders.append(year_folder["name"])
    return year_folders


def _find_template_file(
    drive_id: str,
    drive_root_id: str,
    is_bv: bool,
    token: str,
) -> dict[str, Any]:
    template_folder_name = _BV_TEMPLATE_FOLDER if is_bv else _EZ_TEMPLATE_FOLDER
    template_file_names = _BV_TEMPLATE_FILENAMES if is_bv else _EZ_TEMPLATE_FILENAMES

    templates_root = _find_named_child(
        list_children(drive_id, drive_root_id, token),
        _TEMPLATE_LIBRARY_FOLDER,
        want_folder=True,
    )
    if templates_root is None:
        msg = f"SharePoint template root folder '{_TEMPLATE_LIBRARY_FOLDER}' not found."
        raise RuntimeError(msg)

    template_folder = _find_named_child(
        list_children(drive_id, templates_root["id"], token),
        template_folder_name,
        want_folder=True,
    )
    if template_folder is None:
        msg = f"SharePoint template folder '{template_folder_name}' not found."
        raise RuntimeError(msg)

    children = list_children(drive_id, template_folder["id"], token)
    for candidate_name in template_file_names:
        template_file = _find_named_child(children, candidate_name, want_folder=False)
        if template_file is not None:
            return template_file

    msg = (
        f"No template workbook found in '{template_folder_name}' matching "
        f"{template_file_names!r}."
    )
    raise RuntimeError(msg)


def _download_drive_item_content(drive_id: str, item_id: str, token: str) -> bytes:
    url = f"{GRAPH_BASE_URL}/drives/{drive_id}/items/{item_id}/content"
    _, response_body = http_request(
        "GET",
        url,
        headers={"Authorization": f"Bearer {token}"},
    )
    return response_body


def _ensure_year_template_file(
    drive_id: str,
    year_folder_id: str,
    company_name: str,
    year: int,
    content: bytes,
    mime_type: str,
    token: str,
) -> dict[str, Any]:
    target_name = f"{sanitize_filename(company_name)} {year}.xlsx"
    existing_file = _find_named_child(
        list_children(drive_id, year_folder_id, token),
        target_name,
        want_folder=False,
    )
    if existing_file is not None:
        return existing_file

    return upload_bytes_to_folder(
        drive_id,
        year_folder_id,
        target_name,
        content,
        mime_type,
        token,
    )


def _find_named_child(
    children: list[dict[str, Any]],
    name: str,
    *,
    want_folder: bool,
) -> dict[str, Any] | None:
    for child in children:
        is_folder = child.get("folder") is not None
        if child.get("name") == name and is_folder is want_folder:
            return child
    return None


def _build_dossier_folder_name(
    dossier_id: str,
    dossier_name: str | None,
    contact_id: str | None,
    company_name: str | None,
) -> str:
    display_name = (dossier_name or "").strip()
    if not display_name and contact_id:
        display_name = get_contact_display_name(contact_id)
        if display_name == "Onbekende contactpersoon":
            display_name = ""

    if not display_name and company_name:
        display_name = company_name

    safe_name = sanitize_folder_name(display_name or dossier_id)
    return f"{safe_name}, {dossier_id}"


def _build_company_folder_name(company_id: str, company_name: str | None) -> str:
    if not company_name:
        return str(company_id)
    return f"{sanitize_folder_name(company_name)}, {company_id}"


def _format_date_unix_ms(raw: str | None) -> str:
    """Convert an ISO-format date string to Unix timestamp in milliseconds.

    HubSpot date properties (not datetime) expect a Unix ms timestamp at
    midnight UTC — e.g. oprichtingsdatum.
    """
    if not raw:
        return ""
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            dt = datetime.strptime(raw[: len(fmt)], fmt).replace(tzinfo=UTC)
            return str(int(dt.timestamp() * 1000))
        except ValueError:
            continue
    try:
        parts = raw[:10].split("-")
        if len(parts) == 3:
            dt = datetime(int(parts[0]), int(parts[1]), int(parts[2]), tzinfo=UTC)
            return str(int(dt.timestamp() * 1000))
    except Exception:
        pass
    return ""


def _format_date(raw: str | None) -> str:
    """Convert an ISO-format date string to DD-MM-YYYY."""
    if not raw:
        return ""
    for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw[:26], fmt[: len(fmt)]).strftime("%d-%m-%Y")
        except ValueError:
            continue
    # Last-ditch: try slicing YYYY-MM-DD from front
    try:
        parts = raw[:10].split("-")
        if len(parts) == 3:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
    except Exception:
        pass
    return raw
