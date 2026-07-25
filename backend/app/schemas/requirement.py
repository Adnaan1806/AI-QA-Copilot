import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.report import ReportResponse
from app.schemas.test_case import AutomationScriptItem, TestCaseItem


class RequirementUpdateRequest(BaseModel):
    name: str


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


class RequirementDetailResponse(BaseModel):
    requirement_id: uuid.UUID
    suite_id: uuid.UUID
    name: str
    content: str
    created_at: datetime
    requirements: list[str]
    risks: list[str]
    missing_info: list[str]
    testing_considerations: list[str]
    test_cases: list[TestCaseItem]
    automation_scripts: list[AutomationScriptItem]
    report: Optional[ReportResponse]
