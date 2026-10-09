import uuid
from typing import Any

from app.rag.vector_store import get_vector_store


def retrieve(query: str, project_id: uuid.UUID, k: int = 5) -> list[dict[str, Any]]:
    """The project's knowledge chunks most relevant to `query`. Never searches
    another project's documents."""
    store = get_vector_store()
    results = store.similarity_search_with_relevance_scores(
        query, k=k, filter={"project_id": str(project_id)}
    )
    return [
        {
            "content": doc.page_content,
            "source": doc.metadata.get("source"),
            "score": score,
        }
        for doc, score in results
    ]
