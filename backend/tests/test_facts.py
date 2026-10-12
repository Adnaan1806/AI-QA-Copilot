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

            def all(self):
                return [f for f in session.facts if all(getattr(f, k) == v for k, v in self.kw.items())]

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


def test_layout_controls_are_split_from_pages():
    search = {"role": "button", "name": "Search"}
    home = {"text": "Home", "href": "/"}
    pages = [
        {"url": f"https://app.test/{n}", "pattern": f"/{n}", "depth": 1,
         "buttons": [search, {"role": "tab", "name": "npm"}, {"role": "tab", "name": "npm"}],
         "links": [home, {"text": f"Page {n}", "href": f"/{n}"}]}
        for n in range(4)
    ]
    shared_buttons, shared_links = app_map_service.shared_controls(pages)
    assert shared_buttons == {("button", "Search"), ("tab", "npm")}
    assert shared_links == {("Home", "/")}

    pages[0]["buttons"].append({"role": "button", "name": "Buy"})
    content = app_map_service._stored_content(pages[0], shared_buttons, shared_links)
    assert content["buttons"] == [{"role": "button", "name": "Buy"}]  # layout gone, repeats once
    assert [link["text"] for link in content["links"]] == ["Page 0"]

    layout = app_map_service._layout_content(pages, shared_buttons, shared_links)
    assert [b["name"] for b in layout["buttons"]] == ["Search", "npm"]
    assert "On every page" in app_map_service.layout_text(layout)


def test_small_crawls_have_no_layout():
    page = {"buttons": [{"role": "button", "name": "Log in"}], "links": []}
    assert app_map_service.shared_controls([page, page]) == (set(), set())


class FakeCollection:
    """The vector store's metadata, for set_fact_status."""

    def __init__(self, store):
        self.store = store

    def get(self, ids, include):
        found = [i for i in ids if i in self.store.docs]
        return {"ids": found, "metadatas": [self.store.docs[i].metadata for i in found]}

    def update(self, ids, metadatas):
        for i, metadata in zip(ids, metadatas):
            self.store.docs[i].metadata = metadata


def test_the_team_states_rules_and_terms(monkeypatch):
    from app.services import team_knowledge_service as team

    store, db, project = setup(monkeypatch)
    rule = team.add_rule(db, project, "Orders over $100 ship free")
    term = team.add_term(db, project, "MFE", "Member Firm Engagement report")

    assert (rule.kind, rule.status, rule.source) == ("rule", "stated", "reviewer")
    assert store.docs[f"fact-{rule.id}"].page_content == "Business rule: Orders over $100 ship free"
    assert store.docs[f"fact-{term.id}"].page_content == "Term: MFE -- Member Firm Engagement report"
    # Adding a term again updates it rather than duplicating it.
    again = team.add_term(db, project, "mfe", "Member Firm Engagement")
    assert again.id == term.id and again.content["meaning"] == "Member Firm Engagement"


def test_renaming_a_term_replaces_it(monkeypatch):
    from app.services import team_knowledge_service as team

    store, db, project = setup(monkeypatch)
    old = team.add_term(db, project, "NV", "Non-voting")
    new = team.edit_team_fact(db, project, old, term="NVMF", meaning="Non-voting member firm")

    assert [f.key for f in db.facts] == ["nvmf"]
    assert f"fact-{old.id}" not in store.docs and new.title == "NVMF"


def test_confirming_a_page_reaches_the_vector_store(monkeypatch):
    from app.services import team_knowledge_service as team

    store, db, project = setup(monkeypatch)
    store._collection = FakeCollection(store)
    page = record(db, project, {"headings": ["Checkout"]})

    team.confirm_fact(page)

    assert page.status == "confirmed"
    assert store.docs[f"fact-{page.id}"].metadata["fact_status"] == "confirmed"
