"""Waits until an app has finished drawing its page, before the Explorer reads it.

A page is ready once the number of interactive elements on it (in every frame)
stops changing.
"""

import time

from app.automation.dom_serializer import INTERACTIVE_SELECTOR

POLL_MS = 500
# A page whose element count holds this long is ready.
QUIET_MS = 1000
# A page still changing after this long is read as it is.
APP_READY_TIMEOUT_MS = 60000

_COUNT = "selector => document.querySelectorAll(selector).length"


def _count(page) -> int:
    total = 0
    for frame in page.frames:
        try:
            total += frame.evaluate(_COUNT, INTERACTIVE_SELECTOR)
        except Exception:
            continue  # navigating, or not loaded yet
    return total


def wait_until_ready(page, timeout_ms: int = APP_READY_TIMEOUT_MS) -> int:
    """Wait until the page has stopped drawing; returns how long that took (ms).
    Gives up quietly at `timeout_ms` -- the Explorer then works with what's there."""
    started = time.monotonic()
    last, quiet = None, 0
    while (elapsed := int((time.monotonic() - started) * 1000)) < timeout_ms:
        current = _count(page)
        quiet = quiet + POLL_MS if current == last else 0
        last = current
        if quiet >= QUIET_MS:
            return elapsed
        page.wait_for_timeout(POLL_MS)
    return timeout_ms
