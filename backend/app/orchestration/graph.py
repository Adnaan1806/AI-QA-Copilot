import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional, TypedDict

from langgraph.graph import END, StateGraph

from app import config
from app.agents.qa_agent import MAX_SUGGESTIONS, QAAgent
from app.agents.report_agent import ReportAgent
from app.agents.requirement_agent import RequirementAgent
from app.automation import progress
from app.automation.codegen_agent import CodegenAgent
from app.automation.explorer_agent import ExplorerAgent
from app.automation.mender_agent import MenderAgent
from app.automation.runner import automate_test_case
from app.llm.factory import get_llm_client

logger = logging.getLogger(__name__)

_requirement_agent = RequirementAgent(get_llm_client())
_qa_agent = QAAgent(get_llm_client())
_explorer_agent = ExplorerAgent(get_llm_client())
_codegen_agent = CodegenAgent(get_llm_client())
_mender_agent = MenderAgent(get_llm_client(), _explorer_agent)
_report_agent = ReportAgent(get_llm_client())


def mender() -> Optional[MenderAgent]:
    """Mender when MENDER_AGENT is on; otherwise None, and the codegen healer repairs."""
    return _mender_agent if config.MENDER_AGENT else None


def automate_single_test_case(
    test_case: dict,
    base_url: str,
    requirement_id: str,
    saved_code: Optional[str] = None,
    start: Optional[dict] = None,
) -> dict:
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
        saved_code=saved_code,
        start=start,
        mender=mender(),
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
    # Names of the project's test accounts, default first; empty when it has none.
    account_names: list[str]
    # Pages, layout and proven workflows relevant to the requirement (drafting_service).
    app_knowledge: list[dict[str, Any]]
    # Where the requirement and the app knowledge disagree.
    open_questions: list[str]
    analysis: dict[str, Any]
    test_cases: list[dict[str, Any]]
    suggestions: list[dict[str, Any]]
    # Where the page polls for progress (key and user), when it asked for it.
    progress_key: Optional[str]
    user_id: str


def _report(state: AnalysisQAState, stage: str, **fields) -> None:
    progress.set_analysis_progress(state.get("progress_key"), state.get("user_id", ""), stage, **fields)


def _requirement_node(state: AnalysisQAState) -> dict:
    _report(state, "analyst")
    analysis = _requirement_agent.analyze(state["requirement_text"])
    _report(
        state,
        "drafter",
        points=len(analysis.get("requirements") or []),
        questions=len(analysis.get("missing_info") or []),
    )
    return {"analysis": analysis}


def _qa_node(state: AnalysisQAState) -> dict:
    generated = _qa_agent.generate(
        requirement_text=state["requirement_text"],
        analysis=state["analysis"],
        context=state.get("context") or [],
        account_names=state.get("account_names") or [],
        app_knowledge=state.get("app_knowledge") or [],
    )
    return {
        "test_cases": generated.get("test_cases", []),
        "suggestions": (generated.get("suggestions") or [])[:MAX_SUGGESTIONS],
        "open_questions": [str(q) for q in generated.get("open_questions") or [] if str(q).strip()],
    }


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
    # Test case id -> code of its last passing script, replayed before re-exploring.
    saved_scripts: dict[str, str]
    # Test case id -> {"account", "storage_state"} for cases that start logged in.
    starts: dict[str, dict]
    # Test case id -> status the current report was written for; empty when the
    # requirement has no report yet.
    reported_statuses: dict[str, str]
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
            saved_code=saved.get(tc["id"]),
            start=starts.get(tc["id"]),
            mender=mender(),
        )

    saved = state.get("saved_scripts") or {}
    starts = state.get("starts") or {}
    with ThreadPoolExecutor(max_workers=config.AUTOMATION_CONCURRENCY) as executor:
        results = list(executor.map(run_one, range(1, total + 1), test_cases))
    return {"automation_scripts": results}


def _report_needed(state: AutomationReportState) -> str:
    """Skip the report LLM call when every case ended exactly as the current
    report already describes -- a re-run that changed nothing."""
    previous = state.get("reported_statuses") or {}
    current = {s["test_case_id"]: s["status"] for s in state["automation_scripts"]}
    return "skip" if previous and previous == current else "report"


def _report_node(state: AutomationReportState) -> dict:
    requirement_id = state.get("requirement_id")
    if requirement_id:
        progress.set_progress(requirement_id, stage="compiling_report")
    try:
        report = _report_agent.generate(
            requirement_text=state["requirement_text"],
            analysis=state["analysis"],
            test_cases=state["approved_test_cases"],
            automation_scripts=state["automation_scripts"],
        )
    except Exception:
        # Keep the scripts this run produced; the old report no longer matches
        # their statuses, so the next run writes a new one.
        logger.exception("Report generation failed for requirement %s", requirement_id)
        return {}
    return {"report": report}


_automation_report_builder = StateGraph(AutomationReportState)
_automation_report_builder.add_node("automation", _automation_node)
_automation_report_builder.add_node("report", _report_node)
_automation_report_builder.set_entry_point("automation")
_automation_report_builder.add_conditional_edges(
    "automation", _report_needed, {"report": "report", "skip": END}
)
_automation_report_builder.add_edge("report", END)
automation_report_graph = _automation_report_builder.compile()
