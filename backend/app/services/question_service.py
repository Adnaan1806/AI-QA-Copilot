"""A project's open questions: what each requirement's analysis said is
missing, and where a requirement disagrees with what the app shows. Answering
one makes the answer a stated rule, so the next drafting uses it; dismissing
hides it. Both are kept per requirement, keyed by the question's text."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.database.models import Project, Requirement, TestSuite
from app.services.team_knowledge_service import add_rule


def _requirements(db: Session, project: Project) -> list[Requirement]:
    return (
        db.query(Requirement)
        .join(TestSuite, Requirement.suite_id == TestSuite.id)
        .filter(TestSuite.project_id == project.id)
        .order_by(Requirement.created_at.desc())
        .all()
    )


def unresolved(requirement: Requirement) -> list[dict]:
    """The requirement's questions nobody answered or dismissed; the ones
    where the requirement differs from the app first."""
    analysis = requirement.analysis_result
    if analysis is None:
        return []
    resolved = analysis.question_answers or {}
    asked = [(q, True) for q in analysis.open_questions or []] + [(q, False) for q in analysis.missing_info or []]
    return [{"question": q, "differs_from_app": differs} for q, differs in asked if q not in resolved]


def answered(requirement: Requirement) -> list[dict]:
    """The requirement's answered questions with their answers, so a reviewer
    still sees what was asked. Answers saved before the text was kept have none."""
    analysis = requirement.analysis_result
    if analysis is None:
        return []
    resolved = analysis.question_answers or {}
    asked = [(q, True) for q in analysis.open_questions or []] + [(q, False) for q in analysis.missing_info or []]
    return [
        {"question": q, "differs_from_app": differs, "answer": resolved[q].get("answer")}
        for q, differs in asked
        if resolved.get(q, {}).get("status") == "answered"
    ]


def open_questions(db: Session, project: Project) -> list[dict]:
    found = []
    for requirement in _requirements(db, project):
        for item in unresolved(requirement):
            found.append({"requirement_id": requirement.id, "requirement_name": requirement.name, **item})
    return sorted(found, key=lambda q: not q["differs_from_app"])


def _asked(requirement: Requirement, question: str) -> bool:
    analysis = requirement.analysis_result
    return analysis is not None and question in (analysis.open_questions or []) + (analysis.missing_info or [])


def _resolve(
    requirement: Requirement, question: str, status: str, rule_id: Optional[str] = None, answer: Optional[str] = None
) -> None:
    analysis = requirement.analysis_result
    entry = {"status": status, "rule_id": rule_id, "at": datetime.now(timezone.utc).isoformat()}
    if answer is not None:
        entry["answer"] = answer
    # A new dict: SQLAlchemy only notices a JSON column change on reassignment.
    analysis.question_answers = {**(analysis.question_answers or {}), question: entry}


def answer(db: Session, project: Project, requirement: Requirement, question: str, text: str):
    """The answer becomes a stated rule; returns it, or None if the question isn't the requirement's."""
    if not _asked(requirement, question):
        return None
    rule = add_rule(db, project, text)
    rule.content = {**rule.content, "question": question, "requirement_id": str(requirement.id)}
    _resolve(requirement, question, "answered", str(rule.id), text)
    return rule


def dismiss(requirement: Requirement, question: str) -> bool:
    if not _asked(requirement, question):
        return False
    _resolve(requirement, question, "dismissed")
    return True
