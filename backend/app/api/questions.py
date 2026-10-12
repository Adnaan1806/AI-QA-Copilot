import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_owned_project, get_owned_requirement
from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.database.models import User
from app.schemas.questions import AnswerRequest, DismissRequest, OpenQuestionItem
from app.services.question_service import answer, dismiss, open_questions

router = APIRouter(prefix="/projects/{project_id}/open-questions", tags=["open questions"])


def _requirement_of(project_id: uuid.UUID, requirement_id: uuid.UUID, user: User, db: Session):
    requirement = get_owned_requirement(requirement_id, user, db)
    if requirement.suite.project_id != project_id:
        raise HTTPException(404, "Requirement not found")
    return requirement


@router.get("", response_model=list[OpenQuestionItem])
def list_open_questions(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Every requirement's questions nobody has answered or dismissed yet."""
    project = get_owned_project(project_id, current_user, db)
    return open_questions(db, project)


@router.post("/answer", status_code=204)
def answer_question(
    project_id: uuid.UUID,
    payload: AnswerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The answer is saved as a business rule, so drafting uses it from now on."""
    project = get_owned_project(project_id, current_user, db)
    requirement = _requirement_of(project.id, payload.requirement_id, current_user, db)
    if not payload.answer.strip():
        raise HTTPException(400, "Write the answer")
    if answer(db, project, requirement, payload.question, payload.answer.strip()) is None:
        raise HTTPException(404, "That question isn't one of this requirement's")
    db.commit()


@router.post("/dismiss", status_code=204)
def dismiss_question(
    project_id: uuid.UUID,
    payload: DismissRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    requirement = _requirement_of(project.id, payload.requirement_id, current_user, db)
    if not dismiss(requirement, payload.question):
        raise HTTPException(404, "That question isn't one of this requirement's")
    db.commit()
