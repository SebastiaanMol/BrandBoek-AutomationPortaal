import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client

from connectors.hubspot import HubSpotConnector
from mapper.hubspot_mapper import map_hubspot_workflow

load_dotenv()

# ── Supabase client ───────────────────────────────────────────────────────────
supabase: Client = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],
)

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(title="Automation Navigator API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_hubspot_connector() -> HubSpotConnector:
    key = os.environ.get("HUBSPOT_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail="HUBSPOT_API_KEY niet geconfigureerd")
    return HubSpotConnector(key)


# ── Import endpoints ──────────────────────────────────────────────────────────

@app.get("/import/hubspot/workflows")
async def list_hubspot_workflows():
    """Haal alle beschikbare HubSpot workflows op (voor de import-selector)."""
    connector = _get_hubspot_connector()
    try:
        workflows = await connector.fetch_all_workflows()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"HubSpot API fout: {e}")
    return [{"id": w["id"], "name": w.get("name", "?")} for w in workflows]


@app.post("/import/hubspot/{workflow_id}")
async def import_hubspot_workflow(workflow_id: str):
    """
    Haalt één HubSpot workflow op, mapt hem rule-based naar ons datamodel,
    en slaat het op als 'pending_approval' in Supabase.
    """
    connector = _get_hubspot_connector()
    try:
        payload = await connector.fetch_workflow(workflow_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"HubSpot API fout: {e}")

    mapped = map_hubspot_workflow(payload)
    row    = mapped.to_db_row(raw_payload=payload)

    result = (
        supabase.table("automatiseringen")
        .upsert(row, on_conflict="import_source,external_id")
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Opslaan in database mislukt")

    return {
        "status":   "pending_approval",
        "id":       row["id"],
        "proposal": mapped.__dict__,
    }


# ── Approval endpoints ────────────────────────────────────────────────────────

@app.get("/import/pending")
async def list_pending():
    """Alle automations die wachten op goedkeuring."""
    result = (
        supabase.table("automatiseringen")
        .select("id,naam,status,doel,trigger,systemen,stappen,branches,categorie,import_source,import_proposal,import_status,created_at")
        .eq("import_status", "pending_approval")
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@app.post("/import/approve/{automation_id}")
async def approve(automation_id: str, approved_by: str = Query(...)):
    """Keur een voorstel goed — automation wordt actief."""
    result = (
        supabase.table("automatiseringen")
        .update({
            "import_status": "approved",
            "approved_by":   approved_by,
            "approved_at":   datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", automation_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Automation niet gevonden")
    return {"status": "approved", "id": automation_id}


@app.post("/import/reject/{automation_id}")
async def reject(automation_id: str, reason: str = Query(default="")):
    """Wijs een voorstel af."""
    result = (
        supabase.table("automatiseringen")
        .update({
            "import_status":    "rejected",
            "rejection_reason": reason,
        })
        .eq("id", automation_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Automation niet gevonden")
    return {"status": "rejected", "id": automation_id}


@app.patch("/import/proposal/{automation_id}")
async def update_proposal(automation_id: str, updates: dict):
    """
    Sla handmatige aanpassingen op vóór goedkeuring.
    Alleen velden in 'updates' worden overschreven.
    """
    allowed = {"naam", "doel", "trigger", "systemen", "stappen", "branches", "categorie", "status"}
    patch = {k: v for k, v in updates.items() if k in allowed}
    if not patch:
        raise HTTPException(status_code=400, detail="Geen geldige velden om bij te werken")

    result = (
        supabase.table("automatiseringen")
        .update(patch)
        .eq("id", automation_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Automation niet gevonden")
    return {"status": "updated", "fields": list(patch.keys())}


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}
