"""
Tags knowledge chunks stored before chunks had a "kind" with kind="document".
Retrieval now filters by kind (uploaded documents vs. facts learned about the
app), so untagged chunks would no longer be found.

Run from backend/ with the venv active (safe to re-run):
    PYTHONPATH=. python scripts/migrate_knowledge_kind.py
"""

from app.rag.vector_store import get_vector_store


def main():
    store = get_vector_store()
    stored = store.get(include=["metadatas"])
    ids, metadatas = [], []
    for chunk_id, metadata in zip(stored["ids"], stored["metadatas"]):
        if metadata and metadata.get("project_id") and not metadata.get("kind"):
            ids.append(chunk_id)
            metadatas.append({**metadata, "kind": "document"})
    if ids:
        # langchain's Chroma wrapper has no metadata-only update.
        store._collection.update(ids=ids, metadatas=metadatas)
    print(f"Tagged {len(ids)} of {len(stored['ids'])} chunks as documents.")


if __name__ == "__main__":
    main()
