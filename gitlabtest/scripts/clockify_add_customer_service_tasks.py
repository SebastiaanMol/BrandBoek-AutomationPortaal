import argparse
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

load_dotenv(REPO_ROOT / ".env")

from app.service.clockify.clockify import (
    add_project,
    add_task,
    get_projects_for_client,
    get_tasks_for_project,
    list_clients,
)


TARGET_PROJECT_NAME = "CCR Team"
TARGET_PROJECT_COLOR = "#455A64"
TASKS_TO_ENSURE = [
    "IT Support",
    "Correspondentie Belastingdienst",
    "Debiteurenbeheer",
    "Dossierbeheer",
    "Klantcontact Inbox / Telefoon",
    "Loonadministratie",
    "Onboarding Klanten",
    "Overig",
]


def _normalize(name: str) -> str:
    return name.strip().lower()


def add_tasks_to_customer_service_projects(include_archived: bool = False) -> None:
    clients = list_clients(archived=False)
    if include_archived:
        clients += list_clients(archived=True)

    total_clients = len(clients)
    checked_projects = 0
    created_projects = 0
    added_tasks = 0
    skipped_tasks = 0
    failed_projects = 0
    failed_tasks = 0
    error_clients: list[str] = []

    logging.info(
        "Starting Clockify backfill for %d client(s). Target project: '%s'. Tasks to ensure: %d.",
        total_clients,
        TARGET_PROJECT_NAME,
        len(TASKS_TO_ENSURE),
    )

    for index, client in enumerate(clients, start=1):
        client_id = client.get("id")
        client_name = client.get("name") or ""
        if not client_id:
            logging.warning("Skipping client without id.")
            continue

        logging.info(
            "[%d/%d] Processing client '%s' (%s).",
            index,
            total_clients,
            client_name,
            client_id,
        )

        projects = get_projects_for_client(client_id)
        target_projects = [
            p for p in projects if _normalize(p.get("name", "")) == _normalize(TARGET_PROJECT_NAME)
        ]
        if not target_projects:
            logging.info(
                "Client '%s' has no '%s' project. Creating it.",
                client_name,
                TARGET_PROJECT_NAME,
            )
            created_project = add_project(TARGET_PROJECT_NAME, client_id, TARGET_PROJECT_COLOR)
            if not created_project:
                failed_projects += 1
                error_clients.append(client_name or f"<unknown:{client_id}>")
                logging.error(
                    "Failed to create project '%s' for client '%s' (%s).",
                    TARGET_PROJECT_NAME,
                    client_name,
                    client_id,
                )
                continue
            created_projects += 1
            target_projects = [created_project]

        for project in target_projects:
            project_id = project.get("id")
            if not project_id:
                logging.warning(
                    f"Client '{client_name}' has '{TARGET_PROJECT_NAME}' project without id."
                )
                continue

            checked_projects += 1
            existing_tasks = get_tasks_for_project(project_id)
            existing_names = {_normalize(t.get("name", "")) for t in existing_tasks}

            for task_name in TASKS_TO_ENSURE:
                if _normalize(task_name) in existing_names:
                    skipped_tasks += 1
                    continue
                if add_task(project_id, task_name):
                    added_tasks += 1
                    logging.info(
                        "Added task '%s' for client '%s' (%s).",
                        task_name,
                        client_name,
                        TARGET_PROJECT_NAME,
                    )
                else:
                    failed_tasks += 1
                    error_clients.append(client_name or f"<unknown:{client_id}>")
                    logging.error(
                        "Failed to add task '%s' for client '%s' (%s).",
                        task_name,
                        client_name,
                        TARGET_PROJECT_NAME,
                    )

    logging.info(
        "Done. Processed %d client(s). Checked %d '%s' project(s). "
        "Created %d project(s). Added %d task(s). Skipped %d existing task(s). "
        "Project errors: %d. Task errors: %d.",
        total_clients,
        checked_projects,
        TARGET_PROJECT_NAME,
        created_projects,
        added_tasks,
        skipped_tasks,
        failed_projects,
        failed_tasks,
    )
    if error_clients:
        logging.info(
            "Clients with one or more errors: %s",
            ", ".join(sorted(set(error_clients))),
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="One-time script to add Customer Service tasks to all clients."
    )
    parser.add_argument(
        "--include-archived",
        action="store_true",
        help="Also update archived clients.",
    )
    args = parser.parse_args()

    add_tasks_to_customer_service_projects(include_archived=args.include_archived)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    main()
