import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_owned_project
from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.database.models import KnowledgeDocument, User
from app.rag.loaders import load_pdf, load_text
from app.rag.retriever import retrieve
from app.schemas.knowledge import KnowledgeDocumentItem, SearchRequest, SearchResponse, SearchResult
from app.services.knowledge_service import add_document, delete_document

router = APIRouter(prefix="/projects/{project_id}/knowledge", tags=["knowledge"])


def _item(document: KnowledgeDocument) -> KnowledgeDocumentItem:
    return KnowledgeDocumentItem(
        id=document.id,
        name=document.name,
        chunk_count=document.chunk_count,
        created_at=document.created_at,
    )


@router.get("", response_model=list[KnowledgeDocumentItem])
def list_knowledge(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    return [_item(document) for document in project.knowledge_documents]


@router.post("", response_model=KnowledgeDocumentItem)
def upload_knowledge(
    project_id: uuid.UUID,
    text: Optional[str] = Form(None),
    source_name: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    if file is not None:
        if file.content_type != "application/pdf":
            raise HTTPException(400, "Only PDF file uploads are supported")
        name = (source_name or "").strip() or file.filename
        docs = load_pdf(file.file.read(), name)
    elif text is not None:
        name = (source_name or "").strip()
        if not name:
            raise HTTPException(400, "Give the document a name")
        docs = load_text(text, name)
    else:
        raise HTTPException(400, "Provide either 'text' or a PDF 'file'")

    if not docs[0].page_content.strip():
        raise HTTPException(400, "Document content is empty")

    document = add_document(db, project, name, docs)
    db.commit()
    db.refresh(document)
    return _item(document)


@router.delete("/{document_id}", status_code=204)
def remove_knowledge(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    document = db.get(KnowledgeDocument, document_id)
    if document is None or document.project_id != project.id:
        raise HTTPException(404, "Document not found")
    delete_document(db, document)
    db.commit()


@router.post("/search", response_model=SearchResponse)
def search_knowledge(
    project_id: uuid.UUID,
    payload: SearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Documents and facts (pages, flows, rules, terms) together, best matches first."""
    project = get_owned_project(project_id, current_user, db)
    found = retrieve(payload.query, project.id, payload.k) + retrieve(payload.query, project.id, payload.k, kind="fact")
    found.sort(key=lambda r: r["score"], reverse=True)
    return SearchResponse(results=[SearchResult(**r) for r in found[: payload.k]])
