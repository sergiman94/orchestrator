"""Agent API routes."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import get_db, User, Workplace, Agent, utcnow
from backend.agent.service import invoke_agent, chat_with_agent
from backend.memory.service import list_memories

logger = logging.getLogger("orchestrator")

router = APIRouter(
    prefix="/api/workplaces/{workplace_id}/agent",
    tags=["agent"],
    redirect_slashes=False,
)


# --- Schemas ---

class AgentConfigUpdate(BaseModel):
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    enabled: Optional[bool] = None
    name: Optional[str] = None


class AgentInvokeRequest(BaseModel):
    event_type: str = "user.request"
    payload: dict = {}


class AgentChatRequest(BaseModel):
    message: str


# --- Helpers ---

def _get_workplace_or_404(db: Session, workplace_id: str) -> Workplace:
    workplace = db.query(Workplace).filter(Workplace.id == workplace_id).first()
    if not workplace:
        raise HTTPException(status_code=404, detail="Workplace not found")
    return workplace


def _verify_owner(workplace: Workplace, user: User):
    if workplace.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this workplace")


def _serialize_agent(agent: Agent) -> dict:
    return {
        "id": agent.id,
        "workplace_id": agent.workplace_id,
        "name": agent.name,
        "model": agent.model or "llama-3.3-70b-versatile",
        "system_prompt": agent.system_prompt or "",
        "capabilities": agent.capabilities or {},
        "temperature": agent.temperature if agent.temperature is not None else 0.3,
        "max_tokens": agent.max_tokens or 4096,
        "enabled": agent.enabled if agent.enabled is not None else True,
        "created_at": agent.created_at.isoformat() if agent.created_at else "",
    }


def _get_or_create_agent(db: Session, workplace_id: str) -> Agent:
    """Get the workplace's agent or create a default one."""
    agent = (
        db.query(Agent)
        .filter(Agent.workplace_id == workplace_id)
        .first()
    )
    if not agent:
        agent = Agent(
            workplace_id=workplace_id,
            name="Supervisor Agent",
            model="llama-3.3-70b-versatile",
            system_prompt="",
            capabilities={},
            temperature=0.3,
            max_tokens=4096,
            enabled=True,
        )
        db.add(agent)
        db.commit()
        db.refresh(agent)
    return agent


# --- Routes (static paths first, then parameterized) ---

@router.get("/invoke")
def get_invoke_info(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return info about the invoke endpoint (use POST to invoke)."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)
    return {"message": "Use POST to invoke the agent.", "method": "POST"}


@router.post("/invoke")
def invoke_agent_endpoint(
    workplace_id: str,
    body: AgentInvokeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually invoke the agent with a trigger event."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    agent = _get_or_create_agent(db, workplace_id)
    if not agent.enabled:
        raise HTTPException(status_code=400, detail="Agent is disabled for this workplace.")

    trigger_event = {
        "type": body.event_type,
        "payload": body.payload,
        "source_type": "user",
        "source_id": user.id,
    }

    result = invoke_agent(workplace_id, trigger_event, db)
    return result


@router.get("/history")
def agent_history(
    workplace_id: str,
    limit: int = 50,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List agent decisions from memory."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    memories = list_memories(workplace_id, limit=limit, source_type="agent_decision")
    return {"decisions": memories, "count": len(memories)}


@router.post("/chat")
def agent_chat(
    workplace_id: str,
    body: AgentChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Send a message to the agent, get a response (single turn)."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    if not body.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    agent = _get_or_create_agent(db, workplace_id)
    if not agent.enabled:
        raise HTTPException(status_code=400, detail="Agent is disabled for this workplace.")

    result = chat_with_agent(workplace_id, body.message, db)
    return result


@router.get("")
def get_agent_config(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get agent configuration for the workplace."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    agent = _get_or_create_agent(db, workplace_id)
    return _serialize_agent(agent)


@router.put("")
def update_agent_config(
    workplace_id: str,
    body: AgentConfigUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update agent configuration."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    agent = _get_or_create_agent(db, workplace_id)

    if body.name is not None:
        agent.name = body.name
    if body.system_prompt is not None:
        agent.system_prompt = body.system_prompt
    if body.model is not None:
        agent.model = body.model
    if body.temperature is not None:
        if not (0.0 <= body.temperature <= 2.0):
            raise HTTPException(status_code=400, detail="Temperature must be between 0.0 and 2.0")
        agent.temperature = body.temperature
    if body.max_tokens is not None:
        if body.max_tokens < 1 or body.max_tokens > 32768:
            raise HTTPException(status_code=400, detail="max_tokens must be between 1 and 32768")
        agent.max_tokens = body.max_tokens
    if body.enabled is not None:
        agent.enabled = body.enabled

    db.commit()
    db.refresh(agent)
    return _serialize_agent(agent)
