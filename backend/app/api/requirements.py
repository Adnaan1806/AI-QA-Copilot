import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.test_suites import _get_owned_suite
from app.automation import progress
from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.database.models import (
    AnalysisResult,
    AutomationScript,
    Project,
    Report,
    Requirement,
    TestCase,
    TestSuite,
    User,
)
from app.orchestration.graph import analysis_qa_graph, automation_report_graph
from app.rag.retriever import retrieve
from app.schemas.report import ReportResponse
from app.schemas.requirement import (
    RequirementDetailResponse,
    RequirementListItem,
    RequirementUpdateRequest,
)
from app.schemas.test_case import AutomationScriptItem, TestCaseCreateRequest, TestCaseItem
from app.services.document_service import extract_text_from_pdf
from app.services.export_service import build_test_cases_workbook

router = APIRouter(tags=["requirements"])


def _invoke_graph(graph, state: dict) -> dict:
    try:
        return graph.invoke(state)
    except Exception as exc:
        # Surface as a normal HTTPException (goes through CORSMiddleware correctly) instead of
        # letting an LLM-provider error (e.g. rate limits) propagate as a bare 500 -- an unhandled
        # exception bypasses CORS header injection, which browsers report as a CORS failure.
        raise HTTPException(
            502, f"AI generation failed -- the LLM provider returned an error: {exc}"
        ) from exc


def _get_owned_requirement(
    requirement_id: uuid.UUID, current_user: User, db: Session
) -> Requirement:
    requirement = (
        db.query(Requirement)
        .join(TestSuite, Requirement.suite_id == TestSuite.id)
        .join(Project, TestSuite.project_id == Project.id)
        .filter(Requirement.id == requirement_id, Project.user_id == current_user.id)
        .first()
    )
    if requirement is None:
        raise HTTPException(404, "Requirement not found")
    return requirement


def _to_test_case_item(tc: TestCase) -> TestCaseItem:
    return TestCaseItem(
        id=tc.id,
        title=tc.title,
        type=tc.test_type,
        steps=tc.steps,
        expected_result=tc.expected_result,
        priority=tc.priority,
        status=tc.status,
    )


def _to_detail_response(requirement: Requirement) -> RequirementDetailResponse:
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
        test_cases=[_to_test_case_item(tc) for tc in requirement.test_cases],
        automation_scripts=[
            AutomationScriptItem(
                test_case_id=tc.automation_script.test_case_id,
                framework=tc.automation_script.framework,
                code=tc.automation_script.code,
                status=tc.automation_script.status,
                attempts=tc.automation_script.attempts,
                last_output=tc.automation_script.last_output,
                has_trace=tc.automation_script.trace_path is not None,
            )
            for tc in requirement.test_cases
            if tc.automation_script is not None
        ],
        report=ReportResponse(
            summary=report.summary,
            coverage_analysis=report.coverage_analysis,
            quality_risks=report.quality_risks,
            release_recommendation=report.release_recommendation,
            created_at=report.created_at,
        )
        if report
        else None,
    )


@router.post("/test-suites/{suite_id}/requirements", response_model=RequirementDetailResponse)
def create_requirement(
    suite_id: uuid.UUID,
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    suite = _get_owned_suite(suite_id, current_user, db)

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

    context = retrieve(requirement_text)
    result = _invoke_graph(
        analysis_qa_graph, {"requirement_text": requirement_text, "context": context}
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

    return _to_detail_response(requirement)


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
        )
        for r in requirements
    ]


@router.get("/requirements/{requirement_id}", response_model=RequirementDetailResponse)
def get_requirement(
    requirement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = _get_owned_requirement(requirement_id, current_user, db)
    return _to_detail_response(requirement)


@router.patch("/requirements/{requirement_id}", response_model=RequirementDetailResponse)
def update_requirement(
    requirement_id: uuid.UUID,
    payload: RequirementUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = _get_owned_requirement(requirement_id, current_user, db)
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Requirement name cannot be empty")
    requirement.name = name
    db.commit()
    db.refresh(requirement)
    return _to_detail_response(requirement)


@router.post(
    "/requirements/{requirement_id}/test-cases/approve-all",
    response_model=list[TestCaseItem],
)
def approve_all_test_cases(
    requirement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = _get_owned_requirement(requirement_id, current_user, db)
    for test_case in requirement.test_cases:
        test_case.status = "approved"
    db.commit()
    return [_to_test_case_item(tc) for tc in requirement.test_cases]


@router.post("/requirements/{requirement_id}/test-cases", response_model=TestCaseItem)
def create_test_case(
    requirement_id: uuid.UUID,
    payload: TestCaseCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = _get_owned_requirement(requirement_id, current_user, db)
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
    return _to_test_case_item(test_case)


@router.post("/requirements/{requirement_id}/automation", response_model=RequirementDetailResponse)
def generate_automation_and_report(
    requirement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = _get_owned_requirement(requirement_id, current_user, db)
    if requirement.analysis_result is None:
        raise HTTPException(400, "Requirement has not been analyzed yet")

    if not requirement.test_cases:
        raise HTTPException(400, "No test cases to automate")
    if any(tc.status != "approved" for tc in requirement.test_cases):
        raise HTTPException(
            400, "All test cases must be accepted before generating automation -- accept all test cases first"
        )
    base_url = requirement.suite.project.base_url
    if not base_url:
        raise HTTPException(
            400, "Set a base URL on this project before generating automation"
        )
    approved = requirement.test_cases

    approved_payload = [
        {
            "id": str(tc.id),
            "title": tc.title,
            "type": tc.test_type,
            "steps": tc.steps,
            "expected_result": tc.expected_result,
            "priority": tc.priority,
        }
        for tc in approved
    ]
    analysis = requirement.analysis_result
    try:
        result = _invoke_graph(
            automation_report_graph,
            {
                "requirement_id": str(requirement_id),
                "requirement_text": requirement.content,
                "analysis": {
                    "requirements": analysis.requirements,
                    "risks": analysis.risks,
                    "missing_info": analysis.missing_info,
                    "testing_considerations": analysis.testing_considerations,
                },
                "approved_test_cases": approved_payload,
                "base_url": base_url,
            },
        )
    finally:
        progress.clear_progress(str(requirement_id))

    approved_by_id = {str(tc.id): tc for tc in approved}
    for script in result["automation_scripts"]:
        test_case = approved_by_id.get(script.get("test_case_id"))
        if test_case is None:
            continue
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

    report_data = result["report"]
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


@router.get("/requirements/{requirement_id}/automation/progress")
def get_automation_progress(
    requirement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_owned_requirement(requirement_id, current_user, db)
    return progress.get_progress(str(requirement_id)) or {"items": {}, "report": None}


@router.get("/requirements/{requirement_id}/test-cases/export")
def export_test_cases(
    requirement_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    requirement = _get_owned_requirement(requirement_id, current_user, db)
    if not requirement.test_cases:
        raise HTTPException(400, "No test cases to export")
    if any(tc.status != "approved" for tc in requirement.test_cases):
        raise HTTPException(
            400, "All test cases must be accepted before exporting -- accept all test cases first"
        )

    workbook_bytes = build_test_cases_workbook(requirement.test_cases)
    return Response(
        content=workbook_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="test-cases-{requirement_id}.xlsx"'
        },
    )
