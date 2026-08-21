import uuid
from typing import Optional

from pydantic import BaseModel


class TestCaseItem(BaseModel):
    id: uuid.UUID
    title: str
    type: str
    steps: list[str]
    expected_result: str
    priority: str
    status: str


class TestCaseCreateRequest(BaseModel):
    title: str
    type: str = "functional"
    steps: list[str] = []
    expected_result: str = ""
    priority: str = "medium"


class TestCaseGenerationResponse(BaseModel):
    requirement_id: uuid.UUID
    test_cases: list[TestCaseItem]


class TestCaseUpdateRequest(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    steps: Optional[list[str]] = None
    expected_result: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None


class AutomationScriptItem(BaseModel):
    test_case_id: uuid.UUID
    framework: str
    code: str
    status: str
    attempts: int
    last_output: Optional[str] = None
    has_trace: bool = False
