"""AI Agent service using Groq API (OpenAI-compatible tool_use)."""

import json
import logging
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from backend.config import GROQ_API_KEY, GROQ_MODEL, AGENT_TEMPERATURE, AGENT_MAX_TOKENS
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

logger = logging.getLogger("orchestrator")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
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

    if agent:
        if agent.model:
            model = agent.model
        if agent.temperature is not None:
            temperature = agent.temperature
        if agent.max_tokens:
            max_tokens = agent.max_tokens
        if agent.system_prompt:
            custom_system_prompt = agent.system_prompt

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

    # 4. Build system prompt + context
    if custom_system_prompt:
        system_prompt = custom_system_prompt
    else:
        system_prompt = build_system_prompt(workplace_dict)

    context_message = build_context_prompt(
        workplace=workplace_dict,
        trigger_event=trigger_event,
        memory_results=memory_results,
        recent_history=recent_history,
    )

    # 5. Call Groq API with tool definitions
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": context_message},
    ]

    actions_taken = []
    iterations = 0
    final_response = ""

    try:
        for iteration in range(MAX_TOOL_ITERATIONS):
            iterations = iteration + 1

            response_data = _call_groq(
                messages=messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
                tools=TOOL_DEFINITIONS,
            )

            if not response_data:
                final_response = "Failed to get response from Groq API."
                break

            choice = response_data.get("choices", [{}])[0]
            message = choice.get("message", {})
            finish_reason = choice.get("finish_reason", "stop")

            # Add assistant message to history
            messages.append(message)

            # Check for tool calls
            tool_calls = message.get("tool_calls")

            if not tool_calls or finish_reason == "stop":
                # No tool calls — agent is done
                final_response = message.get("content", "") or ""
                break

            # 6. Execute tool calls
            for tc in tool_calls:
                func = tc.get("function", {})
                tool_name = func.get("name", "")
                try:
                    tool_args = json.loads(func.get("arguments", "{}"))
                except json.JSONDecodeError:
                    tool_args = {}

                tool_call_id = tc.get("id", "")

                logger.info(f"Agent calling tool: {tool_name}({tool_args})")

                result = execute_tool(
                    tool_name=tool_name,
                    arguments=tool_args,
                    workplace_id=workplace_id,
                    db=db,
                )

                actions_taken.append({
                    "tool": tool_name,
                    "arguments": tool_args,
                    "result": result[:500],  # Truncate for storage
                })

                # Add tool result to messages
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call_id,
                    "content": result,
                })

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


def _call_groq(
    messages: list[dict],
    model: str,
    temperature: float,
    max_tokens: int,
    tools: Optional[list[dict]] = None,
) -> Optional[dict]:
    """Call the Groq API.

    Returns the response JSON dict, or None on failure.
    """
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    body = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"

    try:
        response = httpx.post(
            GROQ_API_URL,
            headers=headers,
            json=body,
            timeout=60.0,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Groq API HTTP error {e.response.status_code}: {e.response.text[:500]}")
        return None
    except Exception as e:
        logger.error(f"Groq API request failed: {e}")
        return None
