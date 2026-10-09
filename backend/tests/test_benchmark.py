"""The benchmark's scoring: what it counts per case and how it compares runs."""

from app.automation import runner
from scripts.benchmark import RecordingExplorer, case_result, compare, summarize

CASE = {"title": "Search opens", "steps": ["Open docs", "Click Search", "Type x"]}


def test_case_result_counts_tries_healing_and_dead_ends(monkeypatch):
    monkeypatch.setattr(
        runner, "execute_script", lambda code, test_case_id=None: {"passed": code == "healed-1", "output": "boom"}
    )

    class Explorer:
        def explore(self, test_case, base_url):
            return {"actions": [], "dead_ends": [{"step_text": "Type x", "reason": "no input"}]}

    class Codegen:
        def generate(self, trace, test_case):
            return "generated"

        def heal(self, code, result, trace, test_case, attempt):
            return {"fixable": True, "reason": "", "code": f"healed-{attempt}"}

    explorer = RecordingExplorer(Explorer())
    outcome = runner.automate_test_case(CASE, "https://example.test", explorer, Codegen())
    result = case_result("Req", CASE, outcome, explorer.trace, 12.34)

    assert result["status"] == "passed"
    assert result["tries"] == 2 and result["healed"] == 1
    assert result["dead_ends"] == 1 and result["dead_end_steps"] == ["Type x"]
    assert result["gave_up"] is False
    assert result["seconds"] == 12.3


def case(status="passed", tries=1, dead_ends=0, steps=4, gave_up=False):
    return {"status": status, "tries": tries, "dead_ends": dead_ends, "steps": steps,
            "gave_up": gave_up, "seconds": 10}


def test_summary():
    summary = summarize([
        case(),
        case(tries=3),
        case(status="needs_review", tries=2, dead_ends=2, gave_up=True),
    ])
    assert summary["passed"] == 2
    assert summary["passed_first_try"] == 1 and summary["passed_after_healing"] == 1
    assert summary["needs_review"] == 1 and summary["healing_gave_up"] == 1
    assert summary["dead_end_rate"] == round(2 / 12, 3)
    assert summary["mean_tries"] == 2.0
    assert summarize([]) == {"cases": 0}


def test_compare_marks_direction():
    before = {"summary": {"cases": 4, "passed": 2, "dead_end_rate": 0.2}}
    after = {"summary": {"cases": 4, "passed": 3, "dead_end_rate": 0.3}}
    lines = compare(before, after).splitlines()
    assert lines[0].startswith("cases") and lines[0].endswith("(+0)")
    assert lines[1].endswith("better")  # more passed
    assert lines[2].endswith("worse")  # more dead ends
