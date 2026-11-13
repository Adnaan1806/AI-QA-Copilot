import json
import re
import subprocess
import threading
from typing import Optional

from app import config
from app.llm.client import LLMClient

CLAUDE_BIN = config.CLAUDE_CLI_PATH
REQUEST_TIMEOUT_S = 120

# The JSON contract lives in the system prompt only (a permissive --json-schema
# made the CLI wrap answers under invented keys). The model still sometimes
# fences its answer in ```json, so that is stripped before parsing.
# Token usage of each call, per calling thread, for scripts/benchmark.py.
_usage = threading.local()


def take_usage() -> list[dict]:
    """Usage of every call this thread made since the last take_usage()."""
    calls = getattr(_usage, "calls", [])
    _usage.calls = []
    return calls


_FENCE_RE = re.compile(r"^```[a-zA-Z]*\n(.*)\n```$", re.DOTALL)


class ClaudeCliClient(LLMClient):
    """Shells out to the locally-authenticated `claude` CLI in print mode.

    Billed to this machine's Claude Code subscription instead of an API key,
    so the `claude` CLI must be installed and logged in here.
    """

    def generate_json(self, system_prompt: str, user_prompt: str, timeout_s: Optional[int] = None) -> dict:
        timeout_s = timeout_s or REQUEST_TIMEOUT_S
        try:
            result = subprocess.run(
                [
                    CLAUDE_BIN,
                    "-p", user_prompt,
                    "--system-prompt", system_prompt,
                    "--tools", "",
                    "--output-format", "json",
                    "--no-session-persistence",
                    "--strict-mcp-config",
                ],
                capture_output=True,
                text=True,
                # The CLI writes UTF-8; without this Windows decodes it as cp1252,
                # garbling dashes and quotes and crashing on some accented letters.
                encoding="utf-8",
                timeout=timeout_s,
            )
        except subprocess.TimeoutExpired:
            # The exception's own message embeds the whole prompt.
            raise TimeoutError(f"the claude CLI didn't answer within {timeout_s}s") from None
        if result.returncode != 0:
            raise RuntimeError(f"claude CLI exited {result.returncode}: {result.stderr.strip()}")

        envelope = json.loads(result.stdout)
        usage = envelope.get("usage") or {}
        _usage.calls = getattr(_usage, "calls", []) + [
            {
                # Cached prompt tokens are still input the model read.
                "input_tokens": sum(
                    usage.get(key) or 0
                    for key in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")
                ),
                "output_tokens": usage.get("output_tokens") or 0,
                "cost_usd": envelope.get("total_cost_usd") or 0,
            }
        ]
        if envelope.get("is_error"):
            raise RuntimeError(f"claude CLI returned an error: {envelope.get('result')}")

        text = envelope["result"].strip()
        fence = _FENCE_RE.match(text)
        if fence:
            text = fence.group(1).strip()
        return json.loads(text)
