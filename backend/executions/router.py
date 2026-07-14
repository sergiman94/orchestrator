"""Execution history routes."""

import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import (
    get_db, User, Workplace, Execution, StepResult, UnitOfWork, Step, utcnow,
)

logger = logging.getLogger("orchestrator")

wp_router = APIRouter(
    prefix="/api/workplaces/{workplace_id}/executions",
    tags=["executions"],
    redirect_slashes=False,
)

detail_router = APIRouter(
    prefix="/api/executions",
    tags=["executions"],
    redirect_slashes=False,
)


def _verify_workplace(db, workplace_id, user):
    wp = db.query(Workplace).filter(Workplace.id == workplace_id).first()
    if not wp:
        raise HTTPException(404, "Workplace not found")
    if wp.owner_id != user.id:
        raise HTTPException(403, "Not your workplace")
    return wp


def _serialize_execution(exe, unit_name=None):
    return {
        "id": exe.id,
        "workplace_id": exe.workplace_id,
        "unit_id": exe.unit_id,
        "unit_name": unit_name or "",
        "pipeline_id": exe.pipeline_id,
        "agent_id": exe.agent_id,
        "trigger_type": exe.trigger_type,
        "status": exe.status,
        "started_at": exe.started_at.isoformat() if exe.started_at else None,
        "finished_at": exe.finished_at.isoformat() if exe.finished_at else None,
        "retry_count": exe.retry_count,
        "agent_context": exe.agent_context,
        "created_at": exe.created_at.isoformat() if exe.created_at else None,
    }


# --- Workplace-scoped routes ---

@wp_router.get("/active")
def list_active(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _verify_workplace(db, workplace_id, user)
    execs = (
        db.query(Execution)
        .filter(Execution.workplace_id == workplace_id, Execution.status.in_(["running", "pending"]))
        .order_by(Execution.started_at.desc())
        .all()
    )
    results = []
    for exe in execs:
        unit = db.query(UnitOfWork).filter(UnitOfWork.id == exe.unit_id).first() if exe.unit_id else None
        results.append(_serialize_execution(exe, unit.name if unit else ""))
    return results


@wp_router.get("")
def list_executions(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _verify_workplace(db, workplace_id, user)
    execs = (
        db.query(Execution)
        .filter(Execution.workplace_id == workplace_id)
        .order_by(Execution.started_at.desc())
        .limit(100)
        .all()
    )
    results = []
    for exe in execs:
        unit = db.query(UnitOfWork).filter(UnitOfWork.id == exe.unit_id).first() if exe.unit_id else None
        results.append(_serialize_execution(exe, unit.name if unit else ""))
    return results


# --- Detail route (not scoped to workplace in URL) ---

@detail_router.get("/{execution_id}")
def get_execution(
    execution_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    exe = db.query(Execution).filter(Execution.id == execution_id).first()
    if not exe:
        raise HTTPException(404, "Execution not found")

    # Verify ownership
    wp = db.query(Workplace).filter(Workplace.id == exe.workplace_id).first()
    if not wp or wp.owner_id != user.id:
        raise HTTPException(403, "Not your execution")

    unit = db.query(UnitOfWork).filter(UnitOfWork.id == exe.unit_id).first() if exe.unit_id else None

    # Get step results
    step_results = (
        db.query(StepResult)
        .filter(StepResult.execution_id == execution_id)
        .order_by(StepResult.started_at)
        .all()
    )

    sr_list = []
    for sr in step_results:
        step = db.query(Step).filter(Step.id == sr.step_id).first() if sr.step_id else None
        sr_list.append({
            "id": sr.id,
            "step_id": sr.step_id,
            "step_name": step.name if step else "Unknown",
            "status": sr.status,
            "started_at": sr.started_at.isoformat() if sr.started_at else None,
            "finished_at": sr.finished_at.isoformat() if sr.finished_at else None,
            "stdout": sr.stdout or "",
            "stderr": sr.stderr or "",
            "return_value": sr.return_value or "",
            "input_data": sr.input_data or "",
            "agent_notes": sr.agent_notes or "",
            "metrics": sr.metrics or {},
        })

    result = _serialize_execution(exe, unit.name if unit else "")
    result["step_results"] = sr_list
    return result
