import argparse
import csv
import os
import time
from typing import Dict, Iterable, List, Tuple

import requests
from dotenv import load_dotenv

load_dotenv()

DEFAULT_DUPLICATES_CSV = "scripts/wefact_data/active_hub_duplicates_by_record_id.csv"
DEFAULT_MATCHES_CSV = "scripts/wefact_data/active_hub_matches_by_record_id.csv"

WEFACT_API_KEY = os.getenv("WEFACT_API_KEY")
HUBSPOT_FIELD_KEY = os.environ.get("HUBSPOT_FIELD_KEY", "hubspotcompanyrecordid")

REQUEST_TIMEOUT = 15


def normalize(value: str) -> str:
    return (value or "").strip()


def iter_rows(path: str) -> Iterable[Dict[str, str]]:
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            yield row


def matches_key(row: Dict[str, str]) -> Tuple[str, str]:
    record_id = normalize(row.get("norm_record_id") or row.get("Record ID"))
    klantnummer = normalize(row.get("Klantnummer"))
    return record_id, klantnummer


def load_matches(path: str) -> set:
    keys = set()
    for row in iter_rows(path):
        record_id, klantnummer = matches_key(row)
        if record_id and klantnummer:
            keys.add((record_id, klantnummer))
    return keys


def load_duplicates_to_clear(path: str, matches: set) -> List[Dict[str, str]]:
    to_clear = []
    for row in iter_rows(path):
        record_id, klantnummer = matches_key(row)
        if not record_id or not klantnummer:
            continue
        if (record_id, klantnummer) in matches:
            continue
        to_clear.append(row)
    return to_clear


def clear_hubspot_id(klantnummer: str) -> None:
    url = "https://api.mijnwefact.nl/v2/"
    payload = {
        "api_key": WEFACT_API_KEY,
        "controller": "debtor",
        "action": "edit",
        "DebtorCode": klantnummer,
        "CustomFields": {HUBSPOT_FIELD_KEY: ""},
    }
    resp = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
    if resp.status_code >= 300:
        raise RuntimeError(f"{resp.status_code} {resp.text}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Clear the HubSpot record ID on duplicate WeFact clients that are not in the current matches file."
        )
    )
    parser.add_argument(
        "--duplicates",
        default=DEFAULT_DUPLICATES_CSV,
        help="CSV with duplicates (from wefact_match_by_record_id).",
    )
    parser.add_argument(
        "--matches",
        default=DEFAULT_MATCHES_CSV,
        help="CSV with current matches (from wefact_match_by_record_id).",
    )
    parser.add_argument(
        "--rate-limit-sleep",
        type=float,
        default=0.31,
        help="Seconds to sleep between API calls.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be cleared without calling the API.",
    )
    args = parser.parse_args()

    if not WEFACT_API_KEY:
        raise RuntimeError("WEFACT_API_KEY is not set.")

    matches = load_matches(args.matches)
    to_clear = load_duplicates_to_clear(args.duplicates, matches)

    if not to_clear:
        print("No duplicate WeFact clients found outside the current matches file.")
        return

    total = len(to_clear)
    print(f"Will clear HubSpot record ID for {total} WeFact client(s).")

    for i, row in enumerate(to_clear, 1):
        record_id, klantnummer = matches_key(row)
        name = normalize(row.get("Bedrijfsnaam"))
        print(f"[{i}/{total}] Debtor {klantnummer} ({name}) -> clear record ID {record_id}")
        if not args.dry_run:
            try:
                clear_hubspot_id(klantnummer)
                print(f"[{i}/{total}] OK {klantnummer}")
            except Exception as exc:
                print(f"[{i}/{total}] ERROR {klantnummer}: {exc}")
            time.sleep(args.rate_limit_sleep)


if __name__ == "__main__":
    main()
