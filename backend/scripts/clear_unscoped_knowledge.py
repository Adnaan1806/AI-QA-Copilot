"""
Deletes knowledge chunks uploaded before the knowledge base was per project.
Those chunks have no project_id, so retrieval no longer finds them; this
removes them from the vector store. Re-upload the documents from each
project's Knowledge tab.

Run from backend/ with the venv active (prints what it would delete first):
    PYTHONPATH=. python scripts/clear_unscoped_knowledge.py          # dry run
    PYTHONPATH=. python scripts/clear_unscoped_knowledge.py --delete
"""

import sys
from collections import Counter

from app.rag.vector_store import get_vector_store


def main():
    store = get_vector_store()
    stored = store.get(include=["metadatas"])
    unscoped = [
        (chunk_id, (metadata or {}).get("source") or "unknown")
        for chunk_id, metadata in zip(stored["ids"], stored["metadatas"])
        if not (metadata or {}).get("project_id")
    ]
    print(f"{len(stored['ids'])} chunks stored, {len(unscoped)} without a project:")
    for source, count in Counter(source for _, source in unscoped).most_common():
        print(f"  {count:4}  {source}")

    if "--delete" not in sys.argv:
        print("Dry run. Re-run with --delete to remove them.")
        return
    if unscoped:
        store.delete(ids=[chunk_id for chunk_id, _ in unscoped])
    print(f"Deleted {len(unscoped)} chunks.")


if __name__ == "__main__":
    main()
