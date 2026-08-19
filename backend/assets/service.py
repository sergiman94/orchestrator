"""Asset business logic (AD-13: only this module writes Asset.health_status).

Handles health checks, credential encryption, scheduling, and event emission.
"""

import logging
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from backend.database import Asset, new_uuid
from backend.utils.crypto import encrypt, decrypt
from backend.events.emit import emit_event

logger = logging.getLogger("orchestrator")


def create_asset(
    db: Session,
    workplace_id: str,
    name: str,
    type: str,
    config: dict = None,
    credentials: str = "",
    check_interval: int = 300,
) -> Asset:
    asset = Asset(
        id=new_uuid(),
        workplace_id=workplace_id,
        name=name,
        type=type,
        config=config or {},
        credentials=encrypt(credentials) if credentials else "",
        health_status="unknown",
        check_interval=check_interval,
        created_at=datetime.utcnow(),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    emit_event(
        db,
        workplace_id=workplace_id,
        type="asset.created",
        source_type="asset",
        source_id=asset.id,
        payload={"name": name, "asset_type": type},
    )
    return asset


def update_asset(
    db: Session,
    asset: Asset,
    name: str = None,
    config: dict = None,
    credentials: str = None,
    check_interval: int = None,
) -> Asset:
    if name is not None:
        asset.name = name
    if config is not None:
        asset.config = config
    if credentials is not None:
        asset.credentials = encrypt(credentials) if credentials else ""
    if check_interval is not None:
        asset.check_interval = check_interval
    db.commit()
    db.refresh(asset)
    return asset


def serialize_asset(a: Asset) -> dict:
    return {
        "id": a.id,
        "workplace_id": a.workplace_id,
        "name": a.name,
        "type": a.type,
        "config": a.config or {},
        "has_credentials": bool(a.credentials),
        "health_status": a.health_status,
        "last_checked": a.last_checked.isoformat() if a.last_checked else None,
        "check_interval": a.check_interval,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def check_health(db: Session, asset: Asset) -> dict:
    """Run health check on an asset. Only this function writes health_status (AD-13)."""
    old_status = asset.health_status

    try:
        config = dict(asset.config or {})
        if asset.credentials:
            decrypted = decrypt(asset.credentials)
            if decrypted:
                config["_credentials"] = decrypted

        new_status = _perform_health_check(asset.type, config)
        asset.health_status = new_status
    except Exception as e:
        logger.warning("Health check failed for asset %s: %s", asset.id, e)
        asset.health_status = "unreachable"

    asset.last_checked = datetime.utcnow()
    db.commit()

    if old_status != asset.health_status:
        emit_event(
            db,
            workplace_id=asset.workplace_id,
            type="asset.health_changed",
            source_type="asset",
            source_id=asset.id,
            payload={
                "name": asset.name,
                "asset_type": asset.type,
                "old_status": old_status,
                "new_status": asset.health_status,
            },
        )

    return {
        "health_status": asset.health_status,
        "last_checked": asset.last_checked.isoformat(),
        "changed": old_status != asset.health_status,
    }


def _perform_health_check(asset_type: str, config: dict) -> str:
    """Type-appropriate health check. Returns healthy/degraded/unreachable."""
    if asset_type == "database":
        return _check_database(config)
    elif asset_type == "api":
        return _check_api(config)
    elif asset_type == "aws_service":
        return _check_aws(config)
    elif asset_type == "storage":
        return _check_api(config)  # storage usually has an HTTP endpoint
    else:
        return _check_api(config) if config.get("url") or config.get("base_url") else "unknown"


def _check_database(config: dict) -> str:
    import psycopg2
    conn_string = config.get("connection_string", "")
    creds = config.get("_credentials", "")
    try:
        if conn_string:
            if creds and "password" not in conn_string:
                conn_string += f" password={creds}"
            conn = psycopg2.connect(conn_string)
        else:
            conn = psycopg2.connect(
                host=config.get("host", "localhost"),
                port=config.get("port", 5432),
                dbname=config.get("dbname", ""),
                user=config.get("user", ""),
                password=creds or "",
            )
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        return "healthy"
    except Exception as e:
        logger.warning("Database health check failed: %s", e)
        return "unreachable"


def _check_api(config: dict) -> str:
    url = config.get("url") or config.get("base_url", "")
    if not url:
        return "unknown"
    try:
        with httpx.Client(timeout=10) as client:
            r = client.head(url)
            return "healthy" if r.status_code < 500 else "degraded"
    except Exception as e:
        logger.warning("API health check failed: %s", e)
        return "unreachable"


def _check_aws(config: dict) -> str:
    import boto3
    import json
    try:
        creds = config.get("_credentials", "")
        kwargs = {"region_name": config.get("region", "us-east-1")}
        if creds:
            try:
                cred_data = json.loads(creds) if isinstance(creds, str) else creds
                kwargs["aws_access_key_id"] = cred_data.get("access_key_id", "")
                kwargs["aws_secret_access_key"] = cred_data.get("secret_access_key", "")
            except (json.JSONDecodeError, AttributeError):
                pass
        service = config.get("service", "s3")
        client = boto3.client(service, **kwargs)
        # Generic check: call a harmless API
        if service == "s3":
            client.list_buckets()
        return "healthy"
    except Exception as e:
        logger.warning("AWS health check failed: %s", e)
        return "unreachable"
