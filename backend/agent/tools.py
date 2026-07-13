"""Agent tool definitions (OpenAI function calling format) and implementations."""

import logging
import threading
from typing import Optional

from sqlalchemy.orm import Session

from backend.database import (
    SessionLocal,
    Execution,
    UnitOfWork,
    StepResult,
    Event,
    Step,
    utcnow,
    new_uuid,
)
from backend.memory.service import query_memory as memory_query, store_memory
from backend.memory.ingestion import ingest_execution

logger = logging.getLogger("orchestrator")


# ---------------------------------------------------------------------------
# Tool definitions (OpenAI function calling format for Groq)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "execute_unit",
            "description": "Trigger execution of a unit of work by its ID. Returns the execution record.",
            "parameters": {
                "type": "object",
                "properties": {
                    "unit_id": {
                        "type": "string",
                        "description": "The ID of the unit to execute.",
                    },
                },
                "required": ["unit_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "retry_unit",
            "description": "Retry a failed execution, optionally with a modified timeout. Creates a new execution.",
            "parameters": {
                "type": "object",
                "properties": {
                    "execution_id": {
                        "type": "string",
                        "description": "The ID of the failed execution to retry.",
                    },
                    "modified_timeout": {
                        "type": "integer",
                        "description": "Optional modified timeout in seconds for the retry attempt.",
                    },
                },
                "required": ["execution_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_memory",
            "description": "Search shared memory for relevant past events, errors, and observations using semantic search.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Natural language search query.",
                    },
                    "top_k": {
                        "type": "integer",
                        "description": "Number of results to return (default 5).",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "store_observation",
            "description": "Store an observation or insight in shared memory for future reference.",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "The observation text to store.",
                    },
                    "tags": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional tags for categorization.",
                    },
                },
                "required": ["content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_execution_history",
            "description": "Get recent execution history, optionally filtered by unit.",
            "parameters": {
                "type": "object",
                "properties": {
                    "unit_id": {
                        "type": "string",
                        "description": "Optional unit ID to filter by.",
                    },
                    "last_n": {
                        "type": "integer",
                        "description": "Number of recent executions to return (default 10).",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "alert_user",
            "description": "Create an alert for the user. Use when an issue requires human attention or judgment.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "The alert message describing the issue and recommended action.",
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["info", "warning", "error", "critical"],
                        "description": "Severity level of the alert.",
                    },
                },
                "required": ["message", "severity"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

def execute_tool(
    tool_name: str,
    arguments: dict,
    workplace_id: str,
    db: Session,
) -> str:
    """Execute a tool by name and return the result as a string.

    Args:
        tool_name: Name of the tool to execute.
        arguments: Dict of arguments for the tool.
        workplace_id: The workplace context.
        db: Database session.

    Returns:
        String result to return to the LLM.
    """
    try:
        if tool_name == "execute_unit":
            return _tool_execute_unit(workplace_id, arguments, db)
        elif tool_name == "retry_unit":
            return _tool_retry_unit(workplace_id, arguments, db)
        elif tool_name == "query_memory":
            return _tool_query_memory(workplace_id, arguments)
        elif tool_name == "store_observation":
            return _tool_store_observation(workplace_id, arguments)
        elif tool_name == "get_execution_history":
            return _tool_get_execution_history(workplace_id, arguments, db)
        elif tool_name == "alert_user":
            return _tool_alert_user(workplace_id, arguments, db)
        else:
            return f"Error: Unknown tool '{tool_name}'"
    except Exception as e:
        logger.error(f"Tool execution error ({tool_name}): {e}")
        return f"Error executing {tool_name}: {str(e)}"


def _tool_execute_unit(workplace_id: str, args: dict, db: Session) -> str:
    """Execute a unit of work."""
    unit_id = args.get("unit_id", "")
    if not unit_id:
        return "Error: unit_id is required."

    unit = (
        db.query(UnitOfWork)
        .filter(UnitOfWork.id == unit_id, UnitOfWork.workplace_id == workplace_id)
        .first()
    )
    if not unit:
        return f"Error: Unit '{unit_id}' not found in this workplace."

    if not unit.enabled:
        return f"Error: Unit '{unit.name}' is disabled."

    steps = (
        db.query(Step)
        .filter(Step.unit_id == unit_id)
        .order_by(Step.order)
        .all()
    )
    if not steps:
        return f"Error: Unit '{unit.name}' has no steps to execute."

    # Create execution record
    execution = Execution(
        workplace_id=workplace_id,
        unit_id=unit_id,
        trigger_type="agent",
        status="pending",
    )
    db.add(execution)
    db.commit()
    db.refresh(execution)

    # Run in background thread
    from backend.units.router import _execute_unit_steps

    thread = threading.Thread(
        target=_execute_unit_steps,
        args=(workplace_id, unit_id, execution.id, None, None),
        daemon=True,
    )
    thread.start()

    return (
        f"Execution started for unit '{unit.name}' (execution_id: {execution.id}). "
        f"It is running in the background with {len(steps)} steps."
    )


def _tool_retry_unit(workplace_id: str, args: dict, db: Session) -> str:
    """Retry a failed execution."""
    execution_id = args.get("execution_id", "")
    modified_timeout = args.get("modified_timeout")

    if not execution_id:
        return "Error: execution_id is required."

    original = (
        db.query(Execution)
        .filter(Execution.id == execution_id, Execution.workplace_id == workplace_id)
        .first()
    )
    if not original:
        return f"Error: Execution '{execution_id}' not found."

    if original.status != "failed":
        return f"Error: Execution is '{original.status}', not 'failed'. Can only retry failed executions."

    if not original.unit_id:
        return "Error: Original execution has no associated unit."

    unit = db.query(UnitOfWork).filter(UnitOfWork.id == original.unit_id).first()
    if not unit:
        return "Error: Associated unit no longer exists."

    # Create new execution for the retry
    retry_execution = Execution(
        workplace_id=workplace_id,
        unit_id=original.unit_id,
        trigger_type="agent",
        status="pending",
        retry_count=(original.retry_count or 0) + 1,
        agent_context={"retried_from": execution_id, "modified_timeout": modified_timeout},
    )
    db.add(retry_execution)
    db.commit()
    db.refresh(retry_execution)

    # If modified_timeout, temporarily adjust step timeouts
    env_vars = None
    if modified_timeout:
        # Pass as env var so the executor can use it
        env_vars = {"__AGENT_TIMEOUT_OVERRIDE__": str(modified_timeout)}

    from backend.units.router import _execute_unit_steps

    thread = threading.Thread(
        target=_execute_unit_steps,
        args=(workplace_id, original.unit_id, retry_execution.id, None, env_vars),
        daemon=True,
    )
    thread.start()

    return (
        f"Retry started for unit '{unit.name}' "
        f"(new execution_id: {retry_execution.id}, retry #{retry_execution.retry_count})"
        + (f" with modified timeout of {modified_timeout}s." if modified_timeout else ".")
    )


def _tool_query_memory(workplace_id: str, args: dict) -> str:
    """Search shared memory."""
    query = args.get("query", "")
    top_k = args.get("top_k", 5)

    if not query:
        return "Error: query is required."

    results = memory_query(workplace_id, query, top_k=top_k)

    if not results:
        return "No relevant memories found."

    lines = []
    for i, mem in enumerate(results, 1):
        content = mem.get("content", "")[:400]
        source = mem.get("metadata", {}).get("source_type", "unknown")
        distance = mem.get("distance", 0)
        relevance = round(1 - distance, 3) if distance else "N/A"
        lines.append(f"{i}. [{source}] (relevance: {relevance}) {content}")

    return f"Found {len(results)} relevant memories:\n" + "\n".join(lines)


def _tool_store_observation(workplace_id: str, args: dict) -> str:
    """Store an observation in memory."""
    content = args.get("content", "")
    tags = args.get("tags", [])

    if not content:
        return "Error: content is required."

    metadata = {}
    if tags:
        metadata["tags"] = ", ".join(tags)

    memory_id = store_memory(
        workplace_id=workplace_id,
        content=content,
        source_type="observation",
        source_id="agent",
        metadata=metadata,
    )

    return f"Observation stored in memory (id: {memory_id})."


def _tool_get_execution_history(workplace_id: str, args: dict, db: Session) -> str:
    """Get recent execution history."""
    unit_id = args.get("unit_id")
    last_n = args.get("last_n", 10)

    query = (
        db.query(Execution)
        .filter(Execution.workplace_id == workplace_id)
    )
    if unit_id:
        query = query.filter(Execution.unit_id == unit_id)

    executions = (
        query.order_by(Execution.created_at.desc())
        .limit(last_n)
        .all()
    )

    if not executions:
        return "No executions found."

    lines = []
    for ex in executions:
        unit = db.query(UnitOfWork).filter(UnitOfWork.id == ex.unit_id).first() if ex.unit_id else None
        unit_name = unit.name if unit else "N/A"
        started = ex.started_at.isoformat() if ex.started_at else "N/A"
        finished = ex.finished_at.isoformat() if ex.finished_at else "N/A"

        # Get step results summary
        step_results = db.query(StepResult).filter(StepResult.execution_id == ex.id).all()
        failed_steps = [sr for sr in step_results if sr.status == "failed"]
        step_summary = f"{len(step_results)} steps"
        if failed_steps:
            step_summary += f" ({len(failed_steps)} failed)"

        lines.append(
            f"- {ex.id[:8]}... | {unit_name} | {ex.status} | {ex.trigger_type} | "
            f"{started} | {step_summary}"
        )

    return f"Recent executions ({len(executions)}):\n" + "\n".join(lines)


def _tool_alert_user(workplace_id: str, args: dict, db: Session) -> str:
    """Create an alert event for the user."""
    message = args.get("message", "")
    severity = args.get("severity", "info")

    if not message:
        return "Error: message is required."

    # Create an event record
    event = Event(
        workplace_id=workplace_id,
        type=f"agent.alert.{severity}",
        source_type="agent",
        source_id="",
        payload={
            "message": message,
            "severity": severity,
        },
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    # Also store in memory
    store_memory(
        workplace_id=workplace_id,
        content=f"ALERT [{severity.upper()}]: {message}",
        source_type="observation",
        source_id=event.id,
        metadata={"severity": severity, "type": "alert"},
    )

    return f"Alert created (severity: {severity}, event_id: {event.id}). User will be notified."
