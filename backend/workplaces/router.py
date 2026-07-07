"""Workplace CRUD routes."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.auth import get_current_user
from backend.database import get_db, User, Workplace, UnitOfWork, Execution, utcnow

logger = logging.getLogger("orchestrator")

router = APIRouter(prefix="/api/workplaces", tags=["workplaces"])


# --- Schemas ---

class WorkplaceCreate(BaseModel):
    name: str
    description: str = ""
    config: dict = {}


class WorkplaceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    config: Optional[dict] = None


class WorkplaceResponse(BaseModel):
    id: str
    name: str
    description: str
    owner_id: str
    status: str
    config: dict
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class DashboardResponse(BaseModel):
    workplace_id: str
    workplace_name: str
    unit_count: int
    execution_count: int
    last_run: str | None
    status_summary: dict


# --- Helpers ---

def _get_workplace_or_404(db: Session, workplace_id: str) -> Workplace:
    workplace = db.query(Workplace).filter(Workplace.id == workplace_id).first()
    if not workplace:
        raise HTTPException(status_code=404, detail="Workplace not found")
    return workplace


def _verify_owner(workplace: Workplace, user: User):
    if workplace.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this workplace")


def _serialize_workplace(wp: Workplace) -> dict:
    return {
        "id": wp.id,
        "name": wp.name,
        "description": wp.description or "",
        "owner_id": wp.owner_id,
        "status": wp.status or "active",
        "config": wp.config or {},
        "created_at": wp.created_at.isoformat() if wp.created_at else "",
        "updated_at": wp.updated_at.isoformat() if wp.updated_at else "",
    }


# --- Routes ---

@router.post("/", status_code=201)
def create_workplace(
    body: WorkplaceCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = Workplace(
        name=body.name,
        description=body.description,
        owner_id=user.id,
        status="active",
        config=body.config,
    )
    db.add(workplace)
    db.commit()
    db.refresh(workplace)
    return _serialize_workplace(workplace)


@router.get("/")
def list_workplaces(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplaces = (
        db.query(Workplace)
        .filter(Workplace.owner_id == user.id)
        .order_by(Workplace.created_at.desc())
        .all()
    )
    return [_serialize_workplace(wp) for wp in workplaces]


@router.get("/{workplace_id}")
def get_workplace(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    return _serialize_workplace(workplace)


@router.put("/{workplace_id}")
def update_workplace(
    workplace_id: str,
    body: WorkplaceUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    if body.name is not None:
        workplace.name = body.name
    if body.description is not None:
        workplace.description = body.description
    if body.status is not None:
        if body.status not in ("active", "paused", "archived"):
            raise HTTPException(status_code=400, detail="Invalid status. Must be: active, paused, archived")
        workplace.status = body.status
    if body.config is not None:
        workplace.config = body.config

    workplace.updated_at = utcnow()
    db.commit()
    db.refresh(workplace)
    return _serialize_workplace(workplace)


@router.delete("/{workplace_id}", status_code=204)
def delete_workplace(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    db.delete(workplace)
    db.commit()
    return None


@router.get("/{workplace_id}/dashboard")
def get_dashboard(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    unit_count = db.query(func.count(UnitOfWork.id)).filter(UnitOfWork.workplace_id == workplace_id).scalar()
    execution_count = db.query(func.count(Execution.id)).filter(Execution.workplace_id == workplace_id).scalar()

    last_execution = (
        db.query(Execution)
        .filter(Execution.workplace_id == workplace_id)
        .order_by(Execution.created_at.desc())
        .first()
    )
    last_run = last_execution.created_at.isoformat() if last_execution and last_execution.created_at else None

    # Status summary: count executions by status
    status_rows = (
        db.query(Execution.status, func.count(Execution.id))
        .filter(Execution.workplace_id == workplace_id)
        .group_by(Execution.status)
        .all()
    )
    status_summary = {row[0]: row[1] for row in status_rows}

    return {
        "workplace_id": workplace_id,
        "workplace_name": workplace.name,
        "unit_count": unit_count,
        "execution_count": execution_count,
        "last_run": last_run,
        "status_summary": status_summary,
    }
