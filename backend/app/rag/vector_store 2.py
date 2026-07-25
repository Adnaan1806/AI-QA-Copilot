import os

from langchain_chroma import Chroma
from langchain_google_genai import GoogleGenerativeAIEmbeddings

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
PERSIST_DIRECTORY = os.path.join(_BACKEND_DIR, "chroma_db")

_embeddings = GoogleGenerativeAIEmbeddings(model="models/gemini-embedding-001")

_vector_store = None


def get_vector_store() -> Chroma:
    global _vector_store
    if _vector_store is None:
        _vector_store = Chroma(
            collection_name="qa_copilot_knowledge",
            embedding_function=_embeddings,
            persist_directory=PERSIST_DIRECTORY,
        )
    return _vector_store
