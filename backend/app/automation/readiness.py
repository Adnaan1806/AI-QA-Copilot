"""Waits until an app has finished drawing its page, before the Explorer reads it.

Most pages are ready once the number of interactive elements stops changing.
A Power Apps canvas app is not: its frame shows a loading screen, then sits
almost empty for a minute or more ("Getting data"), then draws every control
at once -- about two minutes in all. It counts as ready once its named
controls (data-control-name) exist and have stopped changing for a few seconds.
"""

import time
from urllib.parse import urlparse

from app.automation.dom_serializer import INTERACTIVE_SELECTOR

POLL_MS = 500
# A normal page whose element count holds this long is ready.
QUIET_MS = 1000
# A canvas app draws in bursts; its controls must hold still longer.
CANVAS_QUIET_MS = 3000
# Power Apps took 55-125s to load in testing.
APP_READY_TIMEOUT_MS = 240000
POWER_APPS_HOSTS = ("powerapps.com", "powerplatform.com")

_COUNT = """selector => [document.querySelectorAll(selector).length,
                          document.querySelectorAll('[data-control-name]').length]"""


def is_canvas_app(page) -> bool:
    return any((urlparse(f.url).hostname or "").endswith(POWER_APPS_HOSTS) for f in page.frames)


def _counts(page) -> tuple[int, int]:
    interactive = controls = 0
    for frame in page.frames:
        try:
            a, b = frame.evaluate(_COUNT, INTERACTIVE_SELECTOR)
        except Exception:
            continue  # navigating, or not loaded yet
        interactive, controls = interactive + a, controls + b
    return interactive, controls


def wait_until_ready(page, timeout_ms: int = APP_READY_TIMEOUT_MS) -> int:
    """Wait until the page has stopped drawing; returns how long that took (ms).
    Gives up quietly at `timeout_ms` -- the Explorer then works with what's there."""
    started = time.monotonic()
    last, quiet = None, 0
    while (elapsed := int((time.monotonic() - started) * 1000)) < timeout_ms:
        canvas = is_canvas_app(page)
        interactive, controls = _counts(page)
        current = (interactive, controls)
        quiet = quiet + POLL_MS if current == last else 0
        last = current
        if canvas:
            if controls > 0 and quiet >= CANVAS_QUIET_MS:
                return elapsed
        elif quiet >= QUIET_MS:
            return elapsed
        page.wait_for_timeout(POLL_MS)
    return timeout_ms
