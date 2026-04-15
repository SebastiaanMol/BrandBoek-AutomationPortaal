"""Common type aliases used across the application."""

from __future__ import annotations

from typing import Any

# HubSpot-related types
HubSpotProperties = dict[str, str]
HubSpotObject = dict[str, Any]

# ID types (HubSpot IDs can be int or str depending on context)
DealId = int | str
ContactId = int | str
CompanyId = int | str
OwnerId = int | str
PipelineId = str
StageId = str
DossierId = str
