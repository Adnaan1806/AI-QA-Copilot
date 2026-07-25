from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.rag.loaders import load_pdf, load_text
from app.rag.retriever import retrieve
from app.rag.splitter import chunk_documents
from app.rag.vector_store import get_vector_store
from app.schemas.knowledge import SearchRequest, SearchResponse, SearchResult, UploadResponse

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.post("/upload", response_model=UploadResponse)
def upload_knowledge(
    text: Optional[str] = Form(None),
    source_name: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
):
    if file is not None:
        if file.content_type != "application/pdf":
            raise HTTPException(400, "Only PDF file uploads are supported")
        name = source_name or file.filename
        docs = load_pdf(file.file.read(), name)
    elif text is not None:
        if not source_name:
            raise HTTPException(400, "source_name is required")
        name = source_name
        docs = load_text(text, name)
    else:
        raise HTTPException(400, "Provide either 'text' or a PDF 'file'")

    if not docs[0].page_content.strip():
        raise HTTPException(400, "Document content is empty")

    chunks = chunk_documents(docs)
    store = get_vector_store()
    store.add_documents(chunks)

    return UploadResponse(chunks_stored=len(chunks), source=name)


@router.post("/search", response_model=SearchResponse)
def search_knowledge(payload: SearchRequest):
    results = retrieve(payload.query, payload.k)
    return SearchResponse(results=[SearchResult(**r) for r in results])
