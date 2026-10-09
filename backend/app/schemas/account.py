import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AccountItem(BaseModel):
    """An account as the API shows it: never the password or the session."""

    id: uuid.UUID
    name: str
    username: str
    login_url: str
    is_default: bool
    last_login_at: Optional[datetime]
    last_login_error: Optional[str]


class AccountsResponse(BaseModel):
    # False until CREDENTIALS_KEY is set; accounts can't be saved before that.
    credentials_ready: bool
    accounts: list[AccountItem]


class AccountCreateRequest(BaseModel):
    name: str
    username: str
    password: str
    login_url: str = ""
    is_default: bool = False


class AccountUpdateRequest(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    # Only sent to change it; the stored one is never returned.
    password: Optional[str] = None
    login_url: Optional[str] = None
    is_default: Optional[bool] = None


class LoginCheckResponse(BaseModel):
    ok: bool
    error: Optional[str] = None
    landed_on: Optional[str] = None
    account: AccountItem
