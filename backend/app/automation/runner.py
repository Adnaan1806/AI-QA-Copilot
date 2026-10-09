import logging
from typing import Optional

from app.automation import progress
from app.automation.codegen_agent import CodegenAgent
from app.automation.executor import execute_script
from app.automation.explorer_agent import ExplorerAgent

logger = logging.getLogger(__name__)

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

    # Every script run, in order, so reviewers can see what healing changed.
    # len(tries) is the "Tries" count; a failed replay counts as one.
    tries: list[dict] = []

    def run(code: str, kind: str, reason: str = "") -> dict:
        report("running_tests", attempt=len(tries) + 1)
        result = execute_script(code, test_case_id=test_case.get("id"))
        tries.append(_try(kind, code, result, reason))
        return result

    if saved_code:
        result = run(saved_code, "replayed")
        if result["passed"]:
            report("passed", attempt=1)
            return _outcome(test_case, saved_code, result, tries, trace=None)

    try:
        report("exploring")
        trace = explorer.explore(test_case, base_url)

        report("generating_script")
        code = codegen.generate(trace, test_case)

        result = run(code, "generated")
        for attempt in range(1, MAX_ATTEMPTS):
            if result["passed"]:
                break
            report("healing", attempt=len(tries))
            healed = codegen.heal(code, result, trace, test_case, attempt)
            if not healed["fixable"]:
                # The page doesn't meet the expected result; healing further would
                # only weaken the test. Leave the failure for a person to review.
                reason = healed["reason"] or "the page does not meet the expected result"
                tries[-1]["stop_reason"] = reason
                result = {**result, "output": f"Healing stopped: {reason}\n\n{result['output']}"}
                break
            code = healed["code"]
            result = run(code, "healed", healed["reason"])
    except Exception as exc:
        # An LLM call that times out or a browser that crashes stops this case
        # only; the other cases in the run still finish and get saved.
        logger.exception("Automation stopped for test case %r", test_case.get("title"))
        report("needs_review", attempt=len(tries))
        return _stopped(test_case, exc, tries, saved_code)

    report("passed" if result["passed"] else "needs_review", attempt=len(tries))
    return _outcome(test_case, code, result, tries, trace)


# Enough of a failing run's output to see the error without storing whole logs.
TRY_OUTPUT_LINES = 60


def _try(kind: str, code: str, result: dict, reason: str) -> dict:
    output = "" if result["passed"] else "\n".join(result["output"].splitlines()[-TRY_OUTPUT_LINES:])
    return {"kind": kind, "passed": result["passed"], "code": code, "output": output, "reason": reason}


def _stopped(test_case: dict, exc: Exception, tries: list[dict], saved_code: Optional[str]) -> dict:
    # Keep the script that ran last, so a reviewer sees what was being tried.
    code = tries[-1]["code"] if tries else saved_code or ""
    detail = str(exc).splitlines()[0][:300] if str(exc) else ""
    message = f"Automation stopped: {type(exc).__name__}: {detail}"
    if tries and not tries[-1]["passed"]:
        message += "\n\nLast run before it stopped:\n" + tries[-1]["output"]
    return {
        "test_case_id": test_case.get("id", ""),
        "code": code,
        "status": "needs_review",
        "attempts": len(tries),
        "last_output": message,
        "trace_path": None,
        "tries": tries,
    }


def _outcome(test_case: dict, code: str, result: dict, tries: list[dict], trace: Optional[dict]) -> dict:
    return {
        "test_case_id": test_case.get("id", ""),
        "code": code,
        "status": "passed" if result["passed"] else "needs_review",
        "attempts": len(tries),
        "last_output": None if result["passed"] else result["output"],
        "trace_path": result.get("trace_path"),
        "tries": tries,
        # What the Explorer did, kept so a pass can teach the project how the
        # flow works; None when the saved script was only replayed.
        "trace": trace,
    }
