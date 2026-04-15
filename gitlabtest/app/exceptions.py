"""Domain exceptions for the automations service.

The repository layer raises these instead of FastAPI HTTPException so that
business logic stays decoupled from the HTTP transport layer.  The API layer
(app/API/) is responsible for catching these and converting to HTTPException.
"""

from __future__ import annotations


class HubSpotError(Exception):
    """Base class for HubSpot-related errors."""


class HubSpotNotFoundError(HubSpotError):
    """Raised when a required HubSpot object or association cannot be found."""


class HubSpotAPIError(HubSpotError):
    """Raised when a HubSpot API call fails with an unexpected error."""


class SalesLeadError(Exception):
    """Raised when processing a sales lead fails (contact, company, or deal creation)."""


class WefactError(Exception):
    """Raised when a Wefact API call fails."""
