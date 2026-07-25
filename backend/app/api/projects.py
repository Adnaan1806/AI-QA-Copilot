import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.database.models import Project, User
from app.schemas.project import ProjectCreateRequest, ProjectResponse

router = APIRouter(prefix="/projects", tags=["projects"])


def _to_response(project: Project) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        created_at=project.created_at,
        test_suite_count=len(project.test_suites),
    )


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    projects = (
        db.query(Project)
        .filter(Project.user_id == current_user.id)
        .order_by(Project.created_at.desc())
        .all()
    )
    return [_to_response(p) for p in projects]


@router.post("", response_model=ProjectResponse)
def create_project(
    payload: ProjectCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = Project(
        user_id=current_user.id, name=payload.name, description=payload.description or ""
    )
    db.add(project)
    db.commit()
    return _to_response(project)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.user_id == current_user.id)
        .first()
    )
    if project is None:
        raise HTTPException(404, "Project not found")
    return _to_response(project)
