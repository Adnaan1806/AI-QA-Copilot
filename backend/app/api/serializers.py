from typing import Optional

from app.database.models import Requirement, TestCase
from app.schemas.report import ReportResponse
from app.schemas.requirement import CaseCounts, RequirementDetailResponse, SuggestedCase
from app.schemas.test_case import (
    AutomationRunItem,
    AutomationScriptItem,
    TestCaseItem,
    clean_list,
    clean_steps,
)
from app.services.question_service import answered, unresolved
from app.services.session_service import start_account

# How many recent runs to send per case -- enough to judge flakiness.
RUN_HISTORY_LIMIT = 10


def active_test_cases(requirement: Requirement) -> list[TestCase]:
    """Test cases still in play -- rejected ones are kept for the record but never
    gate, automate, or export."""
    return [tc for tc in requirement.test_cases if tc.status != "rejected"]


def to_case_counts(requirement: Requirement) -> CaseCounts:
    counts = CaseCounts()
    for tc in requirement.test_cases:
        if tc.status == "rejected":
            counts.rejected += 1
        elif tc.status != "approved":
            counts.draft += 1
        elif tc.automation_script is None:
            counts.approved += 1
        elif tc.automation_script.status == "passed":
            counts.passed += 1
        else:
            counts.needs_review += 1
    return counts


def suggested_cases(raw: Optional[list]) -> list[SuggestedCase]:
    """The QA agent's suggestions, skipping any too malformed to add as a case."""
    cases = []
    for item in raw or []:
        if not isinstance(item, dict) or not str(item.get("title") or "").strip():
            continue
        cases.append(
            SuggestedCase(
                title=str(item["title"]).strip(),
                covers=item.get("covers") or None,
                type=item.get("type") or "functional",
                steps=clean_steps([str(step) for step in item.get("steps") or []]),
                expected_result=str(item.get("expected_result") or ""),
                priority=item.get("priority") or "medium",
                starts_logged_out=item.get("starts_logged_out") is True,
                assumptions=clean_list(item.get("assumptions")),
                questions=clean_list(item.get("questions")),
                why=str(item.get("why") or ""),
            )
        )
    return cases


def to_test_case_item(tc: TestCase) -> TestCaseItem:
    return TestCaseItem(
        id=tc.id,
        title=tc.title,
        type=tc.test_type,
        steps=clean_steps(tc.steps),  # cases saved before steps were cleaned on write
        expected_result=tc.expected_result,
        priority=tc.priority,
        covers=tc.covers,
        assumptions=tc.assumptions or [],
        questions=tc.questions or [],
        start_state=tc.start_state,
        account_id=tc.account_id,
        starts_as=getattr(start_account(tc, tc.requirement.suite.project), "name", None),
        status=tc.status,
        reviewed_by_name=tc.reviewed_by.name if tc.reviewed_by else None,
        reviewed_at=tc.reviewed_at,
        reject_reason=tc.reject_reason,
    )


def to_requirement_detail(requirement: Requirement) -> RequirementDetailResponse:
    analysis = requirement.analysis_result
    report = requirement.report
    return RequirementDetailResponse(
        requirement_id=requirement.id,
        suite_id=requirement.suite_id,
        name=requirement.name,
        content=requirement.content,
        created_at=requirement.created_at,
        requirements=analysis.requirements if analysis else [],
        risks=analysis.risks if analysis else [],
        missing_info=[q["question"] for q in unresolved(requirement) if not q["differs_from_app"]],
        open_questions=[q["question"] for q in unresolved(requirement) if q["differs_from_app"]],
        answered_questions=answered(requirement),
        testing_considerations=analysis.testing_considerations if analysis else [],
        suggestions=suggested_cases(analysis.suggestions if analysis else None),
        test_cases=[to_test_case_item(tc) for tc in requirement.test_cases],
        automation_scripts=[
            AutomationScriptItem(
                test_case_id=tc.automation_script.test_case_id,
                framework=tc.automation_script.framework,
                code=tc.automation_script.code,
                status=tc.automation_script.status,
                attempts=tc.automation_script.attempts,
                last_output=tc.automation_script.last_output,
                has_trace=tc.automation_script.trace_path is not None,
                runs=[
                    AutomationRunItem(status=run.status, attempts=run.attempts, created_at=run.created_at)
                    for run in tc.automation_runs[:RUN_HISTORY_LIMIT]
                ],
            )
            for tc in requirement.test_cases
            if tc.automation_script is not None
        ],
        report=ReportResponse(
            summary=report.summary,
            coverage_analysis=report.coverage_analysis,
            quality_risks=report.quality_risks,
            release_recommendation=report.release_recommendation,
            verdict=report.verdict,
            created_at=report.created_at,
        )
        if report
        else None,
    )
