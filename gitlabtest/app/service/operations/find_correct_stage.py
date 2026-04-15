from __future__ import annotations

import logging
from datetime import UTC
from datetime import date
from datetime import datetime
from typing import Any

from app.service.operations.constants import BETAALT_NIET_LABEL
from app.service.operations.constants import BETAALT_NIET_STAGE_ID
from app.service.operations.constants import BTW_PIPELINE_IDS
from app.utils import parse_quarter
from app.utils import to_int

logger = logging.getLogger(__name__)

# BTW - used for previous-quarter lookup and target stage
TARGET_CSV_LABEL = "Portal werkt niet: CSV uitvragen"

# ---- property keys ----
PROP_YEAR = "year"  # deal prop
PROP_QUARTER = "quarter"  # deal prop
PROP_TWEE_MAANDEN_GEBOEKT = "btw_2_maanden_geboekt"  # deal prop

# company props:
PROP_BANK_STATUS_COMPANY = "bankkoppeling_status"
PROP_BANK_VERLOPEN_COMPANY = "expiry_date"

ACTIVE_STATUSES = {"Verloopt binnen 10 dagen", "Actief"}
EXPIRED_STATUSES = {"Error", "Verlopen", "Inactief", "Deels verlopen"}

# stage labels
STAGE_2M_INFO = "2 maanden geboekt (info nodig)"
STAGE_2M = "2 maanden geboekt"
STAGE_2M_CONTROL = "2 maanden geboekt (controle)"
STAGE_2M_BK_VERLOPEN = "2 maanden geboekt (bankkoppeling verlopen)"

# ---------- Small utils (lightweight + local) --------------------------------


def first_day_of_next_quarter(year: Any, quarter: Any) -> date | None:
    y = to_int(year)
    q = parse_quarter(quarter)
    if y is None or q is None:
        return None
    if q == 4:
        return date(y + 1, 1, 1)
    month = {1: 4, 2: 7, 3: 10}[q]
    return date(y, month, 1)


def stage_from_2m_property(pipeline: Any, value: str | None) -> Any:
    """
    The 'twee_maanden_geboekt' property contains the *exact* stage label.
    - Try that label directly.
    - If missing/unknown, default to 'Gegevens gereed'.
    - If that stage doesn't exist either, fall back to the beginner stage.
    """
    label = (value or "").strip()
    if label:
        st = stage_by_label(pipeline, label)
        if st:
            return st

    # Default target if no/unknown label
    st = stage_by_label(pipeline, "Gegevens gereed")
    return st or find_beginnerstage(pipeline)


# ---------- small helpers ----------


def find_beginnerstage(pipeline: Any) -> Any:
    """Stage labeled with '*' or fallback to first stage."""
    return next((s for s in pipeline.stages if "*" in s.label), pipeline.stages[0])


def stage_by_label(pipeline: Any, label: str) -> Any | None:
    """Return the stage object with exact `label`, or None if not found."""
    return next((s for s in pipeline.stages if s.label == label), None)


def parse_reference_year_quarter(reference_date_raw: Any) -> tuple[int, int] | None:
    """HubSpot createdate -> (year, quarter). Accepts millis or ISO8601."""
    if not reference_date_raw:
        return None
    try:
        if str(reference_date_raw).isdigit():
            dt = datetime.fromtimestamp(int(reference_date_raw) / 1000, tz=UTC)
        else:
            dt = datetime.fromisoformat(str(reference_date_raw).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
    except Exception:
        return None
    return dt.year, (dt.month - 1) // 3 + 1


def is_deal_before_reference_year(deal_year_raw: Any, reference_date_raw: Any) -> bool:
    """
    Year-only comparison: True if deal_year < company.created_year.
    Safe for missing/invalid values (returns False then).
    """
    deal_year = to_int(deal_year_raw)
    if deal_year is None:
        return False
    yq = parse_reference_year_quarter(reference_date_raw)
    if not yq:
        return False
    reference_year, _ = yq
    return deal_year < reference_year


def is_deal_before_reference_year_and_quarter(
    deal_year_raw: Any, deal_quarter_raw: Any, reference_date_raw: Any
) -> bool:
    """
    Year+quarter comparison:
    True if (deal_year, deal_quarter) < (company_year, company_quarter).
    Quarter may be missing; then defaults to Q1.
    """
    deal_year = to_int(deal_year_raw)
    if deal_year is None:
        return False
    dq = parse_quarter(deal_quarter_raw) or 1
    yq = parse_reference_year_quarter(reference_date_raw)
    if not yq:
        return False
    reference_year, reference_quarter = yq
    return (deal_year, dq) < (reference_year, reference_quarter)


# -------------------- MAIN ROUTER (centralized fetch) ------------------------
async def find_correct_stage(
    deal_id: int,
    pipeline: Any,
    year: str | int | None,
    company_id: int | str,
    contact_id: int | str,
    all_deals: list[str],
    company: Any,
    current_deal: dict[str, Any] | None,
    contact: Any,
    deal_properties: dict[str, dict[str, Any]],
    quarter: str | None = None,
) -> Any:
    # Defaults
    year = year or (current_deal.get("year") if current_deal is not None else None)
    quarter = quarter or (
        current_deal.get("quarter") if current_deal is not None else None
    )
    main_deal_won_dtm = (
        current_deal.get("won_dtm") if current_deal is not None else None
    )

    # 1) Sales "Betaalt niet" short-circuit (based on current deal stage)
    if (
        current_deal is not None
        and current_deal.get("dealstage") == BETAALT_NIET_STAGE_ID
    ):
        forced = stage_by_label(pipeline, BETAALT_NIET_LABEL)
        if forced:
            return forced

    # Dispatch
    plabel = pipeline.label or ""

    if "Jaarrekening" in plabel:
        result = await handle_jaarrekening_pipeline(
            deal_id,
            pipeline,
            company_id,
            all_deals,
            year,
            quarter,
            company,
            contact,
            contact_id,
            deal_properties,
            main_deal_won_dtm,
        )
    elif "Inkomstenbelasting" in plabel:
        result = await handle_inkomstenbelasting_pipeline(
            deal_id, pipeline, year, quarter, contact
        )
    elif "VPB" in plabel:
        result = await handle_vpb_pipeline(
            deal_id,
            pipeline,
            company_id,
            all_deals,
            year,
            quarter,
            company,
            main_deal_won_dtm,
        )
    elif "BTW" in plabel:
        result = await handle_btw_pipeline(
            deal_id,
            pipeline,
            company_id,
            all_deals,
            year,
            quarter,
            company,
            deal_properties,
            main_deal_won_dtm,
        )
    elif "Administratie" in plabel:
        result = await handle_administratie_pipeline(
            pipeline, company_id, year, quarter, company, main_deal_won_dtm
        )
    elif "Volledige service" in plabel:
        result = handle_volledige_service_pipeline(pipeline, company)
    else:
        result = find_beginnerstage(pipeline)
    return result


def handle_volledige_service_pipeline(pipeline: Any, company: Any) -> Any:
    intensiteit = (company.properties.get("intensiteit") or "").strip()
    if intensiteit == "Wekelijks":
        st = stage_by_label(pipeline, label="Wekelijks")
        if st:
            return st

    elif intensiteit == "Maandelijks":
        st = stage_by_label(pipeline, label="Maandelijks")
        if st:
            return st

    elif intensiteit == "Per kwartaal":
        st = stage_by_label(pipeline, label="Per kwartaal")
        if st:
            return st

    return find_beginnerstage(pipeline)


# -------------------- ADMINISTRATIE (uses company only) ----------------------
async def handle_administratie_pipeline(
    pipeline: Any,
    company_id: int | str,
    year: str | int | None,
    quarter: str | None,
    company: Any,
    main_deal_won_dtm: str | None,
) -> Any:
    # (company already fetched)
    status = (company.properties.get("bankkoppeling_status") or "").strip()
    if status.lower() == "actief":
        st = stage_by_label(pipeline, "Gegevens gereed")
        if st:
            return st

    pakket = company.properties.get("software_portaal_pakket")
    if pakket == "Software":
        st = stage_by_label(pipeline, "Software")
        if st:
            return st
    if pakket in {"Pakket groot", "Pakket klein"}:
        st = stage_by_label(pipeline, "Pakket")
        if st:
            return st

    if is_deal_before_reference_year_and_quarter(year, quarter, main_deal_won_dtm):
        st = stage_by_label(pipeline, "Open nieuwe bedrijven")
        if st:
            return st

    return find_beginnerstage(pipeline)


# -------------------- BTW (uses company + deal_properties) --------------------
async def handle_btw_pipeline(
    deal_id: int,
    pipeline: Any,
    company_id: int | str,
    all_deals: list[str],
    year: str | int | None,
    quarter: str | None,
    company: Any,
    deal_properties: dict[str, dict[str, Any]],
    main_deal_won_dtm: str | None,
) -> Any:
    # 1) bankkoppeling -> Gegevens gereed
    status = (company.properties.get("bankkoppeling_status") or "").strip()
    if status.lower() == "actief":
        st = stage_by_label(pipeline, "Gegevens gereed")
        if st:
            return st

    # 2) Maandelijkse klant
    if company.properties.get("intensiteit") == "Maandelijks":
        st = stage_by_label(pipeline, "Maandelijkse klant")
        if st:
            return st

    # 3) Historical hit -> check pre-fetched deal_properties
    hit = False
    for did, rec in deal_properties.items():
        if str(did) == str(deal_id):
            continue
        if rec.get("pipeline_id") not in BTW_PIPELINE_IDS:
            continue
        if (
            rec.get("entered_btw_csv_a")
            or rec.get("entered_btw_csv_b")
            or rec.get("entered_btw_csv_c")
        ):
            hit = True
            break

    if hit:
        found = stage_by_label(pipeline, TARGET_CSV_LABEL)
        if found:
            return found

    # 4) Volledige service -> Open Volledige Service
    if company.properties.get("software_portaal_pakket") == "Pakket groot":
        st = stage_by_label(pipeline, "Open Volledige Service")
        if st:
            return st

    # 5) Created-after rule
    if is_deal_before_reference_year_and_quarter(year, quarter, main_deal_won_dtm):
        st = stage_by_label(pipeline, "Open nieuwe bedrijven")
        if st:
            return st

    # Fallback
    return find_beginnerstage(pipeline)


# -------- JAARREKENING (uses company + contact + deal_properties) ------------
async def handle_jaarrekening_pipeline(
    deal_id: int,
    pipeline: Any,
    company_id: int | str,
    all_deals: list[str],
    year: str | int | None,
    quarter: str | None,
    company: Any,
    contact: Any,
    contact_id: int | str,
    deal_properties: dict[str, dict[str, Any]],
    main_deal_won_dtm: str | None,
) -> Any:
    # 1) Maandelijkse klant
    if company.properties.get("intensiteit") == "Maandelijks":
        st = stage_by_label(pipeline, "Maandelijkse klant")
        if st:
            return st

    # 2) Zelf berekening -> check pre-fetched deal_properties
    zelf = any(
        (did != str(deal_id))
        and (rec.get("entered_jr_zelf_a") or rec.get("entered_jr_zelf_b"))
        for did, rec in deal_properties.items()
    )
    if zelf:
        st = stage_by_label(pipeline, "Maakt en levert zelf berekening")
        if st:
            return st

    # 3) Jaarklant
    is_jaarklant = contact.properties.get("jaarklant") == "true"
    if is_jaarklant:
        st = stage_by_label(pipeline, "Zonder BTW (jaarklant)")
        if st:
            return st

    # 4) Jaarlijks & geen jaarklant
    if company.properties.get("intensiteit") == "Jaarlijks" and (
        contact.properties.get("jaarklant") == "false"
    ):
        st = stage_by_label(pipeline, "Zonder BTW (geen jaarklant)")
        if st:
            return st

    # 5) Company newer than deal YEAR
    if is_deal_before_reference_year(year, main_deal_won_dtm):
        st = stage_by_label(pipeline, "Open nieuwe bedrijven")
        if st:
            return st

    # Fallback
    return find_beginnerstage(pipeline)


# -------------------- IB (uses contact only) ---------------------------------
async def handle_inkomstenbelasting_pipeline(
    deal_id: int,
    pipeline: Any,
    year: str | int | None,
    quarter: str | None,
    contact: Any,
) -> Any:
    # Year-only "new customer" rule (IB uses contact.createdate)
    if is_deal_before_reference_year(year, contact.properties.get("createdate")):
        st = stage_by_label(pipeline, "Open nieuwe klanten")
        if st:
            return st
    return find_beginnerstage(pipeline)


# -------------------- VPB (uses company only) --------------------------------
async def handle_vpb_pipeline(
    deal_id: int,
    pipeline: Any,
    company_id: int | str,
    all_deals: list[str],
    year: str | int | None,
    quarter: str | None,
    company: Any,
    main_deal_won_dtm: str | None,
) -> Any:
    pakket = company.properties.get("software_portaal_pakket")

    if pakket == "Software":
        st = stage_by_label(pipeline, "Software")
        if st:
            return st
    if pakket in {"Pakket groot", "Pakket klein"}:
        st = stage_by_label(pipeline, "Pakket")
        if st:
            return st
    if pakket == "CSV":
        st = stage_by_label(pipeline, "CSV")
        if st:
            return st

    # Year-only "new company" rule for VPB
    if is_deal_before_reference_year(year, main_deal_won_dtm):
        st = stage_by_label(pipeline, "Open nieuwe bedrijven")
        if st:
            return st

    return find_beginnerstage(pipeline)
