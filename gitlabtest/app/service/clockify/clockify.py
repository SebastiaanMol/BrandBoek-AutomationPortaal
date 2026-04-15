from __future__ import annotations

import logging
import os
import time
from typing import Any

import requests

CLOCKIFY_API_KEY = os.getenv("CLOCKIFY_API_KEY")

CLOCKIFY_BASE_URL = "https://api.clockify.me/api/v1"
WORKSPACE_ID = os.getenv("CLOCKIFY_WORKSPACE_ID", "6194cfed6a16a7093b1fc6c6")

HEADERS = {"Content-Type": "application/json", "x-api-key": f"{CLOCKIFY_API_KEY}"}

logger = logging.getLogger(__name__)

RATE_LIMIT_DELAY = 0.03  # ~33 req/s, under Clockify's 50 req/s cap
_last_call_time = 0.0


def _respect_clockify_rate_limit() -> None:
    """Simple client-side throttle to stay under Clockify limits."""
    global _last_call_time
    now = time.time()
    elapsed = now - _last_call_time
    if elapsed < RATE_LIMIT_DELAY:
        time.sleep(RATE_LIMIT_DELAY - elapsed)
    _last_call_time = time.time()


def get_client(client_name: str) -> dict[str, list[dict[str, Any]]]:
    _respect_clockify_rate_limit()
    response = requests.get(
        f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/clients?name={client_name}",
        headers=HEADERS,
        timeout=30,
    )
    if response.status_code == 200:
        clients = response.json()
        normalized_target = client_name.strip().lower()
        active_exact = [
            c
            for c in clients
            if not c.get("archived")
            and c.get("name", "").strip().lower() == normalized_target
        ]
        archived_exact = [
            c
            for c in clients
            if c.get("archived")
            and c.get("name", "").strip().lower() == normalized_target
        ]
        logger.info(
            f"Found {len(active_exact)} active client(s) with exact name '{client_name}'. "
            f"(API returned {len(clients)} incl. archived/partial matches)"
        )
        return {"active": active_exact, "archived": archived_exact}
    logger.error(
        f"Failed to retrieve client '{client_name}'. Status code: {response.status_code}"
    )
    return {"active": [], "archived": []}


def add_client(client_name: str, note: str | None = None) -> dict[str, Any] | None:
    payload = {"name": client_name}
    if note:
        payload["note"] = note
    _respect_clockify_rate_limit()
    response = requests.post(
        f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/clients",
        headers=HEADERS,
        json=payload,
        timeout=30,
    )
    if response.status_code == 201:
        client_data = response.json()
        logger.info(f"Client '{client_name}' created with ID {client_data.get('id')}.")
        return client_data
    logger.error(
        f"Failed to create client '{client_name}'. Status code: {response.status_code}, Response: {response.text}"
    )
    return None


def add_project(project_name: str, client_id: str, color: str) -> dict[str, Any] | None:
    payload = {"name": project_name, "clientId": client_id, "color": color}
    _respect_clockify_rate_limit()
    response = requests.post(
        f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/projects",
        headers=HEADERS,
        json=payload,
        timeout=30,
    )
    if response.status_code == 201:
        return response.json()
    return None


def get_projects_for_client(client_id: str) -> list[dict[str, Any]]:
    _respect_clockify_rate_limit()
    response = requests.get(
        f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/projects?clients={client_id}",
        headers=HEADERS,
        timeout=30,
    )
    if response.status_code == 200:
        projects = response.json()
        logger.info(f"Found {len(projects)} project(s) for client '{client_id}'.")
        return projects
    logger.error(
        f"Failed to retrieve projects for client '{client_id}'. Status code: {response.status_code}"
    )
    return []


def list_clients(archived: bool = False, page_size: int = 200) -> list[dict[str, Any]]:
    clients: list[dict[str, Any]] = []
    page = 1
    while True:
        _respect_clockify_rate_limit()
        params: dict[str, str | int] = {
            "page": page,
            "page-size": page_size,
            "archived": str(archived).lower(),
        }
        response = requests.get(
            f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/clients",
            params=params,
            headers=HEADERS,
            timeout=30,
        )
        if response.status_code != 200:
            logger.error(
                f"Failed to list clients (archived={archived}, page={page}). "
                f"Status: {response.status_code}, Response: {response.text}"
            )
            break

        page_clients = response.json()
        if not page_clients:
            break

        clients.extend(page_clients)
        if len(page_clients) < page_size:
            break
        page += 1

    return clients


def get_tasks_for_project(project_id: str) -> list[dict[str, Any]]:
    _respect_clockify_rate_limit()
    response = requests.get(
        f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/projects/{project_id}/tasks",
        headers=HEADERS,
        timeout=30,
    )
    if response.status_code == 200:
        tasks = response.json()
        logger.info(f"Found {len(tasks)} task(s) for project '{project_id}'.")
        return tasks
    logger.error(
        f"Failed to retrieve tasks for project '{project_id}'. Status code: {response.status_code}"
    )
    return []


def archive_project(project_id: str) -> bool:
    payload = {"archived": True}
    _respect_clockify_rate_limit()
    response = requests.put(
        f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/projects/{project_id}",
        headers=HEADERS,
        json=payload,
        timeout=30,
    )
    if response.status_code == 200:
        logger.info(f"Project '{project_id}' archived.")
        return True
    logger.error(
        f"Failed to archive project '{project_id}'. Status code: {response.status_code}, Response: {response.text}"
    )
    return False


def unarchive_client(
    client_id: str, name: str | None = None, note: str | None = None
) -> dict[str, Any] | None:
    # Clockify requires name on update; use provided name or fetch existing first if needed.
    payload: dict[str, Any] = {"archived": False}
    if name:
        payload["name"] = name
    if note:
        payload["note"] = note
    _respect_clockify_rate_limit()
    response = requests.put(
        f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/clients/{client_id}",
        headers=HEADERS,
        json=payload,
        timeout=30,
    )
    if response.status_code == 200:
        client_data = response.json()
        logger.info(f"Client '{client_data.get('name')}' unarchived (ID: {client_id}).")
        return client_data
    logger.error(
        f"Failed to unarchive client '{client_id}'. Status code: {response.status_code}, Response: {response.text}"
    )
    return None


def delete_client(client_id: str) -> tuple[bool, str]:
    _respect_clockify_rate_limit()
    response = requests.delete(
        f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/clients/{client_id}",
        headers=HEADERS,
        timeout=30,
    )
    if response.status_code in (200, 204):
        logger.info(f"Client '{client_id}' deleted.")
        return True, ""
    logger.error(
        f"Failed to delete client '{client_id}'. Status code: {response.status_code}, Response: {response.text}"
    )
    return False, response.text or ""


def add_task(project_id: str, task_name: str) -> dict[str, Any] | None:
    payload = {"name": task_name}
    _respect_clockify_rate_limit()
    response = requests.post(
        f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/projects/{project_id}/tasks",
        headers=HEADERS,
        json=payload,
        timeout=30,
    )
    if response.status_code == 201:
        task_data = response.json()
        logger.info(
            f"Task '{task_name}' created in project '{project_id}' with ID {task_data.get('id')}."
        )
        return task_data
    logger.error(
        f"Failed to create task '{task_name}' in project '{project_id}'. Status code: {response.status_code}, Response: {response.text}"
    )
    return None


def add_new_client_with_projects(
    client_name: str, hubspot_company_id: str | None = None
) -> tuple[str, str]:
    original_name = client_name.strip()
    if len(original_name) > 100:
        logger.info(
            f"Client name '{original_name}' exceeds 100 chars. Truncating to first 100 characters."
        )
        client_name = original_name[:100]
    else:
        client_name = original_name

    existing = get_client(client_name)
    active = existing.get("active", [])
    archived = existing.get("archived", [])

    if active:
        logger.warning(
            f"Client '{client_name}' already exists (active). Skipping creation."
        )
        return "exists", "active client already exists"

    if archived:
        logger.info(
            f"Client '{client_name}' exists but is archived. Deleting and recreating."
        )
        archived_client = archived[0]
        archived_id = archived_client.get("id")
        archived_name = archived_client.get("name")
        archived_note = archived_client.get("note")
        if archived_id:
            deleted, reason = delete_client(archived_id)
            if not deleted:
                if "duplicate projects" in reason.lower():
                    logger.info(
                        "Delete blocked due to duplicate projects. Unarchiving existing client and archiving its projects instead."
                    )
                    client = unarchive_client(
                        archived_id, name=archived_name, note=archived_note
                    )
                    if not client:
                        logger.error("Unarchiving failed. Aborting project creation.")
                        return "error", "unarchiving failed"
                    for project in get_projects_for_client(archived_id):
                        project_id = project.get("id")
                        if project_id:
                            archive_project(project_id)
                else:
                    logger.error(
                        "Deleting archived client failed. Aborting project creation."
                    )
                    return "error", f"delete archived client failed: {reason}"
            else:
                client = None
        else:
            logger.error("Archived client missing ID. Aborting project creation.")
            return "error", "archived client missing id"

    note = f"HubSpot company id: {hubspot_company_id}" if hubspot_company_id else None
    if not archived or (archived and deleted):
        client = add_client(client_name, note=note)
    if not client:
        logger.error("Client creation failed. Aborting project creation.")
        return "error", "client creation failed"

    client_id = client.get("id")
    if not client_id:
        logger.error("Client created, but no ID returned. Aborting project creation.")
        return "error", "client id missing after creation"

    projects = [
        ("Omzetbelasting", "#FF8A00"),
        ("Inkomstenbelasting", "#2E8B57"),
        ("Vennootschapsbelasting", "#6A5ACD"),
        ("Loonbelasting", "#009688"),
        ("Jaarrekening", "#1976D2"),
        ("On- en offboarding", "#8D6E63"),
        ("Customer Service", "#FFB300"),
        ("CCR Team", "#455A64"),
        ("Advisering", "#D81B60"),
    ]

    tasks_by_project = {
        "Omzetbelasting": [
            "Boeken",
            "Controleren",
            "Suppletie",
        ],
        "Inkomstenbelasting": [
            "Informatie Verzamelen",
            "Samenstellen",
            "Controleren",
            "Aanpassen",
        ],
        "Vennootschapsbelasting": [
            "Opmaken",
            "Aanpassen",
        ],
        "Loonbelasting": [
            "Opzetten Salarisadministratie",
            "Contact Loonbureau",
            "Hulp Boetes Loonheffingen",
            "Overig",
        ],
        "Jaarrekening": [
            "Boeken",
            "Controleren",
            "Aanpassen / Bespreken",
            "Tussentijdse Cijfers",
        ],
        "On- en offboarding": [
            "Coordinatiewerkzaamheden",
            "Inlezen Klant",
            "Gesprek klant",
            "Nazorg Klant",
            "Offboarden Klant",
        ],
        "Customer Service": [
            "Jaarrekening",
            "Prognose",
            "IT Support",
            "Liquideren",
            "Voorlopige Aanslag IB/Vpb",
            "Aangifte dividendbelasting",
            "Bezwaarschrift",
            "Betalingsregeling",
            "IND-verklaring",
            "Box 3 - Werkelijk Rendement",
            "Tussentijdse jaarrekening",
            "Controle achterstallige periode",
        ],
        "CCR Team": [
            "IT Support",
            "Correspondentie Belastingdienst",
            "Debiteurenbeheer",
            "Dossierbeheer",
            "Klantcontact Inbox / Telefoon",
            "Loonadministratie",
            "Onboarding Klanten",
            "Overig",
        ],
        "Advisering": [
            "Advies op Uurtarief",
            "Advies Overhead",
            "Fiscale (Her)structurering",
        ],
    }

    for name, color in projects:
        new_project: dict[str, Any] | None = add_project(name, client_id, color)
        if not new_project:
            logger.error(f"Project '{name}' could not be created.")
            continue

        project_id = new_project.get("id")
        if not project_id:
            logger.error(
                f"Project '{name}' created without ID. Skipping task creation."
            )
            continue

        for task_name in tasks_by_project.get(name, []):
            add_task(project_id, task_name)

    return "created", ""


def _list_clients_by_hubspot_id(hubspot_company_id: str) -> dict[str, Any] | None:
    """Return the first client (active or archived) whose note matches the HubSpot id."""
    target_note = f"HubSpot company id: {hubspot_company_id}"
    page_size = 200
    for archived_flag in (False, True):
        page = 1
        while True:
            _respect_clockify_rate_limit()
            archived_params: dict[str, str | int] = {
                "page": page,
                "page-size": page_size,
                "archived": str(archived_flag).lower(),
            }
            response = requests.get(
                f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/clients",
                params=archived_params,
                headers=HEADERS,
                timeout=30,
            )
            if response.status_code != 200:
                logger.error(
                    f"Failed to list clients (archived={archived_flag}, page={page}). "
                    f"Status: {response.status_code}, Response: {response.text}"
                )
                break

            clients = response.json()
            if not clients:
                break

            for client in clients:
                if client.get("note") == target_note:
                    return client

            if len(clients) < page_size:
                break
            page += 1

    return None


def update_client_name_and_note(client_id: str, name: str, note: str) -> bool:
    payload = {"name": name, "note": note, "archived": False}
    _respect_clockify_rate_limit()
    response = requests.put(
        f"{CLOCKIFY_BASE_URL}/workspaces/{WORKSPACE_ID}/clients/{client_id}",
        headers=HEADERS,
        json=payload,
        timeout=30,
    )
    if response.status_code == 200:
        logger.info(f"Client '{client_id}' updated to name '{name}'.")
        return True
    logger.error(
        f"Failed to update client '{client_id}'. Status code: {response.status_code}, Response: {response.text}"
    )
    return False


def upsert_client_from_hubspot(record_id: str, company_name: str) -> tuple[str, str]:
    """
    Ensure a Clockify client exists for the given HubSpot record id.
    If found (by note), update its name (and unarchive). If not, create it with default projects/tasks.
    Returns (status, reason).
    """
    normalized_name = company_name.strip()
    if len(normalized_name) > 100:
        logger.info(
            f"Client name '{normalized_name}' exceeds 100 chars. Truncating to first 100 characters."
        )
        normalized_name = normalized_name[:100]

    note = f"HubSpot company id: {record_id}"
    existing = _list_clients_by_hubspot_id(record_id)

    if existing:
        client_id = existing.get("id")
        if not client_id:
            return "error", "existing client missing id"
        if update_client_name_and_note(client_id, normalized_name, note):
            return "updated", ""
        return "error", "failed to update existing client"

    return add_new_client_with_projects(normalized_name, hubspot_company_id=record_id)
