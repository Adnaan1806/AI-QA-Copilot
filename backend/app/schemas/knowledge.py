from typing import Optional

from pydantic import BaseModel


class UploadResponse(BaseModel):
    chunks_stored: int
    source: str


class SearchRequest(BaseModel):
    query: str
    k: int = 5


class SearchResult(BaseModel):
    content: str
    source: Optional[str] = None
    score: float


class SearchResponse(BaseModel):
    results: list[SearchResult]
