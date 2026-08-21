import time
from threading import Lock
from typing import Optional

_lock = Lock()
_progress: dict = {}


def set_progress(requirement_id: str, test_case_id: Optional[str] = None, **fields) -> None:
    """Record progress for one requirement's automation run.

    With test_case_id set, updates that test case's own entry -- test cases
    run concurrently, so each needs its own slot rather than one global
    "current" stage. With test_case_id omitted, updates the run-level entry
    (used for the report-compilation stage, which happens once after all
    test cases finish).
    """
    with _lock:
        entry = _progress.setdefault(requirement_id, {"items": {}, "report": None})
        if test_case_id is None:
            entry["report"] = {**fields, "updated_at": time.monotonic()}
        else:
            item = entry["items"].setdefault(test_case_id, {})
            item.update(fields)
            item["updated_at"] = time.monotonic()


def get_progress(requirement_id: str) -> Optional[dict]:
    with _lock:
        entry = _progress.get(requirement_id)
        if not entry:
            return None
        return {
            "items": {tc_id: dict(item) for tc_id, item in entry["items"].items()},
            "report": dict(entry["report"]) if entry["report"] else None,
        }


def clear_progress(requirement_id: str) -> None:
    with _lock:
        _progress.pop(requirement_id, None)
