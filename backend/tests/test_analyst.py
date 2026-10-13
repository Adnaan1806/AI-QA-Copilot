"""The Analyst: its tool loop (scripted LLM, fake tools), its read-only tools,
and how its app differences become open questions."""

import json

import pytest

from app import config
from app.agents import requirement_agent
from app.agents.analyst_tools import AnalystTools, ToolError
from app.agents.requirement_agent import RequirementAgent
from app.orchestration import graph

REQUIREMENT = "Product list sorting\n\nAcceptance criteria:\n3. The sort dropdown also offers \"Newest first\"."
ANALYSIS = {
    "name": "Product list sorting",
    "requirements": ["Sort by newest"],
    "risks": [],
    "missing_info": ["Default sort?"],
    "testing_considerations": [],
    "app_differences": ["AC 3 says the dropdown offers Newest first; /inventory.html only offers Name and Price."],
}


class ScriptedLLM:
    def __init__(self, *answers):
        self.answers = list(answers)
        self.prompts = []
        self.systems = []

    def generate_json(self, system_prompt, user_prompt, timeout_s=None):
        self.systems.append(system_prompt)
        self.prompts.append(user_prompt)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def call(tool, **args):
    return {"thought": f"t {tool}", "tool": tool, "args": args}


class FakeTools:
    can_browse = True

    def __init__(self):
        self.calls = []

    def describe(self):
        return {"app_url": "https://shop.test", "pages_open_logged_in_as": "Standard user"}

    def search_app_map(self, query):
        self.calls.append(("map", query))
        return "[Page: Products -- observed]\nSort products dropdown"

    def open_page(self, path):
        self.calls.append(("open", path))
        return '[2] select "Sort products" options: Name (A to Z) | Price (low to high)'

    def search_documents(self, query):
        self.calls.append(("docs", query))
        return "No uploaded document matches that."

    def search_team_knowledge(self, query):
        self.calls.append(("team", query))
        raise ToolError("query must say what to look for")


def test_checks_the_app_then_finishes_with_its_differences():
    llm = ScriptedLLM(
        call("search_app_map", query="sort dropdown"),
        call("open_page", path="/inventory.html"),
        call("finish", analysis=ANALYSIS),
    )
    tools = FakeTools()
    steps = []
    analysis = RequirementAgent(llm).analyze(REQUIREMENT, tools=tools, on_step=steps.append)

    assert tools.calls == [("map", "sort dropdown"), ("open", "/inventory.html")]
    assert steps == ['is looking up "sort dropdown" in the app map', "is opening /inventory.html in the app"]
    assert analysis["app_differences"] == ANALYSIS["app_differences"]
    assert analysis["name"] == "Product list sorting"
    assert [t["tool"] for t in analysis["analyst_turns"]] == ["search_app_map", "open_page"]
    assert "options: Name (A to Z)" in analysis["analyst_turns"][1]["result"]
    # The model saw the page it opened, and the setup.
    sent = json.loads(llm.prompts[2])
    assert "options: Name (A to Z)" in sent["turns_so_far"][1]["result"]
    assert sent["setup"]["pages_open_logged_in_as"] == "Standard user"


def test_without_tools_it_is_one_call_as_before():
    llm = ScriptedLLM({"name": "Sorting", "requirements": [], "risks": [], "missing_info": [], "testing_considerations": []})
    analysis = RequirementAgent(llm).analyze(REQUIREMENT)
    assert llm.systems == [requirement_agent.SYSTEM_PROMPT]
    assert analysis["app_differences"] == [] and analysis["analyst_turns"] == []


def test_bad_calls_cost_a_turn_and_say_why():
    llm = ScriptedLLM(
        call("delete_page", path="/"),
        call("search_team_knowledge", query=""),
        call("finish", analysis={"requirements": []}),
        call("finish", analysis=ANALYSIS),
    )
    analysis = RequirementAgent(llm).analyze(REQUIREMENT, tools=FakeTools())
    results = [t["result"] for t in analysis["analyst_turns"]]
    assert "Unknown tool 'delete_page'" in results[0]
    assert results[1] == "query must say what to look for"
    assert results[2] == "finish needs an analysis with a name"


def test_a_page_that_fails_to_load_costs_the_turn_only():
    class Broken(FakeTools):
        def open_page(self, path):
            raise TimeoutError("page took too long")

    llm = ScriptedLLM(call("open_page", path="/slow"), call("finish", analysis=ANALYSIS))
    analysis = RequirementAgent(llm).analyze(REQUIREMENT, tools=Broken())
    assert analysis["analyst_turns"][0]["result"] == "open_page failed: TimeoutError: page took too long"


def test_turn_budget_asks_it_to_finish_then_falls_back_to_one_call():
    single = {"name": "Sorting", "requirements": ["x"], "risks": [], "missing_info": [], "testing_considerations": []}
    looks = [call("search_app_map", query="q")] * requirement_agent.MAX_TURNS
    llm = ScriptedLLM(*looks, call("search_app_map", query="more"), single)
    analysis = RequirementAgent(llm).analyze(REQUIREMENT, tools=FakeTools())

    assert len(analysis["analyst_turns"]) == requirement_agent.MAX_TURNS
    # The last agent call was told to finish now; it didn't, so one plain call analysed it.
    assert "call finish now" in json.loads(llm.prompts[-2])["note"]
    assert llm.systems[-1] == requirement_agent.SYSTEM_PROMPT
    assert analysis["requirements"] == ["x"] and analysis["app_differences"] == []


def test_time_budget():
    now = [0.0]

    class Slow(FakeTools):
        def open_page(self, path):
            now[0] += requirement_agent.TIME_BUDGET_SECONDS
            return "page"

    llm = ScriptedLLM(call("open_page", path="/"), call("finish", analysis=ANALYSIS))
    analysis = RequirementAgent(llm, clock=lambda: now[0]).analyze(REQUIREMENT, tools=Slow())
    assert "call finish now" in json.loads(llm.prompts[1])["note"]
    assert analysis["name"] == "Product list sorting"


def test_finished_analysis_is_cleaned():
    messy = {**ANALYSIS, "risks": "not a list", "missing_info": [" ", "Default sort?"]}
    analysis = RequirementAgent(ScriptedLLM(call("finish", analysis=messy))).analyze(REQUIREMENT, tools=FakeTools())
    assert analysis["risks"] == [] and analysis["missing_info"] == ["Default sort?"]


# --- the tools

def search(query, project_id, k=5, kind="document", fact_kind=None):
    return [{"source": f"{fact_kind or kind}: {query}", "content": "c", "status": "observed" if kind == "fact" else None}]


def test_searches_say_where_each_answer_came_from():
    tools = AnalystTools("p", "https://shop.test", search=search)
    assert tools.search_app_map("sort") == "[page: sort -- observed]\nc\n\n[workflow: sort -- observed]\nc"
    assert tools.search_documents("sort") == "[document: sort]\nc"
    assert tools.search_team_knowledge("sort").startswith("[rule: sort")
    with pytest.raises(ToolError):
        tools.search_documents("  ")


@pytest.mark.parametrize(
    "path, url",
    [("/inventory.html", "https://shop.test/inventory.html"), ("cart.html", "https://shop.test/app/cart.html"),
     ("https://shop.test/x", "https://shop.test/x")],
)
def test_pages_resolve_against_the_app(path, url):
    assert AnalystTools("p", "https://shop.test/app", search=search).resolve(path) == url


@pytest.mark.parametrize("path", ["https://evil.test/", "//evil.test/x", "http://shop.test/", ""])
def test_only_the_projects_app_can_be_opened(path):
    with pytest.raises(ToolError):
        AnalystTools("p", "https://shop.test", search=search).resolve(path)


def test_no_app_url_means_no_browsing():
    tools = AnalystTools("p", "", search=search)
    assert not tools.can_browse
    with pytest.raises(ToolError, match="no app URL"):
        tools.open_page("/")


def test_open_page_reads_a_real_page_logged_out_when_login_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PLAYWRIGHT_HEADLESS", True)
    (tmp_path / "shop.html").write_text(
        "<title>Shop</title><h1>Products</h1>"
        '<select aria-label="Sort products"><option>Name (A to Z)</option><option>Price (low to high)</option></select>',
        encoding="utf-8",
    )
    logins = []

    def session():
        logins.append(1)
        raise RuntimeError("wrong password")

    tools = AnalystTools("p", tmp_path.as_uri() + "/", session=session, account_name="Standard user", search=search)
    seen = tools.open_page("shop.html")
    tools.open_page("shop.html")

    assert seen.startswith("Logged out.")
    assert 'select "Sort products" options: Name (A to Z) | Price (low to high)' in seen
    assert "Products" in seen
    assert logins == [1]  # tried once, not on every page


# --- into the graph

def test_differences_lead_the_open_questions_and_are_not_repeated(monkeypatch):
    monkeypatch.setattr(graph._requirement_agent, "analyze", lambda text, **kw: {**ANALYSIS, "analyst_turns": [{"x": 1}]})
    seen = {}

    def generate(**kw):
        seen.update(kw)
        return {"test_cases": [], "open_questions": [ANALYSIS["app_differences"][0], "Drafter's own question"]}

    monkeypatch.setattr(graph._qa_agent, "generate", generate)
    result = graph.analysis_qa_graph.invoke({"requirement_text": REQUIREMENT, "context": []})
    assert result["open_questions"] == [ANALYSIS["app_differences"][0], "Drafter's own question"]
    assert "analyst_turns" not in seen["analysis"]
    assert result["analysis"]["analyst_turns"] == [{"x": 1}]
