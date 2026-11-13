"""The knowledge base: document chunks and facts, searched by meaning.

Text is embedded on this machine by a small model (all-MiniLM-L6-v2, through
Chroma's built-in ONNX runtime), so search needs no API key, works offline,
and the text never leaves the machine. The model (~80 MB) downloads on first use.
"""

import os
import threading

from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
PERSIST_DIRECTORY = os.path.join(_BACKEND_DIR, "chroma_db")
# Embeddings from different models can't share a collection, so the name
# changes with the model.
COLLECTION_NAME = "knowledge_minilm"


class LocalEmbeddings(Embeddings):
    def __init__(self):
        self._embed = DefaultEmbeddingFunction()
        # The first call downloads the model; two at once would both fetch it.
        self._lock = threading.Lock()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        with self._lock:
            vectors = self._embed(texts)
        return [[float(x) for x in v] for v in vectors]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]


def relevance(distance: float) -> float:
    """Cosine distance (0 = same meaning, 2 = opposite) as a 0..1 relevance score."""
    return 1 - distance / 2


_vector_store = None
# Requests run on several threads; two creating the client at once crash Chroma's setup.
_create_lock = threading.Lock()


def get_vector_store() -> Chroma:
    global _vector_store
    if _vector_store is None:
        with _create_lock:
            if _vector_store is None:
                _vector_store = Chroma(
                    collection_name=COLLECTION_NAME,
                    embedding_function=LocalEmbeddings(),
                    persist_directory=PERSIST_DIRECTORY,
                    collection_metadata={"hnsw:space": "cosine"},
                    relevance_score_fn=relevance,
                )
    return _vector_store
