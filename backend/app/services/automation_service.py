"""Converts ORM rows into agent payloads and persists automation/report results."""

import re
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.database.models import (
    AnalysisResult,
    AutomationRun,
    AutomationScript,
    Report,
    Requirement,
    TestCase,
)

RELEASE_VERDICTS = ("ready", "ready_with_risks", "not_ready")


def normalize_verdict(raw: Optional[str], recommendation: str = "") -> str:
    """The report agent's verdict, or -- if it's missing or malformed -- one read from
    the wording of the recommendation. Errs toward not_ready when unclear."""
    value = (raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if value in RELEASE_VERDICTS:
        return value
    text = recommendation.lower()
    if re.search(r"\bnot ready\b|\bdo not release\b|\bdon't release\b|\bblock", text):
        return "not_ready"
    if re.search(r"\bwith (caution|caveats?|risks?)\b|\bconditional", text):
        return "ready_with_risks"
    if re.search(r"\bready\b", text):
        return "ready"
    return "not_ready"


def analysis_payload(analysis: AnalysisResult) -> dict[str, Any]:
    return {
        "requirements": analysis.requirements,
        "risks": analysis.risks,
        "missing_info": analysis.missing_info,
        "testing_considerations": analysis.testing_considerations,
    }


def case_label(tc: TestCase) -> str:
    """The TC-n number the UI shows: position among all the requirement's cases,
    rejected ones included (same ordering as caseLabel in frontend/src/lib/qa.js)."""
    return f"TC-{tc.requirement.test_cases.index(tc) + 1}"


def test_case_payload(tc: TestCase) -> dict[str, Any]:
    return {
        "id": str(tc.id),
        "label": case_label(tc),
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
    db.add(
        AutomationRun(
            test_case_id=test_case.id,
            status=fields["status"],
            attempts=fields["attempts"],
            output=fields["last_output"],
        )
    )


def replace_report(db: Session, requirement: Requirement, report_data: dict[str, Any]) -> None:
    if requirement.report is not None:
        db.delete(requirement.report)
        db.flush()
    recommendation = report_data.get("release_recommendation", "")
    db.add(
        Report(
            requirement_id=requirement.id,
            summary=report_data.get("summary", ""),
            coverage_analysis=report_data.get("coverage_analysis", []),
            quality_risks=report_data.get("quality_risks", []),
            release_recommendation=recommendation,
            verdict=normalize_verdict(report_data.get("verdict"), recommendation),
        )
    )
