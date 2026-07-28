from app.automation.codegen_agent import CodegenAgent
from app.automation.executor import execute_script
from app.automation.explorer_agent import ExplorerAgent

MAX_ATTEMPTS = 3


def automate_test_case(
    test_case: dict, base_url: str, explorer: ExplorerAgent, codegen: CodegenAgent
) -> dict:
    trace = explorer.explore(test_case, base_url)
    code = codegen.generate(trace, test_case)

    result = {"passed": False, "output": ""}
    attempt = 0
    for attempt in range(1, MAX_ATTEMPTS + 1):
        result = execute_script(code)
        if result["passed"]:
            break
        if attempt < MAX_ATTEMPTS:
            code = codegen.heal(code, result, trace, test_case, attempt)

    return {
        "test_case_id": test_case.get("id", ""),
        "code": code,
        "status": "passed" if result["passed"] else "needs_review",
        "attempts": attempt,
        "last_output": None if result["passed"] else result["output"],
    }
