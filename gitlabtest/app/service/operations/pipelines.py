from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

import requests
import sentry_sdk

import app.repository.hubspot as hubspot_calls
from app.hubspot_client import get_hs_headers
from app.service.operations.constants import CONTINUOUS_PIPELINE_ID_LIST
from app.service.operations.constants import CONTROLE_PIPELINE_ID_LIST
from app.service.rate_limiter import call_hubspot_api

headers = get_hs_headers()
logger = logging.getLogger(__name__)


async def _get_filtered_pipelines(predicate: Callable[[Any], bool]) -> list[Any]:
    all_pipelines = await call_hubspot_api(hubspot_calls.get_all_pipelines)
    if not all_pipelines:
        logger.error("No pipelines found: error")
        return []
    return [p for p in all_pipelines.results if predicate(p)]


async def get_active_pipelines() -> list[Any]:
    """Finds active pipelines - all pipelines in HubSpot without an *."""
    return await _get_filtered_pipelines(lambda p: "*" not in p.label)


async def get_continuous_pipelines() -> list[Any]:
    """Get the continuous pipelines by their IDs."""
    return await _get_filtered_pipelines(
        lambda p: str(p.id) in CONTINUOUS_PIPELINE_ID_LIST
    )


async def get_controle_pipelines() -> list[Any]:
    """Get the controle pipelines by their IDs."""
    return await _get_filtered_pipelines(
        lambda p: str(p.id) in CONTROLE_PIPELINE_ID_LIST
    )


async def get_pipeline_info(pipeline_label: str) -> Any | None:
    """Gets pipeline info from the pipeline label.

    Args:
        pipeline_label (str): Label of the pipeline.

    Returns:
        Pipeline: The matching pipeline object, or None if not found.
    """

    active_pipelines = await get_active_pipelines()
    return next(
        (pipeline for pipeline in active_pipelines if pipeline_label == pipeline.label),
        None,
    )


def clean_pipeline_label(label: str) -> str:
    """Cleans the pipeline label by removing unnecessary parts.

    Args:
        label (str): The pipeline label to clean.

    Returns:
        str: The cleaned pipeline label.
    """
    import re

    pipeline_label_unfinished = label.rsplit(" ", 1)[0]
    pattern = r"[0-9]"
    pipeline_label = re.sub(pattern, "", pipeline_label_unfinished)

    if pipeline_label.endswith("-"):
        pipeline_label = pipeline_label.rsplit("-", 1)[0].strip()

    if pipeline_label.startswith("Kopie van"):
        pipeline_label = pipeline_label.split(" ", 2)[2].strip()

    return pipeline_label


def get_all_workflows() -> list:
    """MAKES A CALL TO HUBSPOT API
    Fetches all workflows from HubSpot using the v4 API and the provided access token.

    Returns:
        list: A list of workflows.
    """
    url = "https://api.hubapi.com/automation/v4/flows"

    workflows = []
    offset = None

    while True:
        params = {"limit": "100"}
        if offset:
            # Use 'after' not 'offset' in v4 pagination
            params["after"] = offset

        response = requests.get(url, headers=headers, params=params)

        if response.status_code != 200:
            logger.error(f"Error fetching workflows: {response.text}")
            break

        data = response.json()
        results = data.get("results", [])
        workflows.extend(results)

        logger.info(f"Fetched {len(results)} workflows. Total so far: {len(workflows)}")

        # Handle pagination
        paging = data.get("paging", {})
        next_page = paging.get("next", {})
        offset = next_page.get("after")

        if not offset:
            break

    return workflows


def get_pipeline_and_stage_ids(pipeline_label: str) -> list:
    """MAKES A CALL TO HUBSPOT API
    Fetches pipeline and stage IDs from HubSpot using the v4 API.

    Args:
        pipeline_label (str): The label of the pipeline to search for.

    Returns:
        list: A list containing the pipeline ID and stage IDs.
    """

    url = "https://api.hubapi.com/crm/v3/pipelines/deals"

    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        pipelines = response.json().get("results", [])

        for pipeline in pipelines:
            if pipeline["label"].lower() == pipeline_label.lower():
                pipeline_id = pipeline["id"]
                stage_ids = [stage["id"] for stage in pipeline.get("stages", [])]
                return [pipeline_id] + stage_ids  # single list output

        return []  # Not found

    except requests.exceptions.RequestException as e:
        sentry_sdk.capture_exception(e)
        logger.exception(f"Request failed: {e}")
        return []


def get_workflow_detail_keywords(
    wf_id: str, wf_name: str, keywords: list[str]
) -> dict[str, str] | None:
    """MAKES A CALL TO HUBSPOT API
    Fetches workflow details and checks for the presence of keywords.

    Args:
        wf_id (str): Workflow ID.
        wf_name (str): Workflow name.
        keywords (list): List of keywords to search for.

    Returns:
        dict or None: Dictionary with workflow info and found keywords, or None if no keywords found.
    """

    detail_url = f"https://api.hubapi.com/automation/v4/flows/{wf_id}"
    detail_res = requests.get(detail_url, headers=headers)
    detail_data = detail_res.json()

    detail_str = str(detail_data).lower()
    found_keywords = [kw for kw in keywords if kw.lower() in detail_str]

    if found_keywords:
        return {
            "workflow_id": wf_id,
            "workflow_name": wf_name,
            "found_keywords": ", ".join(found_keywords),
        }
    return None


async def search_workflows(pipeline_label: str) -> list:
    """Searches for workflows that use a specific pipeline label.

    Args:
        pipeline_label (str): The label of the pipeline to search for.

    Returns:
        list: A list of workflows that use the specified pipeline label.
    """

    workflows = await call_hubspot_api(get_all_workflows)
    keywords = await call_hubspot_api(get_pipeline_and_stage_ids, pipeline_label)
    results = []

    for wf in workflows:
        wf_id = wf["id"]
        wf_name = wf["name"]

        result = await call_hubspot_api(
            get_workflow_detail_keywords, wf_id, wf_name, keywords
        )
        if result:
            results.append(result)

    return results


def clone_pipeline(
    old_pipeline_id: str, new_pipeline_label: str
) -> dict[str, Any] | None:
    """MAKES A CALL TO HUBSPOT API
    Clones an existing pipeline by its ID and creates a new pipeline with the same stages.

    Args:
        old_pipeline_id (str): The ID of the pipeline to clone.
        new_pipeline_label (str): The label for the new pipeline.

    Returns:
        dict: The newly created pipeline object if successful, or None if failed.
    """

    # Get existing pipeline
    get_url = f"https://api.hubapi.com/crm/v3/pipelines/deals/{old_pipeline_id}"
    get_resp = requests.get(get_url, headers=headers)

    if get_resp.status_code != 200:
        logger.error(f"Failed to fetch old pipeline: {get_resp.text}")
        return None

    old_pipeline = get_resp.json()

    # Create a new pipeline with same stages
    new_pipeline_data = {
        "label": new_pipeline_label,
        "displayOrder": old_pipeline.get("displayOrder", 0),
        "stages": [
            {
                "label": stage["label"],
                "displayOrder": stage["displayOrder"],
                "metadata": stage.get("metadata", {}),
                "probability": stage.get("probability"),
                "stageId": stage["stageId"] + "_copy",  # stageId must be unique
            }
            for stage in old_pipeline.get("stages", [])
        ],
    }

    post_url = "https://api.hubapi.com/crm/v3/pipelines/deals"
    post_resp = requests.post(post_url, headers=headers, json=new_pipeline_data)

    if post_resp.status_code == 201:
        logger.info(f"Successfully cloned pipeline: {new_pipeline_label}")
        return post_resp.json()
    logger.error(f"Failed to create new pipeline: {post_resp.text}")
    return None


def serialize_pipeline(pipeline: Any) -> dict[str, Any]:
    return {
        "id": getattr(pipeline, "id", None),
        "label": getattr(pipeline, "label", None),
    }
