from typing import Optional

from app.automation import progress
from app.automation.codegen_agent import CodegenAgent
from app.automation.executor import execute_script
from app.automation.explorer_agent import ExplorerAgent

MAX_ATTEMPTS = 3


def automate_test_case(
    test_case: dict,
    base_url: str,
    explorer: ExplorerAgent,
    codegen: CodegenAgent,
    requirement_id: Optional[str] = None,
    test_case_index: int = 0,
    test_case_total: int = 0,
    saved_code: Optional[str] = None,
) -> dict:
    """Automate one approved test case.

    With `saved_code` (the script that passed last time) the script is replayed
    first, which takes seconds and no LLM calls. Only if it fails does the case
    go through exploration, generation and healing again.
    """
    def report(stage: str, **extra):
        if requirement_id:
            progress.set_progress(
                requirement_id,
                test_case.get("id", ""),
                stage=stage,
                test_case_index=test_case_index,
                test_case_total=test_case_total,
                test_case_title=test_case.get("title", ""),
                **extra,
            )

    # A failed replay counts as a try, so "Tries" stays the number of script runs.
    replays = 0
    if saved_code:
        replays = 1
        report("running_tests", attempt=1)
        result = execute_script(saved_code, test_case_id=test_case.get("id"))
        if result["passed"]:
            report("passed", attempt=1)
            return _outcome(test_case, saved_code, result, attempts=1)

    report("exploring")
    trace = explorer.explore(test_case, base_url)

    report("generating_script")
    code = codegen.generate(trace, test_case)

    result = {"passed": False, "output": "", "trace_path": None}
    attempt = 0
    for attempt in range(1, MAX_ATTEMPTS + 1):
        report("running_tests", attempt=replays + attempt)
        result = execute_script(code, test_case_id=test_case.get("id"))
        if result["passed"]:
            break
        if attempt < MAX_ATTEMPTS:
            report("healing", attempt=replays + attempt)
            code = codegen.heal(code, result, trace, test_case, attempt)

    report("passed" if result["passed"] else "needs_review", attempt=replays + attempt)
    return _outcome(test_case, code, result, attempts=replays + attempt)


def _outcome(test_case: dict, code: str, result: dict, attempts: int) -> dict:
    return {
        "test_case_id": test_case.get("id", ""),
        "code": code,
        "status": "passed" if result["passed"] else "needs_review",
        "attempts": attempts,
        "last_output": None if result["passed"] else result["output"],
        "trace_path": result.get("trace_path"),
    }
