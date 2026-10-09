import re
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator

# "1. ", "2) ", "Step 3: ", "4 - " -- the UI numbers steps itself.
_STEP_NUMBER = re.compile(r"^\s*(?:step\s*)?\d+\s*[.):-]\s+", re.IGNORECASE)


def clean_steps(steps: list[str]) -> list[str]:
    """Strip leading step numbers and drop blank steps."""
    cleaned = (_STEP_NUMBER.sub("", step, count=1).strip() for step in steps)
    return [step for step in cleaned if step]


class TestCaseItem(BaseModel):
    id: uuid.UUID
    title: str
    type: str
    steps: list[str]
    expected_result: str
    priority: str
    covers: Optional[str] = None
    status: str
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    reject_reason: Optional[str] = None


class TestCaseCreateRequest(BaseModel):
    title: str
    type: str = "functional"
    steps: list[str] = []
    expected_result: str = ""
    priority: str = "medium"
    covers: Optional[str] = None

    _clean_steps = field_validator("steps")(clean_steps)


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

    @field_validator("steps")
    @classmethod
    def _clean_steps(cls, steps: Optional[list[str]]) -> Optional[list[str]]:
        return None if steps is None else clean_steps(steps)
    reject_reason: Optional[str] = None


class AutomationRunItem(BaseModel):
    status: str
    attempts: int
    created_at: datetime


class TryItem(BaseModel):
    kind: str  # replayed | generated | healed
    passed: bool
    code: str
    output: str = ""  # tail of the pytest output, failing tries only
    reason: str = ""  # healed tries: what the healer fixed
    stop_reason: str = ""  # set when the healer declined to change this try


class RunTriesItem(BaseModel):
    status: str
    created_at: datetime
    tries: list[TryItem]


class TestCaseTriesResponse(BaseModel):
    latest: Optional[RunTriesItem] = None
    # The run that produced the saved script, when the latest run only replayed it.
    origin: Optional[RunTriesItem] = None


class AutomationScriptItem(BaseModel):
    test_case_id: uuid.UUID
    framework: str
    code: str
    status: str
    attempts: int
    last_output: Optional[str] = None
    has_trace: bool = False
    runs: list[AutomationRunItem] = []  # newest first, capped
