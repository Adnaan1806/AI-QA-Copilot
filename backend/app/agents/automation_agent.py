import json
from typing import Any

from app.llm.client import LLMClient

SYSTEM_PROMPT = """You are a Senior SDET (Software Development Engineer in Test) writing \
Playwright Test automation scripts (JavaScript, using @playwright/test) for approved manual \
test cases.

You will be given a list of approved test cases, each with an "id", "title", "type", "steps", \
and "expected_result". For each one, write a single Playwright test that follows the steps and \
asserts the expected result. Use realistic but generic selectors (role/text/label based) since \
you do not have access to the actual application markup -- add a short comment where a real \
selector would need to be filled in.

Respond with a JSON object matching exactly this shape:

{
  "scripts": [
    {
      "test_case_id": "the exact id value from the input test case",
      "code": "the full Playwright test file contents as a single string, including imports"
    }
  ]
}

Rules:
- Produce exactly one script per input test case, using its exact "id" as "test_case_id".
- Each script must be runnable on its own (import test/expect from '@playwright/test').
- Do not include markdown code fences, commentary, or text outside the JSON object.
"""


class AutomationAgent:
    def __init__(self, llm_client: LLMClient):
        self._llm_client = llm_client

    def generate(self, test_cases: list[dict[str, Any]]) -> dict:
        user_prompt = json.dumps({"test_cases": test_cases}, indent=2)
        return self._llm_client.generate_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )
