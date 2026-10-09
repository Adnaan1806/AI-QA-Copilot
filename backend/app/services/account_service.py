"""Logging in to a project's app with its stored accounts."""

import json
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.access import secrets
from app.access.login import LoginFailed, LoginResult, log_in
from app.database.models import Project, ProjectAccount


def default_account(project: Project) -> Optional[ProjectAccount]:
    return next((a for a in project.accounts if a.is_default), None) or (
        project.accounts[0] if project.accounts else None
    )


def login_url(account: ProjectAccount, project: Project) -> str:
    return account.login_url or project.base_url


def log_in_account(db: Session, account: ProjectAccount, browser=None) -> LoginResult:
    """Log in with the account in a hidden browser, store the session (encrypted)
    and the outcome on the account, and return the result. Raises LoginFailed."""
    from playwright.sync_api import sync_playwright

    from app.automation.explorer_agent import _ensure_proactor_policy

    password = secrets.decrypt(account.password_encrypted)
    url = login_url(account, account.project)
    try:
        if browser is not None:
            result = _log_in_with(browser, url, account.username, password)
        else:
            _ensure_proactor_policy()
            with sync_playwright() as p:
                launched = p.chromium.launch(headless=True)
                try:
                    result = _log_in_with(launched, url, account.username, password)
                finally:
                    launched.close()
    except LoginFailed as exc:
        account.last_login_error = str(exc)
        db.commit()
        raise
    except Exception as exc:
        account.last_login_error = f"{type(exc).__name__}: {str(exc).splitlines()[0][:300]}"
        db.commit()
        raise LoginFailed(account.last_login_error) from exc

    account.session_encrypted = secrets.encrypt(json.dumps(result.storage_state))
    account.last_login_at = datetime.now(timezone.utc)
    account.last_login_error = None
    db.commit()
    return result


def _log_in_with(browser, url: str, username: str, password: str) -> LoginResult:
    context = browser.new_context()
    try:
        return log_in(context.new_page(), url, username, password)
    finally:
        context.close()
