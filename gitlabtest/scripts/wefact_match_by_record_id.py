import argparse
from pathlib import Path
import pandas as pd


def normalize_record_id(value: str) -> str:
    return (value or "").strip()


def load_hubspot(path: Path) -> pd.DataFrame:
    hub = pd.read_csv(path, dtype=str).fillna("")
    if "Record ID" not in hub.columns and "Record ID - Company" in hub.columns:
        hub = hub.rename(columns={"Record ID - Company": "Record ID"})
    if "Record ID" not in hub.columns:
        raise ValueError("HubSpot export must contain 'Record ID' or 'Record ID - Company'.")
    hub["norm_record_id"] = hub["Record ID"].apply(normalize_record_id)
    return hub


def load_wefact(path: Path) -> pd.DataFrame:
    if path.suffix.lower() in {".xlsx", ".xls"}:
        wf = pd.read_excel(path, dtype=str).fillna("")
    else:
        wf = pd.read_csv(path, dtype=str).fillna("")
    if "veld_hubspotcompanyrecordid" not in wf.columns:
        raise ValueError("WeFact export must contain column 'veld_hubspotcompanyrecordid'.")
    wf["norm_record_id"] = wf["veld_hubspotcompanyrecordid"].apply(normalize_record_id)
    return wf


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Match active HubSpot companies to a WeFact export using only the stored HubSpot Record ID."
        )
    )
    parser.add_argument(
        "--hubspot",
        default="scripts/wefact_data/hubspot-crm-exports-all-active-companies-2-2026-01-23-1.csv",
        help="Path to HubSpot active companies export CSV.",
    )
    parser.add_argument(
        "--wefact",
        default="scripts/wefact_data/Klanten_23-01-2026 (2).xlsx",
        help="Path to WeFact export (CSV or Excel).",
    )
    parser.add_argument(
        "--matched-out",
        default="scripts/wefact_data/active_hub_matches_by_record_id.csv",
        help="Output CSV for matched HubSpot companies.",
    )
    parser.add_argument(
        "--unmatched-out",
        default="scripts/wefact_data/active_hub_unmatched_by_record_id.csv",
        help="Output CSV for unmatched HubSpot companies.",
    )
    parser.add_argument(
        "--duplicates-out",
        default="scripts/wefact_data/active_hub_duplicates_by_record_id.csv",
        help="Output CSV for HubSpot companies with multiple WeFact clients for the same record ID.",
    )
    args = parser.parse_args()

    hubspot_path = Path(args.hubspot)
    wefact_path = Path(args.wefact)
    matched_out = Path(args.matched_out)
    unmatched_out = Path(args.unmatched_out)
    duplicates_out = Path(args.duplicates_out)

    hub = load_hubspot(hubspot_path)
    wf = load_wefact(wefact_path)

    # Only match on non-empty record IDs.
    hub_nonempty = hub[hub["norm_record_id"] != ""].copy()
    wf_nonempty = wf[wf["norm_record_id"] != ""].copy()

    matched = hub_nonempty.merge(
        wf_nonempty,
        on="norm_record_id",
        how="inner",
        suffixes=("_hub", "_wf"),
    )
    matched_ids = set(matched["Record ID"])

    unmatched = hub[~hub["Record ID"].isin(matched_ids)].copy()

    dup_record_ids = (
        wf_nonempty["norm_record_id"]
        .value_counts()
        .loc[lambda counts: counts >= 2]
        .index
    )
    duplicates = hub_nonempty[hub_nonempty["norm_record_id"].isin(dup_record_ids)].merge(
        wf_nonempty,
        on="norm_record_id",
        how="inner",
        suffixes=("_hub", "_wf"),
    )

    matched.to_csv(matched_out, index=False)
    unmatched.to_csv(unmatched_out, index=False)
    duplicates.to_csv(duplicates_out, index=False)

    print(f"Matched: {len(matched)}")
    print(f"Unmatched: {len(unmatched)}")
    print(f"HubSpot companies with >=2 WeFact clients: {len(duplicates)}")
    print(f"Wrote: {matched_out}")
    print(f"Wrote: {unmatched_out}")
    print(f"Wrote: {duplicates_out}")


if __name__ == "__main__":
    main()
