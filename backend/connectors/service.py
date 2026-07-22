"""Connector business logic (AD-1: service layer for cross-model operations).

Handles credential encryption, health checks, serialization, and event emission.
"""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from backend.database import Connector, new_uuid
from backend.utils.crypto import encrypt, decrypt
from backend.events.emit import emit_event
from backend.connectors.registry import get_connector

logger = logging.getLogger("orchestrator")

MASKED_CREDENTIALS = "••••••"


def create_connector(
    db: Session,
    workplace_id: str,
    name: str,
    type: str,
    config: dict = None,
    credentials: str = "",
) -> Connector:
    """Create a connector with encrypted credentials."""
    connector = Connector(
        id=new_uuid(),
        workplace_id=workplace_id,
        name=name,
        type=type,
        config=config or {},
        credentials=encrypt(credentials) if credentials else "",
        health_status="unknown",
        created_at=datetime.utcnow(),
    )
    db.add(connector)
    db.commit()
    db.refresh(connector)

    emit_event(
        db,
        workplace_id=workplace_id,
        type="connector.created",
        source_type="connector",
        source_id=connector.id,
        payload={"name": name, "connector_type": type},
    )

    return connector


def update_connector(
    db: Session,
    connector: Connector,
    name: str = None,
    config: dict = None,
    credentials: str = None,
) -> Connector:
    """Update a connector. Encrypts credentials if provided."""
    if name is not None:
        connector.name = name
    if config is not None:
        connector.config = config
    if credentials is not None:
        connector.credentials = encrypt(credentials) if credentials else ""
    db.commit()
    db.refresh(connector)
    return connector


def serialize_connector(c: Connector) -> dict:
    """Serialize connector for API response. NEVER includes decrypted credentials."""
    return {
        "id": c.id,
        "workplace_id": c.workplace_id,
        "name": c.name,
        "type": c.type,
        "config": c.config or {},
        "has_credentials": bool(c.credentials),
        "health_status": c.health_status,
        "last_checked": c.last_checked.isoformat() if c.last_checked else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


def check_health(db: Session, connector: Connector) -> dict:
    """Run health check on a connector. Updates status and emits event if changed.

    Returns dict with health_status and details.
    """
    old_status = connector.health_status
    provider = get_connector(connector.type)

    if provider is None:
        connector.health_status = "unknown"
        connector.last_checked = datetime.utcnow()
        db.commit()
        return {
            "health_status": "unknown",
            "detail": f"No provider registered for type '{connector.type}'",
        }

    try:
        decrypted_config = dict(connector.config or {})
        if connector.credentials:
            decrypted_creds = decrypt(connector.credentials)
            if decrypted_creds:
                decrypted_config["_credentials"] = decrypted_creds

        new_status = provider.health_check(decrypted_config)
        connector.health_status = new_status
    except Exception as e:
        logger.warning("Health check failed for connector %s: %s", connector.id, e)
        connector.health_status = "unreachable"
        new_status = "unreachable"

    connector.last_checked = datetime.utcnow()
    db.commit()

    if old_status != connector.health_status:
        emit_event(
            db,
            workplace_id=connector.workplace_id,
            type="connector.health_changed",
            source_type="connector",
            source_id=connector.id,
            payload={
                "name": connector.name,
                "old_status": old_status,
                "new_status": connector.health_status,
            },
        )

    return {
        "health_status": connector.health_status,
        "last_checked": connector.last_checked.isoformat(),
    }
