"""The explorer retries a failed LLM call once and says why when it gives up,
instead of silently turning any error into a dead end."""

from app.automation.explorer_agent import LLM_ATTEMPTS, ExplorerAgent


class FlakyClient:
    def __init__(self, failures):
        self.failures = failures
        self.calls = 0

    def generate_json(self, system_prompt, user_prompt):
        self.calls += 1
        if self.calls <= self.failures:
            raise TimeoutError("claude CLI timed out after 120s")
        return {"action": "click", "element_index": 3}


def decide(client):
    return ExplorerAgent(client)._decide({"title": "t"}, "Click Search", "[3] button Search", [])


def test_one_failure_is_retried():
    client = FlakyClient(failures=1)
    assert decide(client) == {"action": "click", "element_index": 3}
    assert client.calls == 2


def test_repeated_failure_is_a_dead_end_with_the_real_error(caplog):
    client = FlakyClient(failures=LLM_ATTEMPTS)
    decision = decide(client)

    assert client.calls == LLM_ATTEMPTS
    assert decision["action"] == "dead_end"
    assert decision["reasoning"] == "LLM call failed (TimeoutError: claude CLI timed out after 120s)"
    assert "Explorer LLM call failed" in caplog.text
