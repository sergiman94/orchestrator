"""Memory API routes."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth import get_current_user
from backend.database import get_db, User, Workplace
from backend.memory.service import (
    query_memory,
    list_memories,
    store_memory,
    delete_memory,
    get_memory_stats,
    VALID_SOURCE_TYPES,
)

logger = logging.getLogger("orchestrator")

router = APIRouter(
    prefix="/api/workplaces/{workplace_id}/memory",
    tags=["memory"],
    redirect_slashes=False,
)


# --- Schemas ---

class MemoryCreate(BaseModel):
    content: str
    source_type: str = "user_input"
    source_id: str = ""
    metadata: Optional[dict] = None


# --- Helpers ---

def _get_workplace_or_404(db: Session, workplace_id: str) -> Workplace:
    workplace = db.query(Workplace).filter(Workplace.id == workplace_id).first()
    if not workplace:
        raise HTTPException(status_code=404, detail="Workplace not found")
    return workplace


def _verify_owner(workplace: Workplace, user: User):
    if workplace.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this workplace")


# --- Routes (static paths first, then parameterized) ---

@router.get("/search")
def search_memories(
    workplace_id: str,
    q: str = Query(..., min_length=1, description="Search query"),
    top_k: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Semantic search over workplace memory."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    results = query_memory(workplace_id, q, top_k=top_k)
    return {"results": results, "query": q, "count": len(results)}


@router.get("/stats")
def memory_stats(
    workplace_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get memory statistics for the workplace."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    stats = get_memory_stats(workplace_id)
    return stats


@router.get("")
def list_workplace_memories(
    workplace_id: str,
    limit: int = Query(50, ge=1, le=200),
    source_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List memories for the workplace, optionally filtered by source_type."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    if source_type and source_type not in VALID_SOURCE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source_type. Must be one of: {', '.join(sorted(VALID_SOURCE_TYPES))}",
        )

    memories = list_memories(workplace_id, limit=limit, source_type=source_type)
    return {"memories": memories, "count": len(memories)}


@router.post("", status_code=201)
def create_memory(
    workplace_id: str,
    body: MemoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a manual memory entry."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")

    if body.source_type not in VALID_SOURCE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source_type. Must be one of: {', '.join(sorted(VALID_SOURCE_TYPES))}",
        )

    memory_id = store_memory(
        workplace_id=workplace_id,
        content=body.content,
        source_type=body.source_type,
        source_id=body.source_id,
        metadata=body.metadata,
    )

    return {"id": memory_id, "message": "Memory entry created."}


@router.delete("/{memory_id}", status_code=204)
def remove_memory(
    workplace_id: str,
    memory_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a memory entry by ID."""
    workplace = _get_workplace_or_404(db, workplace_id)
    _verify_owner(workplace, user)

    deleted = delete_memory(workplace_id, memory_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Memory entry not found")

    return None
