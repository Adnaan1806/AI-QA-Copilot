import uuid
from typing import Any, Optional

from app.rag.vector_store import get_vector_store


def retrieve(
    query: str,
    project_id: uuid.UUID,
    k: int = 5,
    kind: str = "document",
    fact_kind: Optional[str] = None,
) -> list[dict[str, Any]]:
    """The project's chunks most relevant to `query`: uploaded documents by
    default, or "fact" for what the project has learned about its app --
    narrowed to one `fact_kind` ("page", "workflow") if given. Never searches
    another project's."""
    store = get_vector_store()
    conditions = [{"project_id": str(project_id)}, {"kind": kind}]
    if fact_kind:
        conditions.append({"fact_kind": fact_kind})
    results = store.similarity_search_with_relevance_scores(query, k=k, filter={"$and": conditions})
    return [
        {
            "content": doc.page_content,
            "source": doc.metadata.get("source"),
            "score": score,
            # Facts only: observed (seen in the app) or proven (a passing test did it), etc.
            "status": doc.metadata.get("fact_status"),
        }
        for doc, score in results
    ]
