import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.report import ReportResponse
from app.schemas.test_case import AutomationScriptItem, TestCaseItem


class RequirementUpdateRequest(BaseModel):
    name: str


class CaseCounts(BaseModel):
    """Where each test case of a requirement stands. Every case is in exactly one bucket:
    approved means approved but not automated yet; passed/failed/needs_review are
    approved cases with an automation result (failed: the app was seen not to do
    what the case expects)."""

    draft: int = 0
    approved: int = 0
    rejected: int = 0
    passed: int = 0
    failed: int = 0
    needs_review: int = 0


class RequirementListItem(BaseModel):
    id: uuid.UUID
    suite_id: uuid.UUID
    suite_name: str
    project_id: uuid.UUID
    project_name: str
    name: str
    content: str
    created_at: datetime
    has_analysis: bool
    test_case_count: int
    case_counts: CaseCounts
    release_recommendation: Optional[str] = None
    release_verdict: Optional[str] = None


class SuggestedCase(BaseModel):
    title: str
    covers: Optional[str] = None
    type: str = "functional"
    steps: list[str] = []
    expected_result: str = ""
    priority: str = "medium"
    starts_logged_out: bool = False
    assumptions: list[str] = []
    questions: list[str] = []
    why: str = ""


class AnsweredQuestion(BaseModel):
    question: str
    differs_from_app: bool
    answer: Optional[str] = None


class RequirementDetailResponse(BaseModel):
    requirement_id: uuid.UUID
    suite_id: uuid.UUID
    name: str
    content: str
    created_at: datetime
    requirements: list[str]
    risks: list[str]
    missing_info: list[str]
    # Where the requirement and what the app map shows disagree.
    open_questions: list[str] = []
    # Questions already answered; each answer became a project rule.
    answered_questions: list[AnsweredQuestion] = []
    testing_considerations: list[str]
    suggestions: list[SuggestedCase]
    # How the Analyst checked the requirement: {thought, tool, args, result, seconds}.
    analyst_turns: list[dict] = []
    test_cases: list[TestCaseItem]
    automation_scripts: list[AutomationScriptItem]
    report: Optional[ReportResponse]
