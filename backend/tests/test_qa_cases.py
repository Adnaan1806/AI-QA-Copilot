"""Drafted cases carry the criterion they cover; extra ideas come back as suggestions."""

from types import SimpleNamespace

from app.agents import qa_agent
from app.api.serializers import suggested_cases, to_test_case_item
from app.orchestration import graph
from app.schemas.test_case import clean_list
from app.services.session_service import generated_start_state


def test_suggestions_are_capped_and_cases_kept(monkeypatch):
    suggestions = [{"title": f"Idea {i}"} for i in range(qa_agent.MAX_SUGGESTIONS + 3)]
    monkeypatch.setattr(graph._requirement_agent, "analyze", lambda text, **kw: {"requirements": []})
    monkeypatch.setattr(
        graph._qa_agent,
        "generate",
        lambda **kw: {"test_cases": [{"title": "Case", "covers": "AC 1"}], "suggestions": suggestions},
    )
    result = graph.analysis_qa_graph.invoke({"requirement_text": "req", "context": []})
    assert result["test_cases"] == [{"title": "Case", "covers": "AC 1"}]
    assert len(result["suggestions"]) == qa_agent.MAX_SUGGESTIONS


def test_missing_suggestions_mean_none(monkeypatch):
    monkeypatch.setattr(graph._requirement_agent, "analyze", lambda text, **kw: {})
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
        reviewed_by=None, reviewed_at=None, reject_reason=None, start_state=None, account_id=None, assumptions=None, questions=None,
        requirement=SimpleNamespace(suite=SimpleNamespace(project=SimpleNamespace(accounts=[]))),
    )
    assert to_test_case_item(tc).covers == '"Pressing Escape closes the dialog"'


def test_case_item_says_which_account_it_starts_as():
    account = SimpleNamespace(id="a1", name="Standard user", is_default=True)
    tc = SimpleNamespace(
        id="00000000-0000-0000-0000-000000000001", title="Add to cart", test_type="functional",
        steps=["Open the inventory"], expected_result="e", priority="high", covers=None, status="draft",
        reviewed_by=None, reviewed_at=None, reject_reason=None, start_state=None, account_id=None, assumptions=None, questions=None,
        requirement=SimpleNamespace(suite=SimpleNamespace(project=SimpleNamespace(accounts=[account]))),
    )
    assert to_test_case_item(tc).starts_as == "Standard user"
    tc.start_state = "logged_out"
    assert to_test_case_item(tc).starts_as is None


def test_the_qa_agent_hears_account_names_and_can_start_a_case_logged_out():
    prompt = qa_agent.QAAgent._build_user_prompt("req", {}, [], ["Standard user", "Admin"])
    assert "cases start logged in as Standard user (other accounts: Admin)" in prompt
    assert "Test accounts" not in qa_agent.QAAgent._build_user_prompt("req", {}, [], [])

    assert generated_start_state({"starts_logged_out": True}) == "logged_out"
    assert generated_start_state({"starts_logged_out": "yes"}) is None
    assert suggested_cases([{"title": "Visitor", "starts_logged_out": True}])[0].starts_logged_out


def test_the_qa_agent_sees_the_app_for_steps_only():
    prompt = qa_agent.QAAgent._build_user_prompt(
        "req", {}, [], [],
        [{"source": "Page: Checkout", "status": "observed", "content": "Field: text \"Zip/Postal Code\""}],
    )
    assert "What the app looks like (for steps only, never for expected results):" in prompt
    assert "[Page: Checkout -- observed]" in prompt
    assert "What the app looks like" not in qa_agent.QAAgent._build_user_prompt("req", {}, [], [], [])


def test_open_questions_come_back_from_drafting(monkeypatch):
    monkeypatch.setattr(graph._requirement_agent, "analyze", lambda text, **kw: {})
    seen = {}

    def generate(**kw):
        seen.update(kw)
        return {"test_cases": [], "open_questions": ["The requirement has a Promo Code field; checkout shows none", " ", 3]}

    monkeypatch.setattr(graph._qa_agent, "generate", generate)
    knowledge = [{"source": "Page: Checkout", "status": "observed", "content": "..."}]
    result = graph.analysis_qa_graph.invoke({"requirement_text": "r", "context": [], "app_knowledge": knowledge})
    assert seen["app_knowledge"] == knowledge
    assert result["open_questions"] == ["The requirement has a Promo Code field; checkout shows none", "3"]


def test_assumptions_are_cleaned():
    assert clean_list([" Promo Code field ", "", None, 5, "Apply button"]) == ["Promo Code field", "Apply button"]
    assert clean_list(None) == []
    assert suggested_cases([{"title": "t", "assumptions": ["Apply button"]}])[0].assumptions == ["Apply button"]


def test_app_knowledge_is_layout_start_page_then_distinct_pages_then_workflows(monkeypatch):
    from app.services import drafting_service

    calls = []
    pages = [
        {"source": "Page: Installation | Playwright", "content": "App page: x\nHeadings: Installation | Intro"},
        {"source": "Page: Installation | Playwright Java", "content": "App page: y\nHeadings: Installation | Intro"},
        {"source": "Page: Search | Playwright", "content": "App page: z\nHeadings: Search"},
    ]

    def retrieve(query, project_id, k=5, kind="document", fact_kind=None):
        calls.append((fact_kind, k))
        return pages if fact_kind == "page" else [{"source": "Workflow: Search docs", "content": "c", "status": "proven"}]

    facts = [
        SimpleNamespace(kind="layout", content={"buttons": [], "links": []}, status="observed"),
        SimpleNamespace(kind="page", key="https://app.test/", title="Home", status="observed",
                        content={"depth": 0, "headings": [{"text": "Welcome"}], "buttons": [], "fields": [], "links": []}),
    ]

    class Query:
        kind = None

        def filter(self, *conditions):
            return self

        def __iter__(self):
            return iter(facts)

    monkeypatch.setattr(drafting_service, "retrieve", retrieve)
    monkeypatch.setattr(drafting_service, "_fact", lambda db, project, kind, **content: next(
        f for f in facts if f.kind == kind and all(f.content.get(k) == v for k, v in content.items())
    ))
    found = drafting_service.app_knowledge(None, SimpleNamespace(id="p"), "req")

    # The start page always; the Java copy of the Installation page left out.
    assert [f["source"] for f in found] == [
        "Layout: On every page", "Page: Home", "Page: Installation | Playwright", "Page: Search | Playwright",
        "Workflow: Search docs",
    ]
    assert calls == [("page", drafting_service.PAGE_CANDIDATES), ("workflow", drafting_service.APP_WORKFLOWS)]


def test_drafting_context_holds_documents_rules_and_terms(monkeypatch):
    from app.services import drafting_service

    def retrieve(query, project_id, k=5, kind="document", fact_kind=None):
        return [{"source": f"{fact_kind or kind}", "content": "c", "status": None}]

    monkeypatch.setattr(drafting_service, "retrieve", retrieve)
    monkeypatch.setattr(drafting_service, "app_knowledge", lambda db, project, text: [])
    monkeypatch.setattr(drafting_service, "account_names", lambda project: [])
    inputs = drafting_service.drafting_inputs(None, SimpleNamespace(id="p"), "req")

    # Stated knowledge goes where expected results may come from; the app map doesn't.
    assert [c["source"] for c in inputs["context"]] == ["document", "rule", "term"]
    # The Analyst searches the same project's knowledge.
    assert inputs["analyst_tools"]._project_id == "p"


def test_open_questions_are_listed_for_the_drafter_to_link():
    prompt = qa_agent.QAAgent._build_user_prompt(
        "Guest checkout", {"missing_info": ["Maximum number of promo code attempts allowed", " "]}, []
    )
    assert "Open questions (link each to the cases its answer would change, word for word):" in prompt
    assert "- Maximum number of promo code attempts allowed" in prompt
    assert "Open questions" not in qa_agent.QAAgent._build_user_prompt("Guest checkout", {"missing_info": []}, [])


def test_analyst_differences_are_listed_for_the_drafter_to_link():
    analysis = {"missing_info": ["Default sort?"], "app_differences": ["AC 3 says Newest first; the app has no such option."]}
    prompt = qa_agent.QAAgent._build_user_prompt("Sorting", analysis, [])
    assert "- AC 3 says Newest first; the app has no such option." in prompt
    assert "- Default sort?" in prompt
