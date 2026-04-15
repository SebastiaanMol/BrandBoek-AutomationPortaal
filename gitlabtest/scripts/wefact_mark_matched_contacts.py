import argparse
import csv
import os
import time
from typing import Dict, Iterable

import requests
from dotenv import load_dotenv

load_dotenv()

DEFAULT_MATCHES_CSV = "scripts/wefact_data/contacts_matched_by_email.csv"

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


def update_contact(contact_id: str) -> None:
    url = "https://api.mijnwefact.nl/v2/"
    payload = {
        "api_key": WEFACT_API_KEY,
        "controller": "debtor",
        "action": "edit",
        "Identifier": contact_id,
        "CustomFields": {HUBSPOT_FIELD_KEY: "X"},
    }
    resp = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
    if resp.status_code >= 300:
        raise RuntimeError(f"{resp.status_code} {resp.text}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Mark matched WeFact contacts by setting a custom field to 'X'."
    )
    parser.add_argument(
        "--matches",
        default=DEFAULT_MATCHES_CSV,
        help="Matched contacts CSV from wefact_match_contacts_by_email.py.",
    )
    parser.add_argument(
        "--wefact-contact-id-col",
        default="ID",
        help="Column name in the matches CSV for the WeFact contact ID.",
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
        help="Print what would be updated without calling the API.",
    )
    args = parser.parse_args()

    if not WEFACT_API_KEY:
        raise RuntimeError("WEFACT_API_KEY is not set.")

    rows = list(iter_rows(args.matches))
    if not rows:
        print(f"No rows found in {args.matches}")
        return

    total = 0
    for row in rows:
        contact_id = normalize(row.get(args.wefact_contact_id_col))
        if not contact_id:
            continue
        total += 1

    print(f"Will update {total} WeFact contact(s) using {args.matches}")

    idx = 0
    for row in rows:
        contact_id = normalize(row.get(args.wefact_contact_id_col))
        if not contact_id:
            continue
        idx += 1
        print(f"[{idx}/{total}] Contact {contact_id} -> set {HUBSPOT_FIELD_KEY}=X")
        if not args.dry_run:
            try:
                update_contact(contact_id)
                print(f"[{idx}/{total}] OK {contact_id}")
            except Exception as exc:
                print(f"[{idx}/{total}] ERROR {contact_id}: {exc}")
            time.sleep(args.rate_limit_sleep)


if __name__ == "__main__":
    main()
