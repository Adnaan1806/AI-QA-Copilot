"""What the Analyst can look at while it reads a requirement: what the project
already knows (its app map, documents, team rules and terms) and the live app.

Everything here is read-only. open_page loads a page and reads it -- it never
clicks or types -- and only opens pages of the project's own app. When the
project has a default account, pages open logged in as it (one fresh login,
on the first page opened); the account's credentials never reach the LLM.
"""

import logging
from typing import Callable, Optional
from urllib.parse import urljoin, urlparse

from app import config
from app.automation.dom_serializer import serialize_page
from app.automation.readiness import wait_until_ready
from app.rag.retriever import retrieve

logger = logging.getLogger(__name__)

PAGE_LOAD_TIMEOUT_MS = 30000
SETTLE_MS = 15000
PAGE_TEXT_CHARS = 2500
APP_PAGES = 4
APP_FLOWS = 3
DOCUMENT_CHUNKS = 4
TEAM_RULES = 4
TEAM_TERMS = 3


class ToolError(ValueError):
    """A tool call that can't be done; the message says why, for the model to read."""


class AnalystTools:
    def __init__(
        self,
        project_id,
        base_url: str = "",
        session: Optional[Callable[[], Optional[dict]]] = None,
        account_name: Optional[str] = None,
        search=retrieve,
    ):
        """`session` returns the default account's storage state (logging in if
        needed), or None to browse logged out; it's called on the first open_page."""
        self._project_id = project_id
        self._base_url = base_url.strip()
        self._session = session
        self._account_name = account_name
        self._search = search
        self._storage_state = None
        self._session_tried = False

    @property
    def can_browse(self) -> bool:
        return bool(self._base_url)

    def describe(self) -> dict:
        """What the model hears about the setup."""
        return {
            "app_url": self._base_url or None,
            "pages_open_logged_in_as": self._account_name if self._session else None,
        }

    def search_app_map(self, query: str) -> str:
        query = _query(query)
        found = self._search(query, self._project_id, k=APP_PAGES, kind="fact", fact_kind="page")
        found += self._search(query, self._project_id, k=APP_FLOWS, kind="fact", fact_kind="workflow")
        return _format(found, "Nothing in the app map matches that.", with_status=True)

    def search_documents(self, query: str) -> str:
        found = self._search(_query(query), self._project_id, k=DOCUMENT_CHUNKS)
        return _format(found, "No uploaded document matches that.")

    def search_team_knowledge(self, query: str) -> str:
        query = _query(query)
        found = self._search(query, self._project_id, k=TEAM_RULES, kind="fact", fact_kind="rule")
        found += self._search(query, self._project_id, k=TEAM_TERMS, kind="fact", fact_kind="term")
        return _format(found, "The team hasn't stated a rule or term about that.")

    def open_page(self, path: str) -> str:
        url = self.resolve(path)
        storage_state = self._logged_in_state()
        from playwright.sync_api import sync_playwright

        from app.automation.explorer_agent import _ensure_proactor_policy

        _ensure_proactor_policy()
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=config.PLAYWRIGHT_HEADLESS)
            try:
                context = browser.new_context(storage_state=storage_state)
                page = context.new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=PAGE_LOAD_TIMEOUT_MS)
                wait_until_ready(page, timeout_ms=SETTLE_MS)
                snapshot, _ = serialize_page(page)
                landed = page.url
                try:
                    text = page.locator("body").inner_text(timeout=3000)[:PAGE_TEXT_CHARS]
                except Exception:
                    text = ""
            finally:
                browser.close()
        who = f"Logged in as {self._account_name}." if storage_state else "Logged out."
        moved = "" if landed.rstrip("/") == url.rstrip("/") else f" (asked for {url}; the app sent it here)"
        return f"{who}{moved}\n{snapshot}\n\nVisible text:\n{text}"

    def resolve(self, path: str) -> str:
        """`path` as a URL of the project's app; anything else is refused."""
        if not self._base_url:
            raise ToolError("the project has no app URL, so pages can't be opened")
        if not isinstance(path, str) or not path.strip():
            raise ToolError("path must be a page of the app, e.g. \"/inventory.html\"")
        base = self._base_url if self._base_url.endswith("/") else self._base_url + "/"
        url = urljoin(base, path.strip())
        if _origin(url) != _origin(base):
            raise ToolError(f"only pages of the project's app ({_origin(base)}) can be opened")
        return url

    def _logged_in_state(self) -> Optional[dict]:
        if self._session is not None and not self._session_tried:
            self._session_tried = True
            try:
                self._storage_state = self._session()
            except Exception as exc:
                logger.warning("Analyst couldn't log in: %r", exc)
        return self._storage_state


def _query(query) -> str:
    if not isinstance(query, str) or not query.strip():
        raise ToolError("query must say what to look for")
    return query.strip()


def _origin(url: str) -> tuple:
    parsed = urlparse(url)
    return (parsed.scheme, parsed.netloc.lower())


def _format(found: list[dict], empty: str, with_status: bool = False) -> str:
    if not found:
        return empty
    parts = []
    for item in found:
        label = item.get("source") or "unknown"
        if with_status and item.get("status"):
            label += f" -- {item['status']}"
        parts.append(f"[{label}]\n{item['content']}")
    return "\n\n".join(parts)


def default_account_session(db, project) -> tuple[Optional[Callable[[], Optional[dict]]], Optional[str]]:
    """(session getter, account name) for the project's default account, or
    (None, None) when it has none. The getter logs in afresh, as automation
    runs do: a saved session may have expired, and pages would then open on
    the login form while claiming to be logged in."""
    from app.services.account_service import default_account, log_in_account

    account = default_account(project)
    if account is None:
        return None, None

    def session() -> Optional[dict]:
        return log_in_account(db, account).storage_state

    return session, account.name
