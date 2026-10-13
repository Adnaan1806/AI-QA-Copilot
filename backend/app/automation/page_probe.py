"""Lets Mender see the page a failing script reached.

The script is cut just before a line inside its test function and a probe call
is put in its place; the cut script then runs like any other (pytest
subprocess, same logged-in start), and the probe writes what it saw to a file
that comes back with the result. The generated code never runs in the backend
process, and the probe reads the page the same way Scout does: Scout's
numbered element list, and locators checked live to match exactly one element.
"""

import ast
import json
import os
from typing import Optional

from app.automation import executor

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# How long the probe lets the page settle before reading it.
SETTLE_MS = 10000
PAGE_TEXT_CHARS = 2000
MAX_MATCHES = 5
OUTPUT_TAIL_LINES = 30

_IN = "mender_probe_in.json"
_OUT = "mender_probe_out.json"

_PROBE_MODULE = '''import json
import sys

sys.path.insert(0, %(backend)s)

from app.automation.dom_serializer import serialize_page
from app.automation.locators import unique_locator
from app.automation.readiness import wait_until_ready


def probe(page):
    with open(%(inp)s, encoding="utf-8") as f:
        request = json.load(f)
    try:
        wait_until_ready(page, timeout_ms=%(settle)d)
    except Exception:
        pass
    snapshot, elements = serialize_page(page)
    out = {"snapshot": snapshot}
    if request["mode"] == "look":
        try:
            out["text"] = page.locator("body").inner_text(timeout=2000)[:%(chars)d]
        except Exception:
            out["text"] = ""
    else:
        out["matches"] = _find(page, elements, request["text"])
    with open(%(out)s, "w", encoding="utf-8") as f:
        json.dump(out, f)


def _find(page, elements, text):
    wanted = text.strip().lower()
    found, seen = [], set()

    def add(locator, frame, description):
        if len(found) >= %(max)d:
            return
        try:
            located = unique_locator(page, locator, frame)
        except Exception:
            return
        if located["locator"] not in seen:
            seen.add(located["locator"])
            found.append({"element": description, "locator": located["locator"], "fragile": located["fragile"]})

    for element in elements:
        if wanted and wanted in element["description"].split(" ", 1)[1].lower():
            add(element["locator"], element["frame"], element["description"].split(" ", 1)[1])
    try:
        by_text = page.get_by_text(text, exact=False)
        for i in range(min(by_text.count(), 3)):
            shown = by_text.nth(i).inner_text(timeout=2000).strip()[:80]
            add(by_text.nth(i), None, "text " + json.dumps(shown))
    except Exception:
        pass
    return found
''' % {
    "backend": json.dumps(BACKEND_DIR),
    "inp": json.dumps(_IN),
    "out": json.dumps(_OUT),
    "settle": SETTLE_MS,
    "chars": PAGE_TEXT_CHARS,
    "max": MAX_MATCHES,
}


class ProbeError(ValueError):
    """The script can't be probed; the message says why, for the model to read."""


def _test_function(tree: ast.Module, line: Optional[int]):
    """The test taking the page that contains `line`, else the first one."""
    tests = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name.startswith("test")]
    with_page = [n for n in tests if any(a.arg == "page" for a in n.args.args)]
    if not with_page:
        raise ProbeError("the script has no test function taking the page fixture")
    containing = [n for n in with_page if line is not None and n.lineno <= line <= n.end_lineno]
    return (containing or with_page)[0], tests


def cut_script(code: str, line: Optional[int]) -> tuple[str, int]:
    """(probe script, line it stops before). The probe runs in place of the
    statement of the test function containing `line`, so everything before it
    has run; with no line (or one past the function) the whole test runs."""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise ProbeError(f"the script doesn't parse: line {exc.lineno}: {exc.msg}") from None
    function, tests = _test_function(tree, line)
    body = function.body
    cut = function.end_lineno + 1
    if line is not None:
        cut = next((s.lineno for s in body if s.end_lineno >= line), cut)
    lines = code.split("\n")[: cut - 1]
    # Other tests in the file would run too; rename them out of pytest's sight.
    for other in tests:
        if other is not function and other.lineno <= len(lines):
            lines[other.lineno - 1] = lines[other.lineno - 1].replace("def test", "def _probe_skipped_test", 1)
    indent = " " * body[0].col_offset
    lines += [f"{indent}from mender_probe import probe as _mender_probe", f"{indent}_mender_probe(page)"]
    return "\n".join(lines), cut


def look_at_page(code: str, line: Optional[int], storage_state: Optional[dict] = None) -> dict:
    """URL, title, Scout's numbered element list and the visible text of the
    page, as the script leaves it just before `line`."""
    return _probe(code, line, {"mode": "look"}, storage_state)


def find_element(code: str, text: str, line: Optional[int], storage_state: Optional[dict] = None) -> dict:
    """Locators, each checked to match exactly one element, for elements whose
    name or visible text contains `text`, on the page just before `line`."""
    if not isinstance(text, str) or not text.strip():
        raise ProbeError("text must name the element: its visible text, label, placeholder or name")
    return _probe(code, line, {"mode": "find", "text": text}, storage_state)


def _probe(code: str, line: Optional[int], request: dict, storage_state: Optional[dict]) -> dict:
    script, cut = cut_script(code, line)
    result = executor.execute_script(
        script,
        storage_state=storage_state,
        extra_files={"mender_probe.py": _PROBE_MODULE, _IN: json.dumps(request)},
        read_back=_OUT,
    )
    seen = result.get("read_back")
    if seen is None:
        tail = "\n".join(result["output"].splitlines()[-OUTPUT_TAIL_LINES:])
        return {"stopped_before_line": cut, "reached": False, "error": f"The script failed before line {cut}:\n{tail}"}
    return {"stopped_before_line": cut, "reached": True, **json.loads(seen)}
