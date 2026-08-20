import json
import os
import re
import subprocess

from app.llm.client import LLMClient

CLAUDE_BIN = os.environ.get("CLAUDE_CLI_PATH", "claude")
REQUEST_TIMEOUT_S = 120

# `--json-schema '{"type":"object"}'` (too permissive to describe a real
# shape) sometimes made the CLI wrap the answer under an invented key instead
# of returning it as the object itself, so the schema's JSON contract is
# communicated via the system prompt only, same as the Gemini client -- the
# model still occasionally wraps its answer in a ```json fence despite being
# told not to, so that has to be stripped before parsing.
_FENCE_RE = re.compile(r"^```[a-zA-Z]*\n(.*)\n```$", re.DOTALL)


class ClaudeCliClient(LLMClient):
    """Shells out to the locally-authenticated `claude` CLI in print mode.

    Usage rides on this machine's Claude Code subscription (Pro/Max/Team)
    instead of a separate pay-per-token Anthropic API key. Requires the
    `claude` CLI to be installed and already logged into an account here --
    it will not work on a machine without that local OAuth session.
    """

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict:
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
            timeout=REQUEST_TIMEOUT_S,
        )
        if result.returncode != 0:
            raise RuntimeError(f"claude CLI exited {result.returncode}: {result.stderr.strip()}")

        envelope = json.loads(result.stdout)
        if envelope.get("is_error"):
            raise RuntimeError(f"claude CLI returned an error: {envelope.get('result')}")

        text = envelope["result"].strip()
        fence = _FENCE_RE.match(text)
        if fence:
            text = fence.group(1).strip()
        return json.loads(text)
