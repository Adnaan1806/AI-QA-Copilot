from concurrent.futures import ThreadPoolExecutor
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph

from app import config
from app.agents.qa_agent import QAAgent
from app.agents.report_agent import ReportAgent
from app.agents.requirement_agent import RequirementAgent
from app.automation import progress
from app.automation.codegen_agent import CodegenAgent
from app.automation.explorer_agent import ExplorerAgent
from app.automation.runner import automate_test_case
from app.llm.factory import get_llm_client

_requirement_agent = RequirementAgent(get_llm_client())
_qa_agent = QAAgent(get_llm_client())
_explorer_agent = ExplorerAgent(get_llm_client())
_codegen_agent = CodegenAgent(get_llm_client())
_report_agent = ReportAgent(get_llm_client())


def automate_single_test_case(test_case: dict, base_url: str, requirement_id: str) -> dict:
    """Rerun automation for one test case outside the full graph -- e.g. a
    targeted retry on a "needs_review" result, without re-running every other
    already-passing test case in the requirement."""
    return automate_test_case(
        test_case,
        base_url,
        _explorer_agent,
        _codegen_agent,
        requirement_id=requirement_id,
        test_case_index=1,
        test_case_total=1,
    )


def generate_report(
    requirement_text: str,
    analysis: dict[str, Any],
    test_cases: list[dict[str, Any]],
    automation_scripts: list[dict[str, Any]],
) -> dict:
    return _report_agent.generate(
        requirement_text=requirement_text,
        analysis=analysis,
        test_cases=test_cases,
        automation_scripts=automation_scripts,
    )


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
    requirement_id: str
    requirement_text: str
    analysis: dict[str, Any]
    approved_test_cases: list[dict[str, Any]]
    base_url: str
    automation_scripts: list[dict[str, Any]]
    report: dict[str, Any]


def _automation_node(state: AutomationReportState) -> dict:
    requirement_id = state.get("requirement_id")
    test_cases = state["approved_test_cases"]
    total = len(test_cases)

    def run_one(i: int, tc: dict) -> dict:
        return automate_test_case(
            tc,
            state["base_url"],
            _explorer_agent,
            _codegen_agent,
            requirement_id=requirement_id,
            test_case_index=i,
            test_case_total=total,
        )

    with ThreadPoolExecutor(max_workers=config.AUTOMATION_CONCURRENCY) as executor:
        results = list(executor.map(run_one, range(1, total + 1), test_cases))
    return {"automation_scripts": results}


def _report_node(state: AutomationReportState) -> dict:
    requirement_id = state.get("requirement_id")
    if requirement_id:
        progress.set_progress(requirement_id, stage="compiling_report")
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
