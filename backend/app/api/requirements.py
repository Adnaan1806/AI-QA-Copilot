import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_owned_requirement, get_owned_suite
from app.api.errors import llm_errors_as_http
from app.api.serializers import (
    active_test_cases,
    to_case_counts,
    to_requirement_detail,
    to_test_case_item,
)
from app.auth.dependencies import get_current_user
from app.automation import progress
from app.database.connection import get_db
from app.database.models import AnalysisResult, Project, Requirement, TestCase, TestSuite, User
from app.orchestration.graph import analysis_qa_graph, automation_report_graph
from app.rag.retriever import retrieve
from app.schemas.requirement import (
    RequirementDetailResponse,
    RequirementListItem,
    RequirementUpdateRequest,
)
from app.schemas.test_case import TestCaseCreateRequest, TestCaseItem
from app.services.automation_service import (
    analysis_payload,
    replace_report,
    save_automation_script,
    test_case_payload,
)
from app.services.document_service import extract_text_from_pdf
from app.services.export_service import build_test_cases_workbook

router = APIRouter(tags=["requirements"])


@router.post("/test-suites/{suite_id}/requirements", response_model=RequirementDetailResponse)
def create_requirement(
    suite_id: uuid.UUID,
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    suite = get_owned_suite(suite_id, current_user, db)

    if file is not None:
        if file.content_type != "application/pdf":
            raise HTTPException(400, "Only PDF file uploads are supported")
        requirement_text = extract_text_from_pdf(file.file.read())
    elif text is not None:
        requirement_text = text
    else:
        raise HTTPException(400, "Provide either 'text' or a PDF 'file'")

    requirement_text = requirement_text.strip()
    if not requirement_text:
        raise HTTPException(400, "Requirement content is empty")

    with llm_errors_as_http():
        context = retrieve(requirement_text)
        result = analysis_qa_graph.invoke(
            {"requirement_text": requirement_text, "context": context}
        )

    analysis = result["analysis"]
    name = (analysis.get("name") or "").strip() or requirement_text[:60]

    requirement = Requirement(suite_id=suite.id, name=name, content=requirement_text)
    db.add(requirement)
    db.flush()

    db.add(
        AnalysisResult(
            requirement_id=requirement.id,
            requirements=analysis.get("requirements", []),
            risks=analysis.get("risks", []),
            missing_info=analysis.get("missing_info", []),
            testing_considerations=analysis.get("testing_considerations", []),
        )
    )

    for item in result["test_cases"]:
        db.add(
            TestCase(
                requirement_id=requirement.id,
                title=item.get("title", ""),
                test_type=item.get("type", "functional"),
                steps=item.get("steps", []),
                expected_result=item.get("expected_result", ""),
                priority=item.get("priority", "medium"),
            )
        )
    db.commit()
    db.refresh(requirement)

    return to_requirement_detail(requirement)


@router.get("/requirements", response_model=list[RequirementListItem])
def list_my_requirements(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    requirements = (
        db.query(Requirement)
        .join(TestSuite, Requirement.suite_id == TestSuite.id)
        .join(Project, TestSuite.project_id == Project.id)
        .filter(Project.user_id == current_user.id)
        .order_by(Requirement.created_at.desc())
        .all()
    )
    return [
        RequirementListItem(
            id=r.id,
            suite_id=r.suite_id,
            suite_name=r.suite.name,
            project_id=r.suite.project.id,
            project_name=r.suite.project.name,
            name=r.name,
            content=r.content,
            created_at=r.created_at,
            has_analysis=r.analysis_result is not None,
            test_case_count=len(r.test_cases),
            case_counts=to_case_counts(r),
            release_recommendation=r.report.release_recommendation if r.report else None,
        )
        for r in requirements
    ]


@router.get("/requirements/{requirement_id}", response_model=RequirementDetailResponse)
def get_requirement(
    requirement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = get_owned_requirement(requirement_id, current_user, db)
    return to_requirement_detail(requirement)


@router.patch("/requirements/{requirement_id}", response_model=RequirementDetailResponse)
def update_requirement(
    requirement_id: uuid.UUID,
    payload: RequirementUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = get_owned_requirement(requirement_id, current_user, db)
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Requirement name cannot be empty")
    requirement.name = name
    db.commit()
    db.refresh(requirement)
    return to_requirement_detail(requirement)


@router.post(
    "/requirements/{requirement_id}/test-cases/approve-all",
    response_model=list[TestCaseItem],
)
def approve_all_test_cases(
    requirement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = get_owned_requirement(requirement_id, current_user, db)
    for test_case in active_test_cases(requirement):
        test_case.status = "approved"
    db.commit()
    return [to_test_case_item(tc) for tc in requirement.test_cases]


@router.post("/requirements/{requirement_id}/test-cases", response_model=TestCaseItem)
def create_test_case(
    requirement_id: uuid.UUID,
    payload: TestCaseCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = get_owned_requirement(requirement_id, current_user, db)
    if not payload.title.strip():
        raise HTTPException(400, "Title cannot be empty")

    test_case = TestCase(
        requirement_id=requirement.id,
        title=payload.title.strip(),
        test_type=payload.type,
        steps=payload.steps,
        expected_result=payload.expected_result,
        priority=payload.priority,
    )
    db.add(test_case)
    db.commit()
    db.refresh(test_case)
    return to_test_case_item(test_case)


@router.post("/requirements/{requirement_id}/automation", response_model=RequirementDetailResponse)
def generate_automation_and_report(
    requirement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = get_owned_requirement(requirement_id, current_user, db)
    if requirement.analysis_result is None:
        raise HTTPException(400, "Requirement has not been analyzed yet")
    approved = active_test_cases(requirement)
    if not approved:
        raise HTTPException(400, "No test cases to automate")
    if any(tc.status != "approved" for tc in approved):
        raise HTTPException(
            400, "Approve or reject every test case before generating automation"
        )
    base_url = requirement.suite.project.base_url
    if not base_url:
        raise HTTPException(
            400, "Set a base URL on this project before generating automation"
        )

    try:
        with llm_errors_as_http():
            result = automation_report_graph.invoke(
                {
                    "requirement_id": str(requirement_id),
                    "requirement_text": requirement.content,
                    "analysis": analysis_payload(requirement.analysis_result),
                    "approved_test_cases": [test_case_payload(tc) for tc in approved],
                    "base_url": base_url,
                }
            )
    finally:
        progress.clear_progress(str(requirement_id))

    approved_by_id = {str(tc.id): tc for tc in approved}
    for script in result["automation_scripts"]:
        test_case = approved_by_id.get(script.get("test_case_id"))
        if test_case is not None:
            save_automation_script(db, test_case, script)

    replace_report(db, requirement, result["report"])
    db.commit()
    db.refresh(requirement)

    return to_requirement_detail(requirement)


@router.get("/requirements/{requirement_id}/automation/progress")
def get_automation_progress(
    requirement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    get_owned_requirement(requirement_id, current_user, db)
    return progress.get_progress(str(requirement_id)) or {"items": {}, "report": None}


@router.get("/requirements/{requirement_id}/test-cases/export")
def export_test_cases(
    requirement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = get_owned_requirement(requirement_id, current_user, db)
    approved = active_test_cases(requirement)
    if not approved:
        raise HTTPException(400, "No test cases to export")
    if any(tc.status != "approved" for tc in approved):
        raise HTTPException(400, "Approve or reject every test case before exporting")

    workbook_bytes = build_test_cases_workbook(approved)
    return Response(
        content=workbook_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="test-cases-{requirement_id}.xlsx"'
        },
    )
