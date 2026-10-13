"""The Analyst: its tool loop (scripted LLM, fake tools), its knowledge
searches, and how its app differences become open questions."""

import json

import pytest

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
    def __init__(self):
        self.calls = []

    def search_app_map(self, query):
        self.calls.append(("map", query))
        return '[Page: Products -- observed]\nselect "Sort products" options: Name (A to Z) | Price (low to high)'

    def search_documents(self, query):
        self.calls.append(("docs", query))
        return "No uploaded document matches that."

    def search_team_knowledge(self, query):
        self.calls.append(("team", query))
        raise ToolError("query must say what to look for")


def test_checks_what_the_project_knows_then_finishes_with_its_differences():
    llm = ScriptedLLM(
        call("search_app_map", query="sort dropdown"),
        call("search_documents", query="sorting"),
        call("finish", analysis=ANALYSIS),
    )
    tools = FakeTools()
    steps = []
    analysis = RequirementAgent(llm).analyze(REQUIREMENT, tools=tools, on_step=steps.append)

    assert tools.calls == [("map", "sort dropdown"), ("docs", "sorting")]
    assert steps == ['is looking up "sort dropdown" in the app map', 'is searching your documents for "sorting"']
    assert analysis["app_differences"] == ANALYSIS["app_differences"]
    assert analysis["name"] == "Product list sorting"
    assert [t["tool"] for t in analysis["analyst_turns"]] == ["search_app_map", "search_documents"]
    # The model saw what the app map holds.
    sent = json.loads(llm.prompts[2])
    assert "options: Name (A to Z)" in sent["turns_so_far"][0]["result"]


def test_the_app_is_never_opened():
    assert "open_page" not in requirement_agent.AGENT_SYSTEM_PROMPT
    assert "open_page" not in requirement_agent.TOOLS
    llm = ScriptedLLM(call("open_page", path="/inventory.html"), call("finish", analysis=ANALYSIS))
    analysis = RequirementAgent(llm).analyze(REQUIREMENT, tools=FakeTools())
    assert "Unknown tool 'open_page'" in analysis["analyst_turns"][0]["result"]


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


def test_a_search_that_breaks_costs_the_turn_only():
    class Broken(FakeTools):
        def search_app_map(self, query):
            raise ConnectionError("vector store down")

    llm = ScriptedLLM(call("search_app_map", query="sort"), call("finish", analysis=ANALYSIS))
    analysis = RequirementAgent(llm).analyze(REQUIREMENT, tools=Broken())
    assert analysis["analyst_turns"][0]["result"] == "search_app_map failed: ConnectionError: vector store down"


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
        def search_documents(self, query):
            now[0] += requirement_agent.TIME_BUDGET_SECONDS
            return "doc"

    llm = ScriptedLLM(call("search_documents", query="q"), call("finish", analysis=ANALYSIS))
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
    tools = AnalystTools("p", search=search)
    assert tools.search_app_map("sort") == "[page: sort -- observed]\nc\n\n[workflow: sort -- observed]\nc"
    assert tools.search_documents("sort") == "[document: sort]\nc"
    assert tools.search_team_knowledge("sort").startswith("[rule: sort")
    with pytest.raises(ToolError):
        tools.search_documents("  ")


def test_searches_stay_in_the_project():
    seen = []
    tools = AnalystTools("project-1", search=lambda query, project_id, **kw: seen.append(project_id) or [])
    assert tools.search_app_map("sort") == "Nothing in the app map matches that."
    tools.search_team_knowledge("sort")
    assert set(seen) == {"project-1"}


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
