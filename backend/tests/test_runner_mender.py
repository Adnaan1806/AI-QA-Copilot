"""The runner with Mender: its tries, verdicts and budget, and what happens
when Mender itself fails. Agents and executor are fakes."""

import pytest

from app.automation import runner
from app.orchestration import graph

CASE = {"id": "tc-1", "title": "Login", "steps": ["Log in"], "expected_result": "Products"}
TURN = {"diagnosis": "d", "tool": "look_at_page", "args": {}, "why": "w", "result": "x" * 5000, "seconds": 1.0}


class Explorer:
    def __init__(self, dead_ends=()):
        self.dead_ends = list(dead_ends)

    def explore(self, test_case, base_url, start=None):
        return {"actions": [], "dead_ends": self.dead_ends}


class Codegen:
    def generate(self, trace, test_case):
        return "generated"


@pytest.fixture
def ran(monkeypatch):
    ran = []

    def execute(code, test_case_id=None, storage_state=None):
        ran.append(code)
        return {"passed": code.startswith("fixed") or code == "healed-2", "output": "boom", "trace_path": None}

    monkeypatch.setattr(runner, "execute_script", execute)
    return ran


class Mender:
    """Plays a fixed repair through the runner's run_script callback."""

    def __init__(self, play):
        self.play = play
        self.runs_left = None

    def mend(self, code, result, trace, test_case, run_script, runs_left, base_url="", start=None, requirement=None):
        self.runs_left = runs_left
        self.requirement = requirement
        return self.play(code, result, run_script)


def automate(mender, explorer=None, codegen=None, requirement=None):
    return runner.automate_test_case(
        CASE, "https://shop.test", explorer or Explorer(), codegen or Codegen(), mender=mender, requirement=requirement
    )


def test_mender_fix_is_saved_as_a_healed_try_with_its_turns(ran):
    def play(code, result, run_script):
        fixed = run_script("fixed", "Login button was renamed", [TURN, {**TURN, "tool": "run_test"}])
        return {"outcome": "passed", "code": "fixed", "result": fixed, "turns": []}

    mender = Mender(play)
    outcome = automate(mender)

    assert outcome["status"] == "passed" and outcome["code"] == "fixed"
    assert mender.runs_left == runner.MAX_ATTEMPTS - 1
    generated, healed = outcome["tries"]
    assert generated["kind"] == "generated" and "turns" not in generated
    assert healed["kind"] == "healed" and healed["reason"] == "Login button was renamed"
    assert [t["tool"] for t in healed["turns"]] == ["look_at_page", "run_test"]
    # Saved results are trimmed.
    assert len(healed["turns"][0]["result"]) < 2000


def test_an_app_defect_fails_the_case_and_keeps_the_verdict_on_the_last_try(ran):
    def play(code, result, run_script):
        return {"outcome": "stopped", "code": code, "result": result, "verdict": "app_defect",
                "reason": "The page says Inventory, not Products.", "turns": [TURN]}

    mender = Mender(play)
    outcome = automate(mender, requirement="AC 1: the Products page is shown")
    assert mender.requirement == "AC 1: the Products page is shown"
    assert outcome["status"] == "failed" and outcome["attempts"] == 1
    last = outcome["tries"][-1]
    assert last["verdict"] == "app_defect" and last["stop_reason"] == "The page says Inventory, not Products."
    assert len(last["turns"]) == 1
    assert outcome["last_output"].startswith("Mender stopped (app defect): The page says Inventory")


def test_mender_out_of_budget_is_noted_on_the_last_try(ran):
    def play(code, result, run_script):
        tried = run_script("still-broken", "r", [TURN])
        return {"outcome": "gave_up", "code": "still-broken", "result": tried, "budget": "used all 10 turns",
                "turns": [TURN, TURN]}

    outcome = automate(Mender(play))
    assert outcome["status"] == "needs_review" and outcome["code"] == "still-broken"
    last = outcome["tries"][-1]
    assert last["budget"] == "used all 10 turns" and len(last["turns"]) == 3
    assert "stop_reason" not in last


def test_when_mender_fails_the_case_stops_for_review_with_its_last_script(ran):
    def play(code, result, run_script):
        run_script("still-broken", "r", [])
        raise RuntimeError("LLM down")

    outcome = automate(Mender(play))
    assert ran == ["generated", "still-broken"]
    assert outcome["status"] == "needs_review" and outcome["code"] == "still-broken"
    assert outcome["last_output"].startswith("Automation stopped: RuntimeError: LLM down")


def test_a_crashing_script_run_stops_the_case(monkeypatch):
    def execute(code, test_case_id=None, storage_state=None):
        if code != "generated":
            raise OSError("browser crashed")
        return {"passed": False, "output": "boom", "trace_path": None}

    monkeypatch.setattr(runner, "execute_script", execute)

    def play(code, result, run_script):
        return run_script("fixed", "r", [])

    outcome = automate(Mender(play))
    assert outcome["status"] == "needs_review" and "browser crashed" in outcome["last_output"]


def test_hollow_pass_guard_still_applies_after_mender(ran):
    def play(code, result, run_script):
        return {"outcome": "passed", "code": "fixed", "result": run_script("fixed", "r", []), "turns": []}

    outcome = automate(Mender(play), explorer=Explorer(dead_ends=[{"step_text": "Log in", "reason": "no form"}]))
    assert outcome["status"] == "needs_review"
    assert "couldn't be done" in outcome["tries"][-1]["review_reason"]


def test_mender_not_called_when_the_script_passes(ran, monkeypatch):
    monkeypatch.setattr(runner, "execute_script", lambda code, test_case_id=None, storage_state=None: {"passed": True, "output": ""})

    def play(*args):
        raise AssertionError("Mender should not run")

    assert automate(Mender(play))["status"] == "passed"


def test_every_automation_run_gets_mender(monkeypatch):
    menders = []

    def automate(tc, base_url, explorer, codegen, **kwargs):
        menders.append(kwargs["mender"])
        return {"test_case_id": tc["id"], "status": "passed"}

    monkeypatch.setattr(graph, "automate_test_case", automate)
    graph.automate_single_test_case({"id": "a"}, "https://x.test", "")
    graph._automation_node({"approved_test_cases": [{"id": "b"}], "base_url": "https://x.test"})
    assert menders == [graph._mender_agent, graph._mender_agent]


def test_tries_with_and_without_turns_fit_the_api_schema(ran):
    from app.schemas.test_case import TryItem

    def play(code, result, run_script):
        return {"outcome": "stopped", "code": code, "result": result, "verdict": "environment",
                "reason": "App down.", "turns": [TURN]}

    item = TryItem(**automate(Mender(play))["tries"][-1])
    assert item.verdict == "environment" and item.turns[0].tool == "look_at_page"
    old = TryItem(kind="healed", passed=True, code="x")
    assert old.turns == [] and old.verdict == "" and old.budget == ""


@pytest.mark.parametrize("verdict", ["unclear_requirement", "environment"])
def test_other_verdicts_leave_the_case_for_review(ran, verdict):
    def play(code, result, run_script):
        return {"outcome": "stopped", "code": code, "result": result, "verdict": verdict, "reason": "r", "turns": []}

    assert automate(Mender(play))["status"] == "needs_review"


def test_without_a_mender_a_failing_script_is_left_for_review(ran):
    outcome = runner.automate_test_case(CASE, "https://shop.test", Explorer(), Codegen())
    assert ran == ["generated"]
    assert outcome["status"] == "needs_review" and outcome["last_output"] == "boom"
