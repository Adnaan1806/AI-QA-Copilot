"""Records who approved or rejected a test case, when, and why."""

from datetime import datetime, timezone
from typing import Optional

from app.database.models import TestCase, User


def set_review_status(
    test_case: TestCase, status: str, reviewer: User, reject_reason: Optional[str] = None
) -> None:
    test_case.status = status
    if status == "draft":
        test_case.reviewed_by_id = None
        test_case.reviewed_at = None
        test_case.reject_reason = None
        return
    test_case.reviewed_by_id = reviewer.id
    test_case.reviewed_at = datetime.now(timezone.utc)
    reason = (reject_reason or "").strip()
    test_case.reject_reason = (reason or None) if status == "rejected" else None
