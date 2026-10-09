import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CrawlSettings(BaseModel):
    max_pages: int = Field(30, ge=1, le=200)
    max_depth: int = Field(3, ge=0, le=10)
    start_paths: list[str] = []
    respect_robots: bool = True


class CrawlSettingsUpdate(BaseModel):
    max_pages: Optional[int] = Field(None, ge=1, le=200)
    max_depth: Optional[int] = Field(None, ge=0, le=10)
    start_paths: Optional[list[str]] = None
    respect_robots: Optional[bool] = None


class AppPageItem(BaseModel):
    id: uuid.UUID
    url: str
    title: str
    depth: int
    headings: list[str]
    buttons: int
    fields: int
    status: str
    last_seen_at: datetime


class SkippedLink(BaseModel):
    url: str
    reason: str


class SiteLayout(BaseModel):
    """Controls on every page (header, navigation, footer)."""

    buttons: list[str]
    link_count: int


class AppMapResponse(BaseModel):
    # None until the first crawl; then "running", "done" or "failed".
    status: Optional[str]
    error: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    settings: CrawlSettings
    pages: list[AppPageItem]
    layout: Optional[SiteLayout]
    skipped_count: int
    # A sample of what the crawl didn't visit, grouped reasons first.
    skipped: list[SkippedLink]


class FactDetail(BaseModel):
    id: uuid.UUID
    kind: str
    key: str
    title: str
    content: dict
    source: str
    status: str
    first_seen_at: datetime
    last_seen_at: datetime
