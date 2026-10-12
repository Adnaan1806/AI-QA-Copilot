"""The benchmark's scoring: what it counts per case and how it compares runs."""

from app.automation import runner
from scripts.benchmark import RecordingExplorer, case_result, compare, errored_case, summarize

CASE = {"title": "Search opens", "steps": ["Open docs", "Click Search", "Type x"]}


def test_case_result_counts_tries_healing_and_dead_ends(monkeypatch):
    monkeypatch.setattr(
        runner, "execute_script", lambda code, test_case_id=None, storage_state=None: {"passed": code == "healed-1", "output": "boom"}
    )

    class Explorer:
        def explore(self, test_case, base_url, start=None):
            return {"actions": [], "dead_ends": [{"step_text": "Type x", "reason": "no input"}]}

    class Codegen:
        def generate(self, trace, test_case):
            return "generated"

        def heal(self, code, result, trace, test_case, attempt):
            return {"fixable": True, "reason": "", "code": f"healed-{attempt}"}

    explorer = RecordingExplorer(Explorer())
    outcome = runner.automate_test_case(CASE, "https://example.test", explorer, Codegen())
    result = case_result("Req", CASE, outcome, explorer.trace, 12.34)

    # The script passed after one heal, but a step couldn't be done: not counted as a pass.
    assert result["status"] == "needs_review"
    assert result["tries"] == 2 and result["healed"] == 1
    assert result["dead_ends"] == 1 and result["dead_end_steps"] == ["Type x"]
    assert result["gave_up"] is False
    assert result["seconds"] == 12.3
    assert result["stopped"] is False and result["llm_calls"] == 0


def case(status="passed", tries=1, dead_ends=0, steps=4, gave_up=False, stopped=False, calls=2):
    return {"status": status, "tries": tries, "dead_ends": dead_ends, "steps": steps,
            "gave_up": gave_up, "stopped": stopped, "seconds": 10, "llm_calls": calls,
            "input_tokens": 1000, "output_tokens": 100, "cost_usd": 0.01}


def test_summary():
    summary = summarize(
        [
            case(),
            case(tries=3, dead_ends=1),
            case(status="needs_review", tries=2, dead_ends=2, gave_up=True, stopped=True),
            case(status="error", tries=0, calls=0),
        ],
        [{"acceptance_criteria": 2}, {"acceptance_criteria": 0}],
    )
    assert summary["passed"] == 2
    assert summary["passed_first_try"] == 1 and summary["passed_after_healing"] == 1
    assert summary["passed_despite_dead_ends"] == 1
    assert summary["needs_review"] == 1 and summary["errors"] == 1 and summary["stopped"] == 1
    assert summary["healing_gave_up"] == 1
    assert summary["cases_per_criterion"] == 2.0
    assert summary["dead_end_rate"] == round(3 / 16, 3)
    assert summary["llm_calls"] == 6 and summary["mean_llm_calls"] == 1.5
    assert summary["cost_usd"] == 0.04
    assert summarize([]) == {"cases": 0}
    assert summarize([case()])["cases_per_criterion"] is None


def test_errored_case_is_recorded_not_raised():
    result = errored_case("Req", CASE, RuntimeError("browser gone"), 3.0, [
        {"input_tokens": 10, "output_tokens": 2, "cost_usd": 0.001},
    ])
    assert result["status"] == "error" and result["error"] == "RuntimeError: browser gone"
    assert result["llm_calls"] == 1 and result["input_tokens"] == 10


def test_cli_usage_is_recorded_per_thread(monkeypatch):
    import json
    import subprocess
    import threading

    from app.llm import claude_cli_client

    envelope = {
        "result": '{"ok": true}',
        "usage": {"input_tokens": 5, "cache_creation_input_tokens": 100,
                  "cache_read_input_tokens": 20, "output_tokens": 7},
        "total_cost_usd": 0.02,
    }
    monkeypatch.setattr(
        claude_cli_client.subprocess, "run",
        lambda args, **kw: subprocess.CompletedProcess(args, 0, json.dumps(envelope), ""),
    )
    claude_cli_client.take_usage()
    client = claude_cli_client.ClaudeCliClient()
    assert client.generate_json("s", "u") == {"ok": True}

    other = []
    thread = threading.Thread(target=lambda: (client.generate_json("s", "u"), other.extend(claude_cli_client.take_usage())))
    thread.start()
    thread.join()

    assert claude_cli_client.take_usage() == [{"input_tokens": 125, "output_tokens": 7, "cost_usd": 0.02}]
    assert len(other) == 1  # the other thread's call isn't counted here
    assert claude_cli_client.take_usage() == []


def test_compare_marks_direction():
    before = {"summary": {"cases": 4, "passed": 2, "dead_end_rate": 0.2}}
    after = {"summary": {"cases": 4, "passed": 3, "dead_end_rate": 0.3}}
    lines = {line.split()[0]: line for line in compare(before, after).splitlines()}
    assert lines["cases"].endswith("(+0)")
    assert lines["passed"].endswith("(+1)")  # a count: no verdict, the rate carries it
    assert lines["passed_rate"].endswith("better")
    assert lines["dead_end_rate"].endswith("worse")


def test_compare_judges_rates_when_case_counts_differ():
    before = {"summary": {"cases": 40, "passed": 30, "passed_despite_dead_ends": 8}}
    after = {"summary": {"cases": 10, "passed": 9, "passed_despite_dead_ends": 0}}
    lines = {line.split()[0]: line for line in compare(before, after).splitlines()}
    assert not lines["passed"].endswith("worse")
    assert lines["passed_rate"].endswith("better")
    assert lines["passed_despite_dead_ends_rate"].endswith("better")
