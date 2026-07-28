import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProjectCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    base_url: Optional[str] = ""


class ProjectUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    base_url: Optional[str] = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    base_url: str
    created_at: datetime
    test_suite_count: int
