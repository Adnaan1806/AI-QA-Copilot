import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_owned_project, get_owned_suite
from app.api.serializers import to_case_counts
from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.database.models import TestSuite, User
from app.schemas.test_suite import (
    RequirementSummary,
    TestSuiteCreateRequest,
    TestSuiteDetailResponse,
    TestSuiteResponse,
)

router = APIRouter(tags=["test-suites"])


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
    project = get_owned_project(project_id, current_user, db)
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
    project = get_owned_project(project_id, current_user, db)
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
    suite = get_owned_suite(suite_id, current_user, db)
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
            case_counts=to_case_counts(r),
            release_recommendation=r.report.release_recommendation if r.report else None,
            release_verdict=r.report.verdict if r.report else None,
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
