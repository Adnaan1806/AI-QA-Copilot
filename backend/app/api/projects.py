import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_owned_project
from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.database.models import Project, User
from app.schemas.project import ProjectCreateRequest, ProjectResponse, ProjectUpdateRequest
from app.services.app_map_service import is_running, start_crawl

router = APIRouter(prefix="/projects", tags=["projects"])


def _to_response(project: Project) -> ProjectResponse:
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        base_url=project.base_url,
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
        user_id=current_user.id,
        name=payload.name,
        description=payload.description or "",
        base_url=payload.base_url or "",
    )
    db.add(project)
    db.commit()
    if project.base_url:
        start_crawl(db, project)  # map the app before any test cases are written
    return _to_response(project)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    return _to_response(project)


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(400, "Project name cannot be empty")
        project.name = name
    if payload.description is not None:
        project.description = payload.description
    url_changed = payload.base_url is not None and payload.base_url.strip() != project.base_url
    if payload.base_url is not None:
        project.base_url = payload.base_url.strip()
    db.commit()
    db.refresh(project)
    # A new app URL means a different app to map.
    if url_changed and project.base_url and not is_running(project.app_crawl):
        start_crawl(db, project)
    return _to_response(project)
