"""Analysis progress: which agent is working, readable only by the user who asked."""

from app.automation import progress
from app.orchestration import graph


def test_progress_is_kept_per_key_and_user():
    progress.set_analysis_progress("k1", "alice", "analyst")
    assert progress.get_analysis_progress("k1", "alice") == {"stage": "analyst"}
    assert progress.get_analysis_progress("k1", "bob") is None
    assert progress.get_analysis_progress("other", "alice") is None
    progress.clear_analysis_progress("k1")
    assert progress.get_analysis_progress("k1", "alice") is None


def test_without_a_key_nothing_is_recorded():
    progress.set_analysis_progress(None, "alice", "analyst")
    progress.clear_analysis_progress(None)  # no error


def test_the_analyst_hands_over_to_the_drafter_with_what_it_found(monkeypatch):
    seen = []
    monkeypatch.setattr(
        graph._requirement_agent,
        "analyze",
        lambda text, tools=None, on_step=None: seen.append(progress.get_analysis_progress("k2", "alice"))
        or {"requirements": ["a", "b", "c"], "missing_info": ["q1"], "app_differences": ["d1"]},
    )
    state = {"requirement_text": "Guest checkout", "progress_key": "k2", "user_id": "alice"}

    graph._requirement_node(state)

    assert seen == [{"stage": "analyst"}]
    assert progress.get_analysis_progress("k2", "alice") == {
        "stage": "drafter", "points": 3, "questions": 2, "differences": 1
    }
    progress.clear_analysis_progress("k2")


def test_each_analyst_step_shows_in_the_progress(monkeypatch):
    seen = []

    def analyze(text, tools=None, on_step=None):
        on_step("is opening /inventory.html in the app")
        seen.append(progress.get_analysis_progress("k3", "alice"))
        return {"requirements": [], "missing_info": [], "app_differences": []}

    monkeypatch.setattr(graph._requirement_agent, "analyze", analyze)
    graph._requirement_node({"requirement_text": "Sorting", "progress_key": "k3", "user_id": "alice"})
    assert seen == [{"stage": "analyst", "step": "is opening /inventory.html in the app"}]
    progress.clear_analysis_progress("k3")
