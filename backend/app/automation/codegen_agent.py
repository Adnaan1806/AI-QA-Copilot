import json

from app.llm.client import LLMClient

GENERATE_SYSTEM_PROMPT = """You are a Senior SDET writing a pytest-playwright test (Python, using the \
`page` fixture provided by pytest-playwright) for one approved manual test case.

You will be given the test case (title, steps, expected_result) and a "grounded trace" -- a list of \
actions that were actually performed and verified against the real running application. Each action's \
"locator" is Playwright Python code that was checked on the live page to match exactly the element acted \
on. Use it verbatim, e.g. page.get_by_role("button", name="Continue", exact=True).click(); do not \
invent, guess, shorten, or substitute different selectors. If "locator_fragile" is true the locator \
relies on the element's position: keep it, with a comment saying so.

Older traces have no "locator", only locator_strategy and locator_value, which map to Playwright calls:
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
- Navigate to the trace's start_url first (page.goto(start_url)) -- where the exploration began.
- If the trace's "first_wait_timeout_ms" is set, the app is slow to load: open it with \
page.goto(start_url, wait_until="domcontentloaded", timeout=60000), then wait for the first grounded \
action's locator with <locator>.wait_for(timeout=<first_wait_timeout_ms>) before acting.
- If the trace's "starts_logged_in_as" names an account, the test setup has already logged the browser in \
as it (through the `page` fixture's storage state). Do not write login steps and never put credentials in \
the script; start from the page the case is about.
- Canvas apps (Power Apps) change screens without changing the URL. The trace's "start_screen" and each \
action's "resulting_screen" give the screen shown ({"name", "locator"}). After an action that moves to a \
different screen, assert it with expect(<resulting_screen.locator>).to_be_visible(timeout=60000), using \
the locator verbatim -- canvas screens can take well over the default 5s to switch. When the \
expected_result is about which screen is shown, this is the assertion to make.
- Slow apps (the trace's "first_wait_timeout_ms" is set) keep talking to their servers in the background \
and never reach "networkidle": never use page.wait_for_load_state("networkidle") in them; give expect() \
assertions timeout=60000 instead.
- After replaying the grounded actions, add an assertion checking the test case's expected_result (e.g. \
expect(page).to_have_url(...), expect(locator).to_be_visible(), or similar) using \
`from playwright.sync_api import expect`.
- Before asserting an empty or negative outcome ("no results", an element is hidden or absent, a count \
of 0), wait for the page to settle first: page.wait_for_load_state("networkidle") followed by \
page.wait_for_timeout(1000) (in a slow app, only the wait_for_timeout). Pages often show an empty state for a moment while data loads, so \
asserting straight away can pass for the wrong reason.
- If the trace has dead_ends (steps that couldn't be grounded), still write the best possible script from \
the actions that ARE present, and add a short comment noting which step(s) had no grounded action. Still \
assert the expected_result as written: never assert its opposite, and never turn the missing element into \
the thing being checked (e.g. asserting an option is absent because it couldn't be selected).
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
