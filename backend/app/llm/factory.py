import os

from app.llm.claude_cli_client import ClaudeCliClient
from app.llm.client import LLMClient
from app.llm.gemini_client import GeminiClient

_PROVIDERS = {
    "gemini": GeminiClient,
    "claude": ClaudeCliClient,
}


def get_llm_client() -> LLMClient:
    """Build the LLM client selected by the LLM_PROVIDER env var (default: gemini)."""
    provider = os.environ.get("LLM_PROVIDER", "gemini").lower()
    try:
        client_cls = _PROVIDERS[provider]
    except KeyError:
        raise ValueError(
            f"Unknown LLM_PROVIDER '{provider}'. Expected one of {sorted(_PROVIDERS)}"
        )
    return client_cls()
