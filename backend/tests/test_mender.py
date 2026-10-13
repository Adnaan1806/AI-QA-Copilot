"""Mender's tool loop, with a scripted LLM and fake page tools: no browser."""

import json

import pytest

from app.automation import mender_agent
from app.automation.mender_agent import MenderAgent, MenderError

CASE = {"title": "Login", "steps": ["Open the shop", "Log in as standard_user"], "expected_result": "Products page"}
TRACE = {"start_url": "https://shop.test", "actions": [], "dead_ends": []}
CODE = """from playwright.sync_api import expect


def test_login(page):
    page.goto("https://shop.test")
    page.get_by_role("button", name="Log in").click()
    expect(page.locator(".title")).to_have_text("Products")"""
FAILED = {"passed": False, "output": "TimeoutError: waiting for get_by_role('button', name='Log in')"}


class ScriptedLLM:
    def __init__(self, *decisions):
        self.decisions = list(decisions)
        self.prompts = []

    def generate_json(self, system_prompt, user_prompt, timeout_s=None):
        self.prompts.append(user_prompt)
        decision = self.decisions.pop(0)
        if isinstance(decision, Exception):
            raise decision
        return decision


def turn(tool, **args):
    return {"diagnosis": "d", "tool": tool, "args": args, "why": f"why {tool}"}


class FakeProbe:
    def __init__(self):
        self.calls = []

    def look_at_page(self, code, line, storage_state=None):
        self.calls.append(("look", line, storage_state))
        return {"reached": True, "stopped_before_line": line, "snapshot": 'URL: x\n[0] button "Login"', "text": "Swag"}

    def find_element(self, code, text, line, storage_state=None):
        self.calls.append(("find", text, line))
        return {
            "reached": True,
            "stopped_before_line": line,
            "matches": [{"element": 'button "Login"', "locator": 'page.get_by_role("button", name="Login", exact=True)', "fragile": False}],
        }


class Runs:
    """run_script for the agent: passes once the locator is fixed."""

    def __init__(self, passes=lambda code: 'name="Login"' in code):
        self.passes = passes
        self.calls = []

    def __call__(self, code, reason, turns):
        self.calls.append({"code": code, "reason": reason, "tools": [t["tool"] for t in turns]})
        return {"passed": self.passes(code), "output": "" if self.passes(code) else "still failing"}


FIX = [{"from": 6, "to": 6, "new": '    page.get_by_role("button", name="Login").click()'}]


def mend(llm, runs=None, runs_left=2, probe=None, explorer=None, clock=None, start=None):
    agent = MenderAgent(llm, explorer, probe=probe or FakeProbe(), **({"clock": clock} if clock else {}))
    return agent.mend(CODE, FAILED, TRACE, CASE, runs or Runs(), runs_left, "https://shop.test", start=start)


def test_looks_then_fixes_and_passes():
    llm = ScriptedLLM(
        turn("look_at_page", line=6),
        turn("find_element", text="Login", line=6),
        turn("edit_script", edits=FIX),
        turn("run_test"),
    )
    probe = FakeProbe()
    runs = Runs()
    outcome = mend(llm, runs, probe=probe, start={"storage_state": {"cookies": []}})

    assert outcome["outcome"] == "passed"
    assert 'name="Login"' in outcome["code"] and outcome["result"]["passed"]
    assert probe.calls[0] == ("look", 6, {"cookies": []})
    # The run's try carries the turns that led to it, and the edit's reason.
    assert runs.calls == [{"code": outcome["code"], "reason": "why edit_script",
                           "tools": ["look_at_page", "find_element", "edit_script", "run_test"]}]
    assert outcome["turns"] == []
    # The model saw the page and the locators it found.
    assert 'button \\"Login\\"' in llm.prompts[1] and "exact=True" in llm.prompts[2]


def test_stop_returns_the_verdict_with_the_last_script_run():
    llm = ScriptedLLM(turn("look_at_page"), turn("stop", verdict="app_defect", reason="The title says Inventory."))
    outcome = mend(llm)
    assert outcome["outcome"] == "stopped"
    assert outcome["verdict"] == "app_defect" and outcome["reason"] == "The title says Inventory."
    assert outcome["code"] == CODE and outcome["result"] is FAILED
    assert [t["tool"] for t in outcome["turns"]] == ["look_at_page", "stop"]


def test_stop_without_a_valid_verdict_costs_a_turn():
    llm = ScriptedLLM(turn("stop", verdict="flaky", reason="x"), turn("stop", verdict="environment", reason="App down."))
    outcome = mend(llm)
    assert outcome["verdict"] == "environment"
    assert "needs a verdict" in outcome["turns"][0]["result"]


def test_a_weakening_edit_is_refused_and_the_script_kept():
    weaker = [{"from": 7, "to": 7, "new": '    expect(page.locator(".title")).to_be_visible()'}]
    llm = ScriptedLLM(turn("edit_script", edits=weaker), turn("stop", verdict="app_defect", reason="r"))
    outcome = mend(llm)
    assert "Refused" in outcome["turns"][0]["result"]
    assert "to_be_visible" not in json.loads(llm.prompts[1])["script"]
    assert outcome["code"] == CODE


def test_unknown_tools_and_bad_args_cost_a_turn():
    llm = ScriptedLLM(
        turn("delete_everything"),
        turn("edit_script", edits="line 6"),
        turn("reexplore_step", step=9),
        turn("find_element", text=""),
        turn("stop", verdict="environment", reason="r"),
    )

    class Probe(FakeProbe):
        def find_element(self, code, text, line, storage_state=None):
            from app.automation.page_probe import ProbeError
            raise ProbeError("text must name the element")

    outcome = mend(llm, probe=Probe())
    results = [t["result"] for t in outcome["turns"]]
    assert "Unknown tool" in results[0]
    assert "non-empty list" in results[1]
    assert "step number from 1 to 2" in results[2]
    assert "must name the element" in results[3]


def test_a_crashing_tool_costs_the_turn_not_the_repair():
    class Probe(FakeProbe):
        def look_at_page(self, code, line, storage_state=None):
            raise RuntimeError("browser closed")

    outcome = mend(ScriptedLLM(turn("look_at_page"), turn("stop", verdict="environment", reason="r")), probe=Probe())
    assert "look_at_page failed: RuntimeError: browser closed" in outcome["turns"][0]["result"]


def test_turn_budget():
    llm = ScriptedLLM(*[turn("look_at_page")] * mender_agent.MAX_TURNS)
    outcome = mend(llm)
    assert outcome["outcome"] == "gave_up" and "10 turns" in outcome["budget"]
    assert len(outcome["turns"]) == mender_agent.MAX_TURNS and not llm.decisions


def test_run_budget_ends_the_repair_after_the_last_failing_run():
    llm = ScriptedLLM(turn("run_test"), turn("run_test"), turn("look_at_page"))
    runs = Runs(passes=lambda code: False)
    outcome = mend(llm, runs, runs_left=2)
    assert len(runs.calls) == 2
    assert outcome["outcome"] == "gave_up" and "script runs" in outcome["budget"]


def test_run_with_no_runs_left_is_refused():
    llm = ScriptedLLM(turn("run_test"), turn("stop", verdict="environment", reason="r"))
    runs = Runs()
    outcome = mend(llm, runs, runs_left=0)
    assert runs.calls == [] and outcome["turns"][0]["result"] == "No runs left."


def test_time_budget():
    now = [0.0]

    def clock():
        return now[0]

    class SlowProbe(FakeProbe):
        def look_at_page(self, code, line, storage_state=None):
            now[0] += 150
            return super().look_at_page(code, line, storage_state)

    outcome = mend(ScriptedLLM(turn("look_at_page"), turn("look_at_page"), turn("look_at_page")), probe=SlowProbe(), clock=clock)
    assert outcome["outcome"] == "gave_up" and "4 minutes" in outcome["budget"]
    assert len(outcome["turns"]) == 2
    assert outcome["turns"][0]["seconds"] == 150


def test_reexplore_step_has_scout_redo_the_case_up_to_that_step():
    class Explorer:
        def explore(self, test_case, base_url, start=None):
            self.steps = test_case["steps"]
            return {
                "actions": [
                    {"step_text": "Open the shop", "action": "click", "locator": "page.x", "resulting_url": "u"},
                    {"step_text": "Log in as standard_user", "action": "fill", "locator": 'page.get_by_placeholder("Username")',
                     "value": "standard_user", "resulting_url": "u", "locator_fragile": False},
                ],
                "dead_ends": [],
            }

    explorer = Explorer()
    outcome = mend(ScriptedLLM(turn("reexplore_step", step=2), turn("stop", verdict="environment", reason="r")), explorer=explorer)
    assert explorer.steps == CASE["steps"]
    result = outcome["turns"][0]["result"]
    assert 'fill page.get_by_placeholder("Username") value="standard_user"' in result
    assert "page.x" not in result


def test_llm_failures_raise_so_the_runner_can_fall_back():
    with pytest.raises(MenderError):
        mend(ScriptedLLM(TimeoutError("slow"), TimeoutError("slow")))


def test_one_bad_llm_answer_is_retried():
    outcome = mend(ScriptedLLM(TimeoutError("slow"), turn("stop", verdict="environment", reason="r")))
    assert outcome["outcome"] == "stopped"
