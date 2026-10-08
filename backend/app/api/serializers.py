from app.database.models import Requirement, TestCase
from app.schemas.report import ReportResponse
from app.schemas.requirement import CaseCounts, RequirementDetailResponse
from app.schemas.test_case import AutomationRunItem, AutomationScriptItem, TestCaseItem

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


def to_test_case_item(tc: TestCase) -> TestCaseItem:
    return TestCaseItem(
        id=tc.id,
        title=tc.title,
        type=tc.test_type,
        steps=tc.steps,
        expected_result=tc.expected_result,
        priority=tc.priority,
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
        missing_info=analysis.missing_info if analysis else [],
        testing_considerations=analysis.testing_considerations if analysis else [],
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
