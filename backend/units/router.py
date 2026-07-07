"""Unit of Work CRUD and execution routes."""

import logging
import threading
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import (
    get_db,
    User,
    Workplace,
    UnitOfWork,
    Execution,
    StepResult,
    utcnow,
)
from backend.executor import run_script

logger = logging.getLogger("orchestrator")

router = APIRouter(
    prefix="/api/workplaces/{workplace_id}/units",
    tags=["units"],
)


# --- Schemas ---

class UnitCreate(BaseModel):
    name: str
    description: str = ""
    type: str = "script"  # script, http_request, llm_call, transform, condition
    script: str = ""
    config: dict = {}
    timeout: int = 300
    retry_policy: dict = {}
    enabled: bool = True
    order: int = 0
    mode: str = "independent"  # independent, chained


class UnitUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    script: Optional[str] = None
    config: Optional[dict] = None
    timeout: Optional[int] = None
    retry_policy: Optional[dict] = None
    enabled: Optional[bool] = None
    order: Optional[int] = None
    mode: Optional[str] = None


class UnitRunRequest(BaseModel):
    input_data: Optional[str] = None
    env_vars: Optional[dict] = None


# --- Helpers ---

def _get_workplace_or_404(db: Session, workplace_id: str) -> Workplace:
    workplace = db.query(Workplace).filter(Workplace.id == workplace_id).first()
    if not workplace:
        raise HTTPException(status_code=404, detail="Workplace not found")
    return workplace


def _verify_owner(workplace: Workplace, user: User):
    if workplace.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this workplace")


def _get_unit_or_404(db: Session, unit_id: str, workplace_id: str) -> UnitOfWork:
    unit = (
        db.query(UnitOfWork)
        .filter(UnitOfWork.id == unit_id, UnitOfWork.workplace_id == workplace_id)
        .first()
    )
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return unit


def _serialize_unit(unit: UnitOfWork) -> dict:
    return {
        "id": unit.id,
        "workplace_id": unit.workplace_id,
        "name": unit.name,
        "description": unit.description or "",
        "type": unit.type or "script",
        "script": unit.script or "",
        "config": unit.config or {},
        "timeout": unit.timeout or 300,
        "retry_policy": unit.retry_policy or {},
        "enabled": unit.enabled if unit.enabled is not None else True,
        "order": unit.order or 0,
        "mode": unit.mode or "independent",
        "created_at": unit.created_at.isoformat() if unit.created_at else "",
        "updated_at": unit.updated_at.isoformat() if unit.updated_at else "",
    }


def _serialize_step_result(sr: StepResult) -> dict:
    return {
        "id": sr.id,
        "execution_id": sr.execution_id,
        "unit_id": sr.unit_id,
        "status": sr.status,
        "started_at": sr.started_at.isoformat() if sr.started_at else None,
        "finished_at": sr.finished_at.isoformat() if sr.finished_at else None,
        "stdout": sr.stdout or "",
        "stderr": sr.stderr or "",
        "return_value": sr.return_value or "",
        "input_data": sr.input_data or "",
        "agent_notes": sr.agent_notes or "",
        "metrics": sr.metrics or {},
    }


def _serialize_execution(ex: Execution) -> dict:
    return {
        "id": ex.id,
        "workplace_id": ex.workplace_id,
        "pipeline_id": ex.pipeline_id,
        "unit_id": ex.unit_id,
        "agent_id": ex.agent_id,
        "trigger_type": ex.trigger_type,
        "status": ex.status,
        "started_at": ex.started_at.isoformat() if ex.started_at else None,
        "finished_at": ex.finished_at.isoformat() if ex.finished_at else None,
        "retry_count": ex.retry_count or 0,
        "agent_context": ex.agent_context,
        "created_at": ex.created_at.isoformat() if ex.created_at else "",
    }


def _execute_unit(
    workplace_id: str,
    unit_id: str,
    execution_id: str,
    step_result_id: str,
    script: str,
    timeout: int,
    input_data: Optional[str],
    env_vars: Optional[dict],
):
    """Run a unit's script in the background and update execution/step_result records."""
    from backend.database import SessionLocal

    db = SessionLocal()
    try:
        execution = db.query(Execution).filter(Execution.id == execution_id).first()
        step_result = db.query(StepResult).filter(StepResult.id == step_result_id).first()
        if not execution or not step_result:
            return

        # Mark as running
        now = utcnow()
        execution.status = "running"
        execution.started_at = now
        step_result.status = "running"
        step_result.started_at = now
        if input_data:
            step_result.input_data = input_data
        db.commit()

        # Execute
        result = run_script(
            script=script,
            input_data=input_data,
            timeout=timeout,
            env_vars=env_vars,
        )

        # Update step result
        finished = utcnow()
        step_result.status = "completed" if result.success else "failed"
        step_result.finished_at = finished
        step_result.stdout = result.stdout
        step_result.stderr = result.stderr
        step_result.return_value = result.return_value
        step_result.metrics = {
            "wall_time_seconds": result.metrics.wall_time_seconds,
            "cpu_time_seconds": result.metrics.cpu_time_seconds,
            "peak_memory_mb": result.metrics.peak_memory_mb,
        }

        # Update execution
        execution.status = "completed" if result.success else "failed"
        execution.finished_at = finished
        db.commit()

    except Exception as e:
        logger.exception(f"Error executing unit {unit_id}: {e}")
        try:
            execution = db.query(Execution).filter(Execution.id == execution_id).first()
            step_result = db.query(StepResult).filter(StepResult.id == step_result_id).first()
            if execution:
                execution.status = "failed"
                execution.finished_at = utcnow()
            if step_result:
                step_result.status = "failed"
                step_result.finished_at = utcnow()
                step_result.stderr = str(e)
            db.commit()
        except Exception:
            pass
    finally:
        db.close()


# --- Routes ---

@router.post("/", status_code=201)
def create_unit(
    workplace_id: str,
    body: UnitCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    valid_types = ("script", "http_request", "llm_call", "transform", "condition")
    if body.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {', '.join(valid_types)}")

    valid_modes = ("independent", "chained")
    if body.mode not in valid_modes:
        raise HTTPException(status_code=400, detail=f"Invalid mode. Must be one of: {', '.join(valid_modes)}")

    unit = UnitOfWork(
        workplace_id=workplace_id,
        name=body.name,
        description=body.description,
        type=body.type,
        script=body.script,
        config=body.config,
        timeout=body.timeout,
        retry_policy=body.retry_policy,
        enabled=body.enabled,
        order=body.order,
        mode=body.mode,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return _serialize_unit(unit)


@router.get("/")
def list_units(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    units = (
        db.query(UnitOfWork)
        .filter(UnitOfWork.workplace_id == workplace_id)
        .order_by(UnitOfWork.order, UnitOfWork.created_at)
        .all()
    )
    return [_serialize_unit(u) for u in units]


@router.get("/{unit_id}")
def get_unit(
    workplace_id: str,
    unit_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    unit = _get_unit_or_404(db, unit_id, workplace_id)
    return _serialize_unit(unit)


@router.put("/{unit_id}")
def update_unit(
    workplace_id: str,
    unit_id: str,
    body: UnitUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    unit = _get_unit_or_404(db, unit_id, workplace_id)

    if body.name is not None:
        unit.name = body.name
    if body.description is not None:
        unit.description = body.description
    if body.type is not None:
        valid_types = ("script", "http_request", "llm_call", "transform", "condition")
        if body.type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {', '.join(valid_types)}")
        unit.type = body.type
    if body.script is not None:
        unit.script = body.script
    if body.config is not None:
        unit.config = body.config
    if body.timeout is not None:
        unit.timeout = body.timeout
    if body.retry_policy is not None:
        unit.retry_policy = body.retry_policy
    if body.enabled is not None:
        unit.enabled = body.enabled
    if body.order is not None:
        unit.order = body.order
    if body.mode is not None:
        valid_modes = ("independent", "chained")
        if body.mode not in valid_modes:
            raise HTTPException(status_code=400, detail=f"Invalid mode. Must be one of: {', '.join(valid_modes)}")
        unit.mode = body.mode

    unit.updated_at = utcnow()
    db.commit()
    db.refresh(unit)
    return _serialize_unit(unit)


@router.delete("/{unit_id}", status_code=204)
def delete_unit(
    workplace_id: str,
    unit_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    unit = _get_unit_or_404(db, unit_id, workplace_id)
    db.delete(unit)
    db.commit()
    return None


@router.post("/{unit_id}/run")
def run_unit(
    workplace_id: str,
    unit_id: str,
    body: UnitRunRequest = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Execute a unit in the background. Returns the execution record immediately."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    unit = _get_unit_or_404(db, unit_id, workplace_id)

    if unit.type != "script":
        raise HTTPException(status_code=400, detail="Only script-type units can be executed directly")

    if not unit.script or not unit.script.strip():
        raise HTTPException(status_code=400, detail="Unit has no script to execute")

    # Create execution record
    execution = Execution(
        workplace_id=workplace_id,
        unit_id=unit_id,
        trigger_type="manual",
        status="pending",
    )
    db.add(execution)
    db.flush()

    # Create step result record
    step_result = StepResult(
        execution_id=execution.id,
        unit_id=unit_id,
        status="pending",
    )
    db.add(step_result)
    db.commit()
    db.refresh(execution)
    db.refresh(step_result)

    input_data = body.input_data if body else None
    env_vars = body.env_vars if body else None

    # Run in background thread
    thread = threading.Thread(
        target=_execute_unit,
        args=(
            workplace_id,
            unit_id,
            execution.id,
            step_result.id,
            unit.script,
            unit.timeout or 300,
            input_data,
            env_vars,
        ),
        daemon=True,
    )
    thread.start()

    return _serialize_execution(execution)


@router.post("/{unit_id}/test")
def test_unit(
    workplace_id: str,
    unit_id: str,
    body: UnitRunRequest = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Execute a unit synchronously and return the result immediately."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    unit = _get_unit_or_404(db, unit_id, workplace_id)

    if unit.type != "script":
        raise HTTPException(status_code=400, detail="Only script-type units can be tested directly")

    if not unit.script or not unit.script.strip():
        raise HTTPException(status_code=400, detail="Unit has no script to execute")

    input_data = body.input_data if body else None
    env_vars = body.env_vars if body else None

    # Create execution record
    now = utcnow()
    execution = Execution(
        workplace_id=workplace_id,
        unit_id=unit_id,
        trigger_type="manual",
        status="running",
        started_at=now,
    )
    db.add(execution)
    db.flush()

    step_result = StepResult(
        execution_id=execution.id,
        unit_id=unit_id,
        status="running",
        started_at=now,
    )
    if input_data:
        step_result.input_data = input_data
    db.add(step_result)
    db.commit()
    db.refresh(execution)
    db.refresh(step_result)

    # Execute synchronously
    result = run_script(
        script=unit.script,
        input_data=input_data,
        timeout=unit.timeout or 300,
        env_vars=env_vars,
    )

    # Update records
    finished = utcnow()
    step_result.status = "completed" if result.success else "failed"
    step_result.finished_at = finished
    step_result.stdout = result.stdout
    step_result.stderr = result.stderr
    step_result.return_value = result.return_value
    step_result.metrics = {
        "wall_time_seconds": result.metrics.wall_time_seconds,
        "cpu_time_seconds": result.metrics.cpu_time_seconds,
        "peak_memory_mb": result.metrics.peak_memory_mb,
    }

    execution.status = "completed" if result.success else "failed"
    execution.finished_at = finished
    db.commit()
    db.refresh(execution)
    db.refresh(step_result)

    return {
        "execution": _serialize_execution(execution),
        "result": _serialize_step_result(step_result),
    }
