"""Drafted cases carry the criterion they cover; extra ideas come back as suggestions."""

from types import SimpleNamespace

from app.agents import qa_agent
from app.api.serializers import suggested_cases, to_test_case_item
from app.orchestration import graph


def test_suggestions_are_capped_and_cases_kept(monkeypatch):
    suggestions = [{"title": f"Idea {i}"} for i in range(qa_agent.MAX_SUGGESTIONS + 3)]
    monkeypatch.setattr(graph._requirement_agent, "analyze", lambda text: {"requirements": []})
    monkeypatch.setattr(
        graph._qa_agent,
        "generate",
        lambda **kw: {"test_cases": [{"title": "Case", "covers": "AC 1"}], "suggestions": suggestions},
    )
    result = graph.analysis_qa_graph.invoke({"requirement_text": "req", "context": []})
    assert result["test_cases"] == [{"title": "Case", "covers": "AC 1"}]
    assert len(result["suggestions"]) == qa_agent.MAX_SUGGESTIONS


def test_missing_suggestions_mean_none(monkeypatch):
    monkeypatch.setattr(graph._requirement_agent, "analyze", lambda text: {})
    monkeypatch.setattr(graph._qa_agent, "generate", lambda **kw: {"test_cases": []})
    assert graph.analysis_qa_graph.invoke({"requirement_text": "r", "context": []})["suggestions"] == []


def test_suggested_cases_are_cleaned_and_malformed_ones_skipped():
    cases = suggested_cases(
        [
            {"title": " Tab to Search ", "steps": ["1. Press Tab", "2. Press Enter"], "why": "keyboard users"},
            {"title": ""},
            "not a dict",
            {"steps": ["no title"]},
        ]
    )
    assert len(cases) == 1
    case = cases[0]
    assert case.title == "Tab to Search" and case.steps == ["Press Tab", "Press Enter"]
    assert case.type == "functional" and case.priority == "medium" and case.why == "keyboard users"
    assert suggested_cases(None) == []


def test_case_item_includes_covers():
    tc = SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001", title="t", test_type="functional", steps=["Open"],
        expected_result="e", priority="high", covers='"Pressing Escape closes the dialog"', status="draft",
        reviewed_by=None, reviewed_at=None, reject_reason=None,
    )
    assert to_test_case_item(tc).covers == '"Pressing Escape closes the dialog"'
