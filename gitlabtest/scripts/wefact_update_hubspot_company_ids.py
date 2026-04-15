import argparse
import logging
import os
import time
from pathlib import Path
from typing import Dict, List, Tuple

import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv()

DEFAULT_WEFACT_EXPORT = "scripts/wefact_data/Klanten_23-01-2026 (2).xlsx"

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")


def normalize_record_id(value: str) -> str:
    raw = (value or "").strip()
    if not raw:
        return ""
    if raw.upper() == "X":
        return ""
    return raw


def load_wefact_export(path: Path) -> pd.DataFrame:
    if path.suffix.lower() in {".xlsx", ".xls"}:
        df = pd.read_excel(path, dtype=str).fillna("")
    else:
        df = pd.read_csv(path, dtype=str).fillna("")
    required = {"ID", "veld_hubspotcompanyrecordid"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"WeFact export missing required columns: {', '.join(sorted(missing))}")
    return df


def build_mapping(df: pd.DataFrame) -> Tuple[Dict[str, str], List[Tuple[str, str, str]]]:
    mapping: Dict[str, str] = {}
    duplicates: List[Tuple[str, str, str]] = []
    for _, row in df.iterrows():
        record_id = normalize_record_id(row.get("veld_hubspotcompanyrecordid", ""))
        if not record_id:
            continue
        wefact_id = (row.get("ID") or "").strip()
        if not wefact_id:
            continue
        existing = mapping.get(record_id)
        if existing and existing != wefact_id:
            duplicates.append((record_id, existing, wefact_id))
            continue
        mapping[record_id] = wefact_id
    return mapping, duplicates


def chunked(items: List[dict], size: int) -> List[List[dict]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def batch_update_companies(token: str, inputs: List[dict]) -> None:
    url = "https://api.hubapi.com/crm/v3/objects/companies/batch/update"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    resp = requests.post(url, headers=headers, json={"inputs": inputs}, timeout=30)
    if resp.status_code < 300:
        logging.info("HubSpot batch update OK (%d companies)", len(inputs))
    if resp.status_code >= 300:
        raise RuntimeError(f"HubSpot HTTP {resp.status_code}: {resp.text}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Write WeFact ID into HubSpot companies using the HubSpot record ID from a WeFact export."
        )
    )
    parser.add_argument(
        "--wefact",
        default=DEFAULT_WEFACT_EXPORT,
        help="Path to WeFact export (CSV or Excel).",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=100,
        help="HubSpot batch size (max 100).",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.2,
        help="Seconds to sleep between batch calls.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print counts without calling HubSpot.",
    )
    args = parser.parse_args()

    token = os.getenv("HS_ACCESS_TOKEN")
    if not token:
        raise RuntimeError("HS_ACCESS_TOKEN is not set.")

    df = load_wefact_export(Path(args.wefact))
    mapping, duplicates = build_mapping(df)

    if duplicates:
        logging.warning(
            "Found %d duplicate record IDs with different WeFact IDs. Using first seen.",
            len(duplicates),
        )

    inputs = [
        {"id": record_id, "properties": {"wefact_company_id": wefact_id}}
        for record_id, wefact_id in mapping.items()
    ]

    logging.info("Prepared %d company update(s).", len(inputs))
    if args.dry_run:
        logging.info("Dry run enabled; no updates sent.")
        return

    batches = chunked(inputs, max(1, min(args.batch_size, 100)))
    total_batches = len(batches)
    for idx, batch in enumerate(batches, 1):
        logging.info("Updating batch %d/%d (%d companies)", idx, total_batches, len(batch))
        try:
            batch_update_companies(token, batch)
        except Exception as exc:
            logging.error("Batch %d failed: %s", idx, exc)
            raise
        time.sleep(args.sleep)


if __name__ == "__main__":
    main()
