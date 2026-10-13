"""A case Mender saw the app fail is "failed": counted, reported by the Judge
with what was seen, and Mender judges it against the requirement."""

import json
from types import SimpleNamespace

from app.agents.report_agent import ReportAgent
from app.api.serializers import to_case_counts
from app.automation.mender_agent import MenderAgent
from app.orchestration import graph


class CapturingLLM:
    def __init__(self, answer):
        self.answer = answer
        self.prompts = []

    def generate_json(self, system_prompt, user_prompt, timeout_s=None):
        self.prompts.append(json.loads(user_prompt))
        return self.answer


def test_counts_put_failed_cases_in_their_own_bucket():
    def case(status, script_status=None):
        script = SimpleNamespace(status=script_status) if script_status else None
        return SimpleNamespace(status=status, automation_script=script)

    requirement = SimpleNamespace(test_cases=[
        case("approved", "passed"), case("approved", "failed"), case("approved", "needs_review"),
        case("approved"), case("draft"), case("rejected"),
    ])
    counts = to_case_counts(requirement)
    assert (counts.passed, counts.failed, counts.needs_review) == (1, 1, 1)
    assert (counts.approved, counts.draft, counts.rejected) == (1, 1, 1)


def test_judge_hears_which_cases_failed_and_what_was_seen():
    llm = CapturingLLM({"verdict": "not_ready"})
    ReportAgent(llm).generate(
        requirement_text="req",
        analysis={},
        test_cases=[{"id": "a", "label": "TC-1", "title": "t"}, {"id": "b", "label": "TC-2", "title": "t"},
                    {"id": "c", "label": "TC-3", "title": "t"}],
        automation_scripts=[
            {"test_case_id": "a", "status": "passed", "last_output": None},
            {"test_case_id": "b", "status": "failed",
             "last_output": "Mender stopped (app defect): AC 4: the sort resets.\n\nE   AssertionError: ..."},
            {"test_case_id": "c", "status": "needs_review", "last_output": "boom"},
        ],
    )
    sent = llm.prompts[0]
    assert sent["passed_test_case_count"] == 1
    assert sent["failed_test_case_count"] == 1
    assert sent["needs_review_test_case_count"] == 1
    scripts = {s["test_case"]: s for s in sent["automation_scripts"]}
    assert scripts["TC-2"] == {"test_case": "TC-2", "status": "failed",
                               "failure": "Mender stopped (app defect): AC 4: the sort resets."}
    assert "failure" not in scripts["TC-3"]


def test_mender_is_shown_the_requirement():
    llm = CapturingLLM({"diagnosis": "d", "tool": "stop", "args": {"verdict": "app_defect", "reason": "AC 4"}, "why": "w"})
    agent = MenderAgent(llm, explorer=None, probe=None)
    failed = {"passed": False, "output": "boom"}
    code = "def test_x(page):\n    pass"
    agent.mend(code, failed, {}, {"title": "t", "steps": []}, None, 2, requirement="AC 4: the sort is kept")
    agent.mend(code, failed, {}, {"title": "t", "steps": []}, None, 2)
    assert llm.prompts[0]["requirement"] == "AC 4: the sort is kept"
    assert llm.prompts[1]["requirement"] == "(not given)"


def test_automation_runs_get_the_requirement_text(monkeypatch):
    seen = []

    def automate(tc, base_url, explorer, codegen, **kwargs):
        seen.append(kwargs["requirement"])
        return {"test_case_id": tc["id"], "status": "failed", "last_output": "x"}

    monkeypatch.setattr(graph, "automate_test_case", automate)
    graph.automate_single_test_case({"id": "a"}, "https://x.test", "", requirement_text="AC 1")
    graph._automation_node({"approved_test_cases": [{"id": "b"}], "base_url": "https://x.test", "requirement_text": "AC 2"})
    assert seen == ["AC 1", "AC 2"]
