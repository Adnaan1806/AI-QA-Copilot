"""Mender: repairs a failing test script by looking before it edits.

The old healer rewrote the whole script blind, from the error text and Scout's
old trace. Mender works in turns instead, like Scout: each turn the model
names one tool, the code runs it and shows the result, until the test passes,
Mender stops with a verdict, or a budget runs out.

What code enforces, not the prompt: the budgets (turns, script runs, time),
and that an edit never removes or loosens a check (script_edits.check_edit).
Every turn is kept so a reviewer can follow the diagnosis.
"""

import json
import logging
import time
from typing import Callable, Optional

from app.automation import page_probe
from app.automation.page_probe import ProbeError
from app.automation.script_edits import EditError, apply_edits, check_edit, numbered
from app.llm.client import LLMClient

logger = logging.getLogger(__name__)

MAX_TURNS = 10
TIME_BUDGET_SECONDS = 240
LLM_ATTEMPTS = 2
# How much of a tool's result the model sees again in later turns, and what is saved.
RESULT_CHARS = 1500
# The latest result is shown in full (up to this), since the next move depends on it.
LATEST_RESULT_CHARS = 6000
OUTPUT_TAIL_LINES = 50

VERDICTS = ("app_defect", "unclear_requirement", "environment")
TOOLS = ("look_at_page", "find_element", "reexplore_step", "edit_script", "run_test", "stop")

MENDER_SYSTEM_PROMPT = """You are Mender, a Senior SDET repairing a failing pytest-playwright test (Python, \
`page` fixture) for one approved manual test case. You work in turns: each turn you call ONE tool, and \
you are shown its result next turn. Look at the real page before you change anything.

Each turn you are shown the test case, the current script with line numbers, the output of the last run, \
the grounded trace the script was generated from (locators Scout verified on the live app), your remaining \
budget, and the turns so far with their results.

Tools (args in brackets):
- look_at_page {"line": n}: runs the script up to (not including) line n and shows the page there: URL, \
title, a numbered list of interactive elements (the numbers are only for reading -- never use them in \
code) and the page's visible text. Omit line to see the page after the whole test. If the script fails \
before line n you get that error instead.
- find_element {"text": "...", "line": n}: on the page just before line n, finds elements whose name or \
visible text contains `text`, and returns Playwright locators checked live to match exactly one element. \
Use these locators verbatim; never invent selectors.
- reexplore_step {"step": k}: Scout redoes the test case up to step k (1-based) in a fresh browser and \
returns the actions and verified locators it used for step k, or why it couldn't do it. Slow; use it when \
the app's flow seems to have changed.
- edit_script {"edits": [{"from": n, "to": m, "new": "replacement lines"}]}: replaces lines n..m \
(inclusive) of the current script. "to": n-1 inserts before line n; "new": "" deletes. Line numbers are \
those shown in the current script; edits in one call must not overlap. Keep the indentation right.
- run_test {}: runs the current script. Uses one of your runs.
- stop {"verdict": "app_defect | unclear_requirement | environment", "reason": "one sentence"}: ends \
the repair, leaving the failure for a person to review.

You may change how the script reaches and finds things: locators, waits, navigation, typos. You may not \
change what it checks. An edit that removes an expect()/assert, changes its matcher or expected value, \
negates it, or puts it under a try/if/loop is refused. If the test can only pass by checking less than \
the expected_result says, it is doing its job by failing: stop.

When to stop:
- app_defect: the script reaches the right place, but the app doesn't show what expected_result \
describes (you have looked at the page and the outcome is genuinely different).
- unclear_requirement: the steps or expected_result don't match how the app works (a step names \
something that doesn't exist, or the expected outcome is ambiguous), so no correct script can be written.
- environment: the app is down, too slow, or the failure is unrelated to the test (network, login lost).

Working rules:
- Diagnose from the run output first; then look at the page at the failing line before editing.
- Runs are scarce. A run only reports the first failure, so before running, check the locators on the \
failing line and the lines after it that act on the same page against what you saw, and fix every \
mismatch in one edit_script call.
- Don't run an unchanged script again to see if a failure repeats; look at the page instead.
- An assertion on an empty or negative outcome (no results, hidden, a count of 0) must come after the \
page settles: page.wait_for_load_state("networkidle") then page.wait_for_timeout(1000) (in a slow app, \
only the wait_for_timeout, and give expect() timeout=60000).
- Run the test after editing; a passing run ends the repair.

Respond with a JSON object matching exactly this shape:

{
  "diagnosis": "one or two sentences: what you think is wrong, given what you have seen so far",
  "tool": "look_at_page | find_element | reexplore_step | edit_script | run_test | stop",
  "args": {},
  "why": "one short sentence: what this tool call will tell you or fix"
}

Do not include markdown, commentary, or text outside the JSON object.
"""


class MenderError(RuntimeError):
    """Mender couldn't work (its LLM calls kept failing); the runner falls back to the old healer."""


def _trim(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + f"\n... ({len(text) - limit} more characters)"


def _tail(output: str) -> str:
    return "\n".join((output or "").splitlines()[-OUTPUT_TAIL_LINES:])


class MenderAgent:
    def __init__(self, llm_client: LLMClient, explorer, probe=page_probe, clock: Callable[[], float] = time.monotonic):
        self._llm_client = llm_client
        self._explorer = explorer
        self._probe = probe
        self._clock = clock

    def mend(
        self,
        code: str,
        result: dict,
        trace: dict,
        test_case: dict,
        run_script: Callable[[str, str, list], dict],
        runs_left: int,
        base_url: str = "",
        start: Optional[dict] = None,
    ) -> dict:
        """Repairs `code`, which just failed with `result`.

        `run_script(code, reason, turns)` runs a script and records it as a try,
        with the turns that led to it. Returns {"outcome": passed | stopped |
        gave_up, "code", "result"} for the last script run, plus "verdict" and
        "reason" when Mender stopped, "budget" when it gave up, and "turns": the
        turns after the last run (they belong with the try that ended it).
        """
        state = _State(code=code, ran_code=code, result=result, runs_left=runs_left)
        started = self._clock()
        storage_state = start["storage_state"] if start else None

        def finish(outcome: str, **extra) -> dict:
            return {
                "outcome": outcome,
                "code": state.ran_code,
                "result": state.result,
                "turns": state.pending,
                **extra,
            }

        while True:
            seconds_left = int(TIME_BUDGET_SECONDS - (self._clock() - started))
            if len(state.turns) >= MAX_TURNS:
                return finish("gave_up", budget=f"used all {MAX_TURNS} turns")
            if seconds_left <= 0:
                return finish("gave_up", budget=f"used its {TIME_BUDGET_SECONDS // 60} minutes")

            decision = self._decide(test_case, trace, state, seconds_left)
            tool, args = decision.get("tool"), decision.get("args")
            args = args if isinstance(args, dict) else {}
            turn = {
                "diagnosis": str(decision.get("diagnosis") or "").strip(),
                "tool": tool if isinstance(tool, str) else repr(tool),
                "args": args,
                "why": str(decision.get("why") or "").strip(),
            }
            turn_started = self._clock()

            if tool == "stop":
                verdict, reason = args.get("verdict"), str(args.get("reason") or "").strip()
                if verdict in VERDICTS and reason:
                    turn["result"] = f"Stopped: {verdict}"
                    turn["seconds"] = 0
                    state.record(turn)
                    return finish("stopped", verdict=verdict, reason=reason)
                turn["result"] = f"stop needs a verdict ({', '.join(VERDICTS)}) and a reason"
            elif tool == "run_test":
                if state.runs_left <= 0:
                    turn["result"] = "No runs left."
                else:
                    turn["seconds"] = 0
                    state.record(turn)
                    reason = next((t["why"] for t in reversed(state.pending) if t["tool"] == "edit_script"), "")
                    state.result = run_script(state.code, reason or turn["why"], state.take_pending())
                    state.ran_code = state.code
                    state.runs_left -= 1
                    turn["seconds"] = round(self._clock() - turn_started, 1)
                    turn["result"] = "Passed." if state.result["passed"] else "Failed:\n" + _tail(state.result["output"])
                    if state.result["passed"]:
                        return finish("passed")
                    if state.runs_left <= 0:
                        # Further edits could never be checked.
                        return finish("gave_up", budget="used all its script runs")
                    continue
            else:
                turn["result"] = self._use(tool, args, state, trace, test_case, base_url, start, storage_state)
            turn["seconds"] = round(self._clock() - turn_started, 1)
            state.record(turn)

    def _use(self, tool, args, state, trace, test_case, base_url, start, storage_state) -> str:
        try:
            if tool == "look_at_page":
                return _looked(self._probe.look_at_page(state.code, _line(args), storage_state))
            if tool == "find_element":
                return _found(self._probe.find_element(state.code, args.get("text"), _line(args), storage_state))
            if tool == "reexplore_step":
                return self._reexplore(args.get("step"), test_case, base_url, start)
            if tool == "edit_script":
                edited = apply_edits(state.code, args.get("edits"))
                check_edit(state.code, edited)
                state.code = edited
                return "Applied; the updated script is shown next turn. Run the test to check it."
        except (EditError, ProbeError) as exc:
            return str(exc)
        except Exception as exc:
            # A browser that crashes mid-look costs the turn, not the repair.
            logger.warning("Mender tool %s failed: %r", tool, exc)
            return f"{tool} failed: {type(exc).__name__}: {str(exc)[:300]}"
        return f"Unknown tool {tool!r}. Use one of: {', '.join(TOOLS)}."

    def _reexplore(self, step, test_case, base_url, start) -> str:
        steps = test_case.get("steps", [])
        if not isinstance(step, int) or not (1 <= step <= len(steps)):
            return f"step must be a step number from 1 to {len(steps)}"
        redone = self._explorer.explore({**test_case, "steps": steps[:step]}, base_url, start=start)
        step_text = steps[step - 1]
        lines = [f"Step {step}: {step_text}"]
        for action in redone.get("actions", []):
            if action.get("step_text") == step_text:
                value = f" value={json.dumps(action['value'])}" if action.get("value") else ""
                fragile = " (relies on position)" if action.get("locator_fragile") else ""
                lines.append(f"- {action['action']} {action.get('locator')}{value}{fragile} -> {action.get('resulting_url')}")
        for dead_end in redone.get("dead_ends", []):
            lines.append(f"- couldn't do \"{dead_end.get('step_text')}\": {dead_end.get('reason')}")
        if len(lines) == 1:
            lines.append("- Scout found the step already done; it needed no action.")
        return "\n".join(lines)

    def _decide(self, test_case: dict, trace: dict, state: "_State", seconds_left: int) -> dict:
        history = []
        for i, turn in enumerate(state.turns):
            latest = i == len(state.turns) - 1
            history.append(
                {
                    "tool": turn["tool"],
                    "args": turn["args"],
                    "why": turn["why"],
                    "result": _trim(turn.get("result", ""), LATEST_RESULT_CHARS if latest else RESULT_CHARS),
                }
            )
        user_prompt = json.dumps(
            {
                "test_case": {
                    "title": test_case.get("title", ""),
                    "steps": [f"{i}. {s}" for i, s in enumerate(test_case.get("steps", []), 1)],
                    "expected_result": test_case.get("expected_result", ""),
                },
                "script": numbered(state.code),
                "script_edited_since_last_run": state.code != state.ran_code,
                "last_run_output": _tail(state.result.get("output", "")),
                "grounded_trace": _trace_summary(trace),
                "budget": {
                    "turns_left": MAX_TURNS - len(state.turns),
                    "runs_left": state.runs_left,
                    "seconds_left": seconds_left,
                },
                "turns_so_far": history,
            },
            indent=2,
        )
        error = None
        for _ in range(LLM_ATTEMPTS):
            try:
                decision = self._llm_client.generate_json(system_prompt=MENDER_SYSTEM_PROMPT, user_prompt=user_prompt)
            except Exception as exc:
                error = exc
                logger.warning("Mender LLM call failed: %r", exc)
                continue
            if isinstance(decision, dict):
                return decision
            error = ValueError(f"expected a JSON object, got {type(decision).__name__}")
        raise MenderError(f"Mender's LLM calls failed: {type(error).__name__}: {str(error)[:200]}")


class _State:
    def __init__(self, code: str, ran_code: str, result: dict, runs_left: int):
        self.code = code  # the script as edited so far
        self.ran_code = ran_code  # the script the last run used
        self.result = result
        self.runs_left = runs_left
        self.turns: list[dict] = []  # every turn, for the model's history
        self.pending: list[dict] = []  # turns since the last run, for its try

    def record(self, turn: dict) -> None:
        self.turns.append(turn)
        self.pending.append(turn)

    def take_pending(self) -> list[dict]:
        taken, self.pending = self.pending, []
        return taken


def _line(args: dict) -> Optional[int]:
    line = args.get("line")
    return line if isinstance(line, int) else None


def _looked(seen: dict) -> str:
    if not seen["reached"]:
        return seen["error"]
    return (
        f"Stopped before line {seen['stopped_before_line']}.\n{seen['snapshot']}\n\n"
        f"Visible text:\n{seen.get('text', '')}"
    )


def _found(seen: dict) -> str:
    if not seen["reached"]:
        return seen["error"]
    matches = seen.get("matches") or []
    if not matches:
        return f"Before line {seen['stopped_before_line']}: no element's name or visible text contains that."
    lines = [f"Before line {seen['stopped_before_line']}, each locator matches exactly one element:"]
    for match in matches:
        fragile = " (relies on position)" if match["fragile"] else ""
        lines.append(f"- {match['element']}: {match['locator']}{fragile}")
    return "\n".join(lines)


def _trace_summary(trace: Optional[dict]) -> dict:
    trace = trace or {}
    return {
        "start_url": trace.get("start_url"),
        "starts_logged_in_as": trace.get("starts_logged_in_as"),
        "first_wait_timeout_ms": trace.get("first_wait_timeout_ms"),
        "actions": [
            {k: a.get(k) for k in ("step_text", "action", "locator", "value", "resulting_url")}
            for a in trace.get("actions", [])
        ],
        "dead_ends": trace.get("dead_ends", []),
    }


def turn_for_saving(turn: dict) -> dict:
    """A turn as stored with its try: results trimmed so runs stay small."""
    return {**turn, "result": _trim(str(turn.get("result", "")), RESULT_CHARS)}
