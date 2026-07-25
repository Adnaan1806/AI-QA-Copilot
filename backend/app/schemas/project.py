import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProjectCreateRequest(BaseModel):
    name: str
    description: Optional[str] = ""


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    created_at: datetime
    test_suite_count: int
