from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[1]
BASE_DIR = ROOT_DIR / "scripts" / "wefact_data"
OUTPUT_DIR = BASE_DIR / "outputs"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

HUBSPOT_FILE = BASE_DIR / "hubspot-crm-exports-all-active-companies-2-2026-03-19-3.csv"
WEFACT_CLIENTS_FILE = BASE_DIR / "Klanten_19-03-2026.xlsx"
INVOICES_FILE = BASE_DIR / "Facturen_19-03-2026.xlsx"
INVOICE_LINES_FILE = BASE_DIR / "Factuurregels_19-03-2026.xlsx"
CLOCKIFY_TIME_FILE = BASE_DIR / "Clockify_Time_Report_Detailed_01_01_2026-19_03_2026.csv"
CLOCKIFY_CLIENTS_FILE = OUTPUT_DIR / "clockify_clients_from_api.csv"
NOTEBOOK_FILE = BASE_DIR / "hours_vs_revenue_analysis.ipynb"

PROJECT_MAP_RULES: list[tuple[str, str]] = [
    ("cfo werkzaamheden", "CFO / Board / Directorship"),
    ("board lidmaatschap", "CFO / Board / Directorship"),
    ("directorship", "CFO / Board / Directorship"),
    ("liquidation", "Rest"),
    ("ontbinding", "Rest"),
    ("dividend", "Rest"),
    ("prognose", "Advisering"),
    ("annual report", "Jaarrekening"),
    ("vat report", "Omzetbelasting"),
    ("monthly", "Monthly / Maandelijks"),
    ("maandelijks", "Monthly / Maandelijks"),
    ("maandbedrag", "Monthly / Maandelijks"),
    ("maandtarief", "Monthly / Maandelijks"),
    ("maandelijks tarief", "Monthly / Maandelijks"),
    ("boekhouding van januari", "Monthly / Maandelijks"),
    ("boekhouding van de bv", "Monthly / Maandelijks"),
    ("boekhouding van de holding", "Monthly / Maandelijks"),
    ("boekhouding van de werkmaatschappij", "Monthly / Maandelijks"),
    ("administratieve werkzaamheden", "Monthly / Maandelijks"),
    ("het opstellen en verwerken van de icp-aangifte", "Omzetbelasting"),
    ("preparing and filing the icp declaration", "Omzetbelasting"),
    ("icp-aangifte", "Omzetbelasting"),
    ("icp declaration", "Omzetbelasting"),
    ("het opstellen en verwerken van de oss-aangifte", "Omzetbelasting"),
    ("oss-aangifte", "Omzetbelasting"),
    ("oss declaration", "Omzetbelasting"),
    ("het opzetten en verwerken van de loonadministratie", "Rest"),
    ("loonadministratie", "Rest"),
    ("loonheffingennummer", "Rest"),
    ("omzetbelasting", "Omzetbelasting"),
    ("btw", "Omzetbelasting"),
    ("jaarrekening", "Jaarrekening"),
    ("vennootschapsbelasting", "Vennootschapsbelasting"),
    ("vpb", "Vennootschapsbelasting"),
    ("inkomstenbelasting", "Inkomstenbelasting"),
    ("income tax", "Inkomstenbelasting"),
    ("onboarding", "On- en offboarding"),
    ("offboarding", "On- en offboarding"),
    ("loonbelasting", "Loonbelasting"),
    ("advies", "Advisering"),
    ("advis", "Advisering"),
    ("customer service", "Customer Service"),
    ("klantenservice", "Customer Service"),
]


def map_invoice_line_to_project(description: object) -> str | None:
    text = str(description or "").lower()
    text = re.sub(r"\s+", " ", text).strip()

    if re.search(r"\bwerkzaamheden\b.+", text):
        return "Monthly / Maandelijks"

    for needle, project in PROJECT_MAP_RULES:
        if needle in text:
            return project
    return None


def load_hubspot() -> pd.DataFrame:
    hubspot = pd.read_csv(HUBSPOT_FILE).rename(
        columns={
            "Record ID": "hubspot_record_id",
            "Record ID - Company": "hubspot_record_id",
        }
    )
    hubspot["hubspot_record_id"] = pd.to_numeric(
        hubspot["hubspot_record_id"], errors="coerce"
    ).astype("Int64")
    if "WeFact company ID" in hubspot.columns:
        hubspot["WeFact company ID"] = pd.to_numeric(
            hubspot["WeFact company ID"], errors="coerce"
        ).astype("Int64")
    else:
        hubspot["WeFact company ID"] = pd.Series(pd.NA, index=hubspot.index, dtype="Int64")
    return hubspot.sort_values("Company name")


def load_wefact_clients() -> pd.DataFrame:
    clients = pd.read_excel(WEFACT_CLIENTS_FILE)
    clients["ID"] = pd.to_numeric(clients["ID"], errors="coerce").astype("Int64")
    clients["Klantnummer"] = pd.to_numeric(
        clients["Klantnummer"], errors="coerce"
    ).astype("Int64")
    clients["veld_hubspotcompanyrecordid"] = pd.to_numeric(
        clients["veld_hubspotcompanyrecordid"], errors="coerce"
    ).astype("Int64")
    return clients


def load_invoices() -> pd.DataFrame:
    invoices = pd.read_excel(INVOICES_FILE)
    invoices["Klantnummer"] = pd.to_numeric(
        invoices["Klantnummer"], errors="coerce"
    ).astype("Int64")
    invoices["Datum"] = pd.to_datetime(invoices["Datum"], format="%d-%m-%Y", errors="coerce")
    for col in ["Bedrag excl. BTW", "Bedrag incl. BTW", "Open bedrag incl. BTW"]:
        invoices[col] = pd.to_numeric(invoices[col], errors="coerce").fillna(0)
    return invoices


def load_invoice_lines() -> pd.DataFrame:
    lines = pd.read_excel(INVOICE_LINES_FILE)
    lines["Klantnummer"] = pd.to_numeric(
        lines["Klantnummer"], errors="coerce"
    ).astype("Int64")
    lines["Factuurdatum"] = pd.to_datetime(
        lines["Factuurdatum"], format="%d-%m-%Y", errors="coerce"
    )
    lines["Aantal"] = pd.to_numeric(lines["Aantal"], errors="coerce").fillna(0)
    lines["Productnr"] = pd.to_numeric(lines["Productnr"], errors="coerce")
    for col in [
        "Bedrag excl. BTW met regelkorting",
        "Totaal excl. BTW",
        "Totaal incl. BTW",
        "BTW percentage",
    ]:
        lines[col] = pd.to_numeric(lines[col], errors="coerce").fillna(0)
    lines["mapped_clockify_project"] = lines["Omschrijving"].apply(map_invoice_line_to_project)
    return lines


def load_clockify_clients() -> pd.DataFrame:
    if not CLOCKIFY_CLIENTS_FILE.exists():
        raise FileNotFoundError(
            f"Missing {CLOCKIFY_CLIENTS_FILE}. Reuse the existing export or provide one."
        )
    clients = pd.read_csv(CLOCKIFY_CLIENTS_FILE)
    clients["hubspot_record_id_from_note"] = pd.to_numeric(
        clients["hubspot_record_id_from_note"], errors="coerce"
    ).astype("Int64")
    return clients


def build_clockify_time_summary(clockify_clients: pd.DataFrame) -> pd.DataFrame:
    clockify_time = pd.read_csv(CLOCKIFY_TIME_FILE)
    clockify_time["Duration (decimal)"] = pd.to_numeric(
        clockify_time["Duration (decimal)"], errors="coerce"
    ).fillna(0)
    clockify_time["Start Date Parsed"] = pd.to_datetime(
        clockify_time["Start Date"], format="%d/%m/%Y", errors="coerce"
    )

    name_map = (
        clockify_clients.groupby("clockify_client_name", dropna=False)
        .agg(
            api_client_count=("clockify_client_id", "size"),
            api_unique_hubspot_ids=(
                "hubspot_record_id_from_note",
                lambda s: sorted({int(v) for v in s.dropna()}),
            ),
            api_notes=(
                "clockify_note",
                lambda s: " | ".join(sorted(set(str(v) for v in s.dropna() if v))),
            ),
        )
        .reset_index()
    )
    name_map["hubspot_record_id"] = name_map["api_unique_hubspot_ids"].apply(
        lambda ids: ids[0] if len(ids) == 1 else pd.NA
    )
    name_map["clockify_mapping_status"] = name_map["api_unique_hubspot_ids"].apply(
        lambda ids: (
            "matched_by_api_note"
            if len(ids) == 1
            else "missing_hubspot_id_in_note"
            if len(ids) == 0
            else "ambiguous_hubspot_ids"
        )
    )
    name_map["hubspot_record_id"] = pd.to_numeric(
        name_map["hubspot_record_id"], errors="coerce"
    ).astype("Int64")

    time_summary = (
        clockify_time.groupby(["Client", "Project"], dropna=False)
        .agg(
            clockify_entries=("Client", "size"),
            clockify_total_hours=("Duration (decimal)", "sum"),
            clockify_first_entry=("Start Date Parsed", "min"),
            clockify_last_entry=("Start Date Parsed", "max"),
        )
        .reset_index()
        .rename(columns={"Client": "clockify_client_name", "Project": "clockify_project"})
    )

    merged = time_summary.merge(name_map, how="left", on="clockify_client_name")
    merged["clockify_mapping_status"] = merged["clockify_mapping_status"].fillna(
        "no_matching_clockify_client_export"
    )
    return merged


def build_hubspot_wefact_reconciliation(
    hubspot: pd.DataFrame, wefact_clients: pd.DataFrame
) -> pd.DataFrame:
    wefact_by_record = (
        wefact_clients[wefact_clients["veld_hubspotcompanyrecordid"].notna()]
        .groupby("veld_hubspotcompanyrecordid", dropna=False)
        .agg(
            wefact_clients_found_by_record_id=("ID", "size"),
            matched_wefact_ids=("ID", lambda s: " | ".join(str(int(v)) for v in sorted(s.dropna()))),
            matched_klantnummers=(
                "Klantnummer",
                lambda s: " | ".join(str(int(v)) for v in sorted(s.dropna())),
            ),
            matched_wefact_names=(
                "Bedrijfsnaam",
                lambda s: " | ".join(sorted({str(v) for v in s.dropna()})),
            ),
        )
        .reset_index()
        .rename(columns={"veld_hubspotcompanyrecordid": "hubspot_record_id"})
    )

    reconciled = hubspot.merge(wefact_by_record, how="left", on="hubspot_record_id")
    reconciled["wefact_clients_found_by_record_id"] = (
        pd.to_numeric(reconciled["wefact_clients_found_by_record_id"], errors="coerce")
        .fillna(0)
        .astype(int)
    )
    reconciled["matched_wefact_id_numeric"] = pd.to_numeric(
        reconciled["matched_wefact_ids"], errors="coerce"
    )

    def classify(row: pd.Series) -> str:
        if row["wefact_clients_found_by_record_id"] > 1:
            return "duplicate_wefact_clients_for_record"
        if pd.notna(row["WeFact company ID"]) and pd.notna(row["matched_wefact_id_numeric"]):
            return (
                "matched_ok"
                if row["WeFact company ID"] == row["matched_wefact_id_numeric"]
                else "hubspot_wefact_id_mismatch"
            )
        if pd.isna(row["WeFact company ID"]) and pd.notna(row["matched_wefact_id_numeric"]):
            return "hubspot_missing_wefact_company_id"
        if pd.notna(row["WeFact company ID"]) and pd.isna(row["matched_wefact_id_numeric"]):
            return "wefact_record_link_missing"
        return "no_wefact_link"

    reconciled["hubspot_wefact_status"] = reconciled.apply(classify, axis=1)
    return reconciled


def build_invoice_matches(
    invoices: pd.DataFrame, wefact_clients: pd.DataFrame, hubspot: pd.DataFrame
) -> pd.DataFrame:
    invoice_matches = (
        invoices.merge(
            wefact_clients[
                ["ID", "Klantnummer", "Bedrijfsnaam", "veld_hubspotcompanyrecordid"]
            ].rename(
                columns={
                    "ID": "wefact_id",
                    "Bedrijfsnaam": "wefact_bedrijfsnaam",
                    "veld_hubspotcompanyrecordid": "hubspot_record_id",
                }
            ),
            how="left",
            on="Klantnummer",
        ).merge(
            hubspot[["hubspot_record_id", "Company name", "WeFact company ID"]],
            how="left",
            on="hubspot_record_id",
        )
    )
    invoice_matches["invoice_match_status"] = "matched_to_active_hubspot"
    invoice_matches.loc[
        invoice_matches["wefact_id"].isna(), "invoice_match_status"
    ] = "invoice_klantnummer_not_in_wefact_clients"
    invoice_matches.loc[
        invoice_matches["wefact_id"].notna() & invoice_matches["hubspot_record_id"].isna(),
        "invoice_match_status",
    ] = "wefact_client_missing_hubspot_record_id"
    invoice_matches.loc[
        invoice_matches["wefact_id"].notna()
        & invoice_matches["hubspot_record_id"].notna()
        & invoice_matches["Company name"].isna(),
        "invoice_match_status",
    ] = "hubspot_record_not_in_active_export"
    return invoice_matches


def build_invoice_line_matches(
    invoice_lines: pd.DataFrame, wefact_clients: pd.DataFrame, hubspot: pd.DataFrame
) -> pd.DataFrame:
    line_matches = (
        invoice_lines.merge(
            wefact_clients[
                ["ID", "Klantnummer", "Bedrijfsnaam", "veld_hubspotcompanyrecordid"]
            ].rename(
                columns={
                    "ID": "wefact_id",
                    "Bedrijfsnaam": "wefact_bedrijfsnaam",
                    "veld_hubspotcompanyrecordid": "hubspot_record_id",
                }
            ),
            how="left",
            on="Klantnummer",
        ).merge(
            hubspot[["hubspot_record_id", "Company name", "WeFact company ID"]],
            how="left",
            on="hubspot_record_id",
        )
    )
    line_matches["invoice_line_match_status"] = "matched_to_active_hubspot"
    line_matches.loc[
        line_matches["wefact_id"].isna(), "invoice_line_match_status"
    ] = "line_klantnummer_not_in_wefact_clients"
    line_matches.loc[
        line_matches["wefact_id"].notna() & line_matches["hubspot_record_id"].isna(),
        "invoice_line_match_status",
    ] = "wefact_client_missing_hubspot_record_id"
    line_matches.loc[
        line_matches["wefact_id"].notna()
        & line_matches["hubspot_record_id"].notna()
        & line_matches["Company name"].isna(),
        "invoice_line_match_status",
    ] = "hubspot_record_not_in_active_export"
    return line_matches


def build_company_summary(
    hubspot: pd.DataFrame,
    hubspot_wefact: pd.DataFrame,
    invoice_matches: pd.DataFrame,
    invoice_line_matches: pd.DataFrame,
    clockify_time_summary: pd.DataFrame,
) -> pd.DataFrame:
    invoice_by_company = (
        invoice_matches[invoice_matches["invoice_match_status"] == "matched_to_active_hubspot"]
        .groupby("hubspot_record_id", dropna=False)
        .agg(
            invoice_count=("Factuurnr", "nunique"),
            invoice_amount_ex_vat=("Bedrag excl. BTW", "sum"),
            invoice_amount_inc_vat=("Bedrag incl. BTW", "sum"),
            invoice_open_amount_inc_vat=("Open bedrag incl. BTW", "sum"),
            latest_invoice_date=("Datum", "max"),
        )
        .reset_index()
    )

    invoice_lines_by_company = (
        invoice_line_matches[
            invoice_line_matches["invoice_line_match_status"] == "matched_to_active_hubspot"
        ]
        .groupby("hubspot_record_id", dropna=False)
        .agg(
            invoice_line_count=("Factuurnr", "size"),
            invoice_line_amount_ex_vat=("Totaal excl. BTW", "sum"),
            mapped_invoice_line_count=("mapped_clockify_project", lambda s: int(s.notna().sum())),
        )
        .reset_index()
    )

    clockify_by_company = (
        clockify_time_summary[clockify_time_summary["hubspot_record_id"].notna()]
        .groupby("hubspot_record_id", dropna=False)
        .agg(
            matched_clockify_clients=(
                "clockify_client_name",
                lambda s: " | ".join(sorted(set(str(v) for v in s if pd.notna(v)))),
            ),
            matched_clockify_projects=(
                "clockify_project",
                lambda s: " | ".join(sorted(set(str(v) for v in s if pd.notna(v)))),
            ),
            clockify_client_count=("clockify_client_name", "nunique"),
            clockify_entries=("clockify_entries", "sum"),
            clockify_total_hours=("clockify_total_hours", "sum"),
            clockify_first_entry=("clockify_first_entry", "min"),
            clockify_last_entry=("clockify_last_entry", "max"),
        )
        .reset_index()
    )

    company_summary = (
        hubspot.merge(
            hubspot_wefact[
                [
                    "hubspot_record_id",
                    "hubspot_wefact_status",
                    "matched_wefact_ids",
                    "matched_klantnummers",
                    "matched_wefact_names",
                    "wefact_clients_found_by_record_id",
                ]
            ],
            how="left",
            on="hubspot_record_id",
        )
        .merge(clockify_by_company, how="left", on="hubspot_record_id")
        .merge(invoice_by_company, how="left", on="hubspot_record_id")
        .merge(invoice_lines_by_company, how="left", on="hubspot_record_id")
        .sort_values("Company name")
    )

    for col in [
        "clockify_client_count",
        "clockify_entries",
        "clockify_total_hours",
        "invoice_count",
        "invoice_amount_ex_vat",
        "invoice_amount_inc_vat",
        "invoice_open_amount_inc_vat",
        "invoice_line_count",
        "invoice_line_amount_ex_vat",
        "mapped_invoice_line_count",
    ]:
        company_summary[col] = pd.to_numeric(company_summary[col], errors="coerce").fillna(0)

    company_summary["revenue_per_hour_ex_vat"] = company_summary[
        "invoice_amount_ex_vat"
    ] / company_summary["clockify_total_hours"].replace({0: pd.NA})
    company_summary["revenue_per_hour_inc_vat"] = company_summary[
        "invoice_amount_inc_vat"
    ] / company_summary["clockify_total_hours"].replace({0: pd.NA})
    return company_summary


def build_low_revenue_per_hour_export(
    company_summary: pd.DataFrame,
    clockify_time_summary: pd.DataFrame,
    invoice_line_matches: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    low_clients = (
        company_summary[
            (company_summary["clockify_total_hours"] > 0)
            & (company_summary["invoice_amount_ex_vat"] > 0)
            & (company_summary["revenue_per_hour_ex_vat"] < 80)
        ]
        .copy()
        .sort_values(
            ["revenue_per_hour_ex_vat", "clockify_total_hours", "invoice_amount_ex_vat"],
            ascending=[True, False, False],
        )
    )

    low_clients_export = low_clients[
        [
            "hubspot_record_id",
            "Company name",
            "Type klant",
            "Rechtsvorm",
            "matched_wefact_ids",
            "matched_klantnummers",
            "clockify_total_hours",
            "invoice_amount_ex_vat",
            "invoice_amount_inc_vat",
            "invoice_count",
            "invoice_line_count",
            "matched_clockify_projects",
            "revenue_per_hour_ex_vat",
            "revenue_per_hour_inc_vat",
        ]
    ].copy()

    low_ids = set(low_clients_export["hubspot_record_id"].dropna().astype("Int64").tolist())
    if not low_ids:
        return (
            low_clients_export,
            pd.DataFrame(
                columns=[
                    "hubspot_record_id",
                    "Company name",
                    "User",
                    "clockify_total_hours",
                    "clockify_entries",
                    "clockify_projects",
                    "clockify_client_names",
                ]
            ),
            pd.DataFrame(
                columns=[
                    "hubspot_record_id",
                    "Company name",
                    "Factuurnr",
                    "Factuurdatum",
                    "Klantnummer",
                    "Productnr",
                    "Omschrijving",
                    "Aantal",
                    "Totaal excl. BTW",
                    "Totaal incl. BTW",
                    "mapped_clockify_project",
                    "invoice_line_match_status",
                ]
            ),
        )

    client_map = (
        clockify_time_summary[
            ["clockify_client_name", "hubspot_record_id", "clockify_mapping_status"]
        ]
        .drop_duplicates()
        .copy()
    )
    client_map["hubspot_record_id"] = pd.to_numeric(
        client_map["hubspot_record_id"], errors="coerce"
    ).astype("Int64")

    raw_clockify = pd.read_csv(CLOCKIFY_TIME_FILE)
    raw_clockify["Duration (decimal)"] = pd.to_numeric(
        raw_clockify["Duration (decimal)"], errors="coerce"
    ).fillna(0)

    user_breakdown = (
        raw_clockify.merge(
            client_map,
            how="left",
            left_on="Client",
            right_on="clockify_client_name",
        )
        .merge(
            low_clients_export[["hubspot_record_id", "Company name"]],
            how="inner",
            on="hubspot_record_id",
        )
        .groupby(["hubspot_record_id", "Company name", "User"], dropna=False)
        .agg(
            clockify_total_hours=("Duration (decimal)", "sum"),
            clockify_entries=("Client", "size"),
            clockify_projects=(
                "Project",
                lambda s: " | ".join(sorted({str(v) for v in s.dropna() if str(v).strip()})),
            ),
            clockify_client_names=(
                "Client",
                lambda s: " | ".join(sorted({str(v) for v in s.dropna() if str(v).strip()})),
            ),
        )
        .reset_index()
        .sort_values(["Company name", "clockify_total_hours", "User"], ascending=[True, False, True])
    )

    invoice_lines_export = (
        invoice_line_matches[invoice_line_matches["hubspot_record_id"].isin(low_ids)]
        .copy()
        .sort_values(["Company name", "Factuurdatum", "Factuurnr"], ascending=[True, False, False])
    )[
        [
            "hubspot_record_id",
            "Company name",
            "Factuurnr",
            "Factuurdatum",
            "Klantnummer",
            "Productnr",
            "Omschrijving",
            "Aantal",
            "Totaal excl. BTW",
            "Totaal incl. BTW",
            "mapped_clockify_project",
            "invoice_line_match_status",
        ]
    ].copy()

    return low_clients_export, user_breakdown, invoice_lines_export


def make_notebook() -> dict[str, Any]:
    return {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "# Hours vs Revenue Analysis\n",
                    "\n",
                    "This notebook uses only local exports: HubSpot, Klanten, Facturen, Factuurregels, and Clockify.\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "from pathlib import Path\n",
                    "import pandas as pd\n",
                    "import matplotlib.pyplot as plt\n",
                    "\n",
                    "plt.style.use('seaborn-v0_8-whitegrid')\n",
                    "candidates = [Path('outputs'), Path('scripts/wefact_data/outputs')]\n",
                    "base = next((p for p in candidates if (p / 'company_summary.csv').exists()), None)\n",
                    "if base is None:\n",
                    "    raise FileNotFoundError('Could not find company_summary.csv in outputs/ or scripts/wefact_data/outputs/')\n",
                    "company = pd.read_csv(base / 'company_summary.csv')\n",
                    "invoice_lines = pd.read_csv(base / 'invoice_line_matches.csv')\n",
                    "clockify = pd.read_csv(base / 'clockify_time_by_client.csv')\n",
                    "company.head()\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "analysis = company.copy()\n",
                    "for col in ['clockify_total_hours', 'invoice_amount_ex_vat', 'invoice_amount_inc_vat', 'revenue_per_hour_ex_vat']:\n",
                    "    analysis[col] = pd.to_numeric(analysis[col], errors='coerce')\n",
                    "analysis = analysis[(analysis['clockify_total_hours'].fillna(0) > 0) | (analysis['invoice_amount_ex_vat'].fillna(0) > 0)].copy()\n",
                    "analysis = analysis.sort_values(['invoice_amount_ex_vat', 'clockify_total_hours'], ascending=[False, False])\n",
                    "analysis[['Company name', 'clockify_total_hours', 'invoice_amount_ex_vat', 'invoice_amount_inc_vat', 'revenue_per_hour_ex_vat']].head(25)\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "plot_df = analysis[(analysis['clockify_total_hours'] > 0) & (analysis['invoice_amount_ex_vat'] > 0)].copy()\n",
                    "fig, ax = plt.subplots(figsize=(10, 7))\n",
                    "ax.scatter(plot_df['clockify_total_hours'], plot_df['invoice_amount_ex_vat'], alpha=0.7, color='#1f6f8b')\n",
                    "ax.set_title('Hours Worked vs Invoiced Revenue (ex VAT)')\n",
                    "ax.set_xlabel('Clockify hours')\n",
                    "ax.set_ylabel('Invoice amount ex VAT')\n",
                    "plt.show()\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "product = invoice_lines[invoice_lines['invoice_line_match_status'] == 'matched_to_active_hubspot'].groupby('mapped_clockify_project', dropna=False)['Totaal excl. BTW'].sum().reset_index().sort_values('Totaal excl. BTW', ascending=False)\n",
                    "product.head(20)\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "project_hours = clockify[clockify['hubspot_record_id'].notna()].groupby('clockify_project', dropna=False)['clockify_total_hours'].sum().reset_index().sort_values('clockify_total_hours', ascending=False)\n",
                    "fig, ax = plt.subplots(figsize=(11, 7))\n",
                    "ax.barh(project_hours['clockify_project'][::-1], project_hours['clockify_total_hours'][::-1], color='#0f766e')\n",
                    "ax.set_title('Hours per Clockify Project')\n",
                    "ax.set_xlabel('Hours')\n",
                    "ax.set_ylabel('Project')\n",
                    "plt.show()\n",
                    "project_hours\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "project_revenue = invoice_lines[invoice_lines['invoice_line_match_status'] == 'matched_to_active_hubspot'].groupby('mapped_clockify_project', dropna=False)['Totaal excl. BTW'].sum().reset_index().sort_values('Totaal excl. BTW', ascending=False)\n",
                    "fig, ax = plt.subplots(figsize=(11, 7))\n",
                    "ax.barh(project_revenue['mapped_clockify_project'].fillna('Unmapped')[::-1], project_revenue['Totaal excl. BTW'][::-1], color='#b45309')\n",
                    "ax.set_title('Revenue per Mapped Project (ex VAT)')\n",
                    "ax.set_xlabel('Revenue ex VAT')\n",
                    "ax.set_ylabel('Project')\n",
                    "plt.show()\n",
                    "project_revenue\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "project_hours_cmp = project_hours.rename(columns={'clockify_project': 'project'})\n",
                    "project_rev_cmp = project_revenue.rename(columns={'mapped_clockify_project': 'project', 'Totaal excl. BTW': 'revenue_ex_vat'})\n",
                    "project_compare = project_hours_cmp.merge(project_rev_cmp, how='outer', on='project').fillna({'clockify_total_hours': 0, 'revenue_ex_vat': 0})\n",
                    "project_compare['revenue_per_hour'] = project_compare['revenue_ex_vat'] / project_compare['clockify_total_hours'].replace({0: pd.NA})\n",
                    "project_compare.sort_values('revenue_ex_vat', ascending=False)\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "remaining_unmapped_revenue = invoice_lines[(invoice_lines['invoice_line_match_status'] == 'matched_to_active_hubspot') & (invoice_lines['mapped_clockify_project'].isna())]['Totaal excl. BTW'].sum()\n",
                    "monthly_bucket_revenue = invoice_lines[(invoice_lines['invoice_line_match_status'] == 'matched_to_active_hubspot') & (invoice_lines['mapped_clockify_project'] == 'Monthly / Maandelijks')]['Totaal excl. BTW'].sum()\n",
                    "pd.DataFrame([{'metric': 'monthly_bucket_revenue_ex_vat', 'value': monthly_bucket_revenue}, {'metric': 'remaining_unmapped_revenue_ex_vat', 'value': remaining_unmapped_revenue}])\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "project_avg = project_compare[(project_compare['clockify_total_hours'] > 0) & (project_compare['revenue_ex_vat'] > 0)].copy().sort_values('revenue_per_hour', ascending=False)\n",
                    "fig, ax = plt.subplots(figsize=(11, 7))\n",
                    "ax.barh(project_avg['project'].fillna('Unmapped')[::-1], project_avg['revenue_per_hour'][::-1], color='#7c3aed')\n",
                    "ax.set_title('Average Revenue per Hour per Project')\n",
                    "ax.set_xlabel('Revenue per hour (ex VAT)')\n",
                    "ax.set_ylabel('Project')\n",
                    "plt.show()\n",
                    "project_avg[['project', 'clockify_total_hours', 'revenue_ex_vat', 'revenue_per_hour']]\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "client_avg = analysis[(analysis['clockify_total_hours'] > 0) & (analysis['invoice_amount_ex_vat'] > 0)].copy().sort_values('revenue_per_hour_ex_vat', ascending=False)\n",
                    "fig, ax = plt.subplots(figsize=(12, 8))\n",
                    "top_client_avg = client_avg.head(20)\n",
                    "ax.barh(top_client_avg['Company name'][::-1], top_client_avg['revenue_per_hour_ex_vat'][::-1], color='#2563eb')\n",
                    "ax.set_title('Average Revenue per Hour per Client (Top 20)')\n",
                    "ax.set_xlabel('Revenue per hour (ex VAT)')\n",
                    "ax.set_ylabel('Client')\n",
                    "plt.show()\n",
                    "client_avg[['Company name', 'clockify_total_hours', 'invoice_amount_ex_vat', 'revenue_per_hour_ex_vat']].head(30)\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "lowest_client_avg = analysis[(analysis['clockify_total_hours'] > 0) & (analysis['invoice_amount_ex_vat'] > 0) & (analysis['revenue_per_hour_ex_vat'] < 80)].copy().sort_values('revenue_per_hour_ex_vat', ascending=True)\n",
                    "fig, ax = plt.subplots(figsize=(12, max(6, len(lowest_client_avg) * 0.35)))\n",
                    "lowest_client_chart = lowest_client_avg.sort_values('revenue_per_hour_ex_vat', ascending=False)\n",
                    "ax.barh(lowest_client_chart['Company name'], lowest_client_chart['revenue_per_hour_ex_vat'], color='#dc2626')\n",
                    "ax.axvline(80, color='#7f1d1d', linestyle='--', linewidth=1.5)\n",
                    "ax.set_title('Average Revenue per Hour per Client Below EUR 80')\n",
                    "ax.set_xlabel('Revenue per hour (ex VAT)')\n",
                    "ax.set_ylabel('Client')\n",
                    "plt.show()\n",
                    "lowest_client_avg[['Company name', 'clockify_total_hours', 'invoice_amount_ex_vat', 'revenue_per_hour_ex_vat']]\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "type_klant = analysis.groupby('Type klant', dropna=False).agg(revenue_ex_vat=('invoice_amount_ex_vat', 'sum'), hours=('clockify_total_hours', 'sum')).reset_index()\n",
                    "type_klant['revenue_per_hour'] = type_klant['revenue_ex_vat'] / type_klant['hours'].replace({0: pd.NA})\n",
                    "type_klant = type_klant.sort_values('revenue_ex_vat', ascending=False)\n",
                    "fig, ax = plt.subplots(figsize=(11, 7))\n",
                    "ax.barh(type_klant['Type klant'].fillna('Unknown')[::-1], type_klant['revenue_ex_vat'][::-1], color='#9333ea')\n",
                    "ax.set_title('Revenue by Type klant (ex VAT)')\n",
                    "ax.set_xlabel('Revenue ex VAT')\n",
                    "ax.set_ylabel('Type klant')\n",
                    "plt.show()\n",
                    "type_klant\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "type_klant_rph = type_klant[type_klant['hours'] > 0].sort_values('revenue_per_hour', ascending=False)\n",
                    "fig, ax = plt.subplots(figsize=(11, 7))\n",
                    "ax.barh(type_klant_rph['Type klant'].fillna('Unknown')[::-1], type_klant_rph['revenue_per_hour'][::-1], color='#7c3aed')\n",
                    "ax.set_title('Revenue per Hour by Type klant')\n",
                    "ax.set_xlabel('Revenue per hour (ex VAT)')\n",
                    "ax.set_ylabel('Type klant')\n",
                    "plt.show()\n",
                    "type_klant_rph[['Type klant', 'hours', 'revenue_ex_vat', 'revenue_per_hour']]\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "rechtsvorm = analysis.groupby('Rechtsvorm', dropna=False).agg(revenue_ex_vat=('invoice_amount_ex_vat', 'sum'), hours=('clockify_total_hours', 'sum')).reset_index()\n",
                    "rechtsvorm['revenue_per_hour'] = rechtsvorm['revenue_ex_vat'] / rechtsvorm['hours'].replace({0: pd.NA})\n",
                    "rechtsvorm = rechtsvorm.sort_values('revenue_ex_vat', ascending=False)\n",
                    "fig, ax = plt.subplots(figsize=(11, 7))\n",
                    "ax.barh(rechtsvorm['Rechtsvorm'].fillna('Unknown')[::-1], rechtsvorm['revenue_ex_vat'][::-1], color='#0f766e')\n",
                    "ax.set_title('Revenue by Rechtsvorm (ex VAT)')\n",
                    "ax.set_xlabel('Revenue ex VAT')\n",
                    "ax.set_ylabel('Rechtsvorm')\n",
                    "plt.show()\n",
                    "rechtsvorm\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "rechtsvorm_rph = rechtsvorm[rechtsvorm['hours'] > 0].sort_values('revenue_per_hour', ascending=False)\n",
                    "fig, ax = plt.subplots(figsize=(11, 7))\n",
                    "ax.barh(rechtsvorm_rph['Rechtsvorm'].fillna('Unknown')[::-1], rechtsvorm_rph['revenue_per_hour'][::-1], color='#155e75')\n",
                    "ax.set_title('Revenue per Hour by Rechtsvorm')\n",
                    "ax.set_xlabel('Revenue per hour (ex VAT)')\n",
                    "ax.set_ylabel('Rechtsvorm')\n",
                    "plt.show()\n",
                    "rechtsvorm_rph[['Rechtsvorm', 'hours', 'revenue_ex_vat', 'revenue_per_hour']]\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "unmapped_lines = invoice_lines[invoice_lines['mapped_clockify_project'].isna()].copy().sort_values(['invoice_line_match_status', 'Totaal excl. BTW'], ascending=[True, False])\n",
                    "unmapped_lines[['Factuurnr', 'Klantnummer', 'Bedrijfsnaam', 'Productnr', 'Omschrijving', 'Totaal excl. BTW', 'invoice_line_match_status']].head(50)\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": [
                    "outliers = analysis[(analysis['clockify_total_hours'] > 0) & (analysis['revenue_per_hour_ex_vat'] > analysis['revenue_per_hour_ex_vat'].quantile(0.99))].copy()\n",
                    "outliers[['Company name', 'clockify_total_hours', 'invoice_amount_ex_vat', 'revenue_per_hour_ex_vat']].sort_values('revenue_per_hour_ex_vat', ascending=False)\n",
                ],
            },
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {"name": "python", "version": "3"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def main() -> None:
    hubspot = load_hubspot()
    wefact_clients = load_wefact_clients()
    invoices = load_invoices()
    invoice_lines = load_invoice_lines()
    clockify_clients = load_clockify_clients()

    clockify_time_summary = build_clockify_time_summary(clockify_clients)
    hubspot_wefact = build_hubspot_wefact_reconciliation(hubspot, wefact_clients)
    invoice_matches = build_invoice_matches(invoices, wefact_clients, hubspot)
    invoice_line_matches = build_invoice_line_matches(invoice_lines, wefact_clients, hubspot)
    company_summary = build_company_summary(
        hubspot, hubspot_wefact, invoice_matches, invoice_line_matches, clockify_time_summary
    )

    clockify_unmatched = clockify_time_summary[
        clockify_time_summary["clockify_mapping_status"] != "matched_by_api_note"
    ].sort_values("clockify_total_hours", ascending=False)
    invoice_unmatched = invoice_matches[
        invoice_matches["invoice_match_status"] != "matched_to_active_hubspot"
    ].sort_values(["invoice_match_status", "Datum", "Factuurnr"], ascending=[True, False, True])
    hubspot_missing_wefact = hubspot_wefact[
        hubspot_wefact["hubspot_wefact_status"] != "matched_ok"
    ].sort_values("Company name")
    (
        low_clients_export,
        low_clients_user_breakdown,
        low_clients_invoice_lines,
    ) = build_low_revenue_per_hour_export(
        company_summary, clockify_time_summary, invoice_line_matches
    )

    hubspot.to_csv(OUTPUT_DIR / "active_hubspot_companies.csv", index=False, encoding="utf-8-sig")
    hubspot_wefact.to_csv(
        OUTPUT_DIR / "hubspot_wefact_reconciliation.csv", index=False, encoding="utf-8-sig"
    )
    clockify_time_summary.to_csv(
        OUTPUT_DIR / "clockify_time_by_client.csv", index=False, encoding="utf-8-sig"
    )
    invoice_matches.to_csv(OUTPUT_DIR / "invoice_matches.csv", index=False, encoding="utf-8-sig")
    invoice_line_matches.to_csv(
        OUTPUT_DIR / "invoice_line_matches.csv", index=False, encoding="utf-8-sig"
    )
    company_summary.to_csv(OUTPUT_DIR / "company_summary.csv", index=False, encoding="utf-8-sig")
    clockify_unmatched.to_csv(
        OUTPUT_DIR / "clockify_unmatched_clients.csv", index=False, encoding="utf-8-sig"
    )
    invoice_unmatched.to_csv(
        OUTPUT_DIR / "invoice_unmatched_rows.csv", index=False, encoding="utf-8-sig"
    )
    invoice_line_matches[invoice_line_matches["mapped_clockify_project"].isna()].sort_values(
        ["invoice_line_match_status", "Totaal excl. BTW"], ascending=[True, False]
    ).to_csv(
        OUTPUT_DIR / "invoice_lines_unmapped_to_project.csv",
        index=False,
        encoding="utf-8-sig",
    )
    hubspot_missing_wefact.to_csv(
        OUTPUT_DIR / "hubspot_companies_missing_wefact_id.csv",
        index=False,
        encoding="utf-8-sig",
    )
    with pd.ExcelWriter(OUTPUT_DIR / "clients_below_80_eur_per_hour.xlsx") as writer:
        low_clients_export.to_excel(writer, sheet_name="clients_below_80", index=False)
        low_clients_user_breakdown.to_excel(writer, sheet_name="hours_by_user", index=False)
        low_clients_invoice_lines.to_excel(writer, sheet_name="invoice_lines", index=False)

    summary = pd.DataFrame(
        [
            {"metric": "active_hubspot_companies", "value": len(hubspot)},
            {
                "metric": "hubspot_wefact_matched_ok",
                "value": int((hubspot_wefact["hubspot_wefact_status"] == "matched_ok").sum()),
            },
            {
                "metric": "hubspot_wefact_unmatched_or_problematic",
                "value": int((hubspot_wefact["hubspot_wefact_status"] != "matched_ok").sum()),
            },
            {
                "metric": "clockify_time_clients",
                "value": int(clockify_time_summary["clockify_client_name"].nunique()),
            },
            {
                "metric": "clockify_time_clients_matched_by_api_note",
                "value": int(
                    clockify_time_summary.loc[
                        clockify_time_summary["hubspot_record_id"].notna(),
                        "clockify_client_name",
                    ].nunique()
                ),
            },
            {
                "metric": "clockify_hours_matched_to_hubspot",
                "value": round(
                    float(
                        clockify_time_summary.loc[
                            clockify_time_summary["hubspot_record_id"].notna(),
                            "clockify_total_hours",
                        ].sum()
                    ),
                    2,
                ),
            },
            {
                "metric": "clockify_hours_total",
                "value": round(float(clockify_time_summary["clockify_total_hours"].sum()), 2),
            },
            {"metric": "invoice_rows", "value": len(invoice_matches)},
            {
                "metric": "invoice_rows_matched_to_active_hubspot",
                "value": int(
                    (invoice_matches["invoice_match_status"] == "matched_to_active_hubspot").sum()
                ),
            },
            {
                "metric": "invoice_rows_unmatched",
                "value": int(
                    (invoice_matches["invoice_match_status"] != "matched_to_active_hubspot").sum()
                ),
            },
            {"metric": "invoice_line_rows", "value": len(invoice_line_matches)},
            {
                "metric": "invoice_line_rows_matched_to_active_hubspot",
                "value": int(
                    (
                        invoice_line_matches["invoice_line_match_status"]
                        == "matched_to_active_hubspot"
                    ).sum()
                ),
            },
            {
                "metric": "mapped_invoice_line_rows",
                "value": int(invoice_line_matches["mapped_clockify_project"].notna().sum()),
            },
        ]
    )
    summary.to_csv(
        OUTPUT_DIR / "reconciliation_summary.csv", index=False, encoding="utf-8-sig"
    )

    with NOTEBOOK_FILE.open("w", encoding="utf-8") as handle:
        json.dump(make_notebook(), handle, ensure_ascii=False, indent=2)

    print(f"Wrote outputs to {OUTPUT_DIR}")
    print(f"Wrote notebook to {NOTEBOOK_FILE}")


if __name__ == "__main__":
    main()
