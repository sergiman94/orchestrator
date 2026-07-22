"""Centralized event emission utility (AD-4, AD-16).

All system actions emit events through this function.
Event emission NEVER raises — failures are logged and swallowed.
source_type is validated against a constrained enum.
"""

import logging
from datetime import datetime

from backend.database import Event, new_uuid

logger = logging.getLogger("orchestrator")

VALID_SOURCE_TYPES = frozenset({
    "unit",
    "pipeline",
    "agent",
    "asset",
    "connector",
    "channel",
    "memory",
    "system",
    "user",
})


def emit_event(
    db,
    workplace_id: str,
    type: str,
    source_type: str,
    source_id: str,
    payload: dict = None,
) -> None:
    """Persist a structured event to the Event table.

    Args:
        db: SQLAlchemy session
        workplace_id: Workplace this event belongs to
        type: Dot-notation event type (e.g., "unit.completed", "agent.invoked")
        source_type: Must be one of VALID_SOURCE_TYPES
        source_id: UUID of the entity identified by source_type
        payload: Optional JSON payload with event details

    Never raises. Logs warnings on validation or persistence failures.
    """
    try:
        if source_type not in VALID_SOURCE_TYPES:
            logger.warning(
                "Invalid event source_type '%s' (valid: %s). Event will still be persisted.",
                source_type,
                ", ".join(sorted(VALID_SOURCE_TYPES)),
            )

        event = Event(
            id=new_uuid(),
            workplace_id=workplace_id,
            type=type or "",
            source_type=source_type or "system",
            source_id=source_id or "",
            payload=payload or {},
            created_at=datetime.utcnow(),
        )
        db.add(event)
        db.commit()
    except Exception:
        logger.warning("Failed to emit event type='%s': rolling back", type, exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass
