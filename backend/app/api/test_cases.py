import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.database.models import Project, TestCase, TestSuite, User
from app.database.models import Requirement as RequirementModel
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
