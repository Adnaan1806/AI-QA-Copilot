import time
from threading import Lock
from typing import Optional

_lock = Lock()
_progress: dict = {}


def set_progress(requirement_id: str, **fields) -> None:
    with _lock:
        entry = _progress.setdefault(requirement_id, {})
        entry.update(fields)
        entry["updated_at"] = time.monotonic()


def get_progress(requirement_id: str) -> Optional[dict]:
    with _lock:
        entry = _progress.get(requirement_id)
        return dict(entry) if entry else None


def clear_progress(requirement_id: str) -> None:
    with _lock:
        _progress.pop(requirement_id, None)
