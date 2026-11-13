"""Learns how flows work in the app from passing automation runs. The path the
Explorer took for a case that then passed is proven: it becomes a "workflow"
fact, so later drafting and exploration can reuse the real steps and labels.

Cases that take the same path -- the same controls on the same pages, whatever
was typed or chosen -- share one flow, which lists the cases that proved it and
the options each dropdown was proven with. The list grows with the app, not
with the number of test cases.

Only the steps are learned, never the expected result: the app showing
something proves how to get there, not that it is what should happen."""

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from sqlalchemy.orm import Session

from app.database.models import KnowledgeFact, Project, TestCase
from app.services.fact_service import forget_facts, record_fact

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


def workflow_text(title: str, start_url: str, steps: list[dict], cases: list[dict] = (), options: dict = None) -> str:
    lines = [f"Workflow: {title}", f"Starts at {start_url}"]
    for i, step in enumerate(steps, 1):
        line = f"{i}. {step['step_text']}: {_describe(step)}"
        proven = (options or {}).get(str(i - 1))
        if proven and len(proven) > 1:
            line += f" (also proven with: {', '.join(v for v in proven if v != step.get('value'))})"
        lines.append(line)
    if len(cases) > 1:
        lines.append("Proven by: " + "; ".join(c["title"] for c in cases))
    return "\n".join(lines)


def _path(url: Optional[str]) -> str:
    return urlparse(url or "").path or "/"


def _distinct_steps(start_url: str, steps: list[dict]) -> list[tuple[tuple, dict]]:
    """(entry, step) for each step that counts: on which page it used which
    control, and how. What was typed or chosen, and each case's own wording,
    don't count; a step repeated straight away (a re-filled field) counts once."""
    page, kept = _path(start_url), []
    for step in steps:
        entry = (page, step["action"], step["locator_strategy"], step["locator_value"])
        if not kept or kept[-1][0] != entry:
            kept.append((entry, step))
        page = _path(step.get("url")) if step.get("url") else page
    return kept


def flow_signature(start_url: str, steps: list[dict]) -> list[tuple]:
    return [entry for entry, _ in _distinct_steps(start_url, steps)]


def flow_key(start_url: str, steps: list[dict]) -> str:
    digest = hashlib.sha1(json.dumps(flow_signature(start_url, steps)).encode()).hexdigest()[:16]
    return f"flow:{digest}"


_TRAILING = {"by", "with", "for", "to", "and", "then", "on", "in", "of", "-", "the", "a"}


def flow_title(case_titles: list[str]) -> str:
    """The words all the cases' titles start with ("Sort products by Name" and
    "Sort products by Price" -> "Sort products"), else the first title."""
    if len(case_titles) == 1:
        return case_titles[0]
    words = [t.split() for t in case_titles]
    common = []
    for group in zip(*words):
        if len({w.lower() for w in group}) != 1:
            break
        common.append(group[0])
    while common and common[-1].lower().strip(":") in _TRAILING:
        common.pop()
    return " ".join(common) if len(common) >= 2 else case_titles[0]


def _flows(db: Session, project: Project) -> list[KnowledgeFact]:
    return db.query(KnowledgeFact).filter_by(project_id=project.id, kind="workflow").all()


def _record_flow(db: Session, project: Project, key: str, start_url: str, steps: list[dict],
                 cases: list[dict], options: dict, healed: bool) -> KnowledgeFact:
    title = flow_title([c["title"] for c in cases])
    content = {
        "start_url": start_url,
        "steps": steps,
        "cases": cases,
        # Step index -> every value proven in that dropdown.
        "options": options,
        # Healing changed a script after the Explorer's run; the steps are
        # still how the app was driven, but the passing script may differ.
        "healed": healed,
    }
    return record_fact(
        db, project, kind="workflow", key=key, title=title, content=content,
        text=workflow_text(title, start_url, steps, cases, options), source="explorer", status="proven",
    )


def add_case_to_flow(db: Session, project: Project, case: dict, start_url: str, steps: list[dict], healed: bool):
    """File a passing case's path under its flow, moving the case out of any
    other flow it was in (its steps changed) and dropping flows left empty."""
    key = flow_key(start_url, steps)
    flows = _flows(db, project)
    for other in flows:
        cases = other.content.get("cases", [])
        remaining = [c for c in cases if c["id"] != case["id"]]
        if other.key == key or len(remaining) == len(cases):
            continue
        if remaining:
            _record_flow(db, project, other.key, other.content["start_url"], other.content["steps"],
                         remaining, other.content.get("options", {}), other.content.get("healed", False))
        else:
            forget_facts(db, [other])

    distinct = [step for _, step in _distinct_steps(start_url, steps)]
    existing = next((f for f in flows if f.key == key), None)
    if existing is None:
        cases, options, flow_steps = [case], {}, distinct
    else:
        content = existing.content
        cases = [c for c in content["cases"] if c["id"] != case["id"]] + [case]
        options, flow_steps = dict(content.get("options", {})), content["steps"]
        healed = healed or content.get("healed", False)
    for i, step in enumerate(distinct):
        if step["action"] == "select_option" and step.get("value") and step["value"] not in options.get(str(i), []):
            options[str(i)] = options.get(str(i), []) + [step["value"]]
    return _record_flow(db, project, key, start_url, flow_steps, cases, options, healed)


def record_workflow(db: Session, project: Project, test_case: TestCase, script: dict) -> Optional[KnowledgeFact]:
    """Record the path behind a passing run. A replayed pass re-proves the
    flow already learned; a pass with steps the Explorer couldn't carry
    out proves nothing and is not recorded."""
    if script.get("status") != "passed":
        return None
    case_id = str(test_case.id)
    trace = script.get("trace")
    if trace is None:
        fact = next((f for f in _flows(db, project) if any(c["id"] == case_id for c in f.content.get("cases", []))), None)
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
    healed = any(t["kind"] == "healed" for t in script.get("tries") or [])
    start_url = trace.get("start_url") or trace.get("base_url") or project.base_url
    return add_case_to_flow(db, project, {"id": case_id, "title": test_case.title}, start_url, steps, healed)


def learn_from_run(db: Session, test_case: TestCase, script: dict) -> None:
    """record_workflow for a saved run; learning never fails the run itself."""
    try:
        # A savepoint, so a failed write here leaves the run's own save intact.
        with db.begin_nested():
            record_workflow(db, test_case.requirement.suite.project, test_case, script)
    except Exception:
        logger.exception("Couldn't learn a workflow from test case %s", test_case.id)
