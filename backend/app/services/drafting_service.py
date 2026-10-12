"""What the QA agent is given when it drafts a requirement's test cases: the
project's documents, what the project knows about its app, and its test
accounts. Shared by the requirements endpoint and the benchmark, so the
benchmark measures what users get."""

from typing import Any

from sqlalchemy.orm import Session

from app.database.models import KnowledgeFact, Project
from app.rag.retriever import retrieve
from app.services.app_map_service import layout_text
from app.services.session_service import account_names

DOCUMENT_CHUNKS = 5
# Enough pages to cover a feature's screens; enough workflows to reuse setup steps.
APP_PAGES = 4
APP_WORKFLOWS = 3


def app_knowledge(db: Session, project: Project, requirement_text: str) -> list[dict[str, Any]]:
    """The app's pages and proven workflows most relevant to the requirement,
    and its every-page layout, each with its status (observed / proven / ...)."""
    found = []
    layout = (
        db.query(KnowledgeFact)
        .filter(KnowledgeFact.project_id == project.id, KnowledgeFact.kind == "layout")
        .first()
    )
    if layout is not None:
        found.append({"source": "Layout: On every page", "content": layout_text(layout.content), "status": layout.status})
    for fact_kind, k in (("page", APP_PAGES), ("workflow", APP_WORKFLOWS)):
        found += retrieve(requirement_text, project.id, k=k, kind="fact", fact_kind=fact_kind)
    return found


def drafting_inputs(db: Session, project: Project, requirement_text: str) -> dict[str, Any]:
    """The analysis + QA graph's inputs besides the requirement itself."""
    return {
        "context": retrieve(requirement_text, project.id, k=DOCUMENT_CHUNKS),
        "app_knowledge": app_knowledge(db, project, requirement_text),
        "account_names": account_names(project),
    }
