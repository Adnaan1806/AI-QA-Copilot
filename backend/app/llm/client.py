from abc import ABC, abstractmethod


class LLMClient(ABC):
    """Provider-agnostic interface for LLM calls.

    Swapping providers (Gemini -> Claude/OpenAI) means adding a new
    implementation of this interface, not touching agent code.
    """

    @abstractmethod
    def generate_json(self, system_prompt: str, user_prompt: str) -> dict:
        """Send a prompt and return the model's response parsed as a dict."""
        raise NotImplementedError
