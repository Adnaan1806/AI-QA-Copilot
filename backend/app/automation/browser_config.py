import os


def is_headless() -> bool:
    """Whether Playwright browsers should run headless.

    Defaults to headless (true). Set PLAYWRIGHT_HEADLESS=false locally to
    watch the explorer/executor drive a real browser window.
    """
    return os.environ.get("PLAYWRIGHT_HEADLESS", "true").strip().lower() not in (
        "0",
        "false",
        "no",
    )
