"""Runs a project's app-map crawl in the background and records each page it
read as a "page" fact (source crawler, status observed) in the project's
knowledge, where the agents can retrieve it."""

import logging
import threading
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin

from sqlalchemy.orm import Session

from app.appmap.crawler import CrawlLimits, crawl
from app.database.connection import SessionLocal
from app.database.models import AppCrawl, KnowledgeFact, Project
from app.access.login import LoginFailed
from app.access.secrets import CredentialsKeyMissing
from app.services.account_service import default_account, log_in_account
from app.services.fact_service import forget_facts, record_fact

logger = logging.getLogger(__name__)

# A crawl still "running" after this was cut off (e.g. the server restarted).
STALE_AFTER = timedelta(minutes=15)
# How many of a page's links go into its text form.
NAV_LINKS_IN_TEXT = 25
# A control on at least this share of pages is part of the site's layout
# (header, navigation, footer); it's recorded once, not on every page.
SHARED_SHARE = 0.6
SHARED_MIN_PAGES = 3


def _unique(items: list, key) -> list:
    seen, out = set(), []
    for item in items:
        k = key(item)
        if k not in seen:
            seen.add(k)
            out.append(item)
    return out


def _button_key(button: dict) -> tuple:
    return (button.get("role"), button.get("name"))


def _link_key(link: dict) -> tuple:
    return (link.get("text"), link.get("href"))


def shared_controls(pages: list[dict]) -> tuple[set, set]:
    """Buttons and links on most pages: the layout every page shares."""
    if len(pages) < SHARED_MIN_PAGES:
        return set(), set()
    threshold = SHARED_SHARE * len(pages)
    buttons, links = {}, {}
    for page in pages:
        for key in {_button_key(b) for b in page.get("buttons", [])}:
            buttons[key] = buttons.get(key, 0) + 1
        for key in {_link_key(link) for link in page.get("links", []) if link.get("text")}:
            links[key] = links.get(key, 0) + 1
    return (
        {k for k, n in buttons.items() if n >= threshold},
        {k for k, n in links.items() if n >= threshold},
    )


def page_text(url: str, title: str, content: dict) -> str:
    """The page as the agents read it: what's on it, by the names a test would use."""
    lines = [f"App page: {title or url}", f"URL: {url}"]
    headings = [h["text"] for h in content.get("headings", [])]
    if headings:
        lines.append("Headings: " + " | ".join(headings))
    buttons = [f'{b["role"]} "{b["name"]}"' for b in content.get("buttons", [])]
    if buttons:
        lines.append("Buttons: " + ", ".join(buttons))
    for field in content.get("fields", []):
        line = f'Field: {field["type"]} "{field["label"]}"'
        if field.get("required"):
            line += " (required)"
        if field.get("options"):
            line += " options: " + ", ".join(field["options"])
        lines.append(line)
    for message in content.get("messages", []):
        lines.append(f'Message shown: "{message}"')
    links = [link["text"] for link in content.get("links", []) if link.get("text")][:NAV_LINKS_IN_TEXT]
    if links:
        lines.append("Links: " + ", ".join(links))
    return "\n".join(lines)


def _stored_content(page: dict, shared_buttons: set = frozenset(), shared_links: set = frozenset()) -> dict:
    """What's on the page itself: each control once, without the site's layout."""
    links = _unique(
        [
            {"text": link["text"], "href": link["href"], "in_nav": link.get("in_nav", False)}
            for link in page.get("links", [])
            if link.get("text") and _link_key(link) not in shared_links
        ],
        _link_key,
    )
    return {
        "url": page["url"],
        "pattern": page["pattern"],
        "depth": page["depth"],
        "headings": _unique(page.get("headings", []), lambda h: h.get("text")),
        "buttons": _unique(
            [b for b in page.get("buttons", []) if _button_key(b) not in shared_buttons], _button_key
        ),
        "fields": _unique(page.get("fields", []), lambda f: (f.get("label"), f.get("type"))),
        "messages": _unique(page.get("messages", []), lambda m: m),
        "links": links[:100],
    }


def layout_text(content: dict) -> str:
    lines = ["On every page of the app (header, navigation, footer):"]
    if content["buttons"]:
        lines.append("Buttons: " + ", ".join(f'{b["role"]} "{b["name"]}"' for b in content["buttons"]))
    if content["links"]:
        lines.append("Links: " + ", ".join(link["text"] for link in content["links"]))
    return "\n".join(lines)


def is_running(app_crawl: AppCrawl | None) -> bool:
    if app_crawl is None or app_crawl.status != "running":
        return False
    started = app_crawl.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - started < STALE_AFTER


def start_crawl(db: Session, project: Project, run_in_thread: bool = True) -> AppCrawl:
    """Mark the crawl as running and start it. The caller checks is_running() first."""
    app_crawl = project.app_crawl or AppCrawl(project_id=project.id)
    app_crawl.status = "running"
    app_crawl.error = None
    app_crawl.started_at = datetime.now(timezone.utc)
    app_crawl.finished_at = None
    db.add(app_crawl)
    db.commit()
    if run_in_thread:
        threading.Thread(target=run_crawl, args=(project.id,), daemon=True).start()
    return app_crawl


def run_crawl(project_id: uuid.UUID, fetcher_factory=None, rules=None) -> None:
    """Crawl the project's app and record its pages. Runs on its own session
    because it outlives the request that started it."""
    # Imported here: the browser module pulls in Playwright, which tests replace.
    from app.appmap.browser import BrowserFetcher, robots_rules
    from app.automation.explorer_agent import _ensure_proactor_policy

    fetcher_factory = fetcher_factory or BrowserFetcher
    rules = rules or robots_rules
    db = SessionLocal()
    try:
        project = db.get(Project, project_id)
        app_crawl = project.app_crawl
        try:
            base = project.base_url.rstrip("/") + "/"
            starts = [base] + [urljoin(base, path.lstrip("/")) for path in app_crawl.start_paths or []]
            allowed, robots_delay = rules(base) if app_crawl.respect_robots else ((lambda url: True), 0.0)
            limits = CrawlLimits(
                max_pages=app_crawl.max_pages,
                max_depth=app_crawl.max_depth,
                delay_seconds=max(0.5, min(robots_delay, 5.0)),
            )
            _ensure_proactor_policy()
            session = None
            account = default_account(project)
            if account is not None:
                # Map the app as its default account sees it; the page the login
                # lands on is a start too, since the login page may not link to it.
                try:
                    login = log_in_account(db, account)
                except (LoginFailed, CredentialsKeyMissing) as exc:
                    raise RuntimeError(f"Couldn't log in as {account.name}: {exc}") from None
                session = login.storage_state
                starts.append(login.final_url)
            with fetcher_factory(storage_state=session) as fetcher:
                result = crawl(starts, fetcher.fetch, limits, allowed=allowed)
            if not result.pages:
                raise RuntimeError(
                    "No pages could be read. " + (next(iter(result.skipped.values()), "") or "")
                )
            record_pages(db, project, result.pages)
            app_crawl.status = "done"
            app_crawl.skipped = result.skipped
        except Exception as exc:
            logger.exception("App-map crawl failed for project %s", project_id)
            db.rollback()
            app_crawl = db.get(Project, project_id).app_crawl
            app_crawl.status = "failed"
            app_crawl.error = str(exc).splitlines()[0][:500] if str(exc) else type(exc).__name__
        app_crawl.finished_at = datetime.now(timezone.utc)
        db.commit()
    finally:
        db.close()


def record_pages(db: Session, project: Project, pages: list[dict]) -> None:
    """Record each crawled page as a fact, and forget crawled pages this crawl
    no longer found -- unless a reviewer confirmed them."""
    shared_buttons, shared_links = shared_controls(pages)
    seen = set()
    for page in pages:
        content = _stored_content(page, shared_buttons, shared_links)
        title = (page.get("title") or "")[:300] or page["pattern"]
        record_fact(
            db,
            project,
            kind="page",
            key=page["url"],
            title=title,
            content=content,
            text=page_text(page["url"], title, content),
            source="crawler",
            status="observed",
        )
        seen.add(page["url"])

    layout = _layout_content(pages, shared_buttons, shared_links)
    if layout["buttons"] or layout["links"]:
        record_fact(
            db, project, kind="layout", key="site", title="On every page", content=layout,
            text=layout_text(layout), source="crawler", status="observed",
        )
        seen.add("site")
    gone = (
        db.query(KnowledgeFact)
        .filter(
            KnowledgeFact.project_id == project.id,
            KnowledgeFact.kind.in_(("page", "layout")),
            KnowledgeFact.source == "crawler",
            KnowledgeFact.status != "confirmed",
            KnowledgeFact.key.notin_(seen),
        )
        .all()
    )
    forget_facts(db, gone)


def _layout_content(pages: list[dict], shared_buttons: set, shared_links: set) -> dict:
    """The shared controls, in the order they appear on the first page that has them."""
    buttons, links = [], []
    for page in pages:
        buttons += [b for b in page.get("buttons", []) if _button_key(b) in shared_buttons]
        links += [
            {"text": link["text"], "href": link["href"]}
            for link in page.get("links", [])
            if link.get("text") and _link_key(link) in shared_links
        ]
    return {"buttons": _unique(buttons, _button_key), "links": _unique(links, _link_key)}
