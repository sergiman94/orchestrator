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
    ttl_days: Optional[int] = None,
) -> str:
    """Add an entry to the workplace's memory collection.

    Args:
        ttl_days: Optional time-to-live in days. If set, expires_at is calculated.

    Returns the generated memory ID.
    """
    from datetime import datetime, timedelta

    if source_type not in VALID_SOURCE_TYPES:
        raise ValueError(f"Invalid source_type '{source_type}'. Must be one of: {VALID_SOURCE_TYPES}")

    collection = get_collection(workplace_id)
    memory_id = str(uuid.uuid4())

    now = datetime.utcnow()
    doc_metadata = {
        "source_type": source_type,
        "source_id": source_id or "",
        "workplace_id": workplace_id,
        "created_at": now.isoformat(),
    }

    if ttl_days and ttl_days > 0:
        expires_at = now + timedelta(days=ttl_days)
        doc_metadata["expires_at"] = expires_at.isoformat()

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

    from datetime import datetime

    now_iso = datetime.utcnow().isoformat()
    memories = []
    if results and results["ids"] and results["ids"][0]:
        for i, doc_id in enumerate(results["ids"][0]):
            meta = results["metadatas"][0][i] if results["metadatas"] else {}
            # Filter out expired entries
            expires_at = meta.get("expires_at", "")
            if expires_at and expires_at < now_iso:
                continue
            # Filter out compacted originals
            if meta.get("compacted_into"):
                continue
            memories.append({
                "id": doc_id,
                "content": results["documents"][0][i] if results["documents"] else "",
                "metadata": meta,
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


def purge_expired_memories():
    """Daily job: delete expired memory entries from all collections.

    Scans all ChromaDB collections, finds entries with expires_at < now,
    deletes from ChromaDB. Fire-and-forget (AD-9).
    """
    from datetime import datetime

    client = _get_client()
    now_iso = datetime.utcnow().isoformat()
    total_purged = 0

    try:
        collections = client.list_collections()
        for col in collections:
            try:
                # Get all entries with expires_at metadata
                all_entries = col.get(include=["metadatas"])
                if not all_entries or not all_entries["ids"]:
                    continue
                expired_ids = []
                for i, entry_id in enumerate(all_entries["ids"]):
                    meta = all_entries["metadatas"][i] if all_entries["metadatas"] else {}
                    expires_at = meta.get("expires_at", "")
                    if expires_at and expires_at < now_iso:
                        expired_ids.append(entry_id)
                if expired_ids:
                    col.delete(ids=expired_ids)
                    total_purged += len(expired_ids)
                    logger.info(f"Purged {len(expired_ids)} expired entries from {col.name}")
            except Exception as e:
                logger.warning(f"Error purging collection {col.name}: {e}")
    except Exception as e:
        logger.error(f"Memory purge failed: {e}")

    logger.info(f"Memory purge complete: {total_purged} entries removed")
    return total_purged


def compact_memories(workplace_id: str) -> dict:
    """Compact similar memory entries into higher-level patterns.

    Clusters entries by cosine similarity > 0.85 (groups of 3+),
    summarizes each cluster via LLM, marks originals as compacted.
    """
    from backend.llm.client import call_llm
    import json

    collection = get_collection(workplace_id)
    if collection.count() < 3:
        return {"clusters_found": 0, "clusters_compacted": 0, "clusters_failed": 0, "entries_processed": 0}

    # Get all non-compacted entries
    all_entries = collection.get(include=["documents", "metadatas", "embeddings"])
    if not all_entries or not all_entries["ids"]:
        return {"clusters_found": 0, "clusters_compacted": 0, "clusters_failed": 0, "entries_processed": 0}

    # Filter out already-compacted entries
    active_indices = []
    for i, entry_id in enumerate(all_entries["ids"]):
        meta = all_entries["metadatas"][i] if all_entries["metadatas"] else {}
        if not meta.get("compacted_into") and not meta.get("compacted") == "true":
            active_indices.append(i)

    if len(active_indices) < 3:
        return {"clusters_found": 0, "clusters_compacted": 0, "clusters_failed": 0, "entries_processed": len(active_indices)}

    # Simple clustering: for each entry, query similar ones
    clustered_ids = set()
    clusters = []

    for idx in active_indices:
        entry_id = all_entries["ids"][idx]
        if entry_id in clustered_ids:
            continue

        doc = all_entries["documents"][idx]
        # Find similar entries
        try:
            similar = collection.query(
                query_texts=[doc],
                n_results=min(10, collection.count()),
            )
        except Exception:
            continue

        cluster_ids = []
        cluster_docs = []
        if similar and similar["ids"] and similar["ids"][0]:
            for j, sim_id in enumerate(similar["ids"][0]):
                if sim_id in clustered_ids:
                    continue
                distance = similar["distances"][0][j] if similar["distances"] else 1.0
                similarity = 1 - distance
                if similarity >= 0.85:
                    sim_meta = similar["metadatas"][0][j] if similar["metadatas"] else {}
                    if not sim_meta.get("compacted_into"):
                        cluster_ids.append(sim_id)
                        cluster_docs.append(similar["documents"][0][j])

        if len(cluster_ids) >= 3:
            clusters.append({"ids": cluster_ids, "docs": cluster_docs})
            clustered_ids.update(cluster_ids)

    # Summarize each cluster via LLM
    compacted = 0
    failed = 0

    for cluster in clusters:
        try:
            combined = "\n---\n".join(cluster["docs"][:10])  # cap at 10 entries
            response = call_llm(
                messages=[{
                    "role": "user",
                    "content": f"Summarize these related operational observations into one concise pattern description (2-3 sentences):\n\n{combined}",
                }],
                temperature=0.1,
                max_tokens=300,
            )

            summary_id = store_memory(
                workplace_id=workplace_id,
                content=response.content,
                source_type="observation",
                metadata={
                    "compacted": "true",
                    "original_count": len(cluster["ids"]),
                    "compacted_from": json.dumps(cluster["ids"]),
                },
            )

            # Mark originals as compacted
            for orig_id in cluster["ids"]:
                try:
                    collection.update(
                        ids=[orig_id],
                        metadatas=[{"compacted_into": summary_id}],
                    )
                except Exception:
                    pass

            compacted += 1
        except Exception as e:
            logger.warning(f"Compaction failed for cluster of {len(cluster['ids'])} entries: {e}")
            failed += 1

    result = {
        "clusters_found": len(clusters),
        "clusters_compacted": compacted,
        "clusters_failed": failed,
        "entries_processed": len(active_indices),
    }
    logger.info(f"Memory compaction for {workplace_id}: {result}")
    return result
