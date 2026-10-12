"""What the QA agent is given when it drafts a requirement's test cases: the
project's documents, what the project knows about its app, and its test
accounts. Shared by the requirements endpoint and the benchmark, so the
benchmark measures what users get."""

from typing import Any

from sqlalchemy.orm import Session

from app.database.models import KnowledgeFact, Project
from app.rag.retriever import retrieve
from app.services.app_map_service import layout_text, page_text
from app.services.session_service import account_names

DOCUMENT_CHUNKS = 5
# The team's own rules and glossary terms most relevant to the requirement.
TEAM_RULES = 5
TEAM_TERMS = 5
# Enough pages to cover a feature's screens; enough workflows to reuse setup steps.
APP_PAGES = 4
APP_WORKFLOWS = 3
# Pages fetched to choose APP_PAGES from: a site's pages often come in near-identical
# sets (the same docs page per language), which would crowd out everything else.
PAGE_CANDIDATES = 12


def _fact(db: Session, project: Project, kind: str, **content):
    facts = db.query(KnowledgeFact).filter(KnowledgeFact.project_id == project.id, KnowledgeFact.kind == kind)
    return next((f for f in facts if all(f.content.get(k) == v for k, v in content.items())), None)


def _main_heading(text: str) -> str:
    """A page's first heading (page_text's "Headings: A | B" line), or its whole
    text: the same docs page in several languages shares it."""
    for line in text.splitlines():
        if line.startswith("Headings: "):
            return line.removeprefix("Headings: ").split(" | ")[0].strip()
    return text


def app_knowledge(db: Session, project: Project, requirement_text: str) -> list[dict[str, Any]]:
    """The app's every-page layout, its start page, and the pages and proven
    workflows most relevant to the requirement, each with its status
    (observed / proven / ...)."""
    found = []
    layout = _fact(db, project, "layout")
    if layout is not None:
        found.append({"source": "Layout: On every page", "content": layout_text(layout.content), "status": layout.status})
    # Every case starts here, whatever the requirement is about.
    start = _fact(db, project, "page", depth=0)
    if start is not None:
        found.append(
            {"source": f"Page: {start.title}", "content": page_text(start.key, start.title, start.content), "status": start.status}
        )

    seen = {_main_heading(found[-1]["content"])} if start is not None else set()
    pages = []
    for page in retrieve(requirement_text, project.id, k=PAGE_CANDIDATES, kind="fact", fact_kind="page"):
        heading = _main_heading(page["content"])
        if heading in seen:
            continue  # a variant of a page already chosen
        seen.add(heading)
        pages.append(page)
        if len(pages) == APP_PAGES:
            break
    found += pages
    found += retrieve(requirement_text, project.id, k=APP_WORKFLOWS, kind="fact", fact_kind="workflow")
    return found


def drafting_inputs(db: Session, project: Project, requirement_text: str) -> dict[str, Any]:
    """The analysis + QA graph's inputs besides the requirement itself."""
    return {
        # Documents, and what the team stated: both may decide expected results.
        "context": retrieve(requirement_text, project.id, k=DOCUMENT_CHUNKS)
        + retrieve(requirement_text, project.id, k=TEAM_RULES, kind="fact", fact_kind="rule")
        + retrieve(requirement_text, project.id, k=TEAM_TERMS, kind="fact", fact_kind="term"),
        "app_knowledge": app_knowledge(db, project, requirement_text),
        "account_names": account_names(project),
    }
