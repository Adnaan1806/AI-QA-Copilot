import json
from typing import Any

from app.llm.client import LLMClient

SYSTEM_PROMPT = """You are a QA Manager producing a release-readiness report for a feature, \
based on its requirement analysis, approved test cases, and generated automation coverage.

Respond with a JSON object matching exactly this shape:

{
  "summary": "a short paragraph summarizing the testing effort for this requirement",
  "coverage_analysis": ["observations about what is and isn't covered by the approved test cases"],
  "quality_risks": ["remaining quality or business risks given current test coverage"],
  "release_recommendation": "a short, direct recommendation: ready to release, release with caveats, or not ready, with reasoning"
}

Rules:
- Ground every statement in the provided data -- do not invent test cases or risks not implied by it.
- If very few test cases are approved/automated relative to the requirement's scope, say so plainly in quality_risks.
- The input includes exact "approved_test_case_count" and "automated_test_case_count" numbers. Use those
  exact figures whenever you state a count -- do not count list items yourself, and never state a different number.
- Do not include markdown, commentary, or text outside the JSON object.
"""


class ReportAgent:
    def __init__(self, llm_client: LLMClient):
        self._llm_client = llm_client

    def generate(
        self,
        requirement_text: str,
        analysis: dict[str, Any],
        test_cases: list[dict[str, Any]],
        automation_scripts: list[dict[str, Any]],
    ) -> dict:
        user_prompt = json.dumps(
            {
                "requirement": requirement_text,
                "analysis": analysis,
                "approved_test_cases": test_cases,
                "approved_test_case_count": len(test_cases),
                "automation_scripts": [
                    {"test_case_id": s["test_case_id"]} for s in automation_scripts
                ],
                "automated_test_case_count": len(automation_scripts),
            },
            indent=2,
        )
        return self._llm_client.generate_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )
