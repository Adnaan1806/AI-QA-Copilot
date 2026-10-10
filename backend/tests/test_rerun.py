"""Re-runs replay the saved passing script and only fall back to exploration,
generation and healing when it fails. No LLM or browser is involved: the agents
and the script executor are replaced with fakes."""

from types import SimpleNamespace

import pytest

from app.automation import runner
from app.orchestration import graph
from app.services.automation_service import (
    reported_statuses,
    runs_with_tries,
    saved_passing_scripts,
    script_statuses,
)

CASE = {"id": "tc-1", "title": "Get started opens Installation", "steps": ["Click Get started"]}


class FakeExplorer:
    def __init__(self):
        self.calls = 0

    def explore(self, test_case, base_url, start=None):
        self.calls += 1
        return {"actions": [], "dead_ends": []}


class FakeCodegen:
    def __init__(self, fixable=True):
        self.generated = 0
        self.healed = 0
        self.fixable = fixable

    def generate(self, trace, test_case):
        self.generated += 1
        return "generated"

    def heal(self, code, result, trace, test_case, attempt):
        self.healed += 1
        if not self.fixable:
            return {"fixable": False, "reason": "page shows no message", "code": ""}
        return {"fixable": True, "reason": "", "code": f"healed-{attempt}"}


def fake_executor(monkeypatch, passing_code):
    """Scripts pass only when their code is in `passing_code`."""
    ran = []

    def execute(code, test_case_id=None, storage_state=None):
        ran.append(code)
        return {"passed": code in passing_code, "output": "boom", "trace_path": None}

    monkeypatch.setattr(runner, "execute_script", execute)
    return ran


def automate(saved_code=None):
    explorer, codegen = FakeExplorer(), FakeCodegen()
    result = runner.automate_test_case(
        CASE, "https://example.test", explorer, codegen, saved_code=saved_code
    )
    return result, explorer, codegen


def test_passing_saved_script_is_replayed_without_llm_calls(monkeypatch):
    ran = fake_executor(monkeypatch, {"saved"})
    result, explorer, codegen = automate(saved_code="saved")

    assert ran == ["saved"]
    assert explorer.calls == 0 and codegen.generated == 0 and codegen.healed == 0
    assert result["status"] == "passed"
    assert result["code"] == "saved"
    assert result["attempts"] == 1


def test_failing_saved_script_falls_back_to_full_pipeline(monkeypatch):
    ran = fake_executor(monkeypatch, {"generated"})
    result, explorer, codegen = automate(saved_code="saved")

    assert ran == ["saved", "generated"]
    assert explorer.calls == 1 and codegen.generated == 1
    assert result["status"] == "passed"
    assert result["code"] == "generated"
    assert result["attempts"] == 2  # the failed replay counts as a try


def test_fallback_still_heals(monkeypatch):
    ran = fake_executor(monkeypatch, {"healed-1"})
    result, _, codegen = automate(saved_code="saved")

    assert ran == ["saved", "generated", "healed-1"]
    assert codegen.healed == 1
    assert result["status"] == "passed"
    assert result["attempts"] == 3
    assert [(t["kind"], t["passed"], t["code"]) for t in result["tries"]] == [
        ("replayed", False, "saved"),
        ("generated", False, "generated"),
        ("healed", True, "healed-1"),
    ]
    assert result["tries"][0]["output"] == "boom"
    assert result["tries"][2]["output"] == ""  # passing tries keep no output


def test_without_saved_script_runs_full_pipeline(monkeypatch):
    ran = fake_executor(monkeypatch, {"generated"})
    result, explorer, _ = automate()

    assert ran == ["generated"]
    assert explorer.calls == 1
    assert result["attempts"] == 1


def test_needs_review_after_all_attempts(monkeypatch):
    ran = fake_executor(monkeypatch, set())
    result, _, codegen = automate(saved_code="saved")

    assert len(ran) == 1 + runner.MAX_ATTEMPTS
    assert codegen.healed == runner.MAX_ATTEMPTS - 1
    assert result["status"] == "needs_review"
    assert result["last_output"] == "boom"


def test_unfixable_failure_stops_healing(monkeypatch):
    ran = fake_executor(monkeypatch, set())
    explorer, codegen = FakeExplorer(), FakeCodegen(fixable=False)
    result = runner.automate_test_case(CASE, "https://example.test", explorer, codegen)

    assert ran == ["generated"]  # no healed script is run
    assert codegen.healed == 1
    assert result["status"] == "needs_review"
    assert result["code"] == "generated"
    assert result["attempts"] == 1
    assert result["last_output"].startswith("Healing stopped: page shows no message")
    assert "boom" in result["last_output"]
    assert result["tries"][-1]["stop_reason"] == "page shows no message"


def replay(passed=True):
    return {"kind": "replayed", "passed": passed}


def run_row(tries):
    return SimpleNamespace(tries=tries)


def test_replay_run_points_back_to_the_run_that_made_the_script():
    made = run_row([{"kind": "generated"}, {"kind": "healed"}])
    runs = [run_row([replay()]), run_row([replay()]), made, run_row(None)]
    latest, origin = runs_with_tries(SimpleNamespace(automation_runs=runs))
    assert latest is runs[0]
    assert origin is made


def test_run_that_generated_needs_no_origin():
    runs = [run_row([replay(False), {"kind": "generated"}]), run_row([{"kind": "generated"}])]
    latest, origin = runs_with_tries(SimpleNamespace(automation_runs=runs))
    assert latest is runs[0] and origin is None


def test_runs_from_before_tries_were_kept():
    assert runs_with_tries(SimpleNamespace(automation_runs=[])) == (None, None)
    runs = [run_row([replay()]), run_row(None)]
    assert runs_with_tries(SimpleNamespace(automation_runs=runs)) == (runs[0], None)


def case_row(id, status=None, code="code"):
    script = SimpleNamespace(status=status, code=code) if status else None
    return SimpleNamespace(id=id, automation_script=script)


def test_only_passing_scripts_are_replayed():
    cases = [
        case_row("a", "passed"),
        case_row("b", "needs_review"),
        case_row("c"),
        case_row("d", "passed", code=""),
    ]
    assert saved_passing_scripts(cases) == {"a": "code"}
    assert script_statuses(cases) == {"a": "passed", "b": "needs_review", "d": "passed"}


@pytest.fixture
def fake_graph(monkeypatch):
    """Run the real LangGraph automation->report graph with fake work in each node."""
    statuses = {}
    reports = []

    def automate_test_case(tc, base_url, explorer, codegen, **kwargs):
        return {"test_case_id": tc["id"], "status": statuses[tc["id"]], "code": "x"}

    def generate(**kwargs):
        reports.append(kwargs)
        return {"summary": "new report"}

    monkeypatch.setattr(graph, "automate_test_case", automate_test_case)
    monkeypatch.setattr(graph._report_agent, "generate", generate)

    def run(results, reported_statuses):
        statuses.update(results)
        return graph.automation_report_graph.invoke(
            {
                "requirement_id": "",
                "requirement_text": "req",
                "analysis": {},
                "approved_test_cases": [{"id": i} for i in results],
                "base_url": "https://example.test",
                "saved_scripts": {},
                "reported_statuses": reported_statuses,
            }
        )

    return run, reports


def test_report_skipped_when_results_unchanged(fake_graph):
    run, reports = fake_graph
    result = run({"a": "passed", "b": "passed"}, {"a": "passed", "b": "passed"})
    assert "report" not in result
    assert reports == []


@pytest.mark.parametrize(
    "reported",
    [
        {},  # no report yet
        {"a": "passed", "b": "needs_review"},  # a result changed
        {"a": "passed"},  # a case was added since the report
    ],
)
def test_report_written_when_results_differ(fake_graph, reported):
    run, reports = fake_graph
    result = run({"a": "passed", "b": "passed"}, reported)
    assert result["report"] == {"summary": "new report"}
    assert len(reports) == 1


def requirement_with_report(case_statuses):
    report = None if case_statuses is ... else SimpleNamespace(case_statuses=case_statuses)
    return SimpleNamespace(report=report)


def test_report_rewritten_after_a_case_is_removed(fake_graph):
    # The report counted c; c has since been rejected, so a and b alone run.
    requirement = requirement_with_report({"a": "passed", "b": "passed", "c": "passed"})
    run, reports = fake_graph
    result = run({"a": "passed", "b": "passed"}, reported_statuses(requirement))
    assert result["report"] == {"summary": "new report"}
    assert [s["test_case_id"] for s in reports[0]["automation_scripts"]] == ["a", "b"]


def test_reported_statuses_without_a_stored_map():
    assert reported_statuses(requirement_with_report(...)) == {}  # no report
    assert reported_statuses(requirement_with_report(None)) == {}  # report predates the column


class Boom(Exception):
    pass


class FailingCodegen(FakeCodegen):
    def __init__(self, fail_on):
        super().__init__()
        self.fail_on = fail_on

    def generate(self, trace, test_case):
        if self.fail_on == "generate":
            raise Boom("generate timed out")
        return super().generate(trace, test_case)

    def heal(self, code, result, trace, test_case, attempt):
        if self.fail_on == "heal":
            raise Boom("heal timed out")
        return super().heal(code, result, trace, test_case, attempt)


def test_failed_llm_call_stops_only_that_case(monkeypatch):
    fake_executor(monkeypatch, set())
    result = runner.automate_test_case(
        CASE, "https://example.test", FakeExplorer(), FailingCodegen("heal"), saved_code="saved"
    )
    assert result["status"] == "needs_review"
    assert result["code"] == "generated"  # the last script that ran
    assert result["attempts"] == 2  # failed replay + generated
    assert result["last_output"].startswith("Automation stopped: Boom: heal timed out")
    assert "Last run before it stopped:\nboom" in result["last_output"]


def test_failure_before_any_script_keeps_the_saved_one(monkeypatch):
    fake_executor(monkeypatch, set())
    result = runner.automate_test_case(
        CASE, "https://example.test", FakeExplorer(), FailingCodegen("generate"), saved_code="saved"
    )
    assert result["status"] == "needs_review"
    assert result["code"] == "saved"
    assert result["last_output"].startswith("Automation stopped: Boom: generate timed out")

    class CrashingExplorer:
        def explore(self, test_case, base_url, start=None):
            raise Boom("browser crashed")

    result = runner.automate_test_case(CASE, "https://example.test", CrashingExplorer(), FakeCodegen())
    assert result["status"] == "needs_review" and result["code"] == "" and result["attempts"] == 0


def test_report_failure_keeps_the_run(fake_graph, monkeypatch):
    run, _ = fake_graph

    def fail(**kwargs):
        raise Boom("report timed out")

    monkeypatch.setattr(graph._report_agent, "generate", fail)
    result = run({"a": "passed", "b": "needs_review"}, {})
    assert "report" not in result
    assert [s["status"] for s in result["automation_scripts"]] == ["passed", "needs_review"]


def test_cli_timeout_message_leaves_out_the_prompt(monkeypatch):
    import subprocess

    from app.llm import claude_cli_client

    def timeout(args, **kwargs):
        raise subprocess.TimeoutExpired(args, kwargs["timeout"])

    monkeypatch.setattr(claude_cli_client.subprocess, "run", timeout)
    with pytest.raises(TimeoutError) as error:
        claude_cli_client.ClaudeCliClient().generate_json("system", "a very long prompt")
    assert "prompt" not in str(error.value)
    assert str(error.value) == f"the claude CLI didn't answer within {claude_cli_client.REQUEST_TIMEOUT_S}s"
