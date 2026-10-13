import logging
from typing import Optional

from app.automation import progress
from app.automation.codegen_agent import CodegenAgent
from app.automation.executor import execute_script
from app.automation.explorer_agent import ExplorerAgent
from app.automation.mender_agent import MenderAgent, turn_for_saving

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
    start: Optional[dict] = None,
    mender: Optional[MenderAgent] = None,
    requirement: Optional[str] = None,
) -> dict:
    """Automate one approved test case.

    With `saved_code` (the script that passed last time) the script is replayed
    first, which takes seconds and no LLM calls. Only if it fails does the case
    go through exploration, generation and healing again.

    With `start` ({"account", "storage_state"}) every browser -- the Explorer's
    and each script run's -- starts logged in as that account.

    A failing script is repaired by `mender`'s tool loop, within MAX_ATTEMPTS
    runs counting the generated one; without a mender it is left for review.
    If Mender itself fails, the case stops like any other agent failure.
    `requirement` (its text, acceptance criteria included) lets Mender tell an
    app defect from a case that asks for something the requirement doesn't.

    Status: "passed"; "failed" when Mender saw the app not do what the case
    expects (verdict app_defect); otherwise "needs_review" -- a person decides.
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
        result = execute_script(
            code, test_case_id=test_case.get("id"), storage_state=start["storage_state"] if start else None
        )
        tries.append(_try(kind, code, result, reason))
        return result

    if saved_code:
        result = run(saved_code, "replayed")
        if result["passed"]:
            report("passed", attempt=1)
            return _outcome(test_case, saved_code, result, tries, trace=None)

    try:
        report("exploring")
        trace = explorer.explore(test_case, base_url, start=start)

        report("generating_script")
        code = codegen.generate(trace, test_case)

        result = run(code, "generated")

        def mend(code: str, result: dict) -> tuple[str, dict]:
            def run_for_mender(new_code: str, reason: str, turns: list) -> dict:
                new_result = run(new_code, "healed", reason)
                tries[-1]["turns"] = [turn_for_saving(t) for t in turns]
                return new_result

            report("healing", attempt=len(tries))
            mended = mender.mend(
                code, result, trace, test_case, run_for_mender, MAX_ATTEMPTS - 1, base_url, start,
                requirement=requirement,
            )
            code, result = mended["code"], mended["result"]
            tries[-1].setdefault("turns", []).extend(turn_for_saving(t) for t in mended["turns"])
            if mended["outcome"] == "stopped":
                tries[-1]["stop_reason"] = mended["reason"]
                tries[-1]["verdict"] = mended["verdict"]
                label = mended["verdict"].replace("_", " ")
                result = {**result, "output": f"Mender stopped ({label}): {mended['reason']}\n\n{result['output']}"}
            elif mended["outcome"] == "gave_up":
                tries[-1]["budget"] = mended["budget"]
            return code, result

        if not result["passed"] and mender is not None:
            code, result = mend(code, result)
        if result["passed"] and trace.get("dead_ends"):
            # A pass that skipped steps can't show the case holds -- it has
            # passed by checking the opposite of the expected result before.
            steps = "; ".join(d.get("step_text", "") for d in trace["dead_ends"])
            reason = f"The script passed, but these steps couldn't be done in the app: {steps}"
            tries[-1]["review_reason"] = reason
            result = {**result, "passed": False, "output": f"Not counted as a pass. {reason}\n\n{result['output']}"}
    except Exception as exc:
        # An LLM call that times out or a browser that crashes stops this case
        # only; the other cases in the run still finish and get saved.
        logger.exception("Automation stopped for test case %r", test_case.get("title"))
        report("needs_review", attempt=len(tries))
        return _stopped(test_case, exc, tries, saved_code)

    report(_status(result, tries), attempt=len(tries))
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


def _status(result: dict, tries: list[dict]) -> str:
    if result["passed"]:
        return "passed"
    if tries and tries[-1].get("verdict") == "app_defect":
        return "failed"
    return "needs_review"


def _outcome(test_case: dict, code: str, result: dict, tries: list[dict], trace: Optional[dict]) -> dict:
    return {
        "test_case_id": test_case.get("id", ""),
        "code": code,
        "status": _status(result, tries),
        "attempts": len(tries),
        "last_output": None if result["passed"] else result["output"],
        "trace_path": result.get("trace_path"),
        "tries": tries,
        # What the Explorer did, kept so a pass can teach the project how the
        # flow works; None when the saved script was only replayed.
        "trace": trace,
    }
