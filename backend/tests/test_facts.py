"""Facts the project learns: recorded once, refreshed when seen again, and
their status only rises unless what was seen changed."""

import uuid
from types import SimpleNamespace

from app.services import app_map_service, fact_service


class FakeStore:
    def __init__(self):
        self.docs = {}

    def add_documents(self, documents, ids):
        self.docs.update(zip(ids, documents))

    def delete(self, ids):
        for i in ids:
            self.docs.pop(i)


class FakeSession:
    """Just enough of a Session for record_fact's lookup by kind and key."""

    def __init__(self):
        self.facts = []

    def query(self, model):
        session = self

        class Query:
            def filter_by(self, **kw):
                self.kw = kw
                return self

            def one_or_none(self):
                return next(
                    (f for f in session.facts if all(getattr(f, k) == v for k, v in self.kw.items())), None
                )

        return Query()

    def add(self, fact):
        self.facts.append(fact)

    def flush(self):
        pass

    def delete(self, fact):
        self.facts.remove(fact)


def setup(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(fact_service, "get_vector_store", lambda: store)
    return store, FakeSession(), SimpleNamespace(id=uuid.uuid4())


def record(db, project, content, status="observed", source="crawler"):
    return fact_service.record_fact(
        db, project, kind="page", key="https://app.test/", title="Home",
        content=content, text="App page: Home", source=source, status=status,
    )


def test_seeing_a_fact_again_updates_it(monkeypatch):
    store, db, project = setup(monkeypatch)
    first = record(db, project, {"buttons": ["Search"]})
    again = record(db, project, {"buttons": ["Search"]})
    assert again is first and len(db.facts) == 1 and len(store.docs) == 1
    meta = store.docs[f"fact-{first.id}"].metadata
    assert meta["kind"] == "fact" and meta["fact_kind"] == "page"
    assert meta["project_id"] == str(project.id) and meta["fact_status"] == "observed"


def test_status_only_rises_unless_the_content_changed(monkeypatch):
    _, db, project = setup(monkeypatch)
    fact = record(db, project, {"buttons": ["Search"]}, status="confirmed", source="reviewer")
    record(db, project, {"buttons": ["Search"]}, status="observed")
    assert fact.status == "confirmed" and fact.source == "reviewer"
    record(db, project, {"buttons": ["Search", "Log in"]}, status="observed")
    assert fact.status == "observed" and fact.source == "crawler"


def test_forgetting_removes_fact_and_its_text(monkeypatch):
    store, db, project = setup(monkeypatch)
    fact = record(db, project, {})
    fact_service.forget_facts(db, [fact])
    assert db.facts == [] and store.docs == {}


def test_page_text_names_what_a_test_would_use():
    text = app_map_service.page_text("https://app.test/login", "Log in", {
        "headings": [{"level": 1, "text": "Welcome back"}],
        "buttons": [{"role": "button", "name": "Log in"}],
        "fields": [{"type": "email", "label": "Email", "required": True, "options": []}],
        "messages": ["Wrong password"],
        "links": [{"text": "Forgot password?", "href": "/reset"}],
    })
    assert 'button "Log in"' in text
    assert 'Field: email "Email" (required)' in text
    assert 'Message shown: "Wrong password"' in text
    assert "Forgot password?" in text
