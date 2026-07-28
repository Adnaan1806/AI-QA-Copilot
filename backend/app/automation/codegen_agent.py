import json

from app.llm.client import LLMClient

GENERATE_SYSTEM_PROMPT = """You are a Senior SDET writing a pytest-playwright test (Python, using the \
`page` fixture provided by pytest-playwright) for one approved manual test case.

You will be given the test case (title, steps, expected_result) and a "grounded trace" -- a list of \
actions that were actually performed and verified against the real running application, each with a \
locator_strategy and locator_value that are known to work. You MUST use exactly these locators when \
writing the script; do not invent, guess, or substitute different selectors.

locator_strategy values map to Playwright locator calls as follows:
- "role" -> value is "role|accessible_name" -> page.get_by_role("role", name="accessible_name")
- "placeholder" -> page.get_by_placeholder(value)
- "label" -> page.get_by_label(value)
- "text" -> page.get_by_text(value, exact=False)
- "nth" -> page.locator("button, a, input, textarea, select, [role=button], [role=link], \
[role=checkbox], [role=combobox], [tabindex]").nth(int(value))

Respond with a JSON object matching exactly this shape:

{
  "code": "the full pytest-playwright test file contents as a single string, including imports"
}

Rules:
- The test function must accept the `page` fixture (from pytest-playwright) as its only parameter.
- Navigate to the trace's base_url first (page.goto(base_url)) if the trace doesn't already start there.
- After replaying the grounded actions, add an assertion checking the test case's expected_result (e.g. \
expect(page).to_have_url(...), expect(locator).to_be_visible(), or similar) using \
`from playwright.sync_api import expect`.
- If the trace has dead_ends (steps that couldn't be grounded), still write the best possible script from \
the actions that ARE present, and add a short comment noting which step(s) had no grounded action.
- Do not include markdown code fences, commentary, or text outside the JSON object.
"""

HEAL_SYSTEM_PROMPT = """You are a Senior SDET fixing a failing pytest-playwright test. You will be given \
the current script, the pytest failure output from actually running it, the original grounded trace it \
was generated from (locators that were previously verified against the real page), the test case, and \
which retry attempt this is.

Diagnose the failure and return a corrected, complete replacement script. Prefer reusing a \
locator_strategy/locator_value from the grounded trace over inventing a new one, unless the failure \
output clearly shows that specific locator no longer matches -- in that case, adjust conservatively \
(e.g. loosen an exact-text match, fix a typo, correct an assertion) rather than rewriting unrelated \
parts of the script.

Respond with a JSON object matching exactly this shape:

{
  "code": "the full corrected pytest-playwright test file contents as a single string, including imports"
}

Rules:
- Return the complete file, not a diff.
- Do not include markdown code fences, commentary, or text outside the JSON object.
"""


class CodegenAgent:
    def __init__(self, llm_client: LLMClient):
        self._llm_client = llm_client

    def generate(self, trace: dict, test_case: dict) -> str:
        user_prompt = json.dumps({"test_case": test_case, "grounded_trace": trace}, indent=2)
        result = self._llm_client.generate_json(
            system_prompt=GENERATE_SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )
        return result.get("code", "")

    def heal(self, code: str, execution_result: dict, trace: dict, test_case: dict, attempt: int) -> str:
        output_tail = "\n".join(execution_result.get("output", "").splitlines()[-50:])
        user_prompt = json.dumps(
            {
                "test_case": test_case,
                "grounded_trace": trace,
                "current_code": code,
                "failure_output": output_tail,
                "attempt": attempt,
            },
            indent=2,
        )
        result = self._llm_client.generate_json(
            system_prompt=HEAL_SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )
        return result.get("code", "")
