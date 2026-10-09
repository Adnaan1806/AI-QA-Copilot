"""The UI numbers steps itself, so numbers the LLM or a reviewer typed are stripped."""

from app.schemas import test_case as schemas
from app.schemas.test_case import clean_steps


def test_leading_numbers_are_stripped():
    steps = ["1. Navigate to /docs", "2) Click Search", "Step 3: Type locator", "10 - Press Enter"]
    assert clean_steps(steps) == ["Navigate to /docs", "Click Search", "Type locator", "Press Enter"]


def test_numbers_that_belong_to_the_step_are_kept():
    steps = ["1.5 seconds pass", "404 page shows", "Wait 2 seconds"]
    assert clean_steps(steps) == steps


def test_blank_steps_are_dropped():
    assert clean_steps(["", "  ", "3. ", "Click"]) == ["Click"]


def test_requests_clean_steps():
    assert schemas.TestCaseCreateRequest(title="t", steps=["1. Click"]).steps == ["Click"]
    assert schemas.TestCaseUpdateRequest(steps=["2. Click"]).steps == ["Click"]
    assert schemas.TestCaseUpdateRequest().steps is None  # untouched steps stay untouched


def test_export_numbers_steps_once():
    from io import BytesIO
    from types import SimpleNamespace

    from openpyxl import load_workbook

    from app.services.export_service import build_test_cases_workbook

    case = SimpleNamespace(
        title="t", test_type="functional", steps=["1. Open", "Click"], expected_result="e", priority="high"
    )
    sheet = load_workbook(BytesIO(build_test_cases_workbook([case]))).active
    assert sheet.cell(row=2, column=3).value == "1. Open\n2. Click"
