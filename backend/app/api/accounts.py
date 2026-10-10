import base64
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.access import secrets
from app.access.login import LoginFailed
from app.api.deps import get_owned_project
from app.auth.dependencies import get_current_user
from app.database.connection import get_db
from app.database.models import Project, ProjectAccount, User
from app.schemas.account import (
    AccountCreateRequest,
    AccountItem,
    AccountsResponse,
    AccountUpdateRequest,
    LoginCheckResponse,
)
from app.services.account_service import log_in_account
from app.services.app_map_service import is_running, start_crawl

router = APIRouter(prefix="/projects/{project_id}/accounts", tags=["accounts"])


def _item(account: ProjectAccount) -> AccountItem:
    return AccountItem(
        id=account.id,
        name=account.name,
        username=account.username,
        login_url=account.login_url,
        is_default=account.is_default,
        last_login_at=account.last_login_at,
        last_login_error=account.last_login_error,
    )


def _owned_account(project: Project, account_id: uuid.UUID) -> ProjectAccount:
    account = next((a for a in project.accounts if a.id == account_id), None)
    if account is None:
        raise HTTPException(404, "Account not found")
    return account


def _encrypt(password: str) -> str:
    try:
        return secrets.encrypt(password)
    except secrets.CredentialsKeyMissing as exc:
        raise HTTPException(400, str(exc)) from None


def _make_default(project: Project, account: ProjectAccount) -> None:
    for other in project.accounts:
        other.is_default = other is account


def _remap(db: Session, project: Project, account: ProjectAccount) -> None:
    """The app map was made without this login (a new project crawls before
    its accounts exist); map it again as the default account sees it."""
    if account.is_default and project.base_url and not is_running(project.app_crawl):
        start_crawl(db, project)


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "This project already has an account with that name") from None


@router.get("", response_model=AccountsResponse)
def list_accounts(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    return AccountsResponse(credentials_ready=secrets.ready(), accounts=[_item(a) for a in project.accounts])


@router.post("", response_model=AccountItem)
def create_account(
    project_id: uuid.UUID,
    payload: AccountCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    name, username = payload.name.strip(), payload.username.strip()
    if not name or not username or not payload.password:
        raise HTTPException(400, "Name, username and password are required")
    account = ProjectAccount(
        project_id=project.id,
        name=name,
        username=username,
        password_encrypted=_encrypt(payload.password),
        login_url=payload.login_url.strip(),
    )
    project.accounts.append(account)
    if payload.is_default or len(project.accounts) == 1:
        _make_default(project, account)
    _commit(db)
    _remap(db, project, account)
    return _item(account)


@router.patch("/{account_id}", response_model=AccountItem)
def update_account(
    project_id: uuid.UUID,
    account_id: uuid.UUID,
    payload: AccountUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    account = _owned_account(project, account_id)
    if payload.name is not None:
        if not payload.name.strip():
            raise HTTPException(400, "Name cannot be empty")
        account.name = payload.name.strip()
    login_changed = False
    if payload.username is not None and payload.username.strip() != account.username:
        account.username, login_changed = payload.username.strip(), True
    if payload.password:
        account.password_encrypted, login_changed = _encrypt(payload.password), True
    if payload.login_url is not None and payload.login_url.strip() != account.login_url:
        account.login_url, login_changed = payload.login_url.strip(), True
    if login_changed:
        # The saved session belongs to the old login.
        account.session_encrypted = None
        account.last_login_at = account.last_login_error = None
    became_default = payload.is_default and not account.is_default
    if payload.is_default:
        _make_default(project, account)
    _commit(db)
    if login_changed or became_default:
        _remap(db, project, account)
    return _item(account)


@router.delete("/{account_id}", status_code=204)
def delete_account(
    project_id: uuid.UUID,
    account_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_owned_project(project_id, current_user, db)
    account = _owned_account(project, account_id)
    was_default = account.is_default
    project.accounts.remove(account)
    db.delete(account)
    if was_default and project.accounts:
        _make_default(project, project.accounts[0])
    db.commit()


@router.post("/{account_id}/login", response_model=LoginCheckResponse)
def check_login(
    project_id: uuid.UUID,
    account_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Log in now with the account, to check it works. Takes a few seconds."""
    project = get_owned_project(project_id, current_user, db)
    account = _owned_account(project, account_id)
    if not (account.login_url or project.base_url):
        raise HTTPException(400, "Add the app URL to the project, or a login page to the account")
    try:
        result = log_in_account(db, account)
    except secrets.CredentialsKeyMissing as exc:
        raise HTTPException(400, str(exc)) from None
    except LoginFailed as exc:
        db.refresh(account)
        return LoginCheckResponse(ok=False, error=str(exc), account=_item(account))
    db.refresh(account)
    screenshot = (
        "data:image/jpeg;base64," + base64.b64encode(result.screenshot).decode() if result.screenshot else None
    )
    return LoginCheckResponse(ok=True, landed_on=result.final_url, screenshot=screenshot, account=_item(account))
