import uuid
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_owned_project
from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.database.models import AppCrawl, KnowledgeFact, Project, User
from app.schemas.app_map import (
    AppMapResponse,
    AppPageItem,
    CrawlSettings,
    CrawlSettingsUpdate,
    FactDetail,
    SkippedLink,
)
from app.services.app_map_service import is_running, start_crawl

router = APIRouter(prefix="/projects/{project_id}", tags=["app map"])

SKIPPED_SAMPLE = 40


def _settings(app_crawl: AppCrawl | None) -> CrawlSettings:
    if app_crawl is None:
        return CrawlSettings()
    return CrawlSettings(
        max_pages=app_crawl.max_pages,
        max_depth=app_crawl.max_depth,
        start_paths=app_crawl.start_paths or [],
        respect_robots=app_crawl.respect_robots,
    )


def _skipped_sample(skipped: dict) -> list[SkippedLink]:
    """A few of each reason, the most common reasons first."""
    by_reason = Counter(skipped.values())
    per_reason = max(1, SKIPPED_SAMPLE // max(1, len(by_reason)))
    sample = []
    for reason, _ in by_reason.most_common():
        urls = [url for url, r in skipped.items() if r == reason][:per_reason]
        sample.extend(SkippedLink(url=url, reason=reason) for url in urls)
    return sample[:SKIPPED_SAMPLE]


def _fact_detail(fact: KnowledgeFact) -> FactDetail:
    return FactDetail(
        id=fact.id, kind=fact.kind, key=fact.key, title=fact.title, content=fact.content,
        source=fact.source, status=fact.status,
        first_seen_at=fact.first_seen_at, last_seen_at=fact.last_seen_at,
    )


def to_app_map(project: Project) -> AppMapResponse:
    app_crawl = project.app_crawl
    pages = sorted(
        (f for f in project.knowledge_facts if f.kind == "page"),
        key=lambda f: (f.content.get("depth", 0), f.key),
    )
    status, error = (app_crawl.status, app_crawl.error) if app_crawl else (None, None)
    if status == "never":  # settings saved before the first crawl
        status = None
    if status == "running" and not is_running(app_crawl):
        status, error = "failed", "The crawl was interrupted. Run it again."
    skipped = (app_crawl.skipped or {}) if app_crawl else {}
    return AppMapResponse(
        status=status,
        error=error,
        started_at=app_crawl.started_at if app_crawl else None,
        finished_at=app_crawl.finished_at if app_crawl else None,
        settings=_settings(app_crawl),
        pages=[
            AppPageItem(
                id=f.id,
                url=f.key,
                title=f.title,
                depth=f.content.get("depth", 0),
                headings=[h["text"] for h in f.content.get("headings", [])][:3],
                buttons=len(f.content.get("buttons", [])),
                fields=len(f.content.get("fields", [])),
                status=f.status,
                last_seen_at=f.last_seen_at,
            )
            for f in pages
        ],
        skipped_count=len(skipped),
        skipped=_skipped_sample(skipped),
    )


@router.get("/app-map", response_model=AppMapResponse)
def get_app_map(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return to_app_map(get_owned_project(project_id, current_user, db))


@router.post("/app-map/crawl", response_model=AppMapResponse)
def crawl_app(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    if not project.base_url:
        raise HTTPException(400, "Add the app URL to the project before mapping it")
    if is_running(project.app_crawl):
        raise HTTPException(409, "A crawl is already running for this project")
    start_crawl(db, project)
    db.refresh(project)
    return to_app_map(project)


@router.patch("/app-map", response_model=AppMapResponse)
def update_crawl_settings(
    project_id: uuid.UUID,
    payload: CrawlSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    app_crawl = project.app_crawl
    if app_crawl is None:
        app_crawl = AppCrawl(project_id=project.id, status="never", skipped={})
        db.add(app_crawl)
    for field in ("max_pages", "max_depth", "respect_robots"):
        value = getattr(payload, field)
        if value is not None:
            setattr(app_crawl, field, value)
    if payload.start_paths is not None:
        paths = [p.strip() for p in payload.start_paths if p.strip()]
        app_crawl.start_paths = ["/" + p.lstrip("/") for p in paths]
    db.commit()
    db.refresh(project)
    return to_app_map(project)


@router.get("/facts/{fact_id}", response_model=FactDetail)
def get_fact(
    project_id: uuid.UUID,
    fact_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    fact = db.get(KnowledgeFact, fact_id)
    if fact is None or fact.project_id != project.id:
        raise HTTPException(404, "Fact not found")
    return _fact_detail(fact)


@router.get("/facts", response_model=list[FactDetail])
def list_facts(
    project_id: uuid.UUID,
    kind: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    facts = sorted(
        (f for f in project.knowledge_facts if f.kind == kind),
        key=lambda f: f.last_seen_at,
        reverse=True,
    )
    return [_fact_detail(f) for f in facts]
