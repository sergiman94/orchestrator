"""Provider-agnostic LLM client (AD-7).

All LLM calls — agent, LLM steps, snippet generation — go through this interface.
v1 implementation: Groq API. Model field is provider-agnostic; client.py maps to provider calls.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

import httpx

from backend.config import GROQ_API_KEY, GROQ_MODEL

logger = logging.getLogger("orchestrator")

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"


@dataclass
class LLMResponse:
    content: str = ""
    tool_calls: list = field(default_factory=list)
    usage: dict = field(default_factory=dict)
    finish_reason: str = ""


def call_llm(
    model: str = None,
    messages: list[dict] = None,
    tools: Optional[list[dict]] = None,
    temperature: float = 0.3,
    max_tokens: int = 4096,
) -> LLMResponse:
    """Call the LLM provider.

    Args:
        model: Model identifier (default: GROQ_MODEL from config)
        messages: List of message dicts [{role, content}]
        tools: Optional tool definitions (OpenAI function format)
        temperature: Sampling temperature
        max_tokens: Max response tokens

    Returns:
        LLMResponse with content, tool_calls, usage, finish_reason

    Raises:
        Exception on API failure (caller should handle)
    """
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY not configured")

    resolved_model = model or GROQ_MODEL

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    body = {
        "model": resolved_model,
        "messages": messages or [],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }

    if tools:
        body["tools"] = tools
        body["tool_choice"] = "auto"

    response = httpx.post(
        GROQ_API_URL,
        headers=headers,
        json=body,
        timeout=60.0,
    )
    response.raise_for_status()
    data = response.json()

    choice = data.get("choices", [{}])[0]
    message = choice.get("message", {})

    return LLMResponse(
        content=message.get("content", "") or "",
        tool_calls=message.get("tool_calls", []) or [],
        usage=data.get("usage", {}),
        finish_reason=choice.get("finish_reason", ""),
    )
