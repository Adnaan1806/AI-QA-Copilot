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
    FactCreate,
    FactDetail,
    FactUpdate,
    SiteLayout,
    SkippedLink,
)
from app.services.app_map_service import is_running, start_crawl
from app.services.fact_service import forget_facts
from app.services.team_knowledge_service import TEAM_KINDS, add_rule, add_term, confirm_fact, edit_team_fact

# Learned facts a person can confirm; rules and terms are the team's own.
CONFIRMABLE_KINDS = ("page", "layout", "workflow")

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
    layout = next((f for f in project.knowledge_facts if f.kind == "layout"), None)
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
        layout=SiteLayout(
            buttons=[b["name"] for b in layout.content.get("buttons", [])],
            link_count=len(layout.content.get("links", [])),
        )
        if layout
        else None,
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


def _owned_fact(project: Project, fact_id: uuid.UUID, db: Session) -> KnowledgeFact:
    fact = db.get(KnowledgeFact, fact_id)
    if fact is None or fact.project_id != project.id:
        raise HTTPException(404, "Fact not found")
    return fact


def _team_wording(kind: str, text: str, term: str, meaning: str) -> tuple[str, str, str]:
    text, term, meaning = text.strip(), term.strip(), meaning.strip()
    if kind == "rule" and not text:
        raise HTTPException(400, "Write the rule")
    if kind == "term" and not (term and meaning):
        raise HTTPException(400, "A term needs both the word and what it means")
    return text, term, meaning


@router.post("/facts", response_model=FactDetail)
def create_fact(
    project_id: uuid.UUID,
    payload: FactCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a business rule or a glossary term."""
    project = get_owned_project(project_id, current_user, db)
    if payload.kind not in TEAM_KINDS:
        raise HTTPException(400, f"kind must be one of {list(TEAM_KINDS)}")
    text, term, meaning = _team_wording(payload.kind, payload.text, payload.term, payload.meaning)
    fact = add_rule(db, project, text) if payload.kind == "rule" else add_term(db, project, term, meaning)
    db.commit()
    return _fact_detail(fact)


@router.patch("/facts/{fact_id}", response_model=FactDetail)
def update_fact(
    project_id: uuid.UUID,
    fact_id: uuid.UUID,
    payload: FactUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirm a learned page or workflow, or reword a rule or term."""
    project = get_owned_project(project_id, current_user, db)
    fact = _owned_fact(project, fact_id, db)
    if payload.status is not None:
        if payload.status != "confirmed" or fact.kind not in CONFIRMABLE_KINDS:
            raise HTTPException(400, "Only a page or workflow can be confirmed")
        confirm_fact(fact)
    if any(v is not None for v in (payload.text, payload.term, payload.meaning)):
        if fact.kind not in TEAM_KINDS:
            raise HTTPException(400, "Only rules and terms can be reworded; the app's pages come from the app")
        text, term, meaning = _team_wording(fact.kind, payload.text or "", payload.term or "", payload.meaning or "")
        fact = edit_team_fact(db, project, fact, text=text, term=term, meaning=meaning)
    db.commit()
    db.refresh(fact)
    return _fact_detail(fact)


@router.delete("/facts/{fact_id}", status_code=204)
def delete_fact(
    project_id: uuid.UUID,
    fact_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove a fact. A removed page comes back if a later crawl finds it again."""
    project = get_owned_project(project_id, current_user, db)
    forget_facts(db, [_owned_fact(project, fact_id, db)])
    db.commit()
