import json
import re
import subprocess

from app import config
from app.llm.client import LLMClient

CLAUDE_BIN = config.CLAUDE_CLI_PATH
REQUEST_TIMEOUT_S = 120

# The JSON contract lives in the system prompt only (a permissive --json-schema
# made the CLI wrap answers under invented keys). The model still sometimes
# fences its answer in ```json, so that is stripped before parsing.
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
