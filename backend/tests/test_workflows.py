"""Passing runs teach the project how its flows work; failing or hollow ones don't."""

import uuid
from types import SimpleNamespace

from app.automation import runner
from app.services import fact_service, workflow_service

from tests.test_facts import FakeSession, FakeStore

PROJECT = SimpleNamespace(id=uuid.uuid4(), base_url="https://playwright.dev")
CASE = SimpleNamespace(id=uuid.uuid4(), title="Escape closes the search dialog")

TRACE = {
    "base_url": "https://playwright.dev",
    "actions": [
        {"step_text": "Open search", "action": "click", "locator_strategy": "role",
         "locator_value": "button|Search (Control+k)", "value": None, "resulting_url": "https://playwright.dev/"},
        {"step_text": "Type a query", "action": "fill", "locator_strategy": "placeholder",
         "locator_value": "Search docs", "value": "locators", "resulting_url": "https://playwright.dev/"},
        {"step_text": "Close it", "action": "press_key", "locator_strategy": "placeholder",
         "locator_value": "Search docs", "value": "Escape", "resulting_url": "https://playwright.dev/"},
    ],
    "dead_ends": [],
}


def setup(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(fact_service, "get_vector_store", lambda: store)
    return store, FakeSession()


def run(status="passed", trace=TRACE, tries=({"kind": "generated"},)):
    return {"status": status, "trace": trace, "tries": list(tries)}


def test_a_passing_run_becomes_a_proven_workflow(monkeypatch):
    store, db = setup(monkeypatch)
    fact = workflow_service.record_workflow(db, PROJECT, CASE, run())
    assert fact.kind == "workflow" and fact.key == str(CASE.id)
    assert fact.source == "explorer" and fact.status == "proven"
    assert [s["locator_value"] for s in fact.content["steps"]] == ["button|Search (Control+k)", "Search docs", "Search docs"]
    assert fact.content["healed"] is False
    text = store.docs[f"fact-{fact.id}"].page_content
    assert text.splitlines() == [
        "Workflow: Escape closes the search dialog",
        "Starts at https://playwright.dev",
        '1. Open search: click button "Search (Control+k)"',
        '2. Type a query: type "locators" into the field "Search docs"',
        '3. Close it: press Escape in the field "Search docs"',
    ]


def test_failing_and_hollow_runs_teach_nothing(monkeypatch):
    store, db = setup(monkeypatch)
    assert workflow_service.record_workflow(db, PROJECT, CASE, run(status="needs_review")) is None
    hollow = {**TRACE, "dead_ends": [{"step_text": "Go offline", "reason": "no such control"}]}
    assert workflow_service.record_workflow(db, PROJECT, CASE, run(trace=hollow)) is None
    assert workflow_service.record_workflow(db, PROJECT, CASE, run(trace={**TRACE, "actions": []})) is None
    assert db.facts == [] and store.docs == {}


def test_a_replayed_pass_reproves_the_workflow(monkeypatch):
    _, db = setup(monkeypatch)
    assert workflow_service.record_workflow(db, PROJECT, CASE, run(trace=None)) is None  # nothing learned yet
    fact = workflow_service.record_workflow(db, PROJECT, CASE, run(tries=[{"kind": "generated"}, {"kind": "healed"}]))
    assert fact.content["healed"] is True
    seen = fact.last_seen_at
    again = workflow_service.record_workflow(db, PROJECT, CASE, run(trace=None))
    assert again is fact and fact.last_seen_at >= seen and len(db.facts) == 1


def test_runner_hands_back_the_trace(monkeypatch):
    monkeypatch.setattr(runner, "execute_script", lambda code, test_case_id=None: {"passed": True, "output": ""})

    class Explorer:
        def explore(self, test_case, base_url):
            return TRACE

    class Codegen:
        def generate(self, trace, test_case):
            return "code"

    case = {"id": "tc", "title": "t", "steps": []}
    assert runner.automate_test_case(case, "https://x.test", Explorer(), Codegen())["trace"] is TRACE
    replayed = runner.automate_test_case(case, "https://x.test", Explorer(), Codegen(), saved_code="saved")
    assert replayed["trace"] is None


def test_learning_failure_never_fails_the_run(monkeypatch):
    class Session:
        def begin_nested(self):
            from contextlib import nullcontext
            return nullcontext()

    def boom(*args):
        raise RuntimeError("vector store down")

    monkeypatch.setattr(workflow_service, "record_workflow", boom)
    case = SimpleNamespace(id=uuid.uuid4(), requirement=SimpleNamespace(suite=SimpleNamespace(project=PROJECT)))
    workflow_service.learn_from_run(Session(), case, run())  # logs, doesn't raise
