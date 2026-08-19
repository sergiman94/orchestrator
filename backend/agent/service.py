"""AI Agent service — tool-use loop with provider-agnostic LLM calls."""

import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from backend.config import GROQ_MODEL, AGENT_TEMPERATURE, AGENT_MAX_TOKENS
from backend.database import (
    Workplace,
    Agent,
    Execution,
    UnitOfWork,
    StepResult,
    utcnow,
)
from backend.agent.prompts import build_system_prompt, build_context_prompt
from backend.agent.tools import TOOL_DEFINITIONS, execute_tool
from backend.memory.service import query_memory
from backend.memory.ingestion import ingest_agent_decision
from backend.llm.client import call_llm

logger = logging.getLogger("orchestrator")

MAX_TOOL_ITERATIONS = 5


def invoke_agent(
    workplace_id: str,
    trigger_event: dict,
    db: Session,
) -> dict:
    """Main agent entry point.

    1. Load workplace config
    2. Load recent execution history (last 5)
    3. Query memory for relevant context (RAG, top 5)
    4. Build system prompt + context
    5. Call Groq API with tool definitions
    6. Execute tool calls in a loop (max 5 iterations)
    7. Store agent decision in memory
    8. Return agent response + actions taken

    Args:
        workplace_id: The workplace to operate in.
        trigger_event: Dict describing what triggered the agent, with keys:
            type, payload, source_type, source_id.
        db: Database session.

    Returns:
        Dict with keys: response, actions_taken, iterations.
    """
    if not GROQ_API_KEY:
        logger.error("GROQ_API_KEY not set, cannot invoke agent.")
        return {
            "response": "Agent cannot be invoked: GROQ_API_KEY not configured.",
            "actions_taken": [],
            "iterations": 0,
            "error": True,
        }

    # 1. Load workplace config
    workplace = db.query(Workplace).filter(Workplace.id == workplace_id).first()
    if not workplace:
        return {
            "response": f"Workplace {workplace_id} not found.",
            "actions_taken": [],
            "iterations": 0,
            "error": True,
        }

    workplace_dict = {
        "name": workplace.name,
        "description": workplace.description or "",
        "config": workplace.config or {},
    }

    # Load agent config if it exists
    agent = (
        db.query(Agent)
        .filter(Agent.workplace_id == workplace_id, Agent.enabled == True)
        .first()
    )

    model = GROQ_MODEL
    temperature = AGENT_TEMPERATURE
    max_tokens = AGENT_MAX_TOKENS
    custom_system_prompt = None

    # Safety defaults
    max_tool_calls = 10
    max_retries = 3
    max_invocations_hour = 30

    if agent:
        if agent.model:
            model = agent.model
        if agent.temperature is not None:
            temperature = agent.temperature
        if agent.max_tokens:
            max_tokens = agent.max_tokens
        if agent.system_prompt:
            custom_system_prompt = agent.system_prompt
        if agent.max_tool_calls_per_invocation is not None:
            max_tool_calls = agent.max_tool_calls_per_invocation
        if agent.max_retries_per_execution is not None:
            max_retries = agent.max_retries_per_execution
        if agent.max_invocations_per_hour is not None:
            max_invocations_hour = agent.max_invocations_per_hour

    # Safety: check hourly invocation rate (AD-6)
    from datetime import datetime, timedelta
    from backend.database import Event
    from backend.events.emit import emit_event
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent_invocations = db.query(Event).filter(
        Event.workplace_id == workplace_id,
        Event.type == "agent.invoked",
        Event.created_at >= one_hour_ago,
    ).count()
    if recent_invocations >= max_invocations_hour:
        emit_event(db, workplace_id, "agent.safety_limit", "agent", "", {
            "limit": "invocations_per_hour", "current": recent_invocations, "max": max_invocations_hour,
        })
        return {
            "response": f"Agent rate limit exceeded ({recent_invocations}/{max_invocations_hour} invocations in the last hour).",
            "actions_taken": [],
            "iterations": 0,
            "error": "safety_limit_exceeded",
        }

    # Emit agent.invoked event for rate tracking
    emit_event(db, workplace_id, "agent.invoked", "agent", "", {"trigger": trigger_event.get("type", "")})

    # 2. Load recent execution history (last 5)
    recent_executions = (
        db.query(Execution)
        .filter(Execution.workplace_id == workplace_id)
        .order_by(Execution.created_at.desc())
        .limit(5)
        .all()
    )

    recent_history = []
    for ex in recent_executions:
        unit = db.query(UnitOfWork).filter(UnitOfWork.id == ex.unit_id).first() if ex.unit_id else None
        recent_history.append({
            "id": ex.id,
            "unit_id": ex.unit_id or "",
            "unit_name": unit.name if unit else "N/A",
            "status": ex.status,
            "trigger_type": ex.trigger_type,
            "started_at": ex.started_at.isoformat() if ex.started_at else "",
            "finished_at": ex.finished_at.isoformat() if ex.finished_at else "",
            "retry_count": ex.retry_count or 0,
        })

    # 3. Query memory for relevant context (RAG, top 5)
    query_text = trigger_event.get("type", "")
    payload = trigger_event.get("payload", {})
    if isinstance(payload, dict):
        # Build a search query from the event
        error_msg = payload.get("error", payload.get("stderr", payload.get("message", "")))
        unit_name = payload.get("unit_name", "")
        query_text = f"{query_text} {unit_name} {error_msg}".strip()

    memory_results = []
    if query_text:
        memory_results = query_memory(workplace_id, query_text, top_k=5)

    # 4. Load asset health for context
    from backend.database import Asset
    assets = db.query(Asset).filter(Asset.workplace_id == workplace_id).all()
    asset_health = []
    for a in assets:
        asset_health.append({
            "name": a.name,
            "type": a.type,
            "health_status": a.health_status,
            "last_checked": a.last_checked.isoformat() if a.last_checked else "never",
        })

    # 5. Build system prompt + context
    if custom_system_prompt:
        system_prompt = custom_system_prompt
    else:
        system_prompt = build_system_prompt(workplace_dict)

    context_message = build_context_prompt(
        workplace=workplace_dict,
        trigger_event=trigger_event,
        memory_results=memory_results,
        recent_history=recent_history,
        asset_health=asset_health if asset_health else None,
    )

    # 5. Call Groq API with tool definitions
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": context_message},
    ]

    actions_taken = []
    iterations = 0
    final_response = ""
    tool_call_count = 0

    try:
        used_tools = False

        for iteration in range(MAX_TOOL_ITERATIONS):
            iterations = iteration + 1

            # On first call, include tools. After tool execution, don't include tools
            # so Groq generates a text response instead of empty content.
            include_tools = not used_tools

            llm_response = call_llm(
                model=model,
                messages=messages,
                tools=TOOL_DEFINITIONS if include_tools else None,
                temperature=temperature,
                max_tokens=max_tokens,
            )

            content = llm_response.content
            tool_calls = llm_response.tool_calls
            finish_reason = llm_response.finish_reason

            if not tool_calls or finish_reason == "stop":
                # No tool calls — agent is done
                final_response = content or ""
                break

            # Add assistant message to history
            assistant_msg = {"role": "assistant", "tool_calls": tool_calls}
            if content:
                assistant_msg["content"] = content
            messages.append(assistant_msg)

            # 6. Execute tool calls and add results
            for tc in tool_calls:
                func = tc.get("function", {})
                tool_name = func.get("name", "")
                try:
                    tool_args = json.loads(func.get("arguments", "{}"))
                except json.JSONDecodeError:
                    tool_args = {}

                tool_call_id = tc.get("id", "")

                logger.info(f"Agent calling tool: {tool_name}({tool_args})")

                # Safety: check tool call limit (AD-6)
                tool_call_count += 1
                if tool_call_count > max_tool_calls:
                    emit_event(db, workplace_id, "agent.safety_limit", "agent", "", {
                        "limit": "tool_calls_per_invocation", "current": tool_call_count, "max": max_tool_calls,
                    })
                    final_response = f"Tool call limit reached ({max_tool_calls}). Stopping to prevent runaway automation."
                    break

                result = execute_tool(
                    tool_name=tool_name,
                    arguments=tool_args,
                    workplace_id=workplace_id,
                    db=db,
                )

                actions_taken.append({
                    "tool": tool_name,
                    "arguments": tool_args,
                    "result": result[:500],
                })

                # Add tool result to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": str(result),
                })

            used_tools = True

        # 7. Store agent decision in memory
        if actions_taken:
            action_summary = ", ".join(a["tool"] for a in actions_taken)
            outcomes = "; ".join(a["result"][:100] for a in actions_taken)
            ingest_agent_decision(
                workplace_id=workplace_id,
                decision_summary=final_response[:300] if final_response else "Agent took automated action",
                action_taken=action_summary,
                outcome=outcomes[:500],
            )

    except Exception as e:
        logger.exception(f"Agent invocation failed: {e}")
        final_response = f"Agent error: {str(e)}"

    return {
        "response": final_response,
        "actions_taken": actions_taken,
        "iterations": iterations,
        "error": False,
    }


def chat_with_agent(
    workplace_id: str,
    user_message: str,
    db: Session,
) -> dict:
    """Single-turn chat with the agent.

    Simpler than invoke_agent: takes a user message, queries memory for context,
    and returns the agent's response with any tool actions.

    Args:
        workplace_id: The workplace context.
        user_message: The user's message.
        db: Database session.

    Returns:
        Dict with keys: response, actions_taken, iterations.
    """
    trigger_event = {
        "type": "user.request",
        "payload": {
            "message": user_message,
        },
        "source_type": "user",
        "source_id": "",
    }
    return invoke_agent(workplace_id, trigger_event, db)


    # _call_groq removed — all LLM calls now go through backend.llm.client (AD-7)
