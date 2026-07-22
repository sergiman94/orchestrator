"""Step type dispatcher (AD-17).

Single entry point for step execution. Dispatches by step.type.
All types return an ExecutionResult with uniform shape.
New step types register here only.
"""

import logging
from typing import Dict, Optional

from backend.executor import run_script, ExecutionResult

logger = logging.getLogger("orchestrator")


def run_step(
    step,
    input_data: Optional[str] = None,
    env_vars: Optional[Dict[str, str]] = None,
) -> ExecutionResult:
    """Dispatch step execution by type.

    Args:
        step: Step ORM object with .type, .script, .timeout attributes
        input_data: Optional input from previous step (for chained mode)
        env_vars: Optional per-execution environment variables

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

    raise NotImplementedError(f"Step type '{step_type}' not yet implemented")
