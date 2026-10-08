"""Converts ORM rows into agent payloads and persists automation/report results."""

from typing import Any

from sqlalchemy.orm import Session

from app.database.models import AnalysisResult, AutomationScript, Report, Requirement, TestCase


def analysis_payload(analysis: AnalysisResult) -> dict[str, Any]:
    return {
        "requirements": analysis.requirements,
        "risks": analysis.risks,
        "missing_info": analysis.missing_info,
        "testing_considerations": analysis.testing_considerations,
    }


def test_case_payload(tc: TestCase) -> dict[str, Any]:
    return {
        "id": str(tc.id),
        "title": tc.title,
        "type": tc.test_type,
        "steps": tc.steps,
        "expected_result": tc.expected_result,
        "priority": tc.priority,
    }


def save_automation_script(db: Session, test_case: TestCase, script: dict[str, Any]) -> None:
    fields = {
        "code": script.get("code", ""),
        "status": script.get("status", "passed"),
        "attempts": script.get("attempts", 1),
        "last_output": script.get("last_output"),
        "trace_path": script.get("trace_path"),
    }
    if test_case.automation_script is not None:
        for key, value in fields.items():
            setattr(test_case.automation_script, key, value)
    else:
        db.add(AutomationScript(test_case_id=test_case.id, **fields))


def replace_report(db: Session, requirement: Requirement, report_data: dict[str, Any]) -> None:
    if requirement.report is not None:
        db.delete(requirement.report)
        db.flush()
    db.add(
        Report(
            requirement_id=requirement.id,
            summary=report_data.get("summary", ""),
            coverage_analysis=report_data.get("coverage_analysis", []),
            quality_risks=report_data.get("quality_risks", []),
            release_recommendation=report_data.get("release_recommendation", ""),
        )
    )
