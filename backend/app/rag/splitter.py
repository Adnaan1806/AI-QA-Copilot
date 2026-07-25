from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)


def chunk_documents(docs: list[Document]) -> list[Document]:
    return _splitter.split_documents(docs)
