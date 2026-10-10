import uuid
from types import SimpleNamespace

import pytest

from app.access.login import LoginFailed
from app.services import session_service
from app.services.session_service import StartFailed, start_account, starts_for


def account(name, is_default=False):
    return SimpleNamespace(id=uuid.uuid4(), name=name, is_default=is_default)


def case(title="Add a product to the cart", steps=("Open the inventory", "Click Add to cart"), **kwargs):
    fields = {"id": uuid.uuid4(), "start_state": None, "account_id": None, **kwargs}
    return SimpleNamespace(title=title, steps=list(steps), **fields)


STANDARD = account("Standard user", is_default=True)
ADMIN = account("Admin")
PROJECT = SimpleNamespace(accounts=[ADMIN, STANDARD])


def test_cases_start_as_the_default_account():
    assert start_account(case(), PROJECT) is STANDARD


def test_a_project_without_accounts_starts_logged_out():
    assert start_account(case(), SimpleNamespace(accounts=[])) is None


def test_a_case_about_logging_in_starts_logged_out():
    assert start_account(case(title="Log in with a locked-out user"), PROJECT) is None
    assert start_account(case(steps=["Enter the password", "Click Login"]), PROJECT) is None


def test_an_explicit_start_overrides_the_automatic_rule():
    assert start_account(case(start_state="logged_out"), PROJECT) is None
    assert start_account(case(title="Log in as admin", start_state="logged_in"), PROJECT) is STANDARD


def test_a_case_can_start_as_a_chosen_account():
    assert start_account(case(account_id=ADMIN.id), PROJECT) is ADMIN


def test_logs_in_once_per_account(monkeypatch):
    logins = []

    def log_in(db, acc):
        logins.append(acc.name)
        return SimpleNamespace(storage_state={"cookies": [acc.name]}, final_url="https://app.test/home")

    monkeypatch.setattr(session_service, "log_in_account", log_in)
    cases = [case(), case(), case(account_id=ADMIN.id), case(title="Log in")]

    starts = starts_for(None, PROJECT, cases)

    assert sorted(logins) == ["Admin", "Standard user"]
    assert starts[str(cases[0].id)] == {
        "account": "Standard user",
        "storage_state": {"cookies": ["Standard user"]},
        "start_url": "https://app.test/home",
    }
    assert starts[str(cases[2].id)]["account"] == "Admin"
    assert str(cases[3].id) not in starts


def test_a_failed_login_names_the_account(monkeypatch):
    def log_in(db, acc):
        raise LoginFailed("still on the login page")

    monkeypatch.setattr(session_service, "log_in_account", log_in)

    with pytest.raises(StartFailed, match="Couldn't log in as Standard user: still on the login page"):
        starts_for(None, PROJECT, [case()])
