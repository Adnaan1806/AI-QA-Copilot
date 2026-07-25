from datetime import datetime

from pydantic import BaseModel


class ReportResponse(BaseModel):
    summary: str
    coverage_analysis: list[str]
    quality_risks: list[str]
    release_recommendation: str
    created_at: datetime
