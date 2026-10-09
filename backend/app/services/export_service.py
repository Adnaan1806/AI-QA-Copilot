import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.database.models import TestCase
from app.schemas.test_case import clean_steps

HEADERS = ["Title", "Type", "Steps", "Expected Result", "Priority"]
COLUMN_WIDTHS = [35, 14, 55, 45, 12]


def build_test_cases_workbook(test_cases: list[TestCase]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Test Cases"

    ws.append(HEADERS)
    header_fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
    for col, width in enumerate(COLUMN_WIDTHS, start=1):
        cell = ws.cell(row=1, column=col)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(vertical="center")
        ws.column_dimensions[get_column_letter(col)].width = width
    ws.freeze_panes = "A2"

    wrap = Alignment(wrap_text=True, vertical="top")
    for tc in test_cases:
        steps_text = "\n".join(f"{i}. {step}" for i, step in enumerate(clean_steps(tc.steps), 1))
        row = [
            tc.title,
            tc.test_type.replace("_", " ").title(),
            steps_text,
            tc.expected_result,
            tc.priority.title(),
        ]
        ws.append(row)
        for col in range(1, len(HEADERS) + 1):
            ws.cell(row=ws.max_row, column=col).alignment = wrap

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
