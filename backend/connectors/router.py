"""Connector CRUD routes.

Prefix: /api/workplaces/{workplace_id}/connectors
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import get_db, User, Workplace, Connector
from backend.connectors.service import (
    create_connector,
    update_connector,
    serialize_connector,
    check_health,
)

logger = logging.getLogger("orchestrator")

router = APIRouter(
    prefix="/api/workplaces/{workplace_id}/connectors",
    tags=["connectors"],
)


# --- Pydantic Schemas ---

class ConnectorCreate(BaseModel):
    name: str
    type: str
    config: dict = {}
    credentials: str = ""


class ConnectorUpdate(BaseModel):
    name: Optional[str] = None
    config: Optional[dict] = None
    credentials: Optional[str] = None


# --- Helpers ---

def _get_workplace_or_404(db: Session, workplace_id: str, user: User):
    wp = (
        db.query(Workplace)
        .filter(Workplace.id == workplace_id, Workplace.owner_id == user.id)
        .first()
    )
    if not wp:
        raise HTTPException(status_code=404, detail="Workplace not found")
    return wp


def _get_connector_or_404(db: Session, workplace_id: str, connector_id: str):
    connector = (
        db.query(Connector)
        .filter(Connector.id == connector_id, Connector.workplace_id == workplace_id)
        .first()
    )
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    return connector


# --- Routes ---

@router.post("", status_code=201)
def create_connector_route(
    workplace_id: str,
    body: ConnectorCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    connector = create_connector(
        db,
        workplace_id=workplace_id,
        name=body.name,
        type=body.type,
        config=body.config,
        credentials=body.credentials,
    )
    return serialize_connector(connector)


@router.get("")
def list_connectors(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    connectors = (
        db.query(Connector)
        .filter(Connector.workplace_id == workplace_id)
        .order_by(Connector.created_at)
        .all()
    )
    return [serialize_connector(c) for c in connectors]


@router.get("/{connector_id}")
def get_connector(
    workplace_id: str,
    connector_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    connector = _get_connector_or_404(db, workplace_id, connector_id)
    return serialize_connector(connector)


@router.put("/{connector_id}")
def update_connector_route(
    workplace_id: str,
    connector_id: str,
    body: ConnectorUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    connector = _get_connector_or_404(db, workplace_id, connector_id)
    updated = update_connector(
        db,
        connector,
        name=body.name,
        config=body.config,
        credentials=body.credentials,
    )
    return serialize_connector(updated)


@router.delete("/{connector_id}", status_code=204)
def delete_connector(
    workplace_id: str,
    connector_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    connector = _get_connector_or_404(db, workplace_id, connector_id)
    db.delete(connector)
    db.commit()
    return Response(status_code=204)


@router.get("/{connector_id}/health")
def check_connector_health(
    workplace_id: str,
    connector_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _get_workplace_or_404(db, workplace_id, user)
    connector = _get_connector_or_404(db, workplace_id, connector_id)
    result = check_health(db, connector)
    return result
