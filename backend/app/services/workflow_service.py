"""Learns how flows work in the app from passing automation runs. The path the
Explorer took for a case that then passed is proven: it becomes a "workflow"
fact, so later drafting and exploration can reuse the real steps and labels.

Only the steps are learned, never the expected result: the app showing
something proves how to get there, not that it is what should happen."""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.database.models import KnowledgeFact, Project, TestCase
from app.services.fact_service import record_fact

logger = logging.getLogger(__name__)


def _target(strategy: str, value: str) -> str:
    """The element as a tester would name it."""
    if strategy == "role" and "|" in value:
        role, name = value.split("|", 1)
        return f'{role} "{name}"'
    if strategy == "placeholder":
        return f'the field "{value}"'
    if strategy == "label":
        return f'"{value}"'
    if strategy == "text":
        return f'the text "{value}"'
    if strategy == "control":
        return f'the control "{value}"'
    return "an element"


def _describe(step: dict) -> str:
    target = _target(step["locator_strategy"], step["locator_value"])
    action, value = step["action"], step.get("value")
    if action == "fill":
        return f'type "{value}" into {target}'
    if action == "press_key":
        return f"press {value or 'Enter'} in {target}"
    if action == "select_option":
        return f'choose "{value}" in {target}'
    if action == "check":
        return f"tick {target}"
    return f"click {target}"


def workflow_text(title: str, start_url: str, steps: list[dict]) -> str:
    lines = [f"Workflow: {title}", f"Starts at {start_url}"]
    for i, step in enumerate(steps, 1):
        lines.append(f"{i}. {step['step_text']}: {_describe(step)}")
    return "\n".join(lines)


def record_workflow(db: Session, project: Project, test_case: TestCase, script: dict) -> Optional[KnowledgeFact]:
    """Record the path behind a passing run. A replayed pass re-proves the
    workflow already learned; a pass with steps the Explorer couldn't carry
    out proves nothing and is not recorded."""
    if script.get("status") != "passed":
        return None
    key = str(test_case.id)
    trace = script.get("trace")
    if trace is None:
        fact = (
            db.query(KnowledgeFact)
            .filter_by(project_id=project.id, kind="workflow", key=key)
            .one_or_none()
        )
        if fact is not None:
            fact.last_seen_at = datetime.now(timezone.utc)
        return fact
    if trace.get("dead_ends") or not trace.get("actions"):
        return None

    steps = [
        {
            "step_text": action["step_text"],
            "action": action["action"],
            "locator_strategy": action["locator_strategy"],
            "locator_value": action["locator_value"],
            "value": action.get("value"),
            "url": action.get("resulting_url"),
        }
        for action in trace["actions"]
    ]
    content = {
        "test_case_id": key,
        "start_url": trace.get("base_url") or project.base_url,
        "steps": steps,
        # Healing changed the script after the Explorer's run; the steps are
        # still how the app was driven, but the passing script may differ.
        "healed": any(t["kind"] == "healed" for t in script.get("tries") or []),
    }
    return record_fact(
        db,
        project,
        kind="workflow",
        key=key,
        title=test_case.title,
        content=content,
        text=workflow_text(test_case.title, content["start_url"], steps),
        source="explorer",
        status="proven",
    )


def learn_from_run(db: Session, test_case: TestCase, script: dict) -> None:
    """record_workflow for a saved run; learning never fails the run itself."""
    try:
        # A savepoint, so a failed write here leaves the run's own save intact.
        with db.begin_nested():
            record_workflow(db, test_case.requirement.suite.project, test_case, script)
    except Exception:
        logger.exception("Couldn't learn a workflow from test case %s", test_case.id)
