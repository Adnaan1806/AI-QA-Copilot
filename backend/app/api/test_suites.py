import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.database.models import Project, TestSuite, User
from app.schemas.test_suite import (
    RequirementSummary,
    TestSuiteCreateRequest,
    TestSuiteDetailResponse,
    TestSuiteResponse,
)

router = APIRouter(tags=["test-suites"])


def _get_owned_project(project_id: uuid.UUID, current_user: User, db: Session) -> Project:
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


def _get_owned_suite(suite_id: uuid.UUID, current_user: User, db: Session) -> TestSuite:
    suite = (
        db.query(TestSuite)
        .join(Project, TestSuite.project_id == Project.id)
        .filter(TestSuite.id == suite_id, Project.user_id == current_user.id)
        .first()
    )
    if suite is None:
        raise HTTPException(404, "Test suite not found")
    return suite


def _to_response(suite: TestSuite) -> TestSuiteResponse:
    return TestSuiteResponse(
        id=suite.id,
        project_id=suite.project_id,
        name=suite.name,
        description=suite.description,
        created_at=suite.created_at,
        requirement_count=len(suite.requirements),
    )


@router.get("/projects/{project_id}/test-suites", response_model=list[TestSuiteResponse])
def list_test_suites(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_owned_project(project_id, current_user, db)
    suites = (
        db.query(TestSuite)
        .filter(TestSuite.project_id == project.id)
        .order_by(TestSuite.created_at.desc())
        .all()
    )
    return [_to_response(s) for s in suites]


@router.post("/projects/{project_id}/test-suites", response_model=TestSuiteResponse)
def create_test_suite(
    project_id: uuid.UUID,
    payload: TestSuiteCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = _get_owned_project(project_id, current_user, db)
    suite = TestSuite(
        project_id=project.id, name=payload.name, description=payload.description or ""
    )
    db.add(suite)
    db.commit()
    return _to_response(suite)


@router.get("/test-suites/{suite_id}", response_model=TestSuiteDetailResponse)
def get_test_suite(
    suite_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    suite = _get_owned_suite(suite_id, current_user, db)
    requirements = [
        RequirementSummary(
            id=r.id,
            name=r.name,
            content=r.content,
            created_at=r.created_at,
            has_analysis=r.analysis_result is not None,
            test_case_count=len(r.test_cases),
            approved_test_case_count=sum(
                1 for tc in r.test_cases if tc.status == "approved"
            ),
            has_report=r.report is not None,
        )
        for r in sorted(suite.requirements, key=lambda r: r.created_at, reverse=True)
    ]
    return TestSuiteDetailResponse(
        id=suite.id,
        project_id=suite.project_id,
        name=suite.name,
        description=suite.description,
        created_at=suite.created_at,
        requirements=requirements,
    )
