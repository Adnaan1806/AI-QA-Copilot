import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.requirement import CaseCounts


class TestSuiteCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""


class TestSuiteResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str
    created_at: datetime
    requirement_count: int


class RequirementSummary(BaseModel):
    id: uuid.UUID
    name: str
    content: str
    created_at: datetime
    has_analysis: bool
    test_case_count: int
    approved_test_case_count: int
    has_report: bool
    case_counts: CaseCounts
    release_recommendation: Optional[str] = None
    release_verdict: Optional[str] = None


class TestSuiteDetailResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str
    created_at: datetime
    requirements: list[RequirementSummary]
