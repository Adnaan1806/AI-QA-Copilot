import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class KnowledgeDocumentItem(BaseModel):
    id: uuid.UUID
    name: str
    chunk_count: int
    created_at: datetime


class SearchRequest(BaseModel):
    query: str
    k: int = 5


class SearchResult(BaseModel):
    content: str
    source: Optional[str] = None
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
