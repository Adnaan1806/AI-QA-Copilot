from langchain_core.documents import Document

from app.services.document_service import extract_text_from_pdf


def load_text(text: str, source_name: str) -> list[Document]:
    return [Document(page_content=text, metadata={"source": source_name})]


def load_pdf(file_bytes: bytes, source_name: str) -> list[Document]:
    text = extract_text_from_pdf(file_bytes)
    return [Document(page_content=text, metadata={"source": source_name})]
