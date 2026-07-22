"""Connector protocol and type registry (AD-2).

All connector implementations must satisfy BaseConnector.
Registry maps type strings to implementation classes.
Providers are registered in Story 1.3.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Protocol, runtime_checkable


@dataclass
class ConnectorResult:
    """Uniform result from connector execution."""
    data: Any = None
    record_count: int = 0
    metadata: dict = field(default_factory=dict)


@runtime_checkable
class BaseConnector(Protocol):
    """Protocol that all connector implementations must satisfy."""

    def execute(self, config: dict, params: dict) -> ConnectorResult:
        """Execute the connector operation."""
        ...

    def health_check(self, config: dict) -> str:
        """Check health. Returns 'healthy', 'degraded', or 'unreachable'."""
        ...

    def get_metadata(self, config: dict) -> dict:
        """Return schema/structure info for memory ingestion."""
        ...


# Type → class registry. Populated by providers in Story 1.3.
_CONNECTOR_REGISTRY: Dict[str, type] = {}


def register_connector(type_str: str, cls: type) -> None:
    """Register a connector implementation class for a type string."""
    _CONNECTOR_REGISTRY[type_str] = cls


def get_connector(type_str: str) -> Optional[BaseConnector]:
    """Get a connector instance by type string.

    Returns None if the type is not registered.
    """
    cls = _CONNECTOR_REGISTRY.get(type_str)
    if cls is None:
        return None
    return cls()


def get_registered_types() -> list:
    """Return list of registered connector type strings."""
    return list(_CONNECTOR_REGISTRY.keys())
