from sqlalchemy.orm import Session

from app.database.models import KnowledgeDocument, Project
from app.rag.splitter import chunk_documents
from app.rag.vector_store import get_vector_store


def _chunk_ids(document: KnowledgeDocument) -> list[str]:
    return [f"{document.id}-{n}" for n in range(document.chunk_count)]


def add_document(db: Session, project: Project, name: str, docs) -> KnowledgeDocument:
    """Chunk `docs`, store the chunks tagged with the project, and record the document."""
    chunks = chunk_documents(docs)
    document = KnowledgeDocument(project_id=project.id, name=name, chunk_count=len(chunks))
    db.add(document)
    db.flush()  # assigns document.id for the chunk ids
    for chunk in chunks:
        chunk.metadata.update(
            {"source": name, "project_id": str(project.id), "document_id": str(document.id)}
        )
    get_vector_store().add_documents(chunks, ids=_chunk_ids(document))
    return document


def delete_document(db: Session, document: KnowledgeDocument) -> None:
    if document.chunk_count:
        get_vector_store().delete(ids=_chunk_ids(document))
    db.delete(document)
