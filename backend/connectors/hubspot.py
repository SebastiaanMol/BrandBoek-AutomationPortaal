import httpx
from .base import BaseConnector

HUBSPOT_API = "https://api.hubapi.com"


class HubSpotConnector(BaseConnector):
    def __init__(self, api_key: str):
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    async def fetch_all_workflows(self) -> list[dict]:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{HUBSPOT_API}/automation/v3/workflows",
                headers=self.headers,
            )
            r.raise_for_status()
            return r.json().get("workflows", [])

    async def fetch_workflow(self, workflow_id: str) -> dict:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{HUBSPOT_API}/automation/v3/workflows/{workflow_id}",
                headers=self.headers,
            )
            r.raise_for_status()
            return r.json()
