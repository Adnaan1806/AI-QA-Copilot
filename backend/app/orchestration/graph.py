from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app.agents.qa_agent import QAAgent
from app.agents.report_agent import ReportAgent
from app.agents.requirement_agent import RequirementAgent
from app.automation.codegen_agent import CodegenAgent
from app.automation.explorer_agent import ExplorerAgent
from app.automation.runner import automate_test_case
from app.llm.gemini_client import GeminiClient

_requirement_agent = RequirementAgent(GeminiClient())
_qa_agent = QAAgent(GeminiClient())
_explorer_agent = ExplorerAgent(GeminiClient())
_codegen_agent = CodegenAgent(GeminiClient())
_report_agent = ReportAgent(GeminiClient())


class AnalysisQAState(TypedDict):
    requirement_text: str
    context: list[dict[str, Any]]
    analysis: dict[str, Any]
    test_cases: list[dict[str, Any]]


def _requirement_node(state: AnalysisQAState) -> dict:
    analysis = _requirement_agent.analyze(state["requirement_text"])
    return {"analysis": analysis}


def _qa_node(state: AnalysisQAState) -> dict:
    generated = _qa_agent.generate(
        requirement_text=state["requirement_text"],
        analysis=state["analysis"],
        context=state.get("context") or [],
    )
    return {"test_cases": generated.get("test_cases", [])}


_analysis_qa_builder = StateGraph(AnalysisQAState)
_analysis_qa_builder.add_node("requirement", _requirement_node)
_analysis_qa_builder.add_node("qa", _qa_node)
_analysis_qa_builder.set_entry_point("requirement")
_analysis_qa_builder.add_edge("requirement", "qa")
_analysis_qa_builder.add_edge("qa", END)
analysis_qa_graph = _analysis_qa_builder.compile()


class AutomationReportState(TypedDict):
    requirement_text: str
    analysis: dict[str, Any]
    approved_test_cases: list[dict[str, Any]]
    base_url: str
    automation_scripts: list[dict[str, Any]]
    report: dict[str, Any]


def _automation_node(state: AutomationReportState) -> dict:
    results = [
        automate_test_case(tc, state["base_url"], _explorer_agent, _codegen_agent)
        for tc in state["approved_test_cases"]
    ]
    return {"automation_scripts": results}


def _report_node(state: AutomationReportState) -> dict:
    report = _report_agent.generate(
        requirement_text=state["requirement_text"],
        analysis=state["analysis"],
        test_cases=state["approved_test_cases"],
        automation_scripts=state["automation_scripts"],
    )
    return {"report": report}


_automation_report_builder = StateGraph(AutomationReportState)
_automation_report_builder.add_node("automation", _automation_node)
_automation_report_builder.add_node("report", _report_node)
_automation_report_builder.set_entry_point("automation")
_automation_report_builder.add_edge("automation", "report")
_automation_report_builder.add_edge("report", END)
automation_report_graph = _automation_report_builder.compile()
