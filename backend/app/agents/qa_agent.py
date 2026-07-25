import json
from typing import Any, Optional

from app.llm.client import LLMClient

SYSTEM_PROMPT = """You are a Senior QA Engineer designing test cases for a software feature \
before automation begins.

You will be given the original requirement, a prior requirement analysis (functional \
requirements, risks, missing information, testing considerations), and optionally relevant \
context retrieved from the company's QA knowledge base (past test cases, bug reports, API \
docs, security rules). Ground your test cases in that context when it is relevant -- reuse \
known edge cases, respect documented business rules, and avoid re-introducing previously \
reported bugs.

Respond with a JSON object matching exactly this shape:

{
  "test_cases": [
    {
      "title": "short descriptive scenario name",
      "type": "functional" | "negative" | "edge_case" | "security",
      "steps": ["numbered, actionable steps to execute the test"],
      "expected_result": "the single expected outcome of the test",
      "priority": "high" | "medium" | "low"
    }
  ]
}

Rules:
- Cover functional, negative, edge case, and security scenarios; do not skip a category \
unless the requirement genuinely has no relevant cases for it.
- Each test case must be independently executable -- steps must not assume another test ran first.
- priority reflects business/quality risk, not implementation difficulty.
- Do not include markdown, commentary, or text outside the JSON object.
"""


class QAAgent:
    def __init__(self, llm_client: LLMClient):
        self._llm_client = llm_client

    def generate(
        self,
        requirement_text: str,
        analysis: dict[str, Any],
        context: Optional[list[dict[str, Any]]] = None,
    ) -> dict:
        user_prompt = self._build_user_prompt(requirement_text, analysis, context or [])
        return self._llm_client.generate_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )

    @staticmethod
    def _build_user_prompt(
        requirement_text: str, analysis: dict[str, Any], context: list[dict[str, Any]]
    ) -> str:
        sections = [
            f"Requirement:\n{requirement_text}",
            f"Requirement Analysis:\n{json.dumps(analysis, indent=2)}",
        ]
        if context:
            knowledge = "\n\n".join(
                f"[source: {item.get('source') or 'unknown'}]\n{item['content']}"
                for item in context
            )
            sections.append(f"Relevant Knowledge Base Context:\n{knowledge}")
        return "\n\n".join(sections)
