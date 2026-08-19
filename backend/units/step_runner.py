"""Step type dispatcher (AD-17).

Single entry point for step execution. Dispatches by step.type.
All types return an ExecutionResult with uniform shape.
New step types register here only.
"""

import json
import logging
from typing import Dict, Optional

from sqlalchemy.orm import Session

from backend.executor import run_script, ExecutionResult

logger = logging.getLogger("orchestrator")


def run_step(
    step,
    input_data: Optional[str] = None,
    env_vars: Optional[Dict[str, str]] = None,
    db: Session = None,
) -> ExecutionResult:
    """Dispatch step execution by type.

    Args:
        step: Step ORM object with .type, .script, .timeout, .config attributes
        input_data: Optional input from previous step (for chained mode)
        env_vars: Optional per-execution environment variables
        db: SQLAlchemy session (required for connector steps)

    Returns:
        ExecutionResult with stdout, stderr, return_value, success, metrics

    Raises:
        NotImplementedError: For step types not yet implemented
    """
    step_type = step.type or "script"

    if step_type == "script":
        return run_script(
            script=step.script,
            input_data=input_data,
            timeout=step.timeout or 300,
            env_vars=env_vars,
        )

    if step_type == "connector":
        from backend.connectors.service import execute_step as connector_execute
        config = step.config or {}
        connector_id = config.get("connector_id", "")
        params = dict(config.get("params", {}))
        # Inject input_data into params if chained
        if input_data:
            params["input_data"] = input_data
        if not db:
            from backend.executor import ExecutionMetrics
            return ExecutionResult(
                stdout="", stderr="Connector steps require a database session",
                return_value="", success=False,
            )
        return connector_execute(db, connector_id, params)

    if step_type == "llm_call":
        return _run_llm_step(step, input_data)

    raise NotImplementedError(f"Step type '{step_type}' not yet implemented")


def _run_llm_step(step, input_data: Optional[str] = None) -> ExecutionResult:
    """Execute an LLM call step."""
    import time
    from backend.llm.client import call_llm
    from backend.executor import ExecutionMetrics

    config = step.config or {}
    prompt_template = config.get("prompt_template", "")
    model = config.get("model", None)
    temperature = config.get("temperature", 0.3)
    max_tokens = config.get("max_tokens", 4096)

    if not prompt_template:
        return ExecutionResult(
            stdout="", stderr="LLM call step has no prompt_template in config",
            return_value="", success=False, metrics=ExecutionMetrics(),
        )

    # Replace {{INPUT_DATA}} placeholder with previous step output
    prompt = prompt_template.replace("{{INPUT_DATA}}", input_data or "")

    start_time = time.time()
    try:
        response = call_llm(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        wall_time = time.time() - start_time

        return ExecutionResult(
            stdout=f"LLM response ({response.usage.get('total_tokens', 0)} tokens)",
            stderr="",
            return_value=response.content,
            success=True,
            metrics=ExecutionMetrics(wall_time_seconds=round(wall_time, 3)),
        )
    except Exception as e:
        wall_time = time.time() - start_time
        return ExecutionResult(
            stdout="",
            stderr=f"LLM call failed: {str(e)}",
            return_value="",
            success=False,
            metrics=ExecutionMetrics(wall_time_seconds=round(wall_time, 3)),
        )
