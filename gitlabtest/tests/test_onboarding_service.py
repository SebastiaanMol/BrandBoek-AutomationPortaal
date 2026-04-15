"""Tests for the Typeform onboarding webhook handler.

Covers the pure-logic helpers (_format_date, _lookup, _join, _scan_answers,
_extract_company_id, _build_contact_properties, _build_company_properties,
_find_matching_contact, _maybe_create_loonadministratie_deal) without hitting
HubSpot or SharePoint, plus a happy-path smoke test for process_onboarding_webhook.
"""

from datetime import UTC
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.service.typeform import onboarding

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _answer(field_id: str, title: str, answer_type: str, **kwargs) -> dict:
    """Build a minimal Typeform answer dict."""
    ans: dict = {
        "field": {"id": field_id, "title": title, "type": answer_type, "ref": field_id},
        "type": answer_type,
    }
    ans.update(kwargs)
    return ans


def _text(field_id: str, title: str, value: str) -> dict:
    return _answer(field_id, title, "text", text=value)


def _email_answer(field_id: str, title: str, value: str) -> dict:
    return _answer(field_id, title, "email", email=value)


def _phone_answer(field_id: str, title: str, value: str) -> dict:
    return _answer(field_id, title, "phone_number", phone_number=value)


def _choice(field_id: str, title: str, label: str) -> dict:
    return _answer(field_id, title, "choice", choice={"label": label})


def _number(field_id: str, title: str, value: float) -> dict:
    return _answer(field_id, title, "number", number=value)


def _form_response(
    form_id: str, answers: list[dict], fields: list[dict] | None = None
) -> dict:
    """Build a minimal form_response dict."""
    if fields is None:
        fields = [
            {
                "id": a["field"]["id"],
                "title": a["field"]["title"],
                "type": a["type"],
                "ref": a["field"]["id"],
            }
            for a in answers
        ]
    return {
        "form_id": form_id,
        "token": "test-token",
        "submitted_at": "2025-01-01T12:00:00Z",
        "definition": {"id": form_id, "title": "Test Form", "fields": fields},
        "answers": answers,
        "hidden": {},
    }


def _payload(
    form_id: str, answers: list[dict], fields: list[dict] | None = None
) -> dict:
    return {
        "event_id": "evt-1",
        "event_type": "form_response",
        "form_response": _form_response(form_id, answers, fields),
    }


# ---------------------------------------------------------------------------
# _format_date
# ---------------------------------------------------------------------------


def test_format_date_iso_date():
    assert onboarding._format_date("1990-06-15") == "15-06-1990"


def test_format_date_iso_datetime():
    assert onboarding._format_date("1990-06-15T00:00:00Z") == "15-06-1990"


def test_format_date_none():
    assert onboarding._format_date(None) == ""


def test_format_date_empty():
    assert onboarding._format_date("") == ""


def test_format_date_invalid():
    # Should not raise; returns empty string or best-effort
    result = onboarding._format_date("not-a-date")
    assert isinstance(result, str)


# ---------------------------------------------------------------------------
# _lookup
# ---------------------------------------------------------------------------


def test_lookup_hit():
    assert onboarding._lookup(onboarding._AUTO_LOOKUP, "Nee") == "nvt"


def test_lookup_miss():
    assert onboarding._lookup(onboarding._AUTO_LOOKUP, "Unknown value") == ""


def test_lookup_none():
    assert onboarding._lookup(onboarding._AUTO_LOOKUP, None) == ""


def test_lookup_strips_whitespace():
    assert onboarding._lookup(onboarding._AUTO_LOOKUP, " Nee ") == "nvt"


# ---------------------------------------------------------------------------
# _join
# ---------------------------------------------------------------------------


def test_join_all_values():
    assert onboarding._join("A", "B", "C") == "A;B;C"


def test_join_skips_empty():
    assert onboarding._join("A", "", None, "C") == "A;C"


def test_join_all_empty():
    assert onboarding._join("", None, "") == ""


# ---------------------------------------------------------------------------
# _extract_company_id
# ---------------------------------------------------------------------------


def test_extract_company_id_plain_integer():
    answers = [_number("field-1", "Bedrijfs-ID", 12345678)]
    fields = [
        {"id": "field-1", "title": "Bedrijfs-ID", "type": "number", "ref": "field-1"}
    ]
    fr = _form_response("form-1", answers, fields)
    result = onboarding._extract_company_id({"form_response": fr}, fr)
    assert result == "12345678"


def test_extract_company_id_scientific_notation():
    """Typeform serialises large IDs as floats (e.g. 5.31e+10)."""
    answers = [_number("field-1", "Bedrijfs-ID", 5.31e10)]
    fields = [
        {"id": "field-1", "title": "Bedrijfs-ID", "type": "number", "ref": "field-1"}
    ]
    fr = _form_response("form-1", answers, fields)
    result = onboarding._extract_company_id({"form_response": fr}, fr)
    assert result == "53100000000"


def test_extract_company_id_no_answers():
    fr = {
        "form_id": "form-1",
        "definition": {"fields": []},
        "answers": [],
        "hidden": {},
    }
    result = onboarding._extract_company_id({"form_response": fr}, fr)
    assert result is None


# ---------------------------------------------------------------------------
# _is_new_client_form / _is_bv_form
# ---------------------------------------------------------------------------


def test_is_new_client_form():
    assert onboarding._is_new_client_form(onboarding.FORM_ID_NEW_BV) is True
    assert onboarding._is_new_client_form(onboarding.FORM_ID_NEW_EZ) is True
    assert onboarding._is_new_client_form(onboarding.FORM_ID_EXISTING_EZ) is False
    assert onboarding._is_new_client_form(onboarding.FORM_ID_EXISTING_BV) is False


def test_is_bv_form():
    assert onboarding._is_bv_form(onboarding.FORM_ID_NEW_BV) is True
    assert onboarding._is_bv_form(onboarding.FORM_ID_EXISTING_BV) is True
    assert onboarding._is_bv_form(onboarding.FORM_ID_NEW_EZ) is False
    assert onboarding._is_bv_form(onboarding.FORM_ID_EXISTING_EZ) is False


# ---------------------------------------------------------------------------
# _scan_answers — representative payloads
# ---------------------------------------------------------------------------


def test_scan_answers_ez_new_client_basics():
    """Core contact + company fields from an EZ/VOF new-client submission."""
    answers = [
        _email_answer("f-email", "Wat is uw e-mailadres?", "jan@example.com"),
        _phone_answer("f-phone", "Telefoonnummer", "+31612345678"),
        _text("f-first", "First name", "Jan"),
        _text("f-last", "Last name", "Jansen"),
        _text("f-company", "Naam van de onderneming", "Bakkerij Jansen"),
        _text("f-kvk", "KVK nummer", "12345678"),
        _choice("f-bedrijf", "Bedrijfsvorm", "Eenmanszaak (EZ)"),
        _choice("f-auto", "Bedrijfsauto", "Nee"),
        _choice("f-btw", "Bent u BTW-plichtig?", "Ja"),
        _choice("f-bank", "Zakelijke bankrekening", "Ja, er is één zakelijke rekening"),
    ]
    fr = _form_response("ez-new", answers)
    raw = onboarding._scan_answers(fr, {"form_response": fr})

    assert raw["email"] == "jan@example.com"
    assert raw["phone"] == "+31612345678"
    assert raw["firstname"] == "Jan"
    assert raw["lastname"] == "Jansen"
    assert raw["company_name"] == "Bakkerij Jansen"
    assert raw["kvk"] == "12345678"
    assert raw["bedrijfsvorm_raw"] == "Eenmanszaak (EZ)"
    assert raw["auto_raw"] == "Nee"
    assert raw["btw_plichtig_raw"] == "Ja"
    assert raw["bankrekeningen_raw"] == "Ja, er is één zakelijke rekening"


def test_scan_answers_bv_form_btw_vrijgesteld():
    """BV forms use 'BTW-vrijgesteld' instead of 'BTW-plichtig'."""
    answers = [
        _choice("f-vrijgesteld", "Is de onderneming BTW-vrijgesteld?", "Nee"),
        _choice("f-vpb", "Is de onderneming VPB-plichtig?", "Ja"),
    ]
    fr = _form_response("bv-new", answers)
    raw = onboarding._scan_answers(fr, {"form_response": fr})

    assert raw.get("btw_vrijgesteld_raw") == "Nee"
    assert raw.get("vpb_plichtig_raw") == "Ja"
    assert "btw_plichtig_raw" not in raw


def test_scan_answers_fiscale_partner_routing():
    """BSN and geboortedatum answers are correctly routed based on fiscal partner context."""
    answers = [
        _text("f-bsn", "Burgerservicenummer (BSN)", "123456789"),
        _text("f-bsn-fp", "BSN van de fiscale partner", "987654321"),
        _text("f-dob", "Geboortedatum", "1990-06-15"),
        _text("f-dob-fp", "Geboortedatum fiscale partner", "1992-03-20"),
    ]
    fr = _form_response("ez-new", answers)
    raw = onboarding._scan_answers(fr, {"form_response": fr})

    assert raw["bsn"] == "123456789"
    assert raw["bsn_fiscaal_partner"] == "987654321"
    assert raw["date_of_birth_raw"] == "1990-06-15"
    assert raw["geboortedatum_fiscaal_partner_raw"] == "1992-03-20"


def test_scan_answers_bankspec_parts_joined():
    """Bank IBAN details from multiple answers are joined as bankrekeningen_specificatie."""
    answers = [
        _text("f-iban1", "IBAN van de zakelijke rekening 1", "NL01ABCD0123456789"),
        _text(
            "f-iban2", "Overzicht van de zakelijke bankrekeningen", "NL02WXYZ9876543210"
        ),
    ]
    fr = _form_response("ez-new", answers)
    raw = onboarding._scan_answers(fr, {"form_response": fr})

    spec = raw.get("bankrekeningen_specificatie", "")
    assert "NL01ABCD0123456789" in spec
    assert "NL02WXYZ9876543210" in spec


def test_scan_answers_payment_methods():
    answers = [
        _choice(
            "f-pay",
            "Ontvangt u betalingen via Paypal, Stripe of American Express?",
            "Ja, van Stripe",
        ),
    ]
    fr = _form_response("bv-new", answers)
    raw = onboarding._scan_answers(fr, {"form_response": fr})
    assert raw["payment_methods_raw"] == "Ja, van Stripe"


def test_scan_answers_loonadministratie():
    answers = [
        _choice(
            "f-loon",
            "Wilt u loonadministratie?",
            "Ja, dit betreft een werknemer of meerdere werknemers van de onderneming",
        ),
    ]
    fr = _form_response("bv-new", answers)
    raw = onboarding._scan_answers(fr, {"form_response": fr})
    assert (
        raw["loonadministratie_raw"]
        == "Ja, dit betreft een werknemer of meerdere werknemers van de onderneming"
    )


# ---------------------------------------------------------------------------
# _build_contact_properties
# ---------------------------------------------------------------------------


def test_build_contact_properties_basic():
    raw = {
        "email": "jan@example.com",
        "firstname": "Jan",
        "lastname": "Jansen",
        "phone": "+31612345678",
        "address": "Hoofdstraat 1",
        "city": "Amsterdam",
        "zip": "1234 AB",
        "country": "Nederland",
        "bsn": "123456789",
        "company_name": "Bakkerij Jansen",
        "date_of_birth_raw": "1990-06-15",
    }
    props = onboarding._build_contact_properties(raw)

    assert props["email"] == "jan@example.com"
    assert props["firstname"] == "Jan"
    assert props["lastname"] == "Jansen"
    assert props["phone"] == "+31612345678"
    assert props["address"] == "Hoofdstraat 1"
    assert props["city"] == "Amsterdam"
    assert props["zip"] == "1234 AB"
    assert props["country"] == "Nederland"
    assert props["bsn"] == "123456789"
    assert props["company"] == "Bakkerij Jansen"
    assert props["date_of_birth"] == "15-06-1990"


def test_build_contact_properties_ib_toelichting():
    raw = {"ib_vennoten_info": "Vennoot A: BSN 111, partner BSN 222"}
    props = onboarding._build_contact_properties(raw)
    assert "ib_toelichting" in props
    assert "Vennoot A" in props["ib_toelichting"]
    assert "<b>" in props["ib_toelichting"]


def test_build_contact_properties_empty_fields_excluded():
    raw = {"firstname": "Jan", "email": ""}
    props = onboarding._build_contact_properties(raw)
    assert "firstname" in props
    assert "email" not in props


# ---------------------------------------------------------------------------
# _build_company_properties
# ---------------------------------------------------------------------------


def test_build_company_properties_ez_btw_plichtig():
    raw = {
        "company_name": "Bakkerij Jansen",
        "address": "Hoofdstraat 1",
        "city": "Amsterdam",
        "zip": "1234 AB",
        "country": "Nederland",
        "kvk": "12345678",
        "btw_plichtig_raw": "Ja",
        "auto_raw": "Nee",
        "bedrijfsvorm_raw": "Eenmanszaak (EZ)",
        "verlengd_boekjaar_raw": "Nee, ik heb geen verlengd boekjaar",
        "bankrekeningen_raw": "Ja, er is één zakelijke rekening",
    }
    props = onboarding._build_company_properties(raw, is_bv=False)

    assert props["name"] == "Bakkerij Jansen"
    assert props["address"] == "Hoofdstraat 1"
    assert props["city"] == "Amsterdam"
    assert props["zip"] == "1234 AB"
    assert props["country"] == "Nederland"
    assert props["kvk"] == "12345678"
    assert props["btw_plicht"] == "Aangifteplichtig"
    assert props["auto"] == "nvt"
    assert props["bedrijfsvorm"] == "Eenmanszaak/ZZP"
    assert props["verlengd_boekjaar"] == "nvt"
    assert props["bankrekeningen"] == "Éen bankrekening"
    assert props["vpb_plichtig"] == "Nee"  # EZ always Nee
    assert props["onboarding_typeform"] == "Ingevuld"


def test_build_company_properties_bv_btw_vrijgesteld_inverse_lookup():
    """BV form: 'btw-vrijgesteld = Nee' should map to 'Aangifteplichtig'."""
    raw = {
        "btw_vrijgesteld_raw": "Nee",
        "vpb_plichtig_raw": "Ja",
    }
    props = onboarding._build_company_properties(raw, is_bv=True)

    assert props["btw_plicht"] == "Aangifteplichtig"
    assert props["vpb_plichtig"] == "Ja"


def test_build_company_properties_bv_btw_vrijgesteld_ja():
    """BV form: 'btw-vrijgesteld = Ja' should map to 'Vrijgesteld van aangifte'."""
    raw = {"btw_vrijgesteld_raw": "Ja"}
    props = onboarding._build_company_properties(raw, is_bv=True)
    assert props["btw_plicht"] == "Vrijgesteld van aangifte"


def test_build_company_properties_excludes_btw_nummer_longer_than_14_chars():
    raw = {
        "company_name": "Bakkerij Jansen",
        "btw_nummer": "NL123456789B0123",
    }
    props = onboarding._build_company_properties(raw, is_bv=False)
    assert "btw_nummer" not in props


def test_build_company_properties_btw_soorten_eu_b2b():
    raw = {"eu_revenue_type_raw": "Business-to-Business (B2B)"}
    props = onboarding._build_company_properties(raw, is_bv=False)
    assert props["btw_soorten"] == "EU omzet B2B"
    assert props["btw_specificatie"] == "ICP aangifte"


def test_build_company_properties_btw_soorten_combined_bv():
    """BV: EU type + verlegde omzet are combined."""
    raw = {
        "eu_revenue_type_raw": "Business-to-Business (B2B)",
        "verlegde_omzet_raw": "Ja",
    }
    props = onboarding._build_company_properties(raw, is_bv=True)
    soorten = props["btw_soorten"]
    assert "EU omzet B2B" in soorten
    assert "Verlegde omzet" in soorten


def test_build_company_properties_vrijgestelde_omzet_ez():
    """EZ: btw_vrijgesteld_raw 'Ja' adds 'Vrijgestelde omzet' to btw_soorten."""
    raw = {"btw_vrijgesteld_raw": "Ja"}
    props = onboarding._build_company_properties(raw, is_bv=False)
    assert "Vrijgestelde omzet" in props.get("btw_soorten", "")


def test_build_company_properties_buiten_eu():
    raw = {"buiten_eu_raw": "Ja, slechts vanuit niet-EU-landen"}
    props = onboarding._build_company_properties(raw, is_bv=False)
    assert "Buiten EU omzet" in props.get("btw_soorten", "")


def test_build_company_properties_payment_methods_combined():
    raw = {
        "bankrekeningen_raw": "Ja, er zijn meerdere zakelijke rekeningen",
        "payment_methods_raw": "Ja, van Stripe",
    }
    props = onboarding._build_company_properties(raw, is_bv=False)
    assert "Meerdere bankrekeningen" in props["bankrekeningen"]
    assert "Stripe" in props["bankrekeningen"]


def test_build_company_properties_toelichting_admin_html():
    raw = {"toelichting_admin_raw": "Via Excel-spreadsheets"}
    props = onboarding._build_company_properties(raw, is_bv=False)
    assert "toelichting_administratiewijze" in props
    assert "<b>" in props["toelichting_administratiewijze"]
    assert "Via Excel-spreadsheets" in props["toelichting_administratiewijze"]


def test_build_company_properties_oprichtingsdatum_formatted():
    raw = {"oprichtingsdatum_raw": "2020-03-15"}
    props = onboarding._build_company_properties(raw, is_bv=False)
    # HubSpot date fields expect Unix ms timestamp (midnight UTC)
    from datetime import datetime

    expected_ms = str(int(datetime(2020, 3, 15, tzinfo=UTC).timestamp() * 1000))
    assert props["oprichtingsdatum"] == expected_ms


def test_build_company_properties_always_sets_onboarding_flag():
    raw = {}
    props = onboarding._build_company_properties(raw, is_bv=False)
    assert props["onboarding_typeform"] == "Ingevuld"


# ---------------------------------------------------------------------------
# _find_matching_contact
# ---------------------------------------------------------------------------


def _contact(
    contact_id: str, email: str = "", firstname: str = "", lastname: str = ""
) -> SimpleNamespace:
    return SimpleNamespace(
        id=contact_id,
        properties={"email": email, "firstname": firstname, "lastname": lastname},
    )


def test_find_matching_contact_single_contact():
    """If the company has only one contact, return it without fetching details."""
    with (
        patch.object(
            onboarding.hubspot_repository,
            "batch_get_contacts_for_companies",
            return_value={"99": ["contact-1"]},
        ),
    ):
        result = onboarding._find_matching_contact(
            "99", "any@email.com", "Jan", "Jansen"
        )

    assert result == "contact-1"


def test_find_matching_contact_email_match():
    """Matches by email (case-insensitive) when there are multiple contacts."""
    with (
        patch.object(
            onboarding.hubspot_repository,
            "batch_get_contacts_for_companies",
            return_value={"99": ["c-1", "c-2", "c-3"]},
        ),
        patch.object(
            onboarding.hubspot_repository,
            "batch_get_contacts_info",
            return_value=[
                _contact("c-1", email="other@example.com"),
                _contact("c-2", email="Jan@Example.COM"),  # case variation
                _contact("c-3", email="third@example.com"),
            ],
        ),
    ):
        result = onboarding._find_matching_contact(
            "99", "jan@example.com", "Jan", "Jansen"
        )

    assert result == "c-2"


def test_find_matching_contact_name_match_fallback():
    """Falls back to name match when email doesn't match."""
    with (
        patch.object(
            onboarding.hubspot_repository,
            "batch_get_contacts_for_companies",
            return_value={"99": ["c-1", "c-2"]},
        ),
        patch.object(
            onboarding.hubspot_repository,
            "batch_get_contacts_info",
            return_value=[
                _contact(
                    "c-1", email="nope@x.com", firstname="Piet", lastname="Bakker"
                ),
                _contact(
                    "c-2", email="nope2@x.com", firstname="Jan", lastname="Jansen"
                ),
            ],
        ),
    ):
        result = onboarding._find_matching_contact(
            "99", "notfound@x.com", "Jan", "Jansen"
        )

    assert result == "c-2"


def test_find_matching_contact_no_match_returns_first():
    """Returns first contact when no email or name match can be found."""
    with (
        patch.object(
            onboarding.hubspot_repository,
            "batch_get_contacts_for_companies",
            return_value={"99": ["c-1", "c-2"]},
        ),
        patch.object(
            onboarding.hubspot_repository,
            "batch_get_contacts_info",
            return_value=[
                _contact("c-1", email="a@a.com", firstname="Aaa", lastname="Bbb"),
                _contact("c-2", email="b@b.com", firstname="Ccc", lastname="Ddd"),
            ],
        ),
    ):
        result = onboarding._find_matching_contact(
            "99", "nomatch@x.com", "Unknown", "Person"
        )

    assert result == "c-1"


def test_find_matching_contact_no_contacts():
    with patch.object(
        onboarding.hubspot_repository,
        "batch_get_contacts_for_companies",
        return_value={},
    ):
        result = onboarding._find_matching_contact(
            "99", "jan@example.com", "Jan", "Jansen"
        )

    assert result is None


# ---------------------------------------------------------------------------
# _maybe_create_loonadministratie_deal
# ---------------------------------------------------------------------------


def test_maybe_create_loonadministratie_deal_triggers():
    """A matching trigger value creates a deal and returns its ID."""
    mock_response = SimpleNamespace(id="deal-42")

    with patch("app.service.typeform.onboarding.hs_client") as mock_client:
        mock_client.crm.deals.basic_api.create.return_value = mock_response
        result = onboarding._maybe_create_loonadministratie_deal(
            raw={
                "loonadministratie_raw": "Ja, dit betreft een werknemer of meerdere werknemers van de onderneming",
                "firstname": "Jan",
                "lastname": "Jansen",
                "company_name": "Bakkerij BV",
            },
            contact_id="contact-1",
            company_id="company-1",
        )

    assert result == "deal-42"


def test_maybe_create_loonadministratie_deal_nee_skips():
    """'Nee' answer means no deal should be created."""
    with patch("app.service.typeform.onboarding.hs_client") as mock_client:
        result = onboarding._maybe_create_loonadministratie_deal(
            raw={"loonadministratie_raw": "Nee"},
            contact_id="contact-1",
            company_id="company-1",
        )

    assert result is None
    mock_client.crm.deals.basic_api.create.assert_not_called()


def test_maybe_create_loonadministratie_deal_no_contact_skips():
    """Deal creation is skipped if no contact ID is available."""
    with patch("app.service.typeform.onboarding.hs_client") as mock_client:
        result = onboarding._maybe_create_loonadministratie_deal(
            raw={
                "loonadministratie_raw": "Ja, dit betreft een werknemer of meerdere werknemers van de onderneming"
            },
            contact_id=None,
            company_id="company-1",
        )

    assert result is None
    mock_client.crm.deals.basic_api.create.assert_not_called()


def test_maybe_create_loonadministratie_deal_dga_trigger():
    """DGA trigger value also creates a deal."""
    mock_response = SimpleNamespace(id="deal-99")
    with patch("app.service.typeform.onboarding.hs_client") as mock_client:
        mock_client.crm.deals.basic_api.create.return_value = mock_response
        result = onboarding._maybe_create_loonadministratie_deal(
            raw={
                "loonadministratie_raw": "Ja, dit betreft mijzelf als eigenaar van de BV (DGA)",
                "firstname": "Lisa",
                "lastname": "de Vries",
                "company_name": "Lisa BV",
            },
            contact_id="c-5",
            company_id="co-5",
        )
    assert result == "deal-99"


def test_maybe_create_loonadministratie_deal_api_error_returns_none():
    """If HubSpot raises, returns None without propagating the exception."""
    with patch("app.service.typeform.onboarding.hs_client") as mock_client:
        mock_client.crm.deals.basic_api.create.side_effect = Exception("API down")
        result = onboarding._maybe_create_loonadministratie_deal(
            raw={
                "loonadministratie_raw": "Ja, dit betreft een werknemer of meerdere werknemers van de onderneming",
                "firstname": "Jan",
                "lastname": "Jansen",
                "company_name": "Bakkerij BV",
            },
            contact_id="c-1",
            company_id="co-1",
        )
    assert result is None


# ---------------------------------------------------------------------------
# Dossier folder resolution
# ---------------------------------------------------------------------------


def test_find_or_create_dossier_folder_creates_missing_root_folder():
    with (
        patch.object(
            onboarding,
            "_get_company_dossier_id",
            return_value="13685461428",
        ),
        patch.object(
            onboarding,
            "_get_dossier_name",
            return_value="A de Boer",
        ),
        patch(
            "app.service.typeform.onboarding.search_dossier_folders",
            return_value=[],
        ),
        patch(
            "app.service.typeform.onboarding.ensure_child_folder",
            return_value={"id": "dossier-folder", "name": "A de Boer, 13685461428"},
        ) as ensure_child_folder,
    ):
        result = onboarding._find_or_create_dossier_folder(
            drive_id="drive-1",
            drive_root_id="root-1",
            company_id="1807",
            company_name="Aad de Mooij BV",
            contact_id="contact-1",
            token="token-1",
        )

    assert result == {"id": "dossier-folder", "name": "A de Boer, 13685461428"}
    assert ensure_child_folder.call_args.args == (
        "drive-1",
        "root-1",
        "A de Boer, 13685461428",
        "token-1",
    )


def test_find_or_create_dossier_folder_uses_root_level_match():
    with (
        patch.object(
            onboarding,
            "_get_company_dossier_id",
            return_value="13685461428",
        ),
        patch.object(
            onboarding,
            "_get_dossier_name",
            return_value="A de Boer",
        ),
        patch(
            "app.service.typeform.onboarding.search_dossier_folders",
            return_value=[
                {
                    "id": "nested-folder",
                    "name": "A de Boer (EZ), 13685461428",
                    "folder": {},
                    "parentReference": {"id": "some-parent"},
                },
                {
                    "id": "root-dossier-folder",
                    "name": "A. & Y. de Boer - de Cock, 13685461428",
                    "folder": {},
                    "parentReference": {"id": "root-1"},
                },
            ],
        ),
        patch(
            "app.service.typeform.onboarding.rename_drive_item",
            return_value={
                "id": "root-dossier-folder",
                "name": "A de Boer, 13685461428",
                "folder": {},
                "parentReference": {"id": "root-1"},
            },
        ) as rename_drive_item,
        patch("app.service.typeform.onboarding.ensure_child_folder") as ensure_child,
    ):
        result = onboarding._find_or_create_dossier_folder(
            drive_id="drive-1",
            drive_root_id="root-1",
            company_id="14901",
            company_name="A de Boer",
            contact_id="contact-1",
            token="token-1",
        )

    assert result == {
        "id": "root-dossier-folder",
        "name": "A de Boer, 13685461428",
        "folder": {},
        "parentReference": {"id": "root-1"},
    }
    rename_drive_item.assert_called_once_with(
        "drive-1",
        "root-dossier-folder",
        "A de Boer, 13685461428",
        "token-1",
    )
    ensure_child.assert_not_called()


def test_find_or_create_company_folder_uses_existing_folder_with_company_id():
    with (
        patch(
            "app.service.typeform.onboarding.list_children",
            return_value=[
                {
                    "id": "company-folder",
                    "name": "A de Boer, 14901",
                    "folder": {},
                }
            ],
        ) as list_children,
        patch("app.service.typeform.onboarding.ensure_child_folder") as ensure_child,
    ):
        result = onboarding._find_or_create_company_folder(
            drive_id="drive-1",
            dossier_folder_id="dossier-folder",
            company_id="14901",
            company_name="A de Boer",
            token="token-1",
        )

    assert result == {
        "id": "company-folder",
        "name": "A de Boer, 14901",
        "folder": {},
    }
    assert list_children.call_args.args == ("drive-1", "dossier-folder", "token-1")
    ensure_child.assert_not_called()


def test_ensure_contact_folder_uses_contact_name_and_id():
    with (
        patch(
            "app.service.typeform.onboarding.get_contact_display_name",
            return_value="Jan Jansen",
        ),
        patch(
            "app.service.typeform.onboarding.resolve_contact_folder",
            return_value={"id": "contact-folder", "name": "Jan Jansen, 42"},
        ) as resolve_contact_folder,
    ):
        result = onboarding._ensure_contact_folder(
            drive_id="drive-1",
            dossier_folder_id="dossier-folder",
            contact_id="42",
            token="token-1",
        )

    assert result == {"id": "contact-folder", "name": "Jan Jansen, 42"}
    assert resolve_contact_folder.call_args.args == (
        "drive-1",
        "dossier-folder",
        "Jan Jansen",
        "Jan Jansen, 42",
        "token-1",
    )


def test_get_target_years_uses_previous_and_current_year():
    result = onboarding._get_target_years(datetime(2026, 4, 9, tzinfo=UTC))
    assert result == [2025, 2026]


def test_ensure_company_year_folders_creates_year_structure_and_templates():
    with (
        patch(
            "app.service.typeform.onboarding._find_template_file",
            return_value={"id": "template-file", "file": {"mimeType": "xlsx/type"}},
        ),
        patch(
            "app.service.typeform.onboarding._download_drive_item_content",
            return_value=b"template-bytes",
        ),
        patch(
            "app.service.typeform.onboarding.ensure_child_folder",
            side_effect=[
                {"id": "year-2025", "name": "2025"},
                {"id": "btw-2025", "name": "BTW-aangiftes"},
                {"id": "docs-2025", "name": "Aanvullende documenten"},
                {"id": "q1-2025", "name": "Q1"},
                {"id": "q2-2025", "name": "Q2"},
                {"id": "q3-2025", "name": "Q3"},
                {"id": "q4-2025", "name": "Q4"},
                {"id": "year-2026", "name": "2026"},
                {"id": "btw-2026", "name": "BTW-aangiftes"},
                {"id": "docs-2026", "name": "Aanvullende documenten"},
                {"id": "q1-2026", "name": "Q1"},
                {"id": "q2-2026", "name": "Q2"},
                {"id": "q3-2026", "name": "Q3"},
                {"id": "q4-2026", "name": "Q4"},
            ],
        ) as ensure_child_folder,
        patch(
            "app.service.typeform.onboarding._ensure_year_template_file",
        ) as ensure_year_template_file,
    ):
        result = onboarding._ensure_company_year_folders(
            drive_id="drive-1",
            drive_root_id="root-1",
            company_folder_id="company-folder",
            company_name="Bakkerij Jansen",
            is_bv=False,
            token="token-1",
            now=datetime(2026, 4, 9, tzinfo=UTC),
        )

    assert result == {
        "year_folders": ["2025", "2026"],
        "current_year_folder": {
            "id": "year-2026",
            "name": "2026",
        },
    }
    assert ensure_child_folder.call_args_list[0].args == (
        "drive-1",
        "company-folder",
        "2025",
        "token-1",
    )
    assert ensure_child_folder.call_args_list[3].args == (
        "drive-1",
        "year-2025",
        "Q1",
        "token-1",
    )
    assert ensure_child_folder.call_args_list[7].args == (
        "drive-1",
        "company-folder",
        "2026",
        "token-1",
    )
    assert ensure_year_template_file.call_args_list[0].kwargs["year"] == 2025
    assert ensure_year_template_file.call_args_list[1].kwargs["year"] == 2026


def test_ensure_contact_year_folders_creates_years_only():
    with patch(
        "app.service.typeform.onboarding.ensure_child_folder",
        side_effect=[
            {"id": "contact-2025", "name": "2025"},
            {"id": "contact-2026", "name": "2026"},
        ],
    ) as ensure_child_folder:
        result = onboarding._ensure_contact_year_folders(
            drive_id="drive-1",
            contact_folder_id="contact-folder",
            token="token-1",
            now=datetime(2026, 4, 9, tzinfo=UTC),
        )

    assert result == ["2025", "2026"]
    assert ensure_child_folder.call_args_list[0].args == (
        "drive-1",
        "contact-folder",
        "2025",
        "token-1",
    )
    assert ensure_child_folder.call_args_list[1].args == (
        "drive-1",
        "contact-folder",
        "2026",
        "token-1",
    )


def test_build_dossier_folder_name_prefers_dossier_name():
    with patch(
        "app.service.typeform.onboarding.get_contact_display_name",
        return_value="Aad de Mooij",
    ):
        result = onboarding._build_dossier_folder_name(
            dossier_id="13685461428",
            dossier_name="A de Boer",
            contact_id="contact-1",
            company_name="Aad de Mooij BV",
        )

    assert result == "A de Boer, 13685461428"


# ---------------------------------------------------------------------------
# process_onboarding_webhook — integration smoke tests
# ---------------------------------------------------------------------------

_EZ_NEW_FORM_ID = onboarding.FORM_ID_NEW_EZ


def _ez_new_payload() -> dict:
    """Minimal EZ new-client payload with a company ID in field 1."""
    company_field_id = "f-company-id"
    answers = [
        _number(company_field_id, "Bedrijfs-ID", 12345),
        _email_answer("f-email", "E-mailadres", "jan@example.com"),
        _text("f-first", "First name", "Jan"),
        _text("f-last", "Last name", "Jansen"),
        _text("f-company", "Naam van de onderneming", "Bakkerij Jansen"),
        _text("f-kvk", "KVK nummer", "12345678"),
        _choice("f-loon", "Loonadministratie nodig?", "Nee"),
    ]
    fields = [
        {
            "id": a["field"]["id"],
            "title": a["field"]["title"],
            "type": a["type"],
            "ref": a["field"]["id"],
        }
        for a in answers
    ]
    return {
        "event_id": "evt-1",
        "event_type": "form_response",
        "form_response": {
            "form_id": _EZ_NEW_FORM_ID,
            "token": "tok-1",
            "submitted_at": "2025-01-01T12:00:00Z",
            "definition": {
                "id": _EZ_NEW_FORM_ID,
                "title": "EZ Onboarding",
                "fields": fields,
            },
            "answers": answers,
            "hidden": {},
        },
    }


def test_process_onboarding_webhook_ignored_event_type():
    payload = {"event_type": "ping", "form_response": {}}
    result = onboarding.process_onboarding_webhook(payload)
    assert result["status"] == "ignored"


def test_process_onboarding_webhook_no_form_response():
    with pytest.raises(TypeError):
        onboarding.process_onboarding_webhook({"event_type": "form_response"})


def test_process_onboarding_webhook_missing_company_id():
    """When the first answer has no usable company ID, return ignored."""
    fr = {
        "form_id": "some-form",
        "definition": {
            "id": "some-form",
            "fields": [
                {"id": "f1", "title": "Bedrijfs-ID", "type": "text", "ref": "f1"}
            ],
        },
        "answers": [
            {
                "field": {
                    "id": "f1",
                    "title": "Bedrijfs-ID",
                    "type": "text",
                    "ref": "f1",
                },
                "type": "text",
                "text": "",
            }
        ],
        "hidden": {},
    }
    result = onboarding.process_onboarding_webhook(
        {"event_type": "form_response", "form_response": fr}
    )
    assert result["status"] == "ignored"
    assert "company" in result["reason"].lower()


def test_process_onboarding_webhook_updates_contact_and_company():
    """Happy path: contact + company updated, no SharePoint (no contact found after first contact step fails)."""
    updated_contacts: list = []
    updated_companies: list = []

    with (
        patch.object(
            onboarding.hubspot_repository,
            "batch_get_contacts_for_companies",
            return_value={"12345": ["contact-1"]},
        ),
        patch.object(
            onboarding.hubspot_repository,
            "update_contact",
            side_effect=lambda cid, props: updated_contacts.append((cid, props)),
        ),
        patch.object(
            onboarding.hubspot_repository,
            "update_company_properties",
            side_effect=lambda cid, props: updated_companies.append((cid, props)),
        ),
        # Mock the entire SharePoint chain so we don't need credentials
        patch(
            "app.service.typeform.onboarding.get_graph_access_token",
            return_value="fake-token",
        ),
        patch(
            "app.service.typeform.onboarding.get_site", return_value={"id": "site-1"}
        ),
        patch(
            "app.service.typeform.onboarding.graph_json",
            side_effect=[{"id": "drive-1"}, {"id": "root-1"}],
        ),
        patch(
            "app.service.typeform.onboarding._find_or_create_dossier_folder",
            return_value={"id": "dossier-1", "name": "Dossier Bakkerij Jansen, 555"},
        ),
        patch(
            "app.service.typeform.onboarding._find_or_create_company_folder",
            return_value={"id": "company-1", "name": "Bakkerij Jansen, 12345"},
        ),
        patch(
            "app.service.typeform.onboarding._ensure_contact_folder",
            return_value={"id": "contact-folder-1", "name": "Jan Jansen, contact-1"},
        ),
        patch(
            "app.service.typeform.onboarding._ensure_contact_year_folders",
            return_value=["2025", "2026"],
        ),
        patch(
            "app.service.typeform.onboarding._ensure_company_year_folders",
            return_value={
                "year_folders": ["2025", "2026"],
                "current_year_folder": {
                    "id": "year-2026",
                    "name": "2026",
                },
            },
        ),
        patch(
            "app.service.typeform.onboarding.upload_typeform_files_to_sharepoint",
            return_value=[],
        ) as upload_files,
        patch(
            "app.service.typeform.onboarding.render_summary_document",
            return_value=b"%PDF-fake",
        ),
        patch("app.service.typeform.onboarding.upload_bytes_to_folder"),
        patch(
            "app.service.typeform.onboarding.require_env",
            return_value="sharepoint.example.com",
        ),
    ):
        result = onboarding.process_onboarding_webhook(_ez_new_payload())

    assert result["status"] == "uploaded"
    assert result["company_id"] == "12345"
    assert result["contact_id"] == "contact-1"
    assert result["is_new_client"] is True
    assert "dossier_folder" in result
    assert result["company_folder"] == "Bakkerij Jansen, 12345"
    assert result["contact_folder"] == "Jan Jansen, contact-1"
    assert result["year_folders"] == ["2025", "2026"]
    assert upload_files.call_args.args == (
        _ez_new_payload(),
        "drive-1",
        "company-1",
        "fake-token",
    )

    # Contact was updated (is_new_client = True)
    assert len(updated_contacts) == 1
    assert updated_contacts[0][0] == "contact-1"

    # Company was updated
    assert len(updated_companies) == 1
    assert updated_companies[0][0] == 12345
    assert updated_companies[0][1]["onboarding_typeform"] == "Ingevuld"


def test_process_onboarding_webhook_no_contact_returns_partial():
    """When no contact is found, we skip SharePoint and return partial status."""

    with (
        patch.object(
            onboarding.hubspot_repository,
            "batch_get_contacts_for_companies",
            return_value={},  # no contacts
        ),
        patch.object(
            onboarding.hubspot_repository,
            "update_company_properties",
        ),
    ):
        result = onboarding.process_onboarding_webhook(_ez_new_payload())

    assert result["status"] == "partial"
    assert result["company_id"] == "12345"
