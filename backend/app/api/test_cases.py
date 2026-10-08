import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_owned_test_case
from app.api.errors import llm_errors_as_http
from app.api.serializers import to_requirement_detail, to_test_case_item
from app.auth.dependencies import get_current_user
from app.automation import progress
from app.database.connection import get_db
from app.database.models import User
from app.orchestration.graph import automate_single_test_case, generate_report
from app.schemas.requirement import RequirementDetailResponse
from app.schemas.test_case import TestCaseItem, TestCaseUpdateRequest
from app.services.review_service import set_review_status
from app.services.automation_service import (
    analysis_payload,
    replace_report,
    save_automation_script,
    saved_passing_scripts,
    script_statuses,
    test_case_payload,
)

router = APIRouter(prefix="/test-cases", tags=["test-cases"])

VALID_STATUSES = {"draft", "approved", "rejected"}


@router.patch("/{test_case_id}", response_model=TestCaseItem)
def update_test_case(
    test_case_id: uuid.UUID,
    payload: TestCaseUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    test_case = get_owned_test_case(test_case_id, current_user, db)

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
        set_review_status(test_case, payload.status, current_user, payload.reject_reason)
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

    # Its automation script (if any) was generated from the old content, so it must be
    # re-approved before automation can run again. Sibling test cases are unaffected.
    if content_changed and payload.status is None:
        set_review_status(test_case, "draft", current_user)
    # Re-runs replay the saved script, so a script written for the old steps must
    # not survive the edit. Run history is kept.
    if content_changed and test_case.automation_script is not None:
        db.delete(test_case.automation_script)

    db.commit()
    db.refresh(test_case)
    return to_test_case_item(test_case)


@router.delete("/{test_case_id}", status_code=204)
def delete_test_case(
    test_case_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    test_case = get_owned_test_case(test_case_id, current_user, db)
    db.delete(test_case)
    db.commit()


@router.post("/{test_case_id}/automation", response_model=RequirementDetailResponse)
def automate_one_test_case(
    test_case_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    test_case = get_owned_test_case(test_case_id, current_user, db)
    requirement = test_case.requirement
    if test_case.status != "approved":
        raise HTTPException(400, "Test case must be accepted before generating automation")
    base_url = requirement.suite.project.base_url
    if not base_url:
        raise HTTPException(400, "Set a base URL on this project before generating automation")

    requirement_id = str(requirement.id)
    previous_status = script_statuses([test_case]).get(str(test_case.id))
    try:
        with llm_errors_as_http():
            script = automate_single_test_case(
                test_case_payload(test_case),
                base_url,
                requirement_id,
                saved_code=saved_passing_scripts([test_case]).get(str(test_case.id)),
            )
    finally:
        progress.clear_progress(requirement_id)

    save_automation_script(db, test_case, script)
    db.commit()
    db.refresh(requirement)

    # Keep the report in sync -- a stale report showing this test case's old
    # status would be misleading. If the result didn't change, the report still holds.
    approved = [tc for tc in requirement.test_cases if tc.status == "approved"]
    scripted = [tc for tc in approved if tc.automation_script is not None]
    report_stale = requirement.report is None or script["status"] != previous_status
    if scripted and report_stale:
        with llm_errors_as_http():
            report_data = generate_report(
                requirement_text=requirement.content,
                analysis=analysis_payload(requirement.analysis_result),
                test_cases=[test_case_payload(tc) for tc in approved],
                automation_scripts=[
                    {"test_case_id": str(tc.id), "status": tc.automation_script.status}
                    for tc in scripted
                ],
            )
        replace_report(db, requirement, report_data)
        db.commit()
        db.refresh(requirement)

    return to_requirement_detail(requirement)


@router.get("/{test_case_id}/trace")
def get_test_case_trace(
    test_case_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    test_case = get_owned_test_case(test_case_id, current_user, db)
    script = test_case.automation_script
    if script is None or not script.trace_path or not os.path.isfile(script.trace_path):
        raise HTTPException(404, "No trace recorded for this test case's latest run")

    return FileResponse(
        script.trace_path,
        media_type="application/zip",
        filename=f"trace-{test_case_id}.zip",
    )
