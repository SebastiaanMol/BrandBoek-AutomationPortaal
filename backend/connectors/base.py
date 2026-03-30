from abc import ABC, abstractmethod


class BaseConnector(ABC):
    """Every source connector must implement this interface."""

    @abstractmethod
    async def fetch_workflow(self, workflow_id: str) -> dict:
        """Fetch a single workflow by ID and return the raw payload."""
        ...

    @abstractmethod
    async def fetch_all_workflows(self) -> list[dict]:
        """Fetch all available workflows."""
        ...
