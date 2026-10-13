"""The Analyst: reads a requirement before any test case is written.

With tools (AnalystTools) it works in turns, like Scout and Mender: each turn
the model names one tool -- the app map, the live app, the project's documents
or team knowledge -- the code runs it and shows the result, until the model
finishes with its analysis. What it checks can turn up places where the
requirement and the app (or what the team stated) disagree; those come back as
"app_differences", which become open questions. They never change the
requirement or what a case expects: only a person settles who is right.

Without tools (no project context) it is one LLM call, as before.
"""

import json
import logging
import time
from typing import Callable, Optional

from app.agents.analyst_tools import AnalystTools, ToolError
from app.llm.client import LLMClient

logger = logging.getLogger(__name__)

MAX_TURNS = 8
TIME_BUDGET_SECONDS = 180
LLM_ATTEMPTS = 2
RESULT_CHARS = 1500
LATEST_RESULT_CHARS = 5000

ANALYSIS_SHAPE = """{
  "name": "a short, descriptive title for this requirement (3-8 words, e.g. 'Password Reset via Email OTP')",
  "requirements": ["clear, atomic functional requirements extracted from the input"],
  "risks": ["potential quality, security, or business risks this requirement introduces"],
  "missing_info": ["information needed to fully specify or test this requirement, but not stated"],
  "testing_considerations": ["high-level areas or conditions QA should pay attention to when testing this feature"]
}"""

SYSTEM_PROMPT = f"""You are an experienced Business Analyst and QA Lead reviewing a \
software requirement before development and testing begin.

Given a user story, requirement document, or acceptance criteria, analyze it and \
respond with a JSON object matching exactly this shape:

{ANALYSIS_SHAPE}

Rules:
- "name" is mandatory and must never be empty -- summarize the feature/user story concisely.
- Each list item must be a short, standalone sentence.
- Do not invent requirements that contradict the input.
- If a category has nothing to report, return an empty list for it, not a placeholder.
- Do not include markdown, commentary, or text outside the JSON object.
"""

AGENT_SYSTEM_PROMPT = f"""You are the Analyst, an experienced Business Analyst and QA Lead reviewing a \
software requirement before any test case is written. You can check the requirement against what the \
project knows and against the live app. You work in turns: each turn you call ONE tool and see its result \
next turn, until you finish.

Tools (args in brackets):
- search_app_map {{"query": "..."}}: pages and flows the project has already seen in its app (from its \
crawler and from tests that passed), each marked observed or proven.
- open_page {{"path": "/some/page"}}: opens a page of the live app (read-only: nothing is clicked or typed) \
and shows its title, a numbered list of its interactive elements -- dropdowns list their options -- and \
its visible text. Only pages of the project's app; a path relative to the app URL is fine.
- search_documents {{"query": "..."}}: the project's uploaded documents (specs, guides, past stories).
- search_team_knowledge {{"query": "..."}}: rules and terms the team stated, including answers to \
earlier questions.
- finish {{"analysis": {{...}}}}: your final analysis (shape below). Ends the review.

What to check:
- Concrete claims about the app in the requirement -- a page, a control, a label, a dropdown option, a \
message, where a link leads. Look them up in the app map first; open the page when the map doesn't settle \
it or the claim is about something the map wouldn't show (like a dropdown's options).
- Rules or terms the requirement relies on (limits, formats, who may do what): search team knowledge and \
documents.
- You can only read pages, not act on them. A page reached only by acting (submitting a form, adding to a \
cart) can't be checked unless the app map knows it: then say nothing about it rather than guess.
- Stop checking once the claims that matter are settled. A requirement with nothing concrete to check can \
be finished straight away.

The final analysis:
{ANALYSIS_SHAPE[:-2]},
  "app_differences": ["where the requirement and the app or the team's knowledge disagree"]
}}

- "app_differences": only real contradictions you saw: name the criterion, what it says, and what the app \
(or the team) shows, and where -- e.g. "AC 3 says the sort dropdown offers 'Newest first', but on \
/inventory.html it only offers Name (A to Z), Name (Z to A), Price (low to high), Price (high to low)." \
Something you couldn't see is not a difference. Never rewrite the requirement to match the app: whether \
the app or the requirement is wrong is for the product owner to decide.
- "missing_info": what the requirement leaves unstated and you couldn't find in the team's knowledge or \
documents. Don't repeat app_differences here.
- "name" is mandatory. Each list item is a short, standalone sentence. Do not invent requirements. Empty \
lists, not placeholders.

Each turn, respond with a JSON object matching exactly this shape:

{{
  "thought": "one or two sentences: what you know so far and what this call will settle",
  "tool": "search_app_map | open_page | search_documents | search_team_knowledge | finish",
  "args": {{}}
}}

Do not include markdown, commentary, or text outside the JSON object.
"""

TOOLS = ("search_app_map", "open_page", "search_documents", "search_team_knowledge", "finish")
LIST_FIELDS = ("requirements", "risks", "missing_info", "testing_considerations", "app_differences")


def _trim(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + f"\n... ({len(text) - limit} more characters)"


class RequirementAgent:
    def __init__(self, llm_client: LLMClient, clock: Callable[[], float] = time.monotonic):
        self._llm_client = llm_client
        self._clock = clock

    def analyze(
        self,
        requirement_text: str,
        tools: Optional[AnalystTools] = None,
        on_step: Optional[Callable[[str], None]] = None,
    ) -> dict:
        """The analysis, plus "app_differences" and "analyst_turns" (every tool
        call with what it returned). `on_step` hears what the Analyst is doing,
        e.g. "is opening /inventory.html", for live progress."""
        if tools is None:
            return {**self._single_call(requirement_text), "app_differences": [], "analyst_turns": []}

        turns: list[dict] = []
        started = self._clock()
        while True:
            seconds_left = int(TIME_BUDGET_SECONDS - (self._clock() - started))
            must_finish = len(turns) >= MAX_TURNS or seconds_left <= 0
            decision = self._decide(requirement_text, tools, turns, seconds_left, must_finish)
            tool, args = decision.get("tool"), decision.get("args")
            args = args if isinstance(args, dict) else {}

            if tool == "finish":
                analysis = args.get("analysis") if isinstance(args.get("analysis"), dict) else decision.get("analysis")
                if isinstance(analysis, dict) and str(analysis.get("name") or "").strip():
                    return {**_clean(analysis), "analyst_turns": turns}
                if not must_finish:
                    turns.append(_turn(decision, tool, args, "finish needs an analysis with a name", 0))
                    continue
            if must_finish:
                # Out of budget and still no usable analysis: analyse without tools.
                logger.warning("Analyst ran out of budget without finishing; analysing without tools")
                return {**self._single_call(requirement_text), "app_differences": [], "analyst_turns": turns}

            if on_step:
                on_step(_step_text(tool, args))
            turn_started = self._clock()
            result = self._use(tools, tool, args)
            turns.append(_turn(decision, tool, args, result, round(self._clock() - turn_started, 1)))

    def _use(self, tools: AnalystTools, tool, args: dict) -> str:
        try:
            if tool == "search_app_map":
                return tools.search_app_map(args.get("query"))
            if tool == "open_page":
                return tools.open_page(args.get("path"))
            if tool == "search_documents":
                return tools.search_documents(args.get("query"))
            if tool == "search_team_knowledge":
                return tools.search_team_knowledge(args.get("query"))
        except ToolError as exc:
            return str(exc)
        except Exception as exc:
            # A page that won't load costs the turn, not the analysis.
            logger.warning("Analyst tool %s failed: %r", tool, exc)
            return f"{tool} failed: {type(exc).__name__}: {str(exc).splitlines()[0][:300] if str(exc) else ''}"
        return f"Unknown tool {tool!r}. Use one of: {', '.join(TOOLS)}."

    def _decide(self, requirement_text, tools: AnalystTools, turns, seconds_left, must_finish) -> dict:
        history = [
            {
                "tool": t["tool"],
                "args": t["args"],
                "result": _trim(t["result"], LATEST_RESULT_CHARS if i == len(turns) - 1 else RESULT_CHARS),
            }
            for i, t in enumerate(turns)
        ]
        prompt = {
            "requirement": requirement_text,
            "setup": tools.describe(),
            "budget": {"turns_left": max(MAX_TURNS - len(turns), 0), "seconds_left": max(seconds_left, 0)},
            "turns_so_far": history,
        }
        if not tools.can_browse:
            prompt["note"] = "The project has no app URL: open_page is unavailable."
        if must_finish:
            prompt["note"] = "Your budget is used up: call finish now with the best analysis you have."
        error = None
        for _ in range(LLM_ATTEMPTS):
            try:
                decision = self._llm_client.generate_json(
                    system_prompt=AGENT_SYSTEM_PROMPT, user_prompt=json.dumps(prompt, indent=2)
                )
            except Exception as exc:
                error = exc
                logger.warning("Analyst LLM call failed: %r", exc)
                continue
            if isinstance(decision, dict):
                return decision
            error = ValueError(f"expected a JSON object, got {type(decision).__name__}")
        raise error

    def _single_call(self, requirement_text: str) -> dict:
        return self._llm_client.generate_json(system_prompt=SYSTEM_PROMPT, user_prompt=requirement_text)


def _clean(analysis: dict) -> dict:
    cleaned = {"name": str(analysis.get("name") or "").strip()}
    for field in LIST_FIELDS:
        items = analysis.get(field)
        cleaned[field] = [str(i).strip() for i in items if str(i).strip()] if isinstance(items, list) else []
    return cleaned


def _turn(decision: dict, tool, args: dict, result: str, seconds: float) -> dict:
    return {
        "thought": str(decision.get("thought") or "").strip(),
        "tool": tool if isinstance(tool, str) else repr(tool),
        "args": args,
        "result": result,
        "seconds": seconds,
    }


def _step_text(tool, args: dict) -> str:
    if tool == "open_page":
        return f"is opening {args.get('path') or 'a page'} in the app"
    if tool == "search_app_map":
        return f"is looking up \"{args.get('query') or ''}\" in the app map"
    if tool == "search_documents":
        return f"is searching your documents for \"{args.get('query') or ''}\""
    if tool == "search_team_knowledge":
        return f"is checking your team's rules for \"{args.get('query') or ''}\""
    return "is reading the requirement"


def turn_for_saving(turn: dict) -> dict:
    """A turn as stored with the analysis: its result trimmed."""
    return {**turn, "result": _trim(str(turn.get("result", "")), RESULT_CHARS)}
