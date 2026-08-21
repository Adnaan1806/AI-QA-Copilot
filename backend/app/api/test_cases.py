import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.requirements import _to_detail_response
from app.auth.dependencies import get_current_user
from app.automation import progress
from app.database.connection import get_db
from app.database.models import AutomationScript, Project, Report, TestCase, TestSuite, User
from app.database.models import Requirement as RequirementModel
from app.orchestration.graph import automate_single_test_case, generate_report
from app.schemas.requirement import RequirementDetailResponse
from app.schemas.test_case import TestCaseItem, TestCaseUpdateRequest

router = APIRouter(prefix="/test-cases", tags=["test-cases"])

VALID_STATUSES = {"draft", "approved"}


def _get_owned_test_case(test_case_id: uuid.UUID, current_user: User, db: Session) -> TestCase:
    test_case = (
        db.query(TestCase)
        .join(RequirementModel, TestCase.requirement_id == RequirementModel.id)
        .join(TestSuite, RequirementModel.suite_id == TestSuite.id)
        .join(Project, TestSuite.project_id == Project.id)
        .filter(TestCase.id == test_case_id, Project.user_id == current_user.id)
        .first()
    )
    if test_case is None:
        raise HTTPException(404, "Test case not found")
    return test_case


@router.patch("/{test_case_id}", response_model=TestCaseItem)
def update_test_case(
    test_case_id: uuid.UUID,
    payload: TestCaseUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    test_case = _get_owned_test_case(test_case_id, current_user, db)

    content_changed = any(
        value is not None
        for value in (
            payload.title,
            payload.type,
            payload.steps,
            payload.expected_result,
            payload.priority,
        )
    )

    if payload.status is not None:
        if payload.status not in VALID_STATUSES:
            raise HTTPException(400, f"status must be one of {sorted(VALID_STATUSES)}")
        test_case.status = payload.status
    if payload.title is not None:
        test_case.title = payload.title
    if payload.type is not None:
        test_case.test_type = payload.type
    if payload.steps is not None:
        test_case.steps = payload.steps
    if payload.expected_result is not None:
        test_case.expected_result = payload.expected_result
    if payload.priority is not None:
        test_case.priority = payload.priority

    # Editing content invalidates this test case's own prior acceptance -- its automation
    # script (if any) was generated from the old content, so it must be re-approved before
    # automation can run again. Sibling test cases in the requirement are unaffected.
    if content_changed and payload.status is None:
        test_case.status = "draft"

    db.commit()
    db.refresh(test_case)

    return TestCaseItem(
        id=test_case.id,
        title=test_case.title,
        type=test_case.test_type,
        steps=test_case.steps,
        expected_result=test_case.expected_result,
        priority=test_case.priority,
        status=test_case.status,
    )


@router.delete("/{test_case_id}", status_code=204)
def delete_test_case(
    test_case_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    test_case = _get_owned_test_case(test_case_id, current_user, db)
    db.delete(test_case)
    db.commit()


@router.post("/{test_case_id}/automation", response_model=RequirementDetailResponse)
def automate_one_test_case(
    test_case_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rerun automation for just this one test case -- e.g. retrying a single
    "needs_review" result without re-running every other already-passing
    test case in the requirement."""
    test_case = _get_owned_test_case(test_case_id, current_user, db)
    requirement = test_case.requirement
    if test_case.status != "approved":
        raise HTTPException(400, "Test case must be accepted before generating automation")
    base_url = requirement.suite.project.base_url
    if not base_url:
        raise HTTPException(400, "Set a base URL on this project before generating automation")

    payload = {
        "id": str(test_case.id),
        "title": test_case.title,
        "type": test_case.test_type,
        "steps": test_case.steps,
        "expected_result": test_case.expected_result,
        "priority": test_case.priority,
    }
    requirement_id = str(requirement.id)
    try:
        script = automate_single_test_case(payload, base_url, requirement_id)
    except Exception as exc:
        raise HTTPException(
            502, f"AI generation failed -- the LLM provider returned an error: {exc}"
        ) from exc
    finally:
        progress.clear_progress(requirement_id)

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
    db.commit()
    db.refresh(requirement)

    # Keep the report in sync -- it's a single cheap LLM call, and a stale
    # report showing the old status for this test case would be misleading.
    approved = [tc for tc in requirement.test_cases if tc.status == "approved"]
    scripted = [tc for tc in approved if tc.automation_script is not None]
    if scripted:
        analysis = requirement.analysis_result
        report_data = generate_report(
            requirement_text=requirement.content,
            analysis={
                "requirements": analysis.requirements,
                "risks": analysis.risks,
                "missing_info": analysis.missing_info,
                "testing_considerations": analysis.testing_considerations,
            },
            test_cases=[
                {
                    "id": str(tc.id),
                    "title": tc.title,
                    "type": tc.test_type,
                    "steps": tc.steps,
                    "expected_result": tc.expected_result,
                    "priority": tc.priority,
                }
                for tc in approved
            ],
            automation_scripts=[
                {"test_case_id": str(tc.id), "status": tc.automation_script.status}
                for tc in scripted
            ],
        )
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
        db.commit()
        db.refresh(requirement)

    return _to_detail_response(requirement)


@router.get("/{test_case_id}/trace")
def get_test_case_trace(
    test_case_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    test_case = _get_owned_test_case(test_case_id, current_user, db)
    script = test_case.automation_script
    if script is None or not script.trace_path or not os.path.isfile(script.trace_path):
        raise HTTPException(404, "No trace recorded for this test case's latest run")

    return FileResponse(
        script.trace_path,
        media_type="application/zip",
        filename=f"trace-{test_case_id}.zip",
    )
