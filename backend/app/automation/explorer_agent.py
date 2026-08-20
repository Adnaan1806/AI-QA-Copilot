import asyncio
import json
import sys
import threading

from playwright.sync_api import sync_playwright

from app.automation.browser_config import is_headless
from app.automation.dom_serializer import serialize_page
from app.llm.client import LLMClient

MAX_TURNS_PER_STEP = 6
MAX_TOTAL_TURNS = 25
ACTION_TIMEOUT_MS = 5000

# uvicorn forces WindowsSelectorEventLoopPolicy on Windows (needed for its own
# sockets), but that policy's event loop can't spawn subprocesses -- and
# Playwright's sync API spawns its driver as one via asyncio.new_event_loop().
# Called from a FastAPI request thread that inherits uvicorn's policy, this
# blows up with "NotImplementedError" the moment the browser tries to launch.
# Forcing the Proactor policy (which does support subprocesses) for the
# duration of this blocking call, then restoring whatever was set, fixes it.
_policy_lock = threading.Lock()

EXPLORE_SYSTEM_PROMPT = """You are driving a real web browser step by step to execute one manual QA \
test case. On each turn you are shown the current page URL/title, a numbered list of visible \
interactive elements on the page, the test-case step you are currently trying to accomplish, and a \
short history of actions already taken for this step.

Pick exactly ONE next action toward completing the CURRENT step. You must choose an element by its \
index from the numbered list shown -- never invent a selector or refer to an element that isn't listed.

Respond with a JSON object matching exactly this shape:

{
  "action": "click | fill | check | select_option | press_key | step_complete | dead_end",
  "element_index": 0,
  "value": "text to type / option to select / key name -- null for click, check, step_complete, dead_end",
  "reasoning": "one short sentence"
}

Rules:
- Use "step_complete" (element_index and value can be null) once the page state shows the current step \
has already been accomplished (e.g. navigation happened, expected content appeared).
- Use "dead_end" (element_index and value can be null) only if none of the visible elements can \
plausibly accomplish this step, and explain why in "reasoning".
- "fill" clears and types "value" into the chosen element.
- "press_key" sends a single key (e.g. "Enter") to the chosen element.
- Do not include markdown, commentary, or text outside the JSON object.
"""


class ExplorerAgent:
    def __init__(self, llm_client: LLMClient):
        self._llm_client = llm_client

    def explore(self, test_case: dict, base_url: str) -> dict:
        if sys.platform == "win32":
            with _policy_lock:
                previous_policy = asyncio.get_event_loop_policy()
                asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
                try:
                    return self._explore(test_case, base_url)
                finally:
                    asyncio.set_event_loop_policy(previous_policy)
        return self._explore(test_case, base_url)

    def _explore(self, test_case: dict, base_url: str) -> dict:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=is_headless())
            try:
                context = browser.new_context(base_url=base_url)
                page = context.new_page()
                page.set_default_timeout(ACTION_TIMEOUT_MS)
                try:
                    return self._run(page, test_case, base_url)
                finally:
                    context.close()
            finally:
                browser.close()

    def _run(self, page, test_case: dict, base_url: str) -> dict:
        page.goto("/")
        actions: list[dict] = []
        dead_ends: list[dict] = []
        total_turns = 0

        for step_text in test_case.get("steps", []):
            if total_turns >= MAX_TOTAL_TURNS:
                dead_ends.append({"step_text": step_text, "reason": "total turn budget exhausted"})
                continue

            history: list[str] = []
            resolved = False
            for _turn in range(MAX_TURNS_PER_STEP):
                if total_turns >= MAX_TOTAL_TURNS:
                    dead_ends.append({"step_text": step_text, "reason": "total turn budget exhausted"})
                    resolved = True
                    break
                total_turns += 1

                snapshot, elements = serialize_page(page)
                decision = self._decide(test_case, step_text, snapshot, history)
                action = decision.get("action")

                if action == "step_complete":
                    resolved = True
                    break
                if action == "dead_end":
                    dead_ends.append(
                        {"step_text": step_text, "reason": decision.get("reasoning", "no matching element")}
                    )
                    resolved = True
                    break

                index = decision.get("element_index")
                if not isinstance(index, int) or not (0 <= index < len(elements)):
                    history.append(f"Invalid element_index {index!r} -- ignored")
                    continue

                element = elements[index]
                value = decision.get("value")
                try:
                    self._act(element["locator"], action, value)
                except Exception as exc:
                    history.append(f"Action {action} on [{index}] failed: {exc}")
                    continue

                actions.append(
                    {
                        "step_text": step_text,
                        "action": action,
                        "locator_strategy": element["strategy"],
                        "locator_value": element["value"],
                        "value": value,
                        "resulting_url": page.url,
                    }
                )
                history.append(f"{action} on {element['description']} -> ok")

            if not resolved:
                dead_ends.append({"step_text": step_text, "reason": "max turns per step exceeded"})

        return {
            "test_case_id": test_case.get("id", ""),
            "base_url": base_url,
            "actions": actions,
            "dead_ends": dead_ends,
            "final_url": page.url,
        }

    def _decide(self, test_case: dict, step_text: str, snapshot: str, history: list[str]) -> dict:
        user_prompt = json.dumps(
            {
                "test_case_title": test_case.get("title", ""),
                "current_step": step_text,
                "expected_result": test_case.get("expected_result", ""),
                "page_snapshot": snapshot,
                "actions_taken_this_step": history,
            },
            indent=2,
        )
        try:
            return self._llm_client.generate_json(
                system_prompt=EXPLORE_SYSTEM_PROMPT,
                user_prompt=user_prompt,
            )
        except Exception:
            return {"action": "dead_end", "reasoning": "LLM call failed"}

    @staticmethod
    def _act(locator, action: str, value):
        if action == "click":
            locator.click()
        elif action == "fill":
            locator.fill(value or "")
        elif action == "check":
            locator.check()
        elif action == "select_option":
            locator.select_option(value or "")
        elif action == "press_key":
            locator.press(value or "Enter")
        else:
            raise ValueError(f"Unknown action: {action}")
