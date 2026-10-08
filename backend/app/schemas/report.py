from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ReportResponse(BaseModel):
    summary: str
    coverage_analysis: list[str]
    quality_risks: list[str]
    release_recommendation: str
    verdict: Optional[str] = None  # ready | ready_with_risks | not_ready
    created_at: datetime
