from contextlib import contextmanager

from fastapi import HTTPException


@contextmanager
def llm_errors_as_http():
    """Re-raise LLM-provider failures (e.g. rate limits) as a 502 HTTPException.

    An unhandled exception becomes a bare 500 that bypasses CORS header injection,
    which browsers then misreport as a CORS failure.
    """
    try:
        yield
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            502, f"AI generation failed -- the LLM provider returned an error: {exc}"
        ) from exc
