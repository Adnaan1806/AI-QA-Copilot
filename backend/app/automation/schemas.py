from typing import Optional, TypedDict


class GroundedAction(TypedDict):
    step_text: str
    action: str
    locator_strategy: str
    locator_value: str
    value: Optional[str]
    resulting_url: str


class GroundedTrace(TypedDict):
    test_case_id: str
    base_url: str
    actions: list[GroundedAction]
    dead_ends: list[dict]
    final_url: str


class ExecutionResult(TypedDict):
    passed: bool
    output: str
