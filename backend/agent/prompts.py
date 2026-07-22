"""System prompts and context assembly for the AI agent."""


def build_system_prompt(workplace: dict) -> str:
    """Build the base system prompt for the agent.

    Args:
        workplace: Dict with keys: name, description, config.
    """
    wp_name = workplace.get("name", "Unnamed Workplace")
    wp_desc = workplace.get("description", "")

    return f"""You are the AI assistant for the workspace "{wp_name}".
{f'This workspace is about: {wp_desc}' if wp_desc else ''}

You are helpful, conversational, and knowledgeable. When users talk to you, respond naturally like a smart colleague — not like a robotic system.

Your capabilities:
- You can answer questions about the workspace, its units, and execution history
- You can run units, retry failed ones, and check on what's happening
- You have a shared memory of everything that has happened in this workspace — past executions, failures, patterns, and notes
- When something fails, you can diagnose it by checking memory for similar past issues

How to behave:
- For casual messages (greetings, questions), just respond conversationally. Don't use tools unless they're needed.
- For operational questions ("why did X fail?", "what happened yesterday?"), query memory and execution history to give informed answers.
- For action requests ("run the scraper", "retry that job"), use the appropriate tools.
- When a pipeline failure triggers you automatically, analyze the error, check memory for patterns, and decide whether to retry or alert the user.
- Only store observations in memory when something genuinely noteworthy happens — don't log greetings or trivial interactions.

Keep your responses concise and direct. You're a helpful assistant, not a report generator."""


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

    # Section 4: Instructions (only for non-chat triggers)
    event_type = trigger_event.get("type", "")
    if event_type == "user.request":
        sections.append(
            "## Instructions\n"
            "Respond to the user's message naturally. Use tools only if the user is asking "
            "for information you need to look up or actions you need to take. "
            "For simple conversation, just reply directly without using any tools."
        )
    else:
        sections.append(
            "## Your Task\n"
            "Analyze the current event in context. Decide on the appropriate action "
            "and use your tools if needed. Store important observations in memory."
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
