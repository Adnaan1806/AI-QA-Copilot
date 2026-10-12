import uuid

from pydantic import BaseModel


class OpenQuestionItem(BaseModel):
    requirement_id: uuid.UUID
    requirement_name: str
    question: str
    # The requirement says something the app map contradicts; otherwise the
    # analysis found the requirement leaves it out.
    differs_from_app: bool


class AnswerRequest(BaseModel):
    requirement_id: uuid.UUID
    question: str
    answer: str


class DismissRequest(BaseModel):
    requirement_id: uuid.UUID
    question: str
