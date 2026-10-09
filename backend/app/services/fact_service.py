"""The project's growing knowledge about its app. Every source (the crawler
today; passing scripts, the healer, reviewers and chat later) adds facts
through record_fact(), which updates a fact it has seen before instead of
duplicating it, and keeps the fact's text in the vector store for retrieval."""

import uuid
from datetime import datetime, timezone

from langchain_core.documents import Document
from sqlalchemy.orm import Session

from app.database.models import KnowledgeFact, Project
from app.rag.vector_store import get_vector_store

# Higher wins: seeing a fact again never lowers how far it can be relied on,
# unless what was seen changed.
STATUS_RANK = {"observed": 0, "stated": 1, "proven": 2, "confirmed": 3}


def _vector_id(fact: KnowledgeFact) -> str:
    return f"fact-{fact.id}"


def record_fact(
    db: Session,
    project: Project,
    *,
    kind: str,
    key: str,
    title: str,
    content: dict,
    text: str,
    source: str,
    status: str,
    seen_at: datetime | None = None,
) -> KnowledgeFact:
    """Add a fact, or refresh the one with the same kind and key. If its
    content changed, its status resets to the new one: a confirmed page whose
    buttons changed is only observed again."""
    seen_at = seen_at or datetime.now(timezone.utc)
    fact = (
        db.query(KnowledgeFact)
        .filter_by(project_id=project.id, kind=kind, key=key)
        .one_or_none()
    )
    if fact is None:
        fact = KnowledgeFact(
            id=uuid.uuid4(),
            project_id=project.id,
            kind=kind,
            key=key,
            first_seen_at=seen_at,
            source=source,
            status=status,
        )
        db.add(fact)
    elif fact.content != content:
        fact.source, fact.status = source, status
    elif STATUS_RANK.get(status, 0) > STATUS_RANK.get(fact.status, 0):
        fact.source, fact.status = source, status
    fact.title = title
    fact.content = content
    fact.last_seen_at = seen_at
    db.flush()

    get_vector_store().add_documents(
        [
            Document(
                page_content=text,
                metadata={
                    "source": f"{kind.capitalize()}: {title}",
                    "project_id": str(project.id),
                    "kind": "fact",
                    "fact_kind": kind,
                    "fact_status": fact.status,
                },
            )
        ],
        ids=[_vector_id(fact)],
    )
    return fact


def forget_facts(db: Session, facts: list[KnowledgeFact]) -> None:
    if not facts:
        return
    get_vector_store().delete(ids=[_vector_id(fact) for fact in facts])
    for fact in facts:
        db.delete(fact)
