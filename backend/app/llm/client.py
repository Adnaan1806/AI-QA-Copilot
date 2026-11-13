from abc import ABC, abstractmethod
from typing import Optional


class LLMClient(ABC):
    """Provider-agnostic interface for LLM calls.

    Adding a provider means a new implementation of this interface, not
    touching agent code.
    """

    @abstractmethod
    def generate_json(self, system_prompt: str, user_prompt: str, timeout_s: Optional[int] = None) -> dict:
        """Send a prompt and return the model's response parsed as a dict.
        `timeout_s` overrides the client's default wait for one long answer."""
        raise NotImplementedError
