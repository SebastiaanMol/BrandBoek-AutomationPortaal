import asyncio
import logging
import os
from datetime import UTC
from datetime import datetime
from typing import Any

import requests
import sentry_sdk
from dotenv import load_dotenv

import app.repository.hubspot as hubspot_calls
from app.service.rate_limiter import call_hubspot_api

load_dotenv()
logger = logging.getLogger(__name__)

KVK_API_KEY = os.getenv("KVK_API_KEY", "")
KVK_ZOEKEN_API_URL = os.getenv("KVK_ZOEKEN_API_URL", "https://api.kvk.nl/api/v2/zoeken")

# HubSpot company property names.
HS_PROP_KVK_NUMBER = "kvk"
HS_PROP_RSIN = "rsin"
HS_PROP_STATUTAIRE_NAAM = "statutaire_naam"
HS_PROP_ADDRESS = "address"
HS_PROP_CITY = "city"
HS_PROP_ZIP = "zip"
HS_PROP_RECHTSVORM = "rechtsvorm"
HS_PROP_ACTIVITEITEN = "activiteiten"
HS_PROP_REGISTRATIEDATUM = "registratiedatum"
HS_PROP_OPRICHTINGSDATUM = "oprichtingsdatum"


def _clean_digits(value: str | None) -> str:
    if not value:
        return ""
    return "".join(ch for ch in str(value) if ch.isdigit())


def _normalize_type(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().lower()


def _as_list(value: Any) -> list:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _embedded_node(basis: dict[str, Any], key: str) -> dict[str, Any]:
    embedded_raw = basis.get("_embedded")
    embedded: dict[str, Any] = embedded_raw if isinstance(embedded_raw, dict) else {}
    node = embedded.get(key)
    if isinstance(node, dict):
        return node
    node = basis.get(key)
    if isinstance(node, dict):
        return node
    return {}


def _result_type(result: dict[str, Any]) -> str:
    return _normalize_type(
        result.get("type") or result.get("soort") or result.get("vestigingstype")
    )


def _result_debug_summary(result: dict[str, Any], idx: int) -> dict[str, Any]:
    return {
        "idx": idx,
        "type": result.get("type"),
        "soort": result.get("soort"),
        "vestigingstype": result.get("vestigingstype"),
        "kvkNummer": result.get("kvkNummer"),
        "rsin": result.get("rsin"),
        "naam": result.get("naam"),
        "straatnaam": result.get("straatnaam"),
        "huisnummer": result.get("huisnummer"),
        "postcode": result.get("postcode"),
        "plaats": result.get("plaats"),
    }


def _extract_results(payload: dict[str, Any]) -> list[dict[str, Any]]:
    results = payload.get("resultaten")
    if isinstance(results, list):
        return results
    items = payload.get("items")
    if isinstance(items, list):
        return items
    return []


def _pick_best_result(
    results: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, str | None, bool]:
    if not results:
        return None, None, False

    if len(results) == 1:
        return results[0], None, False

    hoofdvestigingen = [r for r in results if _result_type(r) == "hoofdvestiging"]
    if len(hoofdvestigingen) == 1:
        return (
            hoofdvestigingen[0],
            "Multiple results found; selected the only Hoofdvestiging.",
            False,
        )
    if len(hoofdvestigingen) > 1:
        logger.error(
            "KVK result selection: multiple Hoofdvestiging records; refusing automatic selection."
        )
        return (
            None,
            "Multiple Hoofdvestiging results found; cannot determine a unique match.",
            True,
        )
    logger.warning(
        "KVK result selection: no Hoofdvestiging found; picking first result."
    )
    return (
        results[0],
        "Multiple results found and no Hoofdvestiging; selected the first one.",
        False,
    )


def _extract_basisprofiel_link(search_result: dict[str, Any]) -> str:
    for link in _as_list(search_result.get("links")):
        if not isinstance(link, dict):
            continue
        rel = str(link.get("rel") or "").strip().lower()
        href = str(link.get("href") or "").strip()
        if not href:
            continue
        if rel == "basisprofiel" or "basisprofielen" in href:
            return href
    return ""


def _search_zoeken_api(query_key: str, query_value: str) -> dict[str, Any]:
    if not KVK_API_KEY:
        msg = "Missing KVK_API_KEY environment variable."
        raise ValueError(msg)

    headers = {"apikey": KVK_API_KEY}
    params: dict[str, str | int] = {query_key: query_value, "resultatenPerPagina": 100}
    response = requests.get(
        KVK_ZOEKEN_API_URL, headers=headers, params=params, timeout=20
    )
    response.raise_for_status()
    return response.json()


def _search_basisprofiel_api(url: str) -> dict[str, Any]:
    if not KVK_API_KEY:
        msg = "Missing KVK_API_KEY environment variable."
        raise ValueError(msg)

    headers = {"apikey": KVK_API_KEY}
    response = requests.get(url, headers=headers, timeout=20)
    response.raise_for_status()
    return response.json()


def _normalize_address_obj(address_obj: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(address_obj, dict):
        return {}
    if isinstance(address_obj.get("binnenlandsAdres"), dict):
        return address_obj["binnenlandsAdres"]
    if isinstance(address_obj.get("buitenlandsAdres"), dict):
        return address_obj["buitenlandsAdres"]
    return address_obj


def _address_candidates_from_basisprofiel(
    basis: dict[str, Any],
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    hoofdvestiging = _embedded_node(basis, "hoofdvestiging")
    eigenaar = _embedded_node(basis, "eigenaar")
    paths = [
        ("adressen",),  # top-level list
    ]

    # explicit candidates from embedded and top-level
    for embedded_node in [hoofdvestiging, eigenaar]:
        for item in _as_list(embedded_node.get("adressen")):
            if isinstance(item, dict):
                normalized = _normalize_address_obj(item)
                if normalized:
                    candidates.append(normalized)

    for path in paths:
        current: Any = basis
        valid = True
        for key in path:
            if not isinstance(current, dict):
                valid = False
                break
            current = current.get(key)
        if not valid:
            continue

        for item in _as_list(current):
            if isinstance(item, dict):
                normalized = _normalize_address_obj(item)
                if normalized:
                    candidates.append(normalized)
            elif isinstance(current, dict):
                for sub in current.values():
                    if isinstance(sub, dict):
                        normalized = _normalize_address_obj(sub)
                        if normalized:
                            candidates.append(normalized)
    return candidates


def _pick_best_address_obj(addresses: list[dict[str, Any]]) -> dict[str, Any]:
    if not addresses:
        return {}
    visit = [
        a for a in addresses if "bezoek" in str(a.get("type") or "").strip().lower()
    ]
    if visit:
        return visit[0]
    return addresses[0]


def _build_address_from_address_obj(address_obj: dict[str, Any]) -> str:
    street = str(address_obj.get("straatnaam") or "").strip()
    house_number = str(address_obj.get("huisnummer") or "").strip()
    addition = str(
        address_obj.get("huisnummerToevoeging")
        or address_obj.get("toevoegingAdres")
        or address_obj.get("huisletter")
        or ""
    ).strip()
    street_line = " ".join(p for p in [street, house_number, addition] if p).strip()
    if street_line:
        return street_line
    return str(address_obj.get("straatHuisnummer") or "").strip()


def _extract_city_zip_from_address_obj(address_obj: dict[str, Any]) -> tuple[str, str]:
    city = str(address_obj.get("plaats") or "").strip()
    zip_code = str(address_obj.get("postcode") or "").strip()
    if city or zip_code:
        return city, zip_code
    return "", str(address_obj.get("postcodeWoonplaats") or "").strip()


def _extract_rechtsvorm(basis: dict[str, Any]) -> str:
    eigenaar = _embedded_node(basis, "eigenaar")
    raw = eigenaar.get("rechtsvorm") or eigenaar.get("vorm") or basis.get("rechtsvorm")
    if isinstance(raw, dict):
        return str(raw.get("omschrijving") or raw.get("naam") or "").strip()
    return str(raw or "").strip()


def _extract_rsin(basis: dict[str, Any], result: dict[str, Any]) -> str:
    eigenaar = _embedded_node(basis, "eigenaar")
    return str(
        eigenaar.get("rsin") or basis.get("rsin") or result.get("rsin") or ""
    ).strip()


def _extract_sbi_activiteiten(basis: dict[str, Any]) -> str:
    hoofdvestiging = _embedded_node(basis, "hoofdvestiging")
    activities = _as_list(
        hoofdvestiging.get("sbiActiviteiten") or basis.get("sbiActiviteiten")
    )
    lines: list[str] = []
    for item in activities:
        if not isinstance(item, dict):
            continue
        code = str(item.get("sbiCode") or "").strip()
        desc = str(
            item.get("sbiOmschrijving") or item.get("omschrijving") or ""
        ).strip()
        line = " - ".join(p for p in [code, desc] if p)
        if line:
            lines.append(line)
    return "\n".join(lines)


def _extract_date_value(raw: Any) -> str:
    if isinstance(raw, str):
        return raw.strip()
    if isinstance(raw, dict):
        for key in [
            "datumAanvang",
            "startdatum",
            "aanvangsdatum",
            "startDatum",
            "datum",
        ]:
            value = str(raw.get(key) or "").strip()
            if value:
                return value
    return ""


def _to_hubspot_date_millis(raw_date: str) -> int | None:
    """
    Convert date strings like YYYYMMDD or YYYY-MM-DD to HubSpot date format:
    epoch milliseconds at midnight UTC.
    """
    value = (raw_date or "").strip()
    if not value:
        return None

    dt_value: datetime | None = None
    for fmt in ("%Y%m%d", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            dt_value = datetime.strptime(value, fmt)
            break
        except ValueError:
            continue

    if dt_value is None:
        logger.warning("Could not parse date value from KVK: %s", raw_date)
        return None

    dt_utc = datetime(dt_value.year, dt_value.month, dt_value.day, tzinfo=UTC)
    return int(dt_utc.timestamp() * 1000)


def _extract_formele_registratiedatum(basis: dict[str, Any]) -> str:
    hoofdvestiging = _embedded_node(basis, "hoofdvestiging")
    return _extract_date_value(
        hoofdvestiging.get("formeleRegistratie")
        or hoofdvestiging.get("formeleRegistratiedatum")
        or basis.get("formeleRegistratie")
        or basis.get("formeleRegistratiedatum")
    )


def _extract_materiele_oprichtingsdatum(basis: dict[str, Any]) -> str:
    hoofdvestiging = _embedded_node(basis, "hoofdvestiging")
    return _extract_date_value(
        hoofdvestiging.get("materieleRegistratie")
        or hoofdvestiging.get("materieleRegistratiedatum")
        or basis.get("materieleRegistratie")
        or basis.get("materieleRegistratiedatum")
    )


def _prepare_hubspot_properties(
    result: dict[str, Any], basis: dict[str, Any] | None
) -> dict[str, Any]:
    basis = basis or {}
    props: dict[str, Any] = {}

    kvk_number = str(basis.get("kvkNummer") or result.get("kvkNummer") or "").strip()
    rsin = _extract_rsin(basis, result)
    statutaire_naam = str(basis.get("naam") or result.get("naam") or "").strip()

    address_obj = _pick_best_address_obj(_address_candidates_from_basisprofiel(basis))
    address = _build_address_from_address_obj(address_obj) if address_obj else ""
    city, zip_code = (
        _extract_city_zip_from_address_obj(address_obj) if address_obj else ("", "")
    )

    rechtsvorm = _extract_rechtsvorm(basis)
    activiteiten = _extract_sbi_activiteiten(basis)
    formele_raw = _extract_formele_registratiedatum(basis)
    materiele_raw = _extract_materiele_oprichtingsdatum(basis)
    formele = _to_hubspot_date_millis(formele_raw)
    materiele = _to_hubspot_date_millis(materiele_raw)

    if kvk_number:
        props[HS_PROP_KVK_NUMBER] = kvk_number
    if rsin:
        props[HS_PROP_RSIN] = rsin
    if statutaire_naam:
        props[HS_PROP_STATUTAIRE_NAAM] = statutaire_naam
    if address:
        props[HS_PROP_ADDRESS] = address
    if city:
        props[HS_PROP_CITY] = city
    if zip_code:
        props[HS_PROP_ZIP] = zip_code
    if rechtsvorm:
        props[HS_PROP_RECHTSVORM] = rechtsvorm
    if activiteiten:
        props[HS_PROP_ACTIVITEITEN] = activiteiten
    if formele is not None:
        props[HS_PROP_REGISTRATIEDATUM] = formele
    if materiele is not None:
        props[HS_PROP_OPRICHTINGSDATUM] = materiele

    return props


async def sync_company_from_kvk(
    company_id: str,
    kvk_number: str | None = None,
    rsin: str | None = None,
) -> dict[str, Any]:
    kvk_clean = _clean_digits(kvk_number)
    rsin_clean = _clean_digits(rsin)
    if not kvk_clean or not rsin_clean:
        return {
            "status": "no_input",
            "message": "Both KVK number and RSIN are required.",
            "updated": False,
        }

    selected_result: dict[str, Any] | None = None
    selected_by = "kvk_number+rsin"
    warnings: list[str] = []
    kvk_search_responses: list[dict[str, Any]] = []
    basisprofiel_response: dict[str, Any] | None = None

    # 1) Search by kvk number
    try:
        kvk_payload = await asyncio.to_thread(
            _search_zoeken_api, "kvkNummer", kvk_clean
        )
        kvk_search_responses.append(kvk_payload)
    except Exception as exc:
        logger.exception("KVK search failed for kvkNummer=%s", kvk_clean)
        return {
            "status": "kvk_error",
            "message": f"KVK search failed on kvk_number: {exc}",
            "updated": False,
            "kvk_response": {
                "zoeken": kvk_search_responses,
                "basisprofiel": basisprofiel_response,
            },
        }
    kvk_results = _extract_results(kvk_payload)
    if not kvk_results:
        return {
            "status": "no_match",
            "message": "No KVK record found for the provided kvk_number.",
            "updated": False,
            "kvk_response": {
                "zoeken": kvk_search_responses,
                "basisprofiel": basisprofiel_response,
            },
        }
    kvk_result, kvk_warning, kvk_ambiguous = _pick_best_result(kvk_results)
    if kvk_ambiguous:
        return {
            "status": "ambiguous_match",
            "message": kvk_warning
            or "Multiple Hoofdvestiging results found for kvk_number.",
            "updated": False,
            "search_used": "kvk_number",
            "kvk_response": {
                "zoeken": kvk_search_responses,
                "basisprofiel": basisprofiel_response,
            },
        }
    if kvk_warning:
        warnings.append(kvk_warning)
    if not kvk_result:
        return {
            "status": "no_match",
            "message": "No usable KVK result found for kvk_number.",
            "updated": False,
            "kvk_response": {
                "zoeken": kvk_search_responses,
                "basisprofiel": basisprofiel_response,
            },
        }

    # 2) Search by rsin and verify it maps to the same kvk number.
    try:
        rsin_payload = await asyncio.to_thread(_search_zoeken_api, "rsin", rsin_clean)
        kvk_search_responses.append(rsin_payload)
    except Exception as exc:
        logger.exception("KVK search failed for rsin=%s", rsin_clean)
        return {
            "status": "kvk_error",
            "message": f"KVK search failed on rsin: {exc}",
            "updated": False,
            "kvk_response": {
                "zoeken": kvk_search_responses,
                "basisprofiel": basisprofiel_response,
            },
        }
    rsin_results = _extract_results(rsin_payload)
    if not rsin_results:
        return {
            "status": "no_match",
            "message": "No KVK record found for the provided rsin.",
            "updated": False,
            "kvk_response": {
                "zoeken": kvk_search_responses,
                "basisprofiel": basisprofiel_response,
            },
        }
    rsin_result, rsin_warning, rsin_ambiguous = _pick_best_result(rsin_results)
    if rsin_ambiguous:
        return {
            "status": "ambiguous_match",
            "message": rsin_warning
            or "Multiple Hoofdvestiging results found for rsin.",
            "updated": False,
            "search_used": "rsin",
            "kvk_response": {
                "zoeken": kvk_search_responses,
                "basisprofiel": basisprofiel_response,
            },
        }
    if rsin_warning:
        warnings.append(rsin_warning)
    if not rsin_result:
        return {
            "status": "no_match",
            "message": "No usable KVK result found for rsin.",
            "updated": False,
            "kvk_response": {
                "zoeken": kvk_search_responses,
                "basisprofiel": basisprofiel_response,
            },
        }

    kvk_from_kvk_search = _clean_digits(kvk_result.get("kvkNummer"))
    kvk_from_rsin_search = _clean_digits(rsin_result.get("kvkNummer"))
    if (
        not kvk_from_kvk_search
        or not kvk_from_rsin_search
        or kvk_from_kvk_search != kvk_from_rsin_search
    ):
        sentry_sdk.capture_message(
            (
                "KVK mismatch: provided kvk_number and rsin resolved to different companies "
                f"(company_id={company_id}, kvk_input={kvk_clean}, rsin_input={rsin_clean}, "
                f"kvk_from_kvk_search={kvk_from_kvk_search}, kvk_from_rsin_search={kvk_from_rsin_search})"
            ),
            level="error",
        )
        return {
            "status": "mismatch",
            "message": "Provided kvk_number and rsin do not correspond to the same KVK company.",
            "updated": False,
            "kvk_number_from_kvk_search": kvk_from_kvk_search,
            "kvk_number_from_rsin_search": kvk_from_rsin_search,
            "kvk_response": {
                "zoeken": kvk_search_responses,
                "basisprofiel": basisprofiel_response,
            },
        }

    selected_result = kvk_result

    basis_link = _extract_basisprofiel_link(selected_result)
    if basis_link:
        try:
            basisprofiel_response = await asyncio.to_thread(
                _search_basisprofiel_api, basis_link
            )
        except Exception as exc:
            logger.exception("KVK basisprofiel request failed for link=%s", basis_link)
            return {
                "status": "kvk_error",
                "message": f"KVK basisprofiel request failed: {exc}",
                "updated": False,
                "search_used": selected_by,
                "warning": " | ".join(warnings) if warnings else None,
                "selected_result": selected_result,
                "basisprofiel_link": basis_link,
                "kvk_response": {
                    "zoeken": kvk_search_responses,
                    "basisprofiel": basisprofiel_response,
                },
            }
    else:
        logger.warning("No basisprofiel link found in selected KVK result.")

    properties = _prepare_hubspot_properties(selected_result, basisprofiel_response)
    if not properties:
        logger.warning(
            "KVK selected result had no updatable fields for company_id=%s. result=%s",
            company_id,
            _result_debug_summary(selected_result, -1),
        )
        return {
            "status": "no_updatable_data",
            "message": "A KVK record was found, but no updatable fields were available.",
            "updated": False,
            "search_used": selected_by,
            "warning": " | ".join(warnings) if warnings else None,
            "selected_result": selected_result,
            "basisprofiel_link": basis_link,
            "kvk_response": {
                "zoeken": kvk_search_responses,
                "basisprofiel": basisprofiel_response,
            },
        }

    await call_hubspot_api(
        hubspot_calls.update_company_properties, int(company_id), properties
    )
    return {
        "status": "updated",
        "message": "HubSpot company updated from KVK.",
        "updated": True,
        "search_used": selected_by,
        "warning": " | ".join(warnings) if warnings else None,
        "hubspot_properties": properties,
        "selected_result": selected_result,
        "basisprofiel_link": basis_link,
        "kvk_response": {
            "zoeken": kvk_search_responses,
            "basisprofiel": basisprofiel_response,
        },
    }
