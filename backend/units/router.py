"""Unit of Work CRUD, Steps CRUD, and execution routes."""

import logging
import threading
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import (
    get_db,
    User,
    Workplace,
    UnitOfWork,
    Step,
    Execution,
    StepResult,
    utcnow,
)
from backend.executor import run_script

logger = logging.getLogger("orchestrator")

router = APIRouter(
    prefix="/api/workplaces/{workplace_id}/units",
    tags=["units"],
    redirect_slashes=False,
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class UnitCreate(BaseModel):
    name: str
    description: str = ""
    type: str = "script"  # script, http_request, llm_call, transform, condition
    config: dict = {}
    retry_policy: dict = {}
    enabled: bool = True
    order: int = 0


class UnitUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    config: Optional[dict] = None
    retry_policy: Optional[dict] = None
    enabled: Optional[bool] = None
    order: Optional[int] = None


class StepCreate(BaseModel):
    name: str
    order: int = 0
    script: str = ""
    mode: str = "independent"  # independent, chained
    timeout: int = 300


class StepUpdate(BaseModel):
    name: Optional[str] = None
    order: Optional[int] = None
    script: Optional[str] = None
    mode: Optional[str] = None
    timeout: Optional[int] = None


class StepReorder(BaseModel):
    step_ids: List[str]


class UnitRunRequest(BaseModel):
    input_data: Optional[str] = None
    env_vars: Optional[dict] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

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


def _get_step_or_404(db: Session, step_id: str, unit_id: str) -> Step:
    step = (
        db.query(Step)
        .filter(Step.id == step_id, Step.unit_id == unit_id)
        .first()
    )
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    return step


def _serialize_step(step: Step) -> dict:
    return {
        "id": step.id,
        "unit_id": step.unit_id,
        "name": step.name,
        "order": step.order,
        "script": step.script or "",
        "mode": step.mode or "independent",
        "timeout": step.timeout or 300,
        "created_at": step.created_at.isoformat() if step.created_at else "",
    }


def _serialize_unit(unit: UnitOfWork) -> dict:
    return {
        "id": unit.id,
        "workplace_id": unit.workplace_id,
        "name": unit.name,
        "description": unit.description or "",
        "type": unit.type or "script",
        "config": unit.config or {},
        "retry_policy": unit.retry_policy or {},
        "enabled": unit.enabled if unit.enabled is not None else True,
        "order": unit.order or 0,
        "step_count": len(unit.steps) if unit.steps else 0,
        "steps": [_serialize_step(s) for s in (unit.steps or [])],
        "created_at": unit.created_at.isoformat() if unit.created_at else "",
        "updated_at": unit.updated_at.isoformat() if unit.updated_at else "",
    }


def _serialize_step_result(sr: StepResult) -> dict:
    return {
        "id": sr.id,
        "execution_id": sr.execution_id,
        "unit_id": sr.unit_id,
        "step_id": sr.step_id,
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


def _get_ordered_steps(db: Session, unit_id: str) -> list:
    """Get all steps for a unit, ordered by their order field."""
    return (
        db.query(Step)
        .filter(Step.unit_id == unit_id)
        .order_by(Step.order)
        .all()
    )


def _execute_unit_steps(
    workplace_id: str,
    unit_id: str,
    execution_id: str,
    input_data: Optional[str],
    env_vars: Optional[dict],
):
    """Run all steps of a unit in the background, chaining output as needed."""
    from backend.database import SessionLocal

    db = SessionLocal()
    try:
        execution = db.query(Execution).filter(Execution.id == execution_id).first()
        if not execution:
            return

        steps = _get_ordered_steps(db, unit_id)
        if not steps:
            execution.status = "completed"
            execution.started_at = utcnow()
            execution.finished_at = utcnow()
            db.commit()
            return

        execution.status = "running"
        execution.started_at = utcnow()
        db.commit()

        previous_return_value = input_data
        all_success = True

        for step in steps:
            now = utcnow()

            # Determine input for this step
            step_input = None
            if step.mode == "chained" and previous_return_value:
                step_input = previous_return_value
            elif input_data and step.order == 0:
                step_input = input_data

            # Create step result
            step_result = StepResult(
                execution_id=execution_id,
                unit_id=unit_id,
                step_id=step.id,
                status="running",
                started_at=now,
            )
            if step_input:
                step_result.input_data = step_input
            db.add(step_result)
            db.commit()
            db.refresh(step_result)

            # Execute
            if not step.script or not step.script.strip():
                step_result.status = "skipped"
                step_result.finished_at = utcnow()
                step_result.stderr = "Step has no script"
                db.commit()
                continue

            result = run_script(
                script=step.script,
                input_data=step_input,
                timeout=step.timeout or 300,
                env_vars=env_vars,
            )

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
            db.commit()

            if not result.success:
                all_success = False
                break

            previous_return_value = result.return_value

        execution.status = "completed" if all_success else "failed"
        execution.finished_at = utcnow()
        db.commit()

        # --- Post-execution: ingest into memory and optionally invoke agent ---
        try:
            from backend.memory.ingestion import ingest_execution

            # Build execution data for ingestion
            unit = db.query(UnitOfWork).filter(UnitOfWork.id == unit_id).first()
            exec_data = {
                "id": execution_id,
                "unit_id": unit_id,
                "unit_name": unit.name if unit else "Unknown",
                "status": execution.status,
                "started_at": execution.started_at.isoformat() if execution.started_at else "",
                "finished_at": execution.finished_at.isoformat() if execution.finished_at else "",
                "trigger_type": execution.trigger_type or "manual",
            }

            # Build step results for ingestion
            db_step_results = (
                db.query(StepResult)
                .filter(StepResult.execution_id == execution_id)
                .all()
            )
            sr_list = []
            for sr in db_step_results:
                step = db.query(Step).filter(Step.id == sr.step_id).first() if sr.step_id else None
                sr_list.append({
                    "step_name": step.name if step else "unknown",
                    "status": sr.status,
                    "stdout": sr.stdout or "",
                    "stderr": sr.stderr or "",
                    "return_value": sr.return_value or "",
                    "metrics": sr.metrics or {},
                })

            ingest_execution(workplace_id, exec_data, sr_list)

            # If execution failed and workplace has an enabled agent, invoke it
            if not all_success:
                from backend.database import Agent
                agent = (
                    db.query(Agent)
                    .filter(Agent.workplace_id == workplace_id, Agent.enabled == True)
                    .first()
                )
                if agent:
                    from backend.agent.service import invoke_agent

                    failed_step_info = []
                    for sr in sr_list:
                        if sr["status"] == "failed":
                            failed_step_info.append({
                                "step_name": sr["step_name"],
                                "stderr": sr["stderr"][:500],
                                "stdout": sr["stdout"][:200],
                            })

                    trigger_event = {
                        "type": "unit.failed",
                        "payload": {
                            "execution_id": execution_id,
                            "unit_id": unit_id,
                            "unit_name": exec_data["unit_name"],
                            "failed_steps": failed_step_info,
                            "error": failed_step_info[0]["stderr"] if failed_step_info else "Unknown error",
                        },
                        "source_type": "unit",
                        "source_id": unit_id,
                    }
                    logger.info(f"Invoking agent for failed execution {execution_id}")
                    invoke_agent(workplace_id, trigger_event, db)

        except Exception as mem_err:
            logger.warning(f"Post-execution processing error: {mem_err}")

    except Exception as e:
        logger.exception(f"Error executing unit {unit_id}: {e}")
        try:
            execution = db.query(Execution).filter(Execution.id == execution_id).first()
            if execution:
                execution.status = "failed"
                execution.finished_at = utcnow()
            db.commit()
        except Exception:
            pass
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Unit CRUD Routes
# ---------------------------------------------------------------------------

@router.post("", status_code=201)
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

    unit = UnitOfWork(
        workplace_id=workplace_id,
        name=body.name,
        description=body.description,
        type=body.type,
        config=body.config,
        retry_policy=body.retry_policy,
        enabled=body.enabled,
        order=body.order,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return _serialize_unit(unit)


@router.get("")
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
    if body.config is not None:
        unit.config = body.config
    if body.retry_policy is not None:
        unit.retry_policy = body.retry_policy
    if body.enabled is not None:
        unit.enabled = body.enabled
    if body.order is not None:
        unit.order = body.order

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


# ---------------------------------------------------------------------------
# Execution Routes
# ---------------------------------------------------------------------------

@router.post("/{unit_id}/run")
def run_unit(
    workplace_id: str,
    unit_id: str,
    body: UnitRunRequest = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Execute all steps of a unit in the background. Returns the execution record immediately."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    unit = _get_unit_or_404(db, unit_id, workplace_id)

    steps = _get_ordered_steps(db, unit_id)
    if not steps:
        raise HTTPException(status_code=400, detail="Unit has no steps to execute")

    # Check that at least one step has a script
    has_script = any(s.script and s.script.strip() for s in steps)
    if not has_script:
        raise HTTPException(status_code=400, detail="No steps have scripts to execute")

    # Create execution record
    execution = Execution(
        workplace_id=workplace_id,
        unit_id=unit_id,
        trigger_type="manual",
        status="pending",
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)

    input_data = body.input_data if body else None
    env_vars = body.env_vars if body else None

    # Run in background thread
    thread = threading.Thread(
        target=_execute_unit_steps,
        args=(
            workplace_id,
            unit_id,
            execution.id,
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
    """Execute all steps of a unit synchronously and return all results."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    unit = _get_unit_or_404(db, unit_id, workplace_id)

    steps = _get_ordered_steps(db, unit_id)
    if not steps:
        raise HTTPException(status_code=400, detail="Unit has no steps to execute")

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
    db.commit()
    db.refresh(execution)

    previous_return_value = input_data
    all_success = True
    results = []

    for step in steps:
        step_now = utcnow()

        # Determine input for this step
        step_input = None
        if step.mode == "chained" and previous_return_value:
            step_input = previous_return_value
        elif input_data and step.order == 0:
            step_input = input_data

        step_result = StepResult(
            execution_id=execution.id,
            unit_id=unit_id,
            step_id=step.id,
            status="running",
            started_at=step_now,
        )
        if step_input:
            step_result.input_data = step_input
        db.add(step_result)
        db.commit()
        db.refresh(step_result)

        if not step.script or not step.script.strip():
            step_result.status = "skipped"
            step_result.finished_at = utcnow()
            step_result.stderr = "Step has no script"
            db.commit()
            db.refresh(step_result)
            results.append(_serialize_step_result(step_result))
            continue

        result = run_script(
            script=step.script,
            input_data=step_input,
            timeout=step.timeout or 300,
            env_vars=env_vars,
        )

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
        db.commit()
        db.refresh(step_result)
        results.append(_serialize_step_result(step_result))

        if not result.success:
            all_success = False
            break

        previous_return_value = result.return_value

    execution.status = "completed" if all_success else "failed"
    execution.finished_at = utcnow()
    db.commit()
    db.refresh(execution)

    return {
        "execution": _serialize_execution(execution),
        "results": results,
    }


# ---------------------------------------------------------------------------
# Steps CRUD Routes
# ---------------------------------------------------------------------------

@router.get("/{unit_id}/steps")
def list_steps(
    workplace_id: str,
    unit_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    _get_unit_or_404(db, unit_id, workplace_id)

    steps = _get_ordered_steps(db, unit_id)
    return [_serialize_step(s) for s in steps]


@router.post("/{unit_id}/steps/suggest-snippets")
def suggest_snippets(
    workplace_id: str,
    unit_id: str,
    body: StepCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate AI-powered code snippet suggestions for a step."""
    from backend.agent.snippets import generate_snippets

    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    unit = _get_unit_or_404(db, unit_id, workplace_id)

    existing_steps = _get_ordered_steps(db, unit_id)
    existing_data = [
        {"name": s.name, "order": s.order, "mode": s.mode, "script": s.script[:200] if s.script else ""}
        for s in existing_steps
    ]

    snippets = generate_snippets(
        workplace_name=workplace.name,
        workplace_description=workplace.description or "",
        unit_name=unit.name,
        unit_description=unit.description or "",
        step_name=body.name,
        existing_steps=existing_data,
    )

    return {"snippets": snippets}


@router.post("/{unit_id}/steps", status_code=201)
def create_step(
    workplace_id: str,
    unit_id: str,
    body: StepCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    _get_unit_or_404(db, unit_id, workplace_id)

    valid_modes = ("independent", "chained")
    if body.mode not in valid_modes:
        raise HTTPException(status_code=400, detail=f"Invalid mode. Must be one of: {', '.join(valid_modes)}")

    # Auto-assign order if not specified: put at the end
    if body.order == 0:
        existing = _get_ordered_steps(db, unit_id)
        body.order = len(existing)

    step = Step(
        unit_id=unit_id,
        name=body.name,
        order=body.order,
        script=body.script,
        mode=body.mode,
        timeout=body.timeout,
    )
    db.add(step)
    db.commit()
    db.refresh(step)
    return _serialize_step(step)


# IMPORTANT: Register reorder BEFORE /{step_id} routes
@router.put("/{unit_id}/steps/reorder")
def reorder_steps(
    workplace_id: str,
    unit_id: str,
    body: StepReorder,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    _get_unit_or_404(db, unit_id, workplace_id)

    for idx, step_id in enumerate(body.step_ids):
        step = db.query(Step).filter(Step.id == step_id, Step.unit_id == unit_id).first()
        if step:
            step.order = idx
    db.commit()

    steps = _get_ordered_steps(db, unit_id)
    return [_serialize_step(s) for s in steps]


@router.put("/{unit_id}/steps/{step_id}")
def update_step(
    workplace_id: str,
    unit_id: str,
    step_id: str,
    body: StepUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    _get_unit_or_404(db, unit_id, workplace_id)
    step = _get_step_or_404(db, step_id, unit_id)

    if body.name is not None:
        step.name = body.name
    if body.order is not None:
        step.order = body.order
    if body.script is not None:
        step.script = body.script
    if body.mode is not None:
        valid_modes = ("independent", "chained")
        if body.mode not in valid_modes:
            raise HTTPException(status_code=400, detail=f"Invalid mode. Must be one of: {', '.join(valid_modes)}")
        step.mode = body.mode
    if body.timeout is not None:
        step.timeout = body.timeout

    db.commit()
    db.refresh(step)
    return _serialize_step(step)


@router.delete("/{unit_id}/steps/{step_id}", status_code=204)
def delete_step(
    workplace_id: str,
    unit_id: str,
    step_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    _get_unit_or_404(db, unit_id, workplace_id)
    step = _get_step_or_404(db, step_id, unit_id)
    db.delete(step)
    db.commit()
    return None
