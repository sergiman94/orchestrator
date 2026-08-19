"""Auto-ingestion of execution results and agent decisions into shared memory."""

import logging
from typing import Optional

from backend.memory.service import store_memory

logger = logging.getLogger("orchestrator")


def ingest_execution(
    workplace_id: str,
    execution_data: dict,
    step_results: list[dict],
) -> Optional[str]:
    """Store an execution summary as a memory entry.

    Called after every unit execution completes (success or failure).

    Args:
        workplace_id: The workplace ID.
        execution_data: Dict with keys: id, unit_id, unit_name, status, started_at,
                        finished_at, trigger_type.
        step_results: List of dicts with keys: step_name, status, stdout, stderr,
                      return_value, metrics.

    Returns:
        The memory ID of the stored entry, or None on failure.
    """
    try:
        status = execution_data.get("status", "unknown")
        unit_name = execution_data.get("unit_name", "Unknown unit")
        execution_id = execution_data.get("id", "")

        if status == "completed":
            # Build a success summary
            step_summaries = []
            for sr in step_results:
                s_name = sr.get("step_name", "step")
                s_status = sr.get("status", "unknown")
                metrics = sr.get("metrics", {})
                wall_time = metrics.get("wall_time_seconds", 0)
                output_preview = (sr.get("return_value", "") or "")[:200]
                step_summaries.append(
                    f"  - {s_name}: {s_status} ({wall_time}s)"
                    + (f" output: {output_preview}" if output_preview else "")
                )

            content = (
                f"Unit '{unit_name}' completed successfully.\n"
                f"Steps:\n" + "\n".join(step_summaries)
            )
            source_type = "execution"

        elif status == "failed":
            # Build a failure summary with error details
            failed_steps = [sr for sr in step_results if sr.get("status") == "failed"]
            error_details = []
            for sr in failed_steps:
                s_name = sr.get("step_name", "step")
                stderr = (sr.get("stderr", "") or "")[:500]
                stdout = (sr.get("stdout", "") or "")[:200]
                error_details.append(
                    f"  - {s_name} FAILED\n"
                    f"    stderr: {stderr}\n"
                    f"    stdout: {stdout}"
                )

            content = (
                f"Unit '{unit_name}' FAILED.\n"
                f"Error details:\n" + "\n".join(error_details)
            )
            source_type = "error_pattern"

        else:
            content = f"Unit '{unit_name}' finished with status: {status}"
            source_type = "execution"

        metadata = {
            "execution_id": execution_id,
            "unit_id": execution_data.get("unit_id", ""),
            "unit_name": unit_name,
            "status": status,
            "trigger_type": execution_data.get("trigger_type", "manual"),
            "step_count": len(step_results),
        }

        memory_id = store_memory(
            workplace_id=workplace_id,
            content=content,
            source_type=source_type,
            source_id=execution_id,
            metadata=metadata,
            ttl_days=90,  # execution logs expire after 90 days
        )
        logger.info(f"Ingested execution {execution_id} into memory as {memory_id}")
        return memory_id

    except Exception as e:
        logger.error(f"Failed to ingest execution into memory: {e}")
        return None


def ingest_agent_decision(
    workplace_id: str,
    decision_summary: str,
    action_taken: str,
    outcome: str,
) -> Optional[str]:
    """Store an agent decision as a memory entry.

    Args:
        workplace_id: The workplace ID.
        decision_summary: What the agent decided and why.
        action_taken: The specific action taken (e.g., "retry_unit", "alert_user").
        outcome: The result of the action.

    Returns:
        The memory ID, or None on failure.
    """
    try:
        content = (
            f"Agent decided to {action_taken} because: {decision_summary}. "
            f"Result: {outcome}"
        )

        metadata = {
            "action": action_taken,
            "outcome": outcome,
        }

        memory_id = store_memory(
            workplace_id=workplace_id,
            content=content,
            source_type="agent_decision",
            source_id="",
            metadata=metadata,
        )
        logger.info(f"Ingested agent decision into memory as {memory_id}")
        return memory_id

    except Exception as e:
        logger.error(f"Failed to ingest agent decision into memory: {e}")
        return None


def ingest_connector_interaction(
    workplace_id: str,
    connector_name: str,
    connector_type: str,
    connector_id: str,
    success: bool,
    record_count: int = 0,
    wall_time_seconds: float = 0.0,
    metadata_from_provider: dict = None,
    error: str = None,
) -> Optional[str]:
    """Store a connector interaction as a memory entry (fire-and-forget).

    Called after every connector step execution. Ingests schemas, record counts,
    response times, and errors so the agent learns about data sources.

    Returns:
        The memory ID, or None on failure.
    """
    try:
        if success:
            content = (
                f"Connector '{connector_name}' ({connector_type}) executed successfully. "
                f"{record_count} records processed in {wall_time_seconds}s."
            )
            if metadata_from_provider:
                detail_parts = []
                for k, v in metadata_from_provider.items():
                    if k != "_credentials":
                        detail_parts.append(f"{k}: {v}")
                if detail_parts:
                    content += f" Details: {', '.join(detail_parts[:10])}"
            source_type = "observation"
        else:
            content = (
                f"Connector '{connector_name}' ({connector_type}) FAILED. "
                f"Error: {error or 'unknown'}"
            )
            source_type = "error_pattern"

        mem_metadata = {
            "connector_id": connector_id,
            "connector_name": connector_name,
            "connector_type": connector_type,
            "success": success,
            "record_count": record_count,
            "wall_time_seconds": wall_time_seconds,
        }

        memory_id = store_memory(
            workplace_id=workplace_id,
            content=content,
            source_type=source_type,
            source_id=connector_id,
            metadata=mem_metadata,
        )
        logger.info(f"Ingested connector interaction for '{connector_name}' as {memory_id}")
        return memory_id

    except Exception as e:
        logger.error(f"Failed to ingest connector interaction: {e}")
        return None
