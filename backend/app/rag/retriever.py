from typing import Any

from app.rag.vector_store import get_vector_store


def retrieve(query: str, k: int = 5) -> list[dict[str, Any]]:
    store = get_vector_store()
    results = store.similarity_search_with_relevance_scores(query, k=k)
    return [
        {
            "content": doc.page_content,
            "source": doc.metadata.get("source"),
            "score": score,
        }
        for doc, score in results
    ]
