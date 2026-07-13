"""ChromaDB-backed shared memory store."""

import logging
import uuid
from pathlib import Path
from typing import Optional

import chromadb
from chromadb.config import Settings

from backend.config import CHROMADB_PATH

logger = logging.getLogger("orchestrator")

_client: Optional[chromadb.PersistentClient] = None


def init_memory():
    """Initialize ChromaDB persistent client."""
    global _client
    path = Path(CHROMADB_PATH)
    path.mkdir(parents=True, exist_ok=True)
    _client = chromadb.PersistentClient(
        path=str(path),
        settings=Settings(anonymized_telemetry=False),
    )
    logger.info(f"ChromaDB initialized at {path}")
    return _client


def _get_client() -> chromadb.PersistentClient:
    """Get or lazily initialize the ChromaDB client."""
    global _client
    if _client is None:
        init_memory()
    return _client


def get_collection(workplace_id: str):
    """Get or create a ChromaDB collection for the given workplace."""
    client = _get_client()
    collection_name = f"workplace_{workplace_id.replace('-', '_')}"
    # ChromaDB collection names must be 3-63 chars, start/end with alphanumeric
    return client.get_or_create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )


VALID_SOURCE_TYPES = {
    "execution",
    "agent_decision",
    "user_input",
    "observation",
    "error_pattern",
}


def store_memory(
    workplace_id: str,
    content: str,
    source_type: str,
    source_id: str = "",
    metadata: Optional[dict] = None,
) -> str:
    """Add an entry to the workplace's memory collection.

    Returns the generated memory ID.
    """
    if source_type not in VALID_SOURCE_TYPES:
        raise ValueError(f"Invalid source_type '{source_type}'. Must be one of: {VALID_SOURCE_TYPES}")

    collection = get_collection(workplace_id)
    memory_id = str(uuid.uuid4())

    doc_metadata = {
        "source_type": source_type,
        "source_id": source_id or "",
        "workplace_id": workplace_id,
    }
    if metadata:
        # Flatten metadata — ChromaDB only accepts str/int/float/bool values
        for k, v in metadata.items():
            if isinstance(v, (str, int, float, bool)):
                doc_metadata[k] = v
            else:
                doc_metadata[k] = str(v)

    collection.add(
        ids=[memory_id],
        documents=[content],
        metadatas=[doc_metadata],
    )

    logger.info(f"Stored memory {memory_id} ({source_type}) for workplace {workplace_id}")
    return memory_id


def query_memory(
    workplace_id: str,
    query: str,
    top_k: int = 5,
    where_filter: Optional[dict] = None,
) -> list[dict]:
    """Semantic search over workplace memory.

    Returns list of {content, metadata, distance}.
    """
    collection = get_collection(workplace_id)

    # If collection is empty, return empty
    if collection.count() == 0:
        return []

    kwargs = {
        "query_texts": [query],
        "n_results": min(top_k, collection.count()),
    }
    if where_filter:
        kwargs["where"] = where_filter

    try:
        results = collection.query(**kwargs)
    except Exception as e:
        logger.warning(f"Memory query failed: {e}")
        return []

    memories = []
    if results and results["ids"] and results["ids"][0]:
        for i, doc_id in enumerate(results["ids"][0]):
            memories.append({
                "id": doc_id,
                "content": results["documents"][0][i] if results["documents"] else "",
                "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                "distance": results["distances"][0][i] if results["distances"] else 0.0,
            })

    return memories


def list_memories(
    workplace_id: str,
    limit: int = 50,
    source_type: Optional[str] = None,
) -> list[dict]:
    """List recent entries from the workplace's memory collection."""
    collection = get_collection(workplace_id)

    if collection.count() == 0:
        return []

    kwargs = {
        "limit": min(limit, collection.count()),
    }
    if source_type:
        kwargs["where"] = {"source_type": source_type}

    try:
        results = collection.get(**kwargs)
    except Exception as e:
        logger.warning(f"Memory list failed: {e}")
        return []

    memories = []
    if results and results["ids"]:
        for i, doc_id in enumerate(results["ids"]):
            memories.append({
                "id": doc_id,
                "content": results["documents"][i] if results["documents"] else "",
                "metadata": results["metadatas"][i] if results["metadatas"] else {},
            })

    return memories


def delete_memory(workplace_id: str, memory_id: str) -> bool:
    """Delete a memory entry by ID. Returns True if found and deleted."""
    collection = get_collection(workplace_id)

    # Check if it exists
    existing = collection.get(ids=[memory_id])
    if not existing or not existing["ids"]:
        return False

    collection.delete(ids=[memory_id])
    logger.info(f"Deleted memory {memory_id} from workplace {workplace_id}")
    return True


def get_memory_stats(workplace_id: str) -> dict:
    """Get memory statistics: total count and breakdown by source_type."""
    collection = get_collection(workplace_id)
    total = collection.count()

    breakdown = {}
    if total > 0:
        for st in VALID_SOURCE_TYPES:
            try:
                results = collection.get(where={"source_type": st})
                count = len(results["ids"]) if results and results["ids"] else 0
                if count > 0:
                    breakdown[st] = count
            except Exception:
                pass

    return {
        "total": total,
        "by_source_type": breakdown,
        "workplace_id": workplace_id,
    }
