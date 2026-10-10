"""How each test case starts -- logged in as which account, or logged out --
and the logins a run needs. A case's start goes to the browsers only: the
agents are told the account's name, never its password or session."""

import re
from typing import Optional

from sqlalchemy.orm import Session

from app.access.login import LoginFailed
from app.database.models import Project, ProjectAccount, TestCase
from app.services.account_service import default_account, log_in_account

# A case whose own title or steps deal with logging in handles the login itself.
LOGIN_WORDS = re.compile(
    r"\b(log\s*-?\s*in|log\s*-?\s*out|sign\s*-?\s*in|sign\s*-?\s*out|sign\s*-?\s*up|password|"
    r"register|registration|credentials?)\b",
    re.IGNORECASE,
)


def handles_login_itself(test_case: TestCase) -> bool:
    return bool(LOGIN_WORDS.search(" ".join([test_case.title, *test_case.steps])))


def start_account(test_case: TestCase, project: Project) -> Optional[ProjectAccount]:
    """The account a case starts logged in as, or None to start logged out."""
    if not project.accounts or test_case.start_state == "logged_out":
        return None
    if test_case.start_state is None and handles_login_itself(test_case):
        return None
    chosen = next((a for a in project.accounts if a.id == test_case.account_id), None)
    return chosen or default_account(project)


class StartFailed(Exception):
    pass


def starts_for(db: Session, project: Project, test_cases: list[TestCase]) -> dict[str, dict]:
    """Log in once per account the cases need. Returns test case id ->
    {"account": name, "storage_state": session} for cases that start logged in."""
    accounts = {}
    for tc in test_cases:
        account = start_account(tc, project)
        if account is not None:
            accounts.setdefault(account.id, (account, []))[1].append(str(tc.id))
    starts = {}
    for account, case_ids in accounts.values():
        try:
            login = log_in_account(db, account)
        except LoginFailed as exc:
            raise StartFailed(f"Couldn't log in as {account.name}: {exc}") from None
        for case_id in case_ids:
            starts[case_id] = {"account": account.name, "storage_state": login.storage_state}
    return starts
