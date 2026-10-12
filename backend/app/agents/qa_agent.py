import json
from typing import Any, Optional

from app.llm.client import LLMClient

# How many extra ideas the agent may hand back as suggestions instead of cases.
MAX_SUGGESTIONS = 5

SYSTEM_PROMPT = """You are a Senior QA Engineer designing the test cases a reviewer will approve before automation begins.

You will be given the original requirement, a prior requirement analysis (functional requirements, risks, missing information, testing considerations), and optionally relevant context from this project's knowledge base (business rules, user guides, past stories). Ground your cases in that context when it is relevant and respect documented business rules.

You may also be given what this project knows about the app itself ("What the app looks like"): pages seen in the app (status observed), the controls on every page, and workflows a passing test has performed (status proven). Use it for the STEPS, never for the EXPECTED RESULTS:
- Write steps with the app's own labels for pages, buttons, links and fields, exactly as they appear there. Reuse a proven workflow's steps to get to the starting point of a case.
- If a step needs a page, button or field the app knowledge doesn't show, write it from the requirement's wording and list it in that case's "assumptions".
- The app knowledge shows what the app does today, not what it should do. Expected results come only from the requirement and the documents.
- If the requirement describes something the app knowledge contradicts -- a field missing from a page that was seen, a different label, a page that doesn't exist -- still write the case (the app may be missing the feature, which the test should catch), and add an "open_questions" entry saying what the requirement says and what the app shows.

Write the smallest set of cases that proves every acceptance criterion:
- Start from the acceptance criteria. If the requirement has none, use the clear, testable statements in it, as listed under the analysis "requirements".
- Each case covers exactly one criterion; name it in "covers", quoted from the requirement.
- Write one case per criterion. Add a second case for a criterion only when the requirement itself names a different outcome for it (an error, a limit, an empty or invalid input).
- A criterion that already describes a negative outcome (e.g. "shows a no-results message") is covered by its own case; do not add another negative case for it.
- The analysis risks and testing considerations are background, not a to-do list. Do not turn them into cases.

Everything else you would want to test -- accessibility, other browsers or screen sizes, performance, security, unusual inputs the requirement doesn't mention -- goes in "suggestions", at most """ + str(MAX_SUGGESTIONS) + """, most valuable first. A reviewer adds the ones worth it. Leave a security idea out entirely unless the feature takes user input that is stored or shown to others, handles login or permissions, or exposes data.

Cases are run by an agent driving one desktop Chromium browser on the live site, with a normal network and JavaScript on. It can open URLs, click, type, press keys and read the page. Do not write cases that need anything else (other browsers, mobile devices, network throttling or offline mode, disabled JavaScript, browser dev tools, server logs, a screen reader); if such a check matters, make it a suggestion and say what it needs.

Respond with a JSON object matching exactly this shape:

{
  "test_cases": [
    {
      "title": "short descriptive scenario name",
      "covers": "the acceptance criterion this case proves, quoted from the requirement",
      "type": "functional" | "negative" | "edge_case" | "security",
      "steps": ["one actionable step per item, in order, without step numbers"],
      "expected_result": "the single expected outcome of the test",
      "priority": "high" | "medium" | "low",
      "starts_logged_out": false,
      "assumptions": ["a page, button or field a step relies on that the app knowledge doesn't show"]
    }
  ],
  "open_questions": ["where the requirement and the app knowledge disagree: what each says"],
  "suggestions": [
    {
      "title": "...", "covers": "...", "type": "...", "steps": ["..."],
      "expected_result": "...", "priority": "...", "starts_logged_out": false,
      "why": "one sentence: what this would catch that the cases don't"
    }
  ]
}

Rules:
- Each test case must be independently executable -- steps must not assume another test ran first.
- Use the requirement's own wording for labels and messages; do not invent UI text it doesn't give.
- priority reflects business/quality risk, not implementation difficulty.
- If the project has test accounts (listed after the requirement), the browser starts logged in, so do not write login steps for a case that is not about logging in. Set "starts_logged_out" to true only for a case that must begin with no one logged in (e.g. what a visitor sees, or that a page requires login). A case whose steps log in starts logged out anyway.
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
        account_names: Optional[list[str]] = None,
        app_knowledge: Optional[list[dict[str, Any]]] = None,
    ) -> dict:
        user_prompt = self._build_user_prompt(
            requirement_text, analysis, context or [], account_names or [], app_knowledge or []
        )
        return self._llm_client.generate_json(
            system_prompt=SYSTEM_PROMPT,
            user_prompt=user_prompt,
        )

    @staticmethod
    def _build_user_prompt(
        requirement_text: str,
        analysis: dict[str, Any],
        context: list[dict[str, Any]],
        account_names: list[str] = (),
        app_knowledge: list[dict[str, Any]] = (),
    ) -> str:
        sections = [
            f"Requirement:\n{requirement_text}",
            f"Requirement Analysis:\n{json.dumps(analysis, indent=2)}",
        ]
        if account_names:
            others = ", ".join(account_names[1:])
            sections.append(
                f"Test accounts: cases start logged in as {account_names[0]}"
                + (f" (other accounts: {others})" if others else "")
            )
        if context:
            knowledge = "\n\n".join(
                f"[source: {item.get('source') or 'unknown'}]\n{item['content']}"
                for item in context
            )
            sections.append(f"Relevant Knowledge Base Context:\n{knowledge}")
        if app_knowledge:
            seen = "\n\n".join(
                f"[{item.get('source') or 'unknown'} -- {item.get('status') or 'observed'}]\n{item['content']}"
                for item in app_knowledge
            )
            sections.append(f"What the app looks like (for steps only, never for expected results):\n{seen}")
        return "\n\n".join(sections)
