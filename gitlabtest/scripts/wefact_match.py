import pandas as pd
import re
import unicodedata
import time
from pathlib import Path


def log(msg: str) -> None:
    print(f"[wefact_match] {msg}")

# Paths
hubspot_path = Path("scripts/wefact_data/hubspot-crm-exports-oude-companies-ex-klanten-2026-01-19-1.csv")
wefact_path = Path("scripts/wefact_data/Klanten_19-01-2026.xlsx")
contacts_path = Path("scripts/wefact_data/hubspot-crm-exports-all-contacts-2026-01-19.csv")

# Load data
start_time = time.time()
hub = pd.read_csv(hubspot_path, dtype=str).fillna("")
wefact = pd.read_excel(wefact_path, dtype=str).fillna("")
log(f"Loaded HubSpot rows: {len(hub)}, WeFact rows: {len(wefact)}")

# Load contacts to support email-based matching with single-company constraint
contacts = pd.read_csv(contacts_path, dtype=str).fillna("") if contacts_path.exists() else pd.DataFrame()
if not contacts.empty:
    log(f"Loaded contacts rows: {len(contacts)}")
else:
    log("Contacts file not found or empty; email matching will be skipped.")

# Normalize column names from new HubSpot export
hub = hub.rename(columns={
    "Record ID - Company": "Record ID",
    "BTW nummer": "BTW nummer",
    "Company name": "Company name",
    "Street Address": "Street Address",
    "Postal Code": "Postal Code",
    "City": "City",
    "Associated Contact": "Associated Contact",
    "Email": "Email",
})

# Drop obvious test companies
hub = hub[~hub["Company name"].str.contains("test", case=False, na=False)].copy()

LEGAL_SUFFIXES = {
    "bv", "b.v", "b.v.", "bv.", "nv", "n.v", "vof", "v.o.f", "v.o.f.", "cv", "c.v",
    "bvba", "gmbh", "sarl", "sa", "llc", "inc", "ltd", "holding",
    "sl", "s.l", "s.l.", "s.l.u", "ug", "oy",
    "ez", "e.z", "e.z.", "particulier"
}

def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))

def normalize_company(name: str) -> str:
    name = strip_accents(name or "").lower()
    name = name.replace("-particulier", " ")
    # Collapse spaced/dotted legal forms like "v.o.f." -> "vof", "b v" -> "bv"
    name = re.sub(r"\bv\s*\.?\s*o\s*\.?\s*f\b", " vof ", name)
    name = re.sub(r"\bb\s*\.?\s*v\b", " bv ", name)
    name = re.sub(r"\bn\s*\.?\s*v\b", " nv ", name)
    name = re.sub(r"[\'\"]", "", name)
    name = re.sub(r"[^a-z0-9]+", " ", name)
    parts = [p for p in name.split() if p and p not in LEGAL_SUFFIXES]
    return " ".join(parts).strip()

def normalize_btw(btw: str) -> str:
    if not btw:
        return ""
    btw = re.sub(r"[^A-Z0-9]", "", btw.upper())
    if btw and not btw.startswith("NL") and len(btw) in {9, 10, 11}:
        btw = "NL" + btw
    return btw

def normalize_postal_code(pc: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (pc or "").upper())

def normalize_address(street: str, postal: str, city: str) -> str:
    street = re.sub(r"[^a-z0-9]", "", strip_accents(street or "").lower())
    city = re.sub(r"[^a-z0-9]", "", strip_accents(city or "").lower())
    return f"{street}-{normalize_postal_code(postal)}-{city}".strip("-")

def normalize_email(email: str) -> str:
    return (email or "").strip().lower()

def simple_ratio(a: str, b: str) -> int:
    import difflib
    return int(round(difflib.SequenceMatcher(None, a, b).ratio() * 100))

# Add normalized fields
hub["norm_btw"] = hub["BTW nummer"].apply(normalize_btw)
hub["norm_name"] = hub["Company name"].apply(normalize_company)
hub["norm_name_compact"] = hub["norm_name"].str.replace(" ", "", regex=False)
hub["norm_addr"] = [normalize_address(r["Street Address"], r["Postal Code"], r["City"]) for _, r in hub.iterrows()]
hub["norm_email"] = hub["Email"].apply(normalize_email)

wefact["norm_btw"] = wefact["BTW nummer"].apply(normalize_btw)
wefact["norm_name"] = wefact["Bedrijfsnaam"].apply(normalize_company)
wefact["norm_name_compact"] = wefact["norm_name"].str.replace(" ", "", regex=False)
wefact["norm_addr"] = [normalize_address(r["Adres"], r["Postcode"], r["Plaats"]) for _, r in wefact.iterrows()]
wefact["norm_email"] = wefact["E-mail"].apply(normalize_email)

# Build map: normalized email -> set of associated company IDs (only keep if exactly one company)
email_to_company = {}
if not contacts.empty and "Email" in contacts.columns and "Associated Company IDs" in contacts.columns:
    for _, row in contacts.iterrows():
        em = normalize_email(row.get("Email", ""))
        if not em:
            continue
        companies = [c.strip() for c in str(row.get("Associated Company IDs", "")).split(";") if c.strip()]
        if not companies:
            continue
        # Track all companies per email
        s = email_to_company.get(em, set())
        s.update(companies)
        email_to_company[em] = s

log(f"Emails with company links: {len(email_to_company)}")

hub_sorted = hub.sort_values("Record ID")

matches = []
matched_hub_ids = set()
matched_wefact_ids = set()
log("Using rapidfuzz: False (forced difflib)")

def record_best(df, method, hub_suffix="_hub", wf_suffix="_wf"):
    wid_col = "ID" + wf_suffix
    # Fall back to plain "ID" if the suffixed column is missing (e.g., pre-merge frames)
    if wid_col not in df.columns:
        wid_col = "ID"
    df = df[
        ~df["Record ID"].isin(matched_hub_ids)
        & ~df[wid_col].isin(matched_wefact_ids)
    ]
    if df.empty:
        return
    best = df.sort_values(["Record ID", "ID"]).drop_duplicates(subset=["Record ID"], keep="first")
    for _, row in best.iterrows():
        wf_id = row.get(wid_col, row.get("ID"))
        matches.append({
            "method": method,
            "hub_record_id": row.get("Record ID"),
            "hub_company_name": row.get("Company name" + hub_suffix, row.get("Company name")),
            "hub_btw": row.get("BTW nummer" + hub_suffix, row.get("BTW nummer")),
            "hub_contact": row.get("Associated Contact" + hub_suffix, row.get("Associated Contact", "")),
            "hub_email": row.get("Email" + hub_suffix, row.get("Email", "")),
            "wefact_id": row.get("ID" + wf_suffix, row.get("ID")),
            "wefact_klantnummer": row.get("Klantnummer" + wf_suffix, row.get("Klantnummer")),
            "wefact_bedrijfsnaam": row.get("Bedrijfsnaam" + wf_suffix, row.get("Bedrijfsnaam")),
            "wefact_btw": row.get("BTW nummer" + wf_suffix, row.get("BTW nummer")),
        })
        matched_hub_ids.add(row.get("Record ID"))
        matched_wefact_ids.add(wf_id)

# 1) BTW number
btw_merge = hub_sorted[hub_sorted["norm_btw"] != ""].merge(
    wefact[wefact["norm_btw"] != ""], on="norm_btw", how="inner", suffixes=("_hub", "_wf")
)
record_best(btw_merge, "BTW nummer")
log(f"BTW matches: {len(matches)}")

# 2) Exact normalized name
remaining_hub = hub_sorted[~hub_sorted["Record ID"].isin(matched_hub_ids)]
hub_name_nonempty = remaining_hub[remaining_hub["norm_name"] != ""]
name_merge = hub_name_nonempty.merge(
    wefact[wefact["norm_name"] != ""], on="norm_name", how="inner", suffixes=("_hub", "_wf")
)
record_best(name_merge, "Normalized name")
log(f"After normalized name matches: {len(matches)} total")

# 3) Contact email (HubSpot contact email to WeFact email) only when the contact is linked to exactly one company ID
if email_to_company:
    remaining_hub = hub_sorted[~hub_sorted["Record ID"].isin(matched_hub_ids)]
    # Filter hub rows where this email is linked to exactly one company and that company is the current hub record
    def eligible_email(row):
        em = row["norm_email"]
        if not em or em not in email_to_company:
            return False
        company_ids = email_to_company[em]
        return len(company_ids) == 1 and row["Record ID"] in company_ids

    hub_email_single = remaining_hub[remaining_hub["norm_email"] != ""].copy()
    hub_email_single = hub_email_single[hub_email_single.apply(eligible_email, axis=1)]
    email_merge = hub_email_single.merge(
        wefact[wefact["norm_email"] != ""], on="norm_email", how="inner", suffixes=("_hub", "_wf")
    )
    record_best(email_merge, "Contact email (unique contact->company)")
log(f"After email matches: {len(matches)} total")

# No fuzzy matching (removed due to false positives)
remaining_hub = hub_sorted[~hub_sorted["Record ID"].isin(matched_hub_ids)]

matches_df = pd.DataFrame(matches)
matched_hub_count = len(set(matches_df["hub_record_id"]))
unmatched_hub = hub_sorted[~hub_sorted["Record ID"].isin(set(matches_df["hub_record_id"]))].copy()

print("Hub companies matched:", matched_hub_count, "/", len(hub_sorted))
print("Unmatched Hub companies:", len(unmatched_hub))
if len(matches_df):
    print(matches_df.head(20).to_markdown(index=False))

# Exports
matches_out = Path("scripts/wefact_data/old_hub_matches.csv")
unmatched_out = Path("scripts/wefact_data/old_hub_unmatched.csv")
matches_df.to_csv(matches_out, index=False)
unmatched_hub.to_csv(unmatched_out, index=False)
downloads_dir = Path.home() / "Downloads"
downloads_dir.mkdir(parents=True, exist_ok=True)
excel_out = downloads_dir / "wefact_matches.xlsx"
with pd.ExcelWriter(excel_out) as writer:
    matches_df.to_excel(writer, sheet_name="matched", index=False)
    unmatched_hub.to_excel(writer, sheet_name="unmatched", index=False)
print("Wrote:", matches_out, "and", unmatched_out, "and", excel_out)
log(f"Finished in {time.time() - start_time:.1f}s")
