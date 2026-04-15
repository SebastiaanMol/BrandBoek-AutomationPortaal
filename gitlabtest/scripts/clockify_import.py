import argparse
import csv
import logging
from pathlib import Path

from app.service.clockify.clockify import add_new_client_with_projects


def import_clients_from_csv(csv_path: str, name_column: str = "Company name", id_column: str = "Record ID - Company") -> None:
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    created = 0
    skipped_blank = 0
    skipped_existing = 0
    failed = 0
    failures: list[tuple[str, str]] = []

    with path.open(newline="", encoding="utf-8-sig") as f:  # utf-8 with BOM friendly
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("CSV has no header row.")

        if name_column not in reader.fieldnames:
            fallback = reader.fieldnames[0]
            logging.warning(
                f"Column '{name_column}' not found. Falling back to first column '{fallback}'.")
            name_column = fallback

        if id_column not in reader.fieldnames:
            logging.warning(
                f"Column '{id_column}' not found. HubSpot id will be omitted from notes.")
            id_column = None

        for row in reader:
            name = (row.get(name_column) or "").strip()
            if not name:
                skipped_blank += 1
                continue
            hubspot_id = (row.get(id_column) or "").strip() if id_column else None
            status, reason = add_new_client_with_projects(
                name, hubspot_company_id=hubspot_id or None)
            if status == "created":
                created += 1
            elif status == "exists":
                skipped_existing += 1
            else:
                failures.append((name, reason))
                failed += 1

    logging.info(
        f"Import complete. Created {created} clients. "
        f"Skipped {skipped_blank} blank rows. Skipped {skipped_existing} existing. Failed {failed}.")

    if failures:
        logging.error("Failed clients:")
        for company, reason in failures:
            logging.error(f"- {company}: {reason}")


def main():
    parser = argparse.ArgumentParser(
        description="One-time import of HubSpot companies CSV into Clockify clients/projects/tasks.")
    parser.add_argument("csv_path", help="Path to exported CSV of active companies.")
    parser.add_argument("--name-column", default="Company name",
                        help="Column name containing the company name (default: 'name').")
    parser.add_argument("--id-column", default="Record ID - Company",
                        help="Column name containing the HubSpot company id (default: 'id').")
    args = parser.parse_args()

    import_clients_from_csv(args.csv_path, name_column=args.name_column,
                            id_column=args.id_column)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(levelname)s: %(message)s")
    main()
