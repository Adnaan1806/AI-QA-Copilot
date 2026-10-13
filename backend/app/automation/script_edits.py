"""Line edits to a test script, and the guard that keeps them from weakening it.

Mender changes a script a few lines at a time. It may change how the script
reaches and finds things -- a locator, a wait, a navigation step -- but never
what it checks: an edit that removes a check, changes what a check compares
against, or hides one inside a try/if/loop is refused before it is applied.

A check is an expect(...) call or a plain assert. Two checks are the same if
they call the same matcher with the same arguments (a timeout aside); the
subject inside expect(...) may change, since fixing a stale locator inside an
assertion is a legitimate repair.
"""

import ast
from collections import Counter
from dataclasses import dataclass
from typing import Optional

# Statements that can stop a check from running, or swallow its failure.
_GUARDS = (ast.Try, ast.If, ast.For, ast.While, ast.With, ast.IfExp, ast.BoolOp, ast.Lambda)
try:
    _GUARDS = _GUARDS + (ast.TryStar,)
except AttributeError:  # Python < 3.11
    pass


class EditError(ValueError):
    """An edit that can't be applied; the message says why, for the model to read."""


@dataclass(frozen=True)
class Check:
    # What is checked, ignoring the subject of expect(...): the matcher and its
    # arguments, or a plain assert's whole test.
    key: str
    source: str
    guarded: bool


def numbered(code: str) -> str:
    lines = code.split("\n")
    width = len(str(len(lines)))
    return "\n".join(f"{i:>{width}} | {line}" for i, line in enumerate(lines, 1))


def apply_edits(code: str, edits: list) -> str:
    """Each edit is {"from": n, "to": m, "new": text}: lines n..m (1-based,
    inclusive) become `new`'s lines. "to" = n - 1 inserts before line n; an
    empty "new" deletes. Line numbers refer to the script before any of the
    edits, which must not overlap."""
    if not isinstance(edits, list) or not edits:
        raise EditError("edits must be a non-empty list of {from, to, new}")
    lines = code.split("\n")
    spans = []
    for edit in edits:
        if not isinstance(edit, dict):
            raise EditError("each edit must be an object {from, to, new}")
        start, end, new = edit.get("from"), edit.get("to"), edit.get("new", "")
        if not isinstance(start, int) or not isinstance(end, int) or not isinstance(new, str):
            raise EditError("from and to must be line numbers and new a string")
        if not (1 <= start <= len(lines) + 1) or not (start - 1 <= end <= len(lines)):
            raise EditError(f"lines {start}..{end} are outside the script (1..{len(lines)})")
        spans.append((start, end, new))
    spans.sort()
    for (s1, e1, _), (s2, _e2, _) in zip(spans, spans[1:]):
        if s2 <= e1:
            raise EditError(f"edits overlap at line {s2}")
    for start, end, new in reversed(spans):
        lines[start - 1:end] = new.split("\n") if new else []
    return "\n".join(lines)


def _expect_call(node: ast.Call) -> Optional[ast.Call]:
    """The expect(...) call at the root of expect(x).matcher(...), if any."""
    func = node.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Call):
        inner = func.value
        if isinstance(inner.func, ast.Name) and inner.func.id == "expect":
            return inner
    return None


def _check_key(node: ast.Call) -> str:
    args = [ast.unparse(a) for a in node.args]
    kwargs = [f"{k.arg}={ast.unparse(k.value)}" for k in node.keywords if k.arg != "timeout"]
    return f"{node.func.attr}({', '.join(args + kwargs)})"


def checks(code: str) -> list[Check]:
    tree = ast.parse(code)
    found: list[Check] = []

    def visit(node, guarded: bool, in_function: bool):
        if isinstance(node, ast.Assert):
            found.append(Check("assert " + ast.unparse(node.test), ast.unparse(node), guarded))
        elif isinstance(node, ast.Call) and _expect_call(node) is not None:
            found.append(Check(_check_key(node), ast.unparse(node), guarded))
        # A guard counts only inside a function: module-level code is setup. A
        # function defined inside the test may never be called.
        nested = in_function and isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        inner_guarded = guarded or nested or (in_function and isinstance(node, _GUARDS))
        inner_function = in_function or isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        for child in ast.iter_child_nodes(node):
            visit(child, inner_guarded, inner_function)

    visit(tree, False, False)
    return found


def weakened_checks(before: str, after: str) -> list[str]:
    """Why `after` checks less than `before`; empty when it doesn't."""
    try:
        old = checks(before)
    except SyntaxError:
        # Nothing to compare structurally: every check line must survive as is.
        kept = set(after.split("\n"))
        return [
            f"this check would be removed or changed: {line.strip()}"
            for line in before.split("\n")
            if ("expect(" in line or line.strip().startswith("assert ")) and line not in kept
        ]
    new = checks(after)
    problems = []
    available = Counter((c.key, c.guarded) for c in new)
    for check in old:
        if available[(check.key, check.guarded)] > 0:
            available[(check.key, check.guarded)] -= 1
        elif not check.guarded and available[(check.key, True)] > 0:
            available[(check.key, True)] -= 1
            problems.append(f"this check would only run conditionally: {check.source}")
        else:
            problems.append(f"this check would be removed or changed: {check.source}")
    return problems


def check_edit(before: str, after: str) -> None:
    """Raises EditError if `after` doesn't parse or checks less than `before`."""
    try:
        ast.parse(after)
    except SyntaxError as exc:
        raise EditError(f"the edited script doesn't parse: line {exc.lineno}: {exc.msg}") from None
    problems = weakened_checks(before, after)
    if problems:
        raise EditError(
            "Refused: an edit may change how the script reaches and finds things, never what it "
            "checks. " + " ".join(problems)
        )
