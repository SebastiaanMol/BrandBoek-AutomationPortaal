import argparse
from pathlib import Path
import pandas as pd


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


def load_contacts(path: Path, email_col: str) -> pd.DataFrame:
    contacts = pd.read_csv(path, dtype=str).fillna("")
    if email_col not in contacts.columns:
        raise ValueError(f"Contacts CSV must contain '{email_col}'.")
    contacts["norm_email"] = contacts[email_col].apply(normalize_email)
    return contacts


def load_wefact_contacts(path: Path, email_col: str) -> pd.DataFrame:
    if path.suffix.lower() in {".xlsx", ".xls"}:
        wf = pd.read_excel(path, dtype=str).fillna("")
    else:
        wf = pd.read_csv(path, dtype=str).fillna("")
    if email_col not in wf.columns:
        raise ValueError(f"WeFact contacts export must contain '{email_col}'.")
    wf["norm_email"] = wf[email_col].apply(normalize_email)
    return wf


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Match contacts to WeFact contacts by email address."
    )
    parser.add_argument(
        "--contacts",
        default="scripts/wefact_data/hubspot-crm-exports-actieve-sales-contacts-2026-01-23.csv",
        help="Path to contacts CSV (e.g., HubSpot export).",
    )
    parser.add_argument(
        "--contacts-email-col",
        default="Email",
        help="Email column name in contacts CSV.",
    )
    parser.add_argument(
        "--wefact",
        default="scripts/wefact_data/Klanten_23-01-2026 (2).xlsx",
        help="Path to WeFact contacts export (CSV or Excel).",
    )
    parser.add_argument(
        "--wefact-email-col",
        default="E-mail",
        help="Email column name in WeFact contacts export.",
    )
    parser.add_argument(
        "--matched-out",
        default="scripts/wefact_data/contacts_matched_by_email.csv",
        help="Output CSV for matched contacts.",
    )
    parser.add_argument(
        "--unmatched-out",
        default="scripts/wefact_data/contacts_unmatched_by_email.csv",
        help="Output CSV for unmatched contacts.",
    )
    args = parser.parse_args()

    contacts_path = Path(args.contacts)
    wefact_path = Path(args.wefact)
    matched_out = Path(args.matched_out)
    unmatched_out = Path(args.unmatched_out)

    contacts = load_contacts(contacts_path, args.contacts_email_col)
    wefact = load_wefact_contacts(wefact_path, args.wefact_email_col)

    contacts_nonempty = contacts[contacts["norm_email"] != ""].copy()
    wefact_nonempty = wefact[wefact["norm_email"] != ""].copy()

    matched = contacts_nonempty.merge(
        wefact_nonempty,
        on="norm_email",
        how="inner",
        suffixes=("_contact", "_wefact"),
    )
    matched_emails = set(matched["norm_email"])

    unmatched = contacts[~contacts["norm_email"].isin(matched_emails)].copy()

    matched.to_csv(matched_out, index=False)
    unmatched.to_csv(unmatched_out, index=False)

    print(f"Matched: {len(matched)}")
    print(f"Unmatched: {len(unmatched)}")
    print(f"Wrote: {matched_out}")
    print(f"Wrote: {unmatched_out}")


if __name__ == "__main__":
    main()
