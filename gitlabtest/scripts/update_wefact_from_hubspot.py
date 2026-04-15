"""
Update Wefact clients using matches from active_hub_matches.csv.

This script:
- Loads scripts/wefact_data/active_hub_matches.csv (produced by wefact_match.py).
- For each row, updates the Wefact client name to the HubSpot company name and fills the HubSpot Record ID into a custom field.
- Sleeps between calls to respect a 200 calls/minute limit.

You MUST configure:
- WEFACT_API_URL: Base endpoint for updating a client (e.g., https://<your-wefact>/api/v2/clients).
  If updates are per-ID, append /{id}; if per-Klantnummer, adjust accordingly.
- WEFACT_API_KEY: Your API key/token.
- HUBSPOT_FIELD_KEY: The exact custom-field key for the HubSpot company record ID.
- AUTH_HEADER_NAME/AUTH_HEADER_VALUE: Adjust if your API expects a different auth scheme.

Nothing is written back to CSV; only Wefact is called.
"""

import csv
import os
import time
from typing import Iterable, Tuple
from dotenv import load_dotenv
import requests

load_dotenv()

# --- Config (adjust these) ---
MATCHES_CSV = "scripts/wefact_data/active_hub_matches.csv"
WEFACT_API_KEY = os.getenv("WEFACT_API_KEY")
HUBSPOT_FIELD_KEY = os.environ.get("HUBSPOT_FIELD_KEY", "hubspotcompanyrecordid")

# 200 calls/minute => minimum ~0.30s between calls; add a small cushion
RATE_LIMIT_SLEEP = 0.31
REQUEST_TIMEOUT = 15


def iter_updates(path: str) -> Iterable[Tuple[str, str, str]]:
    """Yield (klantnummer, hub_name, hub_id) from the matches CSV."""
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            klantnummer = (row.get("wefact_klantnummer") or "").strip()
            hub_name = (row.get("hub_company_name") or "").strip()
            hub_id = (row.get("hub_record_id") or "").strip()
            if not klantnummer or not hub_name or not hub_id:
                continue
            yield klantnummer, hub_name, hub_id


def update_client(klantnummer: str, new_name: str, hubspot_id: str) -> None:
    """
    Update Wefact client with new name and HubSpot Record ID.

    Adjust URL and payload to match Wefact's API. Example assumes PATCH /clients/{klantnummer}.
    """
    url = f"https://api.mijnwefact.nl/v2/"
    payload = {
        "api_key": WEFACT_API_KEY,
        "controller": "debtor",
        "action": "edit",
        'DebtorCode': klantnummer,
        "CustomFields": {HUBSPOT_FIELD_KEY: hubspot_id},
    }
    resp = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT)
    if resp.status_code >= 300:
        raise RuntimeError(f"{resp.status_code} {resp.text}")


def main() -> None:
    updates = list(iter_updates(MATCHES_CSV))
    if not updates:
        print(f"No updates found in {MATCHES_CSV}")
        return

    total = len(updates)
    print(f"Prepared {total} update(s) from {MATCHES_CSV} (testing first only)")
    for i, (klantnummer, hub_name, hub_id) in enumerate(updates, 1):
        print(f"[{i}/{total}] Preparing update for Debtor {klantnummer}: '{hub_name}' (HubSpot {hub_id})")
        try:
            update_client(klantnummer, hub_name, hub_id)
            print(f"[{i}/{total}] OK {klantnummer}")
        except Exception as exc:  # keep going on failure
            print(f"[{i}/{total}] ERROR {klantnummer}: {exc}")
        time.sleep(RATE_LIMIT_SLEEP)


if __name__ == "__main__":
    main()
