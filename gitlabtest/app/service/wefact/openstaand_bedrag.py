from __future__ import annotations

import argparse
import asyncio
import logging

logger = logging.getLogger(__name__)
import os
import sys
from collections.abc import Iterable
from decimal import ROUND_HALF_UP
from decimal import Decimal
from decimal import InvalidOperation
from pathlib import Path
from typing import Any

import requests
from apscheduler.schedulers.blocking import BlockingScheduler
from dotenv import find_dotenv
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import app.repository.hubspot as hubspot_calls
from app.exceptions import WefactError
from app.service.rate_limiter import call_hubspot_api
from app.service.wefact.wefact import list_invoices
from app.utils import parse_daily_time

load_dotenv(find_dotenv())

from app.hubspot_client import HS_ACCESS_TOKEN
from app.hubspot_client import get_hs_headers

HUBSPOT_BASE_URL = os.getenv("HUBSPOT_BASE_URL", "https://api.hubapi.com")
WEFACT_COMPANY_ID_FIELD = os.getenv("WEFACT_COMPANY_ID_FIELD", "wefact_company_id")
HUBSPOT_OPEN_AMOUNT_FIELD = os.getenv("HUBSPOT_OPEN_AMOUNT_FIELD", "openstaand_bedrag")
CONTACT_OPEN_AMOUNT_FIELD = os.getenv(
    "CONTACT_OPEN_AMOUNT_FIELD", "totaal_openstaand_bedrag"
)
WEFACT_INVOICE_STATUS = os.getenv("WEFACT_INVOICE_STATUS", "")

DEFAULT_BATCH_SIZE = 100
DEFAULT_SLEEP = 0.2
_MATCH_LOG_LIMIT = 5
_match_log_count = 0
_miss_log_count = 0


def _hubspot_headers() -> dict[str, str]:
    return get_hs_headers()


def _parse_amount(raw: object) -> Decimal | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return Decimal(str(raw))
    value = str(raw).strip()
    if not value:
        return None
    # Handle European decimal formatting: "1.234,56" -> "1234.56"
    if "," in value and "." in value:
        value = value.replace(".", "").replace(",", ".")
    else:
        value = value.replace(",", ".")
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def _first_value(item: dict[str, object], keys: Iterable[str]) -> object | None:
    for key in keys:
        if key in item and item.get(key) not in (None, ""):
            return item.get(key)
    return None


def _extract_invoice_open_amount(
    invoice: dict[str, object],
) -> tuple[str | None, Decimal | None]:
    debtor_code = invoice.get("Debtor")
    amount = _parse_amount(invoice.get("AmountOutstanding"))
    return str(debtor_code).strip() if debtor_code else None, amount


def _collect_open_amounts(
    status: str | None, debug_sample: int = 0
) -> dict[str, Decimal]:
    try:
        invoices = list_invoices(status=status or None)
    except WefactError as exc:
        message = str(exc)
        if "Invalid filter 'status'" in message:
            logger.warning("Wefact status filter rejected; retrying without status.")
            invoices = list_invoices(status=None)
        else:
            raise
    totals: dict[str, Decimal] = {}
    sample_left = max(0, debug_sample)
    for invoice in invoices:
        debtor_code, amount = _extract_invoice_open_amount(invoice)
        if sample_left > 0:
            logger.info(
                "Invoice sample: debtor=%s amount=%s keys=%s",
                debtor_code,
                _format_amount(amount) if amount is not None else None,
                ",".join(list(invoice.keys())[:12]),
            )
            sample_left -= 1
        if not debtor_code or amount is None:
            continue
        totals[debtor_code] = totals.get(debtor_code, Decimal("0")) + amount
    logger.info(
        "Wefact invoices processed: %d (with open amount: %d).",
        len(invoices),
        len(totals),
    )
    return totals


def _format_amount(amount: Decimal) -> str:
    return str(amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _chunk(items: list[dict[str, Any]], size: int) -> Iterable[list[dict[str, Any]]]:
    for idx in range(0, len(items), size):
        yield items[idx : idx + size]


def _batch_update_companies(inputs: list[dict[str, Any]]) -> None:
    url = f"{HUBSPOT_BASE_URL}/crm/v3/objects/companies/batch/update"
    resp = requests.post(
        url, headers=_hubspot_headers(), json={"inputs": inputs}, timeout=30
    )
    if resp.status_code >= 300:
        msg = f"HubSpot HTTP {resp.status_code}: {resp.text}"
        raise WefactError(msg)


def _batch_update_contacts(inputs: list[dict[str, Any]]) -> None:
    url = f"{HUBSPOT_BASE_URL}/crm/v3/objects/contacts/batch/update"
    resp = requests.post(
        url, headers=_hubspot_headers(), json={"inputs": inputs}, timeout=30
    )
    if resp.status_code >= 300:
        msg = f"HubSpot HTTP {resp.status_code}: {resp.text}"
        raise WefactError(msg)


def _search_company_by_wefact_id(wefact_id: str) -> dict[str, object] | None:
    global _match_log_count, _miss_log_count
    url = f"{HUBSPOT_BASE_URL}/crm/v3/objects/companies/search"
    payload = {
        "filterGroups": [
            {
                "filters": [
                    {
                        "propertyName": WEFACT_COMPANY_ID_FIELD,
                        "operator": "EQ",
                        "value": str(wefact_id),
                    }
                ]
            }
        ],
        "properties": [WEFACT_COMPANY_ID_FIELD],
        "limit": 2,
    }
    resp = requests.post(url, headers=_hubspot_headers(), json=payload, timeout=30)
    if resp.status_code >= 300:
        msg = f"HubSpot HTTP {resp.status_code}: {resp.text}"
        raise WefactError(msg)
    results = resp.json().get("results", []) or []
    if len(results) > 1:
        logger.warning(
            "Multiple HubSpot companies found for %s=%s; using first.",
            WEFACT_COMPANY_ID_FIELD,
            wefact_id,
        )
    if not results:
        if _miss_log_count < _MATCH_LOG_LIMIT:
            logger.info(
                "HubSpot search miss sample: %s=%s", WEFACT_COMPANY_ID_FIELD, wefact_id
            )
            _miss_log_count += 1
        return None
    company = results[0]
    company_id = company.get("id")
    if _match_log_count < _MATCH_LOG_LIMIT:
        logger.info(
            "HubSpot search match sample: %s=%s -> company_id=%s",
            WEFACT_COMPANY_ID_FIELD,
            wefact_id,
            company_id,
        )
        _match_log_count += 1
    return company


def _search_companies_with_wefact_id(
    after: str | None = None, limit: int = 100
) -> dict[str, object]:
    url = f"{HUBSPOT_BASE_URL}/crm/v3/objects/companies/search"
    payload: dict[str, object] = {
        "filterGroups": [
            {
                "filters": [
                    {
                        "propertyName": WEFACT_COMPANY_ID_FIELD,
                        "operator": "HAS_PROPERTY",
                    }
                ]
            }
        ],
        "properties": [WEFACT_COMPANY_ID_FIELD],
        "limit": limit,
    }
    if after:
        payload["after"] = after
    resp = requests.post(url, headers=_hubspot_headers(), json=payload, timeout=30)
    if resp.status_code >= 300:
        msg = f"HubSpot HTTP {resp.status_code}: {resp.text}"
        raise WefactError(msg)
    return resp.json()


async def _find_company_id_by_wefact_id(wefact_id: str) -> str | None:
    result = await call_hubspot_api(_search_company_by_wefact_id, wefact_id)
    if not result:
        return None
    company_id = str(result.get("id") or "")
    return company_id or None


async def _build_wefact_company_map() -> tuple[dict[str, str], int]:
    mapping: dict[str, str] = {}
    duplicates = 0
    after: str | None = None
    while True:
        response = await call_hubspot_api(_search_companies_with_wefact_id, after, 100)
        results = response.get("results", []) or []
        for company in results:
            company_id = str(company.get("id") or "")
            props = company.get("properties") or {}
            wefact_id = str(props.get(WEFACT_COMPANY_ID_FIELD) or "").strip()
            if not company_id or not wefact_id:
                continue
            existing = mapping.get(wefact_id)
            if existing and existing != company_id:
                duplicates += 1
                continue
            mapping[wefact_id] = company_id
        paging = response.get("paging", {}) or {}
        next_page = paging.get("next", {}) or {}
        after = next_page.get("after")
        if not after:
            break
    return mapping, duplicates


async def update_openstaande_bedragen(
    status: str | None,
    include_zero: bool,
    batch_size: int,
    sleep_seconds: float,
    dry_run: bool,
    debug_sample: int = 0,
    update_contacts: bool = True,
) -> None:
    if not HS_ACCESS_TOKEN:
        msg = "HS_ACCESS_TOKEN is not set."
        raise WefactError(msg)

    logger.info("Collecting open invoice totals from Wefact...")
    totals = _collect_open_amounts(status=status, debug_sample=debug_sample)
    total_open_amount = sum(totals.values(), Decimal("0"))
    logger.info(
        "Found %d debtor(s) with open amounts. Total open: %s.",
        len(totals),
        _format_amount(total_open_amount),
    )
    nonzero = [(code, amt) for code, amt in totals.items() if amt != Decimal("0")]
    if nonzero:
        sample: list[Any] = nonzero[:5]
        logger.info(
            "Non-zero open amount sample (first %d): %s",
            len(sample),
            ", ".join(f"{code}={_format_amount(amt)}" for code, amt in sample),
        )

    inputs: list[dict] = []
    missing = 0

    if include_zero:
        if not totals:
            logger.warning(
                "No outstanding amounts found; skipping zero-fill updates to avoid overwriting."
            )
            return
        logger.info("Loading HubSpot companies with %s set...", WEFACT_COMPANY_ID_FIELD)
        wefact_to_company, duplicates = await _build_wefact_company_map()
        if duplicates:
            logger.warning(
                "Found %d duplicate %s values in HubSpot.",
                duplicates,
                WEFACT_COMPANY_ID_FIELD,
            )
        for wefact_id, company_id in wefact_to_company.items():
            amount = totals.get(wefact_id, Decimal("0"))
            inputs.append(
                {
                    "id": company_id,
                    "properties": {HUBSPOT_OPEN_AMOUNT_FIELD: _format_amount(amount)},
                }
            )
    else:
        if update_contacts:
            logger.warning(
                "Contact totals may be incomplete because --skip-zero was used."
            )
        for wefact_id, amount in totals.items():
            company_id = await _find_company_id_by_wefact_id(wefact_id)  # type: ignore[assignment]
            if not company_id:
                missing += 1
                continue
            inputs.append(
                {
                    "id": company_id,
                    "properties": {HUBSPOT_OPEN_AMOUNT_FIELD: _format_amount(amount)},
                }
            )

    logger.info("Prepared %d update(s).", len(inputs))
    if missing:
        logger.warning("No HubSpot company found for %d debtor code(s).", missing)
    if inputs:
        sample = inputs[:5]
        logger.info(
            "Update sample (first %d): %s",
            len(sample),
            ", ".join(
                f"{item['id']}={item['properties'].get(HUBSPOT_OPEN_AMOUNT_FIELD)}"
                for item in sample
            ),
        )
        nonzero_inputs = [
            item
            for item in inputs
            if Decimal(item["properties"].get(HUBSPOT_OPEN_AMOUNT_FIELD, "0") or "0")
            != Decimal("0")
        ]
        nonzero_total = sum(
            (
                Decimal(item["properties"].get(HUBSPOT_OPEN_AMOUNT_FIELD, "0") or "0")
                for item in nonzero_inputs
            ),
            Decimal("0"),
        )
        logger.info(
            "Non-zero updates: %d company(ies), total open=%s.",
            len(nonzero_inputs),
            _format_amount(nonzero_total),
        )
        if nonzero_inputs:
            sample = nonzero_inputs[:10]
            logger.info(
                "Non-zero company sample (first %d): %s",
                len(sample),
                ", ".join(
                    f"{item['id']}={item['properties'].get(HUBSPOT_OPEN_AMOUNT_FIELD)}"
                    for item in sample
                ),
            )

    contact_inputs: list[dict] = []
    if update_contacts:
        if not totals:
            logger.warning("Skipping contact updates because no totals were found.")
        else:
            company_amounts = {
                item["id"]: Decimal(
                    item["properties"].get(HUBSPOT_OPEN_AMOUNT_FIELD, "0") or "0"
                )
                for item in inputs
            }
            contact_totals: dict[str, Decimal] = {}
            company_ids = list(company_amounts.keys())
            for batch in _chunk(company_ids, 100):
                associations = await call_hubspot_api(
                    hubspot_calls.batch_get_contacts_for_companies,
                    [str(cid) for cid in batch],
                )
                for company_id, contact_ids in associations.items():
                    amount = company_amounts.get(str(company_id), Decimal("0"))
                    for contact_id in contact_ids:
                        contact_totals[str(contact_id)] = (
                            contact_totals.get(str(contact_id), Decimal("0")) + amount
                        )

            contact_inputs = [
                {
                    "id": contact_id,
                    "properties": {CONTACT_OPEN_AMOUNT_FIELD: _format_amount(total)},
                }
                for contact_id, total in contact_totals.items()
            ]

            nonzero_contact = [
                item
                for item in contact_inputs
                if Decimal(
                    item["properties"].get(CONTACT_OPEN_AMOUNT_FIELD, "0") or "0"
                )
                != Decimal("0")
            ]
            logger.info(
                "Prepared %d contact update(s) (%d non-zero).",
                len(contact_inputs),
                len(nonzero_contact),
            )
            if nonzero_contact:
                sample = nonzero_contact[:10]
                logger.info(
                    "Non-zero contact sample (first %d): %s",
                    len(sample),
                    ", ".join(
                        f"{item['id']}={item['properties'].get(CONTACT_OPEN_AMOUNT_FIELD)}"
                        for item in sample
                    ),
                )

    if dry_run:
        logger.info(
            "Dry run enabled; no updates sent. %d company update(s) would be scheduled.",
            len(inputs),
        )
        if update_contacts:
            logger.info(
                "Dry run enabled; %d contact update(s) would be scheduled.",
                len(contact_inputs),
            )
        return

    if not inputs:
        logger.info("Nothing to update.")
        return

    batch_size = max(1, min(batch_size, 100))
    total_batches = (len(inputs) + batch_size - 1) // batch_size
    logger.info(
        "Scheduling %d update(s) across %d batch(es) (batch_size=%d).",
        len(inputs),
        total_batches,
        batch_size,
    )
    for idx, batch in enumerate(_chunk(inputs, batch_size), 1):
        logger.info(
            "Updating batch %d/%d (%d companies)", idx, total_batches, len(batch)
        )
        await call_hubspot_api(_batch_update_companies, batch)
        await asyncio.sleep(sleep_seconds)

    if update_contacts and contact_inputs:
        contact_batches = list(_chunk(contact_inputs, batch_size))
        total_contact_batches = len(contact_batches)
        logger.info(
            "Scheduling %d contact update(s) across %d batch(es) (batch_size=%d).",
            len(contact_inputs),
            total_contact_batches,
            batch_size,
        )
        for idx, batch in enumerate(contact_batches, 1):
            logger.info(
                "Updating batch %d/%d (%d contacts)",
                idx,
                total_contact_batches,
                len(batch),
            )
            await call_hubspot_api(_batch_update_contacts, batch)
            await asyncio.sleep(sleep_seconds)


def _run_async(coro: Any) -> Any:
    try:
        return asyncio.run(coro)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(coro)
        finally:
            loop.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

    parser = argparse.ArgumentParser(
        description=(
            "Sync open invoice totals from Wefact to HubSpot companies "
            f"({HUBSPOT_OPEN_AMOUNT_FIELD} property)."
        )
    )
    parser.add_argument(
        "--status",
        default=WEFACT_INVOICE_STATUS,
        help="Wefact invoice status filter (default from WEFACT_INVOICE_STATUS). Use '' for no filter.",
    )
    parser.add_argument(
        "--skip-zero",
        action="store_true",
        help="Only update companies that have an open amount; skip zero updates.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help="HubSpot batch size (max 100).",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=DEFAULT_SLEEP,
        help="Seconds to sleep between HubSpot batch calls.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be updated without calling HubSpot.",
    )
    parser.add_argument(
        "--debug-sample",
        type=int,
        default=0,
        help="Log a small sample of invoice extraction (count).",
    )
    parser.add_argument(
        "--skip-contact-update",
        action="store_true",
        help="Skip updating contact totals.",
    )
    parser.add_argument(
        "--schedule",
        action="store_true",
        help="Run daily on a schedule instead of once.",
    )
    parser.add_argument(
        "--daily-at",
        default="03:00",
        help="Daily run time in HH:MM (24h). Only used with --schedule.",
    )
    args = parser.parse_args()

    status = args.status.strip() if args.status is not None else ""
    status = status or None
    include_zero = not args.skip_zero

    if not args.schedule:
        _run_async(
            update_openstaande_bedragen(
                status=status,
                include_zero=include_zero,
                batch_size=args.batch_size,
                sleep_seconds=args.sleep,
                dry_run=args.dry_run,
                debug_sample=args.debug_sample,
                update_contacts=not args.skip_contact_update,
            )
        )
        return

    hour, minute = parse_daily_time(args.daily_at)
    scheduler = BlockingScheduler(timezone="Europe/Amsterdam")
    scheduler.add_job(
        lambda: _run_async(
            update_openstaande_bedragen(
                status=status,
                include_zero=include_zero,
                batch_size=args.batch_size,
                sleep_seconds=args.sleep,
                dry_run=args.dry_run,
                debug_sample=args.debug_sample,
                update_contacts=not args.skip_contact_update,
            )
        ),
        "cron",
        hour=hour,
        minute=minute,
    )
    logger.info("Scheduled daily run at %02d:%02d.", hour, minute)
    _run_async(
        update_openstaande_bedragen(
            status=status,
            include_zero=include_zero,
            batch_size=args.batch_size,
            sleep_seconds=args.sleep,
            dry_run=args.dry_run,
            debug_sample=args.debug_sample,
            update_contacts=not args.skip_contact_update,
        )
    )
    scheduler.start()


if __name__ == "__main__":
    main()
