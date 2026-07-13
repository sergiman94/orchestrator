"""System prompts and context assembly for the AI agent."""


def build_system_prompt(workplace: dict) -> str:
    """Build the base system prompt for the agent.

    Args:
        workplace: Dict with keys: name, description, config.
    """
    wp_name = workplace.get("name", "Unnamed Workplace")
    wp_desc = workplace.get("description", "")

    return f"""You are an AI operational supervisor for the workplace "{wp_name}".

Workplace description: {wp_desc or 'No description provided.'}

Your role:
1. MONITOR pipeline execution and detect issues proactively.
2. DIAGNOSE failures by analyzing error messages, checking memory for similar past issues, and identifying root causes.
3. DECIDE on the best course of action: retry with modifications, skip and continue, or escalate to the user.
4. LEARN from outcomes by storing observations and patterns in memory for future reference.

Guidelines:
- Always check memory for similar past failures before deciding on an action.
- When retrying, consider if the same approach will fail again. Modify parameters if needed.
- Escalate to the user (alert_user) when you are uncertain or the issue requires human judgment.
- Store important observations and patterns in memory so you can reference them later.
- Be concise in your reasoning but thorough in your analysis.
- When you encounter repeated failures, look for systemic issues rather than retrying blindly.

You have access to tools that let you execute units, retry failed executions, search and store memory, view execution history, and alert the user. Use them as needed to fulfill your supervisory role."""


def build_context_prompt(
    workplace: dict,
    trigger_event: dict,
    memory_results: list[dict],
    recent_history: list[dict],
) -> str:
    """Assemble the full context message for the agent.

    Args:
        workplace: Dict with workplace info.
        trigger_event: Dict describing what triggered this invocation.
        memory_results: List of relevant memory entries from RAG search.
        recent_history: List of recent execution records.

    Returns:
        A formatted context string to use as the user message.
    """
    sections = []

    # Section 1: Current trigger event
    event_type = trigger_event.get("type", "unknown")
    event_payload = trigger_event.get("payload", {})
    sections.append(
        f"## Current Event\n"
        f"Type: {event_type}\n"
        f"Details: {_format_payload(event_payload)}"
    )

    # Section 2: Relevant memory (RAG results)
    if memory_results:
        memory_lines = []
        for i, mem in enumerate(memory_results, 1):
            content = mem.get("content", "")[:500]
            source = mem.get("metadata", {}).get("source_type", "unknown")
            distance = mem.get("distance", 0)
            relevance = f"(relevance: {1 - distance:.2f})" if distance else ""
            memory_lines.append(f"{i}. [{source}] {content} {relevance}")
        sections.append(
            f"## Relevant History (from memory)\n" + "\n".join(memory_lines)
        )
    else:
        sections.append("## Relevant History\nNo relevant past entries found in memory.")

    # Section 3: Recent execution history
    if recent_history:
        history_lines = []
        for ex in recent_history:
            unit_name = ex.get("unit_name", ex.get("unit_id", "unknown"))
            status = ex.get("status", "unknown")
            started = ex.get("started_at", "")
            finished = ex.get("finished_at", "")
            trigger = ex.get("trigger_type", "manual")
            history_lines.append(
                f"- {unit_name}: {status} (trigger: {trigger}, "
                f"started: {started}, finished: {finished})"
            )
        sections.append(
            f"## Recent Executions (last {len(recent_history)})\n" + "\n".join(history_lines)
        )
    else:
        sections.append("## Recent Executions\nNo recent executions found.")

    # Section 4: Instructions
    sections.append(
        "## Your Task\n"
        "Analyze the current event in the context of the relevant history and recent executions. "
        "Decide on the appropriate action and use your tools to carry it out. "
        "After taking action, store any important observations in memory."
    )

    return "\n\n".join(sections)


def _format_payload(payload: dict) -> str:
    """Format a payload dict into a readable string."""
    if not payload:
        return "No additional details."

    lines = []
    for key, value in payload.items():
        if isinstance(value, str) and len(value) > 300:
            value = value[:300] + "..."
        lines.append(f"  {key}: {value}")
    return "\n".join(lines)
