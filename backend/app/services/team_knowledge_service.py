"""What the team tells a project about its app: business rules and glossary
terms. Stored as facts (status "stated", source "reviewer") next to what the
crawler and test runs learned, so search and drafting find them the same way.
Unlike observed facts, a stated rule may decide an expected result -- a person
said the app should behave so."""

import uuid

from sqlalchemy.orm import Session

from app.database.models import KnowledgeFact, Project
from app.services.fact_service import forget_facts, record_fact, set_fact_status

TEAM_KINDS = ("rule", "term")


def rule_text(text: str) -> str:
    return f"Business rule: {text}"


def term_text(term: str, meaning: str) -> str:
    return f"Term: {term} -- {meaning}"


def add_rule(db: Session, project: Project, text: str) -> KnowledgeFact:
    return record_fact(
        db, project, kind="rule", key=str(uuid.uuid4()), title=text[:80], content={"text": text},
        text=rule_text(text), source="reviewer", status="stated",
    )


def add_term(db: Session, project: Project, term: str, meaning: str) -> KnowledgeFact:
    """A term is keyed by its name, so adding it again updates its meaning."""
    return record_fact(
        db, project, kind="term", key=term.lower(), title=term, content={"term": term, "meaning": meaning},
        text=term_text(term, meaning), source="reviewer", status="stated",
    )


def edit_team_fact(
    db: Session, project: Project, fact: KnowledgeFact, text: str = "", term: str = "", meaning: str = ""
) -> KnowledgeFact:
    if fact.kind == "rule":
        return record_fact(
            db, project, kind="rule", key=fact.key, title=text[:80], content={"text": text},
            text=rule_text(text), source="reviewer", status="stated",
        )
    if term.lower() != fact.key:
        forget_facts(db, [fact])  # a renamed term has a new key
    return add_term(db, project, term, meaning)


def confirm_fact(fact: KnowledgeFact) -> None:
    """A person checked a page or workflow: it survives re-crawls and counts as confirmed."""
    set_fact_status(fact, "confirmed")
