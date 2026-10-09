import uuid
from typing import Any

from app.rag.vector_store import get_vector_store


def retrieve(
    query: str, project_id: uuid.UUID, k: int = 5, kind: str = "document"
) -> list[dict[str, Any]]:
    """The project's chunks most relevant to `query`: uploaded documents by
    default, or "fact" for what the project has learned about its app. Never
    searches another project's."""
    store = get_vector_store()
    results = store.similarity_search_with_relevance_scores(
        query, k=k, filter={"$and": [{"project_id": str(project_id)}, {"kind": kind}]}
    )
    return [
        {
            "content": doc.page_content,
            "source": doc.metadata.get("source"),
            "score": score,
        }
        for doc, score in results
    ]
