"""Open questions: listed until answered or dismissed; an answer becomes a rule."""

import uuid
from types import SimpleNamespace

from app.services import fact_service, question_service

from tests.test_facts import FakeSession, FakeStore

PROJECT = SimpleNamespace(id=uuid.uuid4())


def requirement(open_questions=(), missing_info=(), answers=None):
    analysis = SimpleNamespace(
        open_questions=list(open_questions), missing_info=list(missing_info), question_answers=answers
    )
    return SimpleNamespace(id=uuid.uuid4(), name="Product list sorting", analysis_result=analysis)


NEWEST = "The requirement says the sort dropdown offers 'Newest first'; the Products page doesn't list it."
TIES = "How are ties handled?"


def test_questions_where_the_app_differs_come_first():
    req = requirement(open_questions=[NEWEST], missing_info=[TIES])
    assert question_service.unresolved(req) == [
        {"question": NEWEST, "differs_from_app": True},
        {"question": TIES, "differs_from_app": False},
    ]
    assert question_service.unresolved(SimpleNamespace(analysis_result=None)) == []


def test_an_answer_becomes_a_rule_and_the_question_closes(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(fact_service, "get_vector_store", lambda: store)
    db, req = FakeSession(), requirement(open_questions=[NEWEST], missing_info=[TIES])

    rule = question_service.answer(db, PROJECT, req, TIES, "Products with the same price are listed by name.")

    assert rule.kind == "rule" and rule.status == "stated"
    assert rule.content["question"] == TIES and rule.content["requirement_id"] == str(req.id)
    assert store.docs[f"fact-{rule.id}"].page_content == "Business rule: Products with the same price are listed by name."
    assert req.analysis_result.question_answers[TIES]["status"] == "answered"
    assert [q["question"] for q in question_service.unresolved(req)] == [NEWEST]
    assert question_service.answered(req) == [
        {"question": TIES, "differs_from_app": False, "answer": "Products with the same price are listed by name."}
    ]


def test_answered_questions_leave_out_dismissed_ones_and_tolerate_older_answers():
    req = requirement(
        open_questions=[NEWEST],
        missing_info=[TIES],
        answers={NEWEST: {"status": "dismissed"}, TIES: {"status": "answered", "rule_id": "r1"}},
    )
    assert question_service.answered(req) == [{"question": TIES, "differs_from_app": False, "answer": None}]
    assert question_service.answered(SimpleNamespace(analysis_result=None)) == []


def test_dismissing_hides_a_question():
    req = requirement(open_questions=[NEWEST])
    assert question_service.dismiss(req, NEWEST) is True
    assert question_service.unresolved(req) == []
    assert req.analysis_result.question_answers[NEWEST]["status"] == "dismissed"


def test_only_the_requirements_own_questions_can_be_resolved(monkeypatch):
    monkeypatch.setattr(fact_service, "get_vector_store", lambda: FakeStore())
    req = requirement(open_questions=[NEWEST])
    assert question_service.dismiss(req, "Something nobody asked") is False
    assert question_service.answer(FakeSession(), PROJECT, req, "Something nobody asked", "x") is None
    assert req.analysis_result.question_answers is None


ASKED = [NEWEST, TIES]


def test_a_case_links_to_the_questions_it_names():
    assert question_service.link_questions([TIES], ASKED) == [TIES]
    # Small rewording, case and trailing punctuation still link.
    assert question_service.link_questions(["how are ties handled"], ASKED) == [TIES]
    assert question_service.link_questions(["How are the ties handled?"], ASKED) == [TIES]


def test_unrelated_or_repeated_questions_are_dropped():
    assert question_service.link_questions(["What colour is the button?", "", None], ASKED) == []
    assert question_service.link_questions([TIES, TIES.upper()], ASKED) == [TIES]
    assert question_service.link_questions([TIES], []) == []
    assert question_service.link_questions(None, ASKED) == []
