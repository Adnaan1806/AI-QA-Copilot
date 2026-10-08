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
  "verdict": "ready" | "ready_with_risks" | "not_ready",
  "release_recommendation": "a short, direct recommendation with reasoning, consistent with verdict"
}

Choosing verdict:
- "not_ready" if any approved test case is not automated, any automation script is "needs_review",
  or a quality risk would block release.
- "ready_with_risks" if everything approved passes but quality_risks names gaps worth tracking.
- "ready" only if every approved test case passes and no material risk remains.

Rules:
- Refer to a test case by its "label" (e.g. TC-3), optionally followed by its title.
- Ground every statement in the provided data -- do not invent test cases or risks not implied by it.
- If very few test cases are approved/automated relative to the requirement's scope, say so plainly in quality_risks.
- The input includes exact "approved_test_case_count", "automated_test_case_count", "passed_test_case_count",
  and "needs_review_test_case_count" numbers. Use those exact figures whenever you state a count -- do not
  count list items yourself, and never state a different number.
- Automation scripts marked "needs_review" failed execution after automated self-healing attempts and were
  NOT verified to pass -- treat these as unverified, not as working coverage, and factor this into
  quality_risks and release_recommendation.
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
        passed = [s for s in automation_scripts if s.get("status", "passed") == "passed"]
        needs_review = [s for s in automation_scripts if s.get("status") == "needs_review"]
        # Database ids leak into the prose if the model sees them; it gets the
        # TC-n labels the UI shows instead.
        labels = {tc["id"]: tc.get("label") or tc["title"] for tc in test_cases}
        user_prompt = json.dumps(
            {
                "requirement": requirement_text,
                "analysis": analysis,
                "approved_test_cases": [
                    {k: v for k, v in tc.items() if k != "id"} for tc in test_cases
                ],
                "approved_test_case_count": len(test_cases),
                "automation_scripts": [
                    {
                        "test_case": labels.get(s["test_case_id"], s["test_case_id"]),
                        "status": s.get("status", "passed"),
                    }
                    for s in automation_scripts
                ],
                "automated_test_case_count": len(automation_scripts),
                "passed_test_case_count": len(passed),
                "needs_review_test_case_count": len(needs_review),
            },
            indent=2,
        )
        return self._llm_client.generate_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )
