"""Knowledge is stored and searched per project."""

import uuid
from types import SimpleNamespace

from langchain_core.documents import Document

from app.rag import retriever
from app.services import knowledge_service


class FakeStore:
    def __init__(self):
        self.chunks = {}  # id -> Document
        self.searches = []

    def add_documents(self, documents, ids):
        self.chunks.update(zip(ids, documents))

    def delete(self, ids):
        for chunk_id in ids:
            self.chunks.pop(chunk_id)

    def similarity_search_with_relevance_scores(self, query, k, filter):
        self.searches.append(filter)
        return [
            (doc, 0.9)
            for doc in self.chunks.values()
            if all(doc.metadata.get(key) == value for key, value in filter.items())
        ][:k]


class FakeSession:
    def __init__(self):
        self.added, self.deleted = [], []

    def add(self, obj):
        self.added.append(obj)

    def flush(self):
        for obj in self.added:
            obj.id = obj.id or uuid.uuid4()

    def delete(self, obj):
        self.deleted.append(obj)


def setup(monkeypatch):
    store = FakeStore()
    monkeypatch.setattr(knowledge_service, "get_vector_store", lambda: store)
    monkeypatch.setattr(retriever, "get_vector_store", lambda: store)
    return store


def project():
    return SimpleNamespace(id=uuid.uuid4())


def long_doc(name):
    return [Document(page_content=("Business rule. " * 200), metadata={"source": name})]


def test_chunks_are_tagged_with_project_and_document(monkeypatch):
    store = setup(monkeypatch)
    p = project()
    document = knowledge_service.add_document(FakeSession(), p, "Rules", long_doc("Rules"))

    assert document.chunk_count == len(store.chunks) > 1
    assert sorted(store.chunks) == sorted(f"{document.id}-{n}" for n in range(document.chunk_count))
    for chunk in store.chunks.values():
        assert chunk.metadata == {
            "source": "Rules", "project_id": str(p.id), "document_id": str(document.id),
        }


def test_retrieval_only_searches_the_project(monkeypatch):
    store = setup(monkeypatch)
    mine, other = project(), project()
    knowledge_service.add_document(FakeSession(), mine, "Mine", long_doc("Mine"))
    knowledge_service.add_document(FakeSession(), other, "Theirs", long_doc("Theirs"))

    results = retriever.retrieve("rule", mine.id, k=50)
    assert results and {r["source"] for r in results} == {"Mine"}
    assert store.searches == [{"project_id": str(mine.id)}]


def test_deleting_a_document_removes_its_chunks(monkeypatch):
    store = setup(monkeypatch)
    p = project()
    keep = knowledge_service.add_document(FakeSession(), p, "Keep", long_doc("Keep"))
    drop = knowledge_service.add_document(FakeSession(), p, "Drop", long_doc("Drop"))

    session = FakeSession()
    knowledge_service.delete_document(session, drop)
    assert session.deleted == [drop]
    assert {c.metadata["document_id"] for c in store.chunks.values()} == {str(keep.id)}
